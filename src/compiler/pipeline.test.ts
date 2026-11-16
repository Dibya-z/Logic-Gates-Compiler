import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { compile } from './index';
import { SAMPLES } from '../data/samples';
import { LIMITS, type Phase } from './types';

const PHASES: Phase[] = ['lexer', 'parser', 'semantic', 'ir', 'optimizer', 'codegen'];
const BROKEN: Record<string, { phase: Phase; code: string }> = {
  'broken-illegal': { phase: 'lexer', code: 'LEX001' },
  'broken-number': { phase: 'lexer', code: 'LEX002' },
  'broken-digit-name': { phase: 'lexer', code: 'LEX003' },
  'broken-comment': { phase: 'lexer', code: 'LEX004' },
  'broken-syntax': { phase: 'parser', code: 'SYN003' },
  'broken-semicolon': { phase: 'parser', code: 'SYN001' },
  'broken-parenthesis': { phase: 'parser', code: 'SYN002' },
  'broken-extra-paren': { phase: 'parser', code: 'SYN002' },
  'broken-operators': { phase: 'parser', code: 'SYN010' },
  'broken-assign': { phase: 'parser', code: 'SYN004' },
  'broken-no-names': { phase: 'parser', code: 'SYN007' },
  'broken-eof': { phase: 'parser', code: 'SYN008' },
  'broken-stray': { phase: 'parser', code: 'SYN006' },
  'broken-undefined': { phase: 'semantic', code: 'SEM001' },
  'broken-double': { phase: 'semantic', code: 'SEM003' },
  'broken-input': { phase: 'semantic', code: 'SEM004' },
  'broken-duplicate': { phase: 'semantic', code: 'SEM002' },
  'broken-keyword': { phase: 'semantic', code: 'SEM005' },
  'broken-cycle': { phase: 'semantic', code: 'SEM007' },
  'broken-undriven': { phase: 'semantic', code: 'SEM006' },
  'broken-input-limit': { phase: 'semantic', code: 'SEM008' },
};

describe('complete phase pipeline', () => {
  it.each(SAMPLES.filter(sample => sample.category === 'broken'))('blocks later phases for $name', sample => {
    const result = compile(sample.source);
    const expected = BROKEN[sample.id];
    expect(expected, `Missing diagnostic contract for ${sample.id}`).toBeDefined();
    expect(result.diagnostics.some(d => d.phase === expected.phase && d.code === expected.code && d.severity === 'error')).toBe(true);
    expect(result.stages.map(s => s.phase)).toEqual(PHASES);
    expect(result.stages.find(s => s.phase === expected.phase)).toMatchObject({ status: 'error' });
    const after = result.stages.slice(PHASES.indexOf(expected.phase) + 1);
    after.forEach(stage => expect(stage).toMatchObject({ status: 'skipped', blockedBy: expected.phase }));
    expect(result.codegen).toBeUndefined();
    expect(result.tokens.length).toBeGreaterThan(0);
    if (expected.phase === 'parser') expect(result.parseTree?.children.length).toBeGreaterThan(0);
    for (const diagnostic of result.diagnostics) {
      expect(diagnostic.line).toBeGreaterThan(0); expect(diagnostic.column).toBeGreaterThan(0);
      expect(diagnostic.length).toBeGreaterThan(0); expect(diagnostic.hint.length).toBeGreaterThan(5);
    }
  });

  it.each(SAMPLES.filter(sample => sample.category === 'working'))('produces equivalent original and optimized targets for $name', sample => {
    const before = compile(sample.source, { optimize: false });
    const after = compile(sample.source);
    expect(before.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(after.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(before.stages[4].status).toBe('disabled');
    expect(after.optimizer?.equivalence).toEqual({ verified: true, checkedRows: 2 ** after.ir!.netlist.inputs.length });
    expect(after.stages[5].status).toBe('success');
    const outputs = before.codegen!.truthTable.outputs;
    expect(after.codegen!.truthTable.rows.map(row => outputs.map(name => row.values[name]))).toEqual(before.codegen!.truthTable.rows.map(row => outputs.map(name => row.values[name])));
  });

  it('hand-checks the reference expression: 001 is zero, 000 is one', () => {
    const result = compile('input a,b,c; output out; out=(a AND b) OR NOT c;');
    expect(result.codegen!.truthTable.rows.map(row => row.values.out)).toEqual([1, 0, 1, 0, 1, 0, 1, 1]);
    expect(result.codegen!.truthTable.forms[0]).toMatchObject({ sop: 'Σm(0,2,4,6,7)', pos: 'ΠM(1,3,5)' });
    expect(result.ir!.tac.map(({ op, arg1, arg2, result }) => [op, arg1, arg2, result])).toEqual([
      ['AND', 'a', 'b', 't1'], ['NOT', 'c', undefined, 't2'], ['OR', 't1', 't2', 'out'],
    ]);
  });

  it('keeps a warning-only circuit executable', () => {
    const result = compile('input unused; output y; y=1;');
    expect(result.stages[2].status).toBe('warning');
    expect(result.codegen!.truthTable.rows.map(row => row.values.y)).toEqual([1, 1]);
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'])('supports the legal signal name %s without prototype leakage', name => {
    const source = `input ${name},b; output y; y=${name} XOR b;`;
    const result = compile(source);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(result.codegen!.truthTable.rows.map(row => row.values.y)).toEqual([0, 1, 1, 0]);
  });

  it('avoids user signal names when allocating TAC temporary nets', () => {
    const result = compile('input t1,t2; wire t3; output t4; t3=t1 OR t2; t4=(t3 AND t1) XOR (t2 NAND t3);');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    const definitions = [...result.ir!.netlist.gates.map(g => g.output), ...result.ir!.netlist.aliases.map(a => a.output)];
    expect(new Set(definitions).size).toBe(definitions.length);
    expect(result.ir!.netlist.gates.filter(g => g.output !== 't3' && g.output !== 't4').every(g => !['t1', 't2', 't3', 't4'].includes(g.output))).toBe(true);
  });

  it('supports case-insensitive keywords and case-sensitive identifiers together', () => {
    const result = compile('InPuT a,A; OuTpUt y; y=a xOr A;');
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(result.codegen!.truthTable.inputs).toEqual(['a', 'A']);
    expect(result.codegen!.truthTable.rows.map(row => row.values.y)).toEqual([0, 1, 1, 0]);
  });

  it('contains no React, DOM or browser imports in any compiler module', () => {
    const files = readdirSync(new URL('.', import.meta.url)).filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'));
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/(?:from\s*|import\s*)['"](?:react|react-dom|@codemirror)(?:[/'"])/);
      expect(source, file).not.toMatch(/\b(?:document|window)\s*\./);
    }
  });
});

describe('bounded compilation and fuzz recovery', () => {
  it.each(['', ' \t\r\n', '\0\u0001\u0002\u00ff\ud800', '☃🙂你好', '0'.repeat(10000)])('never throws on empty, whitespace, binary or Unicode source %j', source => {
    expect(() => compile(source)).not.toThrow();
    const result = compile(source);
    expect(result.stages).toHaveLength(6);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('accepts exactly ten thousand source characters when mostly comments', () => {
    const base = 'output y; y=1;\n//';
    const result = compile(base + 'x'.repeat(LIMITS.sourceLength - base.length));
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(result.codegen!.truthTable.rows[0].values.y).toBe(1);
  });

  it('rejects oversized source in the lexer and skips all later phases', () => {
    const result = compile(' '.repeat(250000));
    expect(result.diagnostics[0].code).toBe('LEX005');
    expect(result.stages.slice(1).every(s => s.status === 'skipped' && s.blockedBy === 'lexer')).toBe(true);
  });

  it.each([
    'input a; output y; y=' + '('.repeat(1500) + 'a' + ')'.repeat(1500) + ';',
    'input a; output y; y=' + 'NOT '.repeat(1000) + 'a;',
    'input a; output y; y=' + Array(1000).fill('a').join(' OR ') + ';',
  ])('rejects extreme nesting and long AST chains without stack overflow', source => {
    const result = compile(source);
    expect(result.diagnostics.some(d => d.code === 'SYN012')).toBe(true);
    expect(result.stages[2].status).toBe('skipped');
  });

  it('recovers safely from 600 deterministic random garbage programs', () => {
    let seed = 0x10c1c;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
    const alphabet = 'abc_xyz012389 ;=()&|^!~@$/#*\r\n\t\0☃';
    for (let trial = 0; trial < 600; trial++) {
      const length = Math.floor(random() * 300);
      let source = '';
      for (let i = 0; i < length; i++) source += alphabet[Math.floor(random() * alphabet.length)];
      let result: ReturnType<typeof compile> | undefined;
      expect(() => { result = compile(source); }, `fuzz trial ${trial}`).not.toThrow();
      expect(result!.stages).toHaveLength(6);
      expect(result!.diagnostics.every(d => Number.isFinite(d.line) && d.line > 0 && d.column > 0)).toBe(true);
    }
  });

  it('compiles and exhaustively verifies a ten-input design in under 300 ms', () => {
    const source = `input ${Array.from({ length: 10 }, (_, i) => `a${i}`).join(',')}; output parity,all_high; parity=${Array.from({ length: 10 }, (_, i) => `a${i}`).join(' XOR ')}; all_high=${Array.from({ length: 10 }, (_, i) => `a${i}`).join(' AND ')};`;
    const start = performance.now();
    const result = compile(source);
    const elapsed = performance.now() - start;
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(result.optimizer!.equivalence.checkedRows).toBe(1024);
    expect(result.codegen!.truthTable.rows).toHaveLength(1024);
    expect(elapsed).toBeLessThan(300);
  });
});

import { describe, expect, it } from 'vitest';
import { lex } from './lexer';
import { parse } from './parser';
import { analyze } from './semantic';
import { generateIR } from './ir';
import { optimize } from './optimizer';
import { evaluateNetlist } from './evaluator';

function run(source: string) {
  const lexical = lex(source);
  const parsed = parse(lexical.tokens);
  const semantic = analyze(parsed.ast);
  expect([...lexical.diagnostics, ...parsed.diagnostics, ...semantic.diagnostics].filter(d => d.severity === 'error')).toEqual([]);
  const ir = generateIR(parsed.ast, semantic);
  const original = JSON.stringify({ program: parsed.ast, ir });
  const result = optimize(parsed.ast, semantic, ir);
  expect(result.equivalence.verified).toBe(true);
  expect(JSON.stringify({ program: parsed.ast, ir })).toBe(original);
  return result;
}

describe('optimization rules', () => {
  it.each([
    ['1 AND 0', 'Constant folding', 0], ['NOT 0', 'Constant folding', 0],
    ['a AND 1', 'Identity law', 0], ['1 AND a', 'Identity law', 0],
    ['a AND 0', 'Annihilator law', 0], ['0 AND a', 'Annihilator law', 0],
    ['a OR 0', 'Identity law', 0], ['0 OR a', 'Identity law', 0],
    ['a OR 1', 'Annihilator law', 0], ['1 OR a', 'Annihilator law', 0],
    ['a XOR 0', 'Identity law', 0], ['0 XOR a', 'Identity law', 0],
    ['a XOR 1', 'XOR inversion', 1], ['1 XOR a', 'XOR inversion', 1],
    ['a AND a', 'Idempotence', 0], ['a OR a', 'Idempotence', 0],
    ['a OR NOT a', 'Complement law', 0], ['NOT a OR a', 'Complement law', 0],
    ['a AND NOT a', 'Complement law', 0], ['NOT a AND a', 'Complement law', 0],
    ['NOT NOT a', 'Double negation elimination', 0],
    ['a NAND 1', 'Identity law', 1], ['a NAND 0', 'Annihilator law', 0],
    ['a NOR 0', 'Identity law', 1], ['a NOR 1', 'Annihilator law', 0],
    ['a XNOR 1', 'Identity law', 0], ['a XNOR 0', 'XNOR inversion', 1],
    ['a XOR a', 'Idempotence', 0], ['a XNOR NOT a', 'Complement law', 0],
  ])('simplifies %s using %s', (expression, rule, gateCount) => {
    const result = run(`input a; output y; y=${expression};`);
    expect(result.steps.some(step => step.rule === rule)).toBe(true);
    expect(result.after.gateCount).toBe(gateCount);
    expect(result.steps.every(step => step.span.line === 1 && step.span.column > 1)).toBe(true);
  });

  it('shares commutative common subexpressions across separate output drivers', () => {
    const result = run('input a,b,c; output y,z; y=(a AND b) XOR c; z=(b AND a) OR c;');
    expect(result.before.gateCount).toBe(4);
    expect(result.after.gateCount).toBe(3);
    expect(result.steps.some(step => step.rule === 'Common subexpression elimination')).toBe(true);
  });

  it('eliminates gates and aliases that cannot reach an output', () => {
    const result = run('input a,b; wire dead,copy; output y; dead=a XOR b; copy=dead; y=a AND b;');
    expect(result.before.gateCount).toBe(2);
    expect(result.after.gateCount).toBe(1);
    expect(result.ir.netlist.wires).toEqual([]);
    expect(result.steps.filter(step => step.rule === 'Dead code elimination')).toHaveLength(2);
  });

  it('retains a declared output even when it has no consumers', () => {
    const result = run('input a,b; output y,z; y=a AND b; z=a XOR b;');
    expect(result.ir.netlist.outputs).toEqual(['y', 'z']);
    expect(result.ir.gateCount).toBe(2);
  });

  it('repeats simplification when one rule exposes another', () => {
    const result = run('input a; output y; y=NOT (a XOR 1);');
    expect(result.ir.gateCount).toBe(0);
    expect(result.steps.map(step => step.rule)).toEqual(['XOR inversion', 'Double negation elimination']);
    expect(evaluateNetlist(result.ir.netlist, { a: 1 }).y).toBe(1);
  });

  it('does not incorrectly reassociate NAND or NOR during CSE', () => {
    const result = run('input a,b,c; output y,z; y=(a NAND b) NAND c; z=a NAND (b NAND c);');
    expect(result.after.gateCount).toBe(4);
    expect(evaluateNetlist(result.ir.netlist, { a: 0, b: 0, c: 1 })).toMatchObject({ y: 0, z: 1 });
  });

  it('exhaustively checks 200 seeded random expressions on every input combination', () => {
    let seed = 0x51c0ffee;
    const random = (limit: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit; };
    const operators = ['AND', 'NAND', 'OR', 'NOR', 'XOR', 'XNOR'];
    const expression = (depth: number): string => {
      if (depth === 0 || random(5) === 0) return ['a', 'b', 'c', '0', '1'][random(5)];
      if (random(4) === 0) return `NOT (${expression(depth - 1)})`;
      return `(${expression(depth - 1)} ${operators[random(operators.length)]} ${expression(depth - 1)})`;
    };
    for (let index = 0; index < 200; index++) {
      const result = run(`input a,b,c; output y; y=${expression(4)};`);
      expect(result.equivalence).toEqual({ verified: true, checkedRows: 8 });
      expect(result.after.gateCount).toBeLessThanOrEqual(result.before.gateCount);
    }
  });
});

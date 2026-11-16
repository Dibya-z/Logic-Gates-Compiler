import { describe, expect, it } from 'vitest';
import { lex } from './lexer';
import { parse } from './parser';
import { analyze } from './semantic';
import { generateIR } from './ir';
import { evaluateNetlist } from './evaluator';

function build(source: string) {
  const lexical = lex(source);
  const parsed = parse(lexical.tokens);
  const semantic = analyze(parsed.ast);
  expect([...lexical.diagnostics, ...parsed.diagnostics, ...semantic.diagnostics].filter(d => d.severity === 'error')).toEqual([]);
  return generateIR(parsed.ast, semantic);
}

describe('three-address code generation', () => {
  it.each([
    ['PDF circuit', 'input a,b,c; output out; out=(a AND b) OR NOT c;', ['AND a b t1', 'NOT c - t2', 'OR t1 t2 out']],
    ['half adder', 'input a,b; output sum,carry; sum=a XOR b; carry=a AND b;', ['XOR a b sum', 'AND a b carry']],
    ['full adder', 'input a,b,cin; output sum,carry; sum=a XOR b XOR cin; carry=(a AND b) OR (cin AND (a XOR b));', ['XOR a b t1', 'XOR t1 cin sum', 'AND a b t2', 'XOR a b t3', 'AND cin t3 t4', 'OR t2 t4 carry']],
    ['two-to-one mux', 'input a,b,s; output y; y=(a AND NOT s) OR (b AND s);', ['NOT s - t1', 'AND a t1 t2', 'AND b s t3', 'OR t2 t3 y']],
    ['majority', 'input a,b,c; output y; y=(a AND b) OR (b AND c) OR (a AND c);', ['AND a b t1', 'AND b c t2', 'OR t1 t2 t3', 'AND a c t4', 'OR t3 t4 y']],
    ['constant copy', 'output y; y=1;', ['COPY 1 - y']],
    ['input copy', 'input a; output y; y=a;', ['COPY a - y']],
    ['all complemented gates', 'input a,b; output x,y,z; x=a NAND b; y=a NOR b; z=a XNOR b;', ['NAND a b x', 'NOR a b y', 'XNOR a b z']],
  ])('emits exact TAC for %s', (_, source, expected) => {
    const ir = build(source);
    expect(ir.tac.map(row => `${row.op} ${row.arg1} ${row.arg2 ?? '-'} ${row.result}`)).toEqual(expected);
    expect(ir.tac.map(row => row.index)).toEqual(ir.tac.map((_, index) => index + 1));
  });

  it('emits signal drivers in topological order, regardless of source order', () => {
    const ir = build('input a,b; output y; wire w; y=NOT w; w=a AND b;');
    expect(ir.tac.map(row => row.result)).toEqual(['w', 'y']);
    expect(evaluateNetlist(ir.netlist, { a: 1, b: 1 }).y).toBe(0);
  });

  it('does not allocate a temporary over a declared t1 signal', () => {
    const ir = build('input a,b,t1; output y; y=(a AND b) OR t1;');
    expect(ir.tac[0].result).toBe('t2');
    expect(evaluateNetlist(ir.netlist, { a: 0, b: 0, t1: 1 }).y).toBe(1);
  });

  it('measures gate depth through aliases without counting COPY as a gate', () => {
    const ir = build('input a,b; wire w,z; output y; w=a AND b; z=w; y=NOT z;');
    expect(ir.gateCount).toBe(2);
    expect(ir.depth).toBe(2);
    expect(ir.netlist.aliases).toHaveLength(1);
    expect(new Set(ir.netlist.gates.map(gate => gate.id)).size).toBe(2);
  });

  it('retains accurate spans and corresponding gate IDs in the TAC', () => {
    const ir = build('input a,b;\noutput y;\ny=a AND b;');
    expect(ir.tac[0].span).toMatchObject({ line: 3, column: 3 });
    expect(ir.tac[0].gateId).toBe(ir.netlist.gates[0].id);
  });
});

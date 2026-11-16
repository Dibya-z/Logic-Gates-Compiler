import { describe, expect, it } from 'vitest';
import { evaluateNetlist, evaluateOperator, inputsForRow, verifyEquivalence, type Bit } from './evaluator';
import { DEFAULT_SPAN, type GateOp, type Netlist } from './types';

const binaryTables: [GateOp, number[]][] = [
  ['AND', [0, 0, 0, 1]], ['NAND', [1, 1, 1, 0]], ['OR', [0, 1, 1, 1]],
  ['NOR', [1, 0, 0, 0]], ['XOR', [0, 1, 1, 0]], ['XNOR', [1, 0, 0, 1]],
];

describe('Boolean netlist evaluator', () => {
  it.each(binaryTables)('implements the independent known truth table for %s', (op, table) => {
    const actual = [0, 1, 2, 3].map(index => evaluateOperator(op, ((index >> 1) & 1) as Bit, (index & 1) as Bit));
    expect(actual).toEqual(table);
  });
  it.each([0, 1] as const)('inverts %s', bit => expect(evaluateOperator('NOT', bit)).toBe(1 - bit));

  it('orders input rows in declaration order with the first input as MSB', () => {
    expect([0, 1, 2, 3].map(index => inputsForRow(['b', 'a'], index))).toEqual([
      { b: 0, a: 0 }, { b: 0, a: 1 }, { b: 1, a: 0 }, { b: 1, a: 1 },
    ]);
  });

  const copyNetlist = (): Netlist => ({
    inputs: ['a'], outputs: ['y'], wires: ['w'], gates: [],
    aliases: [{ output: 'y', input: 'w', span: DEFAULT_SPAN }, { output: 'w', input: 'a', span: DEFAULT_SPAN }],
  });

  it('schedules alias chains independently of storage order', () => expect(evaluateNetlist(copyNetlist(), { a: 1 })).toMatchObject({ a: 1, w: 1, y: 1 }));
  it('is prototype-safe for legal JavaScript object property identifiers', () => {
    const netlist: Netlist = { inputs: ['__proto__'], outputs: ['constructor'], wires: [], gates: [], aliases: [{ input: '__proto__', output: 'constructor', span: DEFAULT_SPAN }] };
    expect(evaluateNetlist(netlist, { ['__proto__']: 1 }).constructor).toBe(1);
  });
  it('rejects malformed cyclic netlists instead of hanging', () => {
    const netlist = copyNetlist();
    netlist.aliases[1].input = 'y';
    expect(() => evaluateNetlist(netlist, { a: 0 })).toThrow(/cycle|undefined/);
  });
  it('reports the first exhaustive equivalence counterexample', () => {
    const before = copyNetlist();
    const after: Netlist = { inputs: ['a'], outputs: ['y'], wires: [], gates: [{ id: 'g1', type: 'NOT', inputs: ['a'], output: 'y', span: DEFAULT_SPAN }], aliases: [] };
    expect(verifyEquivalence(before, after)).toEqual({ verified: false, checkedRows: 1, counterexample: { a: 0 } });
  });
  it('checks one row for a zero-input constant circuit', () => {
    const netlist: Netlist = { inputs: [], outputs: ['y'], wires: [], gates: [], aliases: [{ input: '1', output: 'y', span: DEFAULT_SPAN }] };
    expect(verifyEquivalence(netlist, netlist)).toEqual({ verified: true, checkedRows: 1 });
  });
  it('rejects mismatched equivalence interfaces', () => {
    const before = copyNetlist();
    const after = { ...copyNetlist(), outputs: ['z'] };
    expect(verifyEquivalence(before, after)).toEqual({ verified: false, checkedRows: 0 });
  });
});

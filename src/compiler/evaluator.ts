import { LIMITS, type EquivalenceResult, type GateOp, type Netlist } from './types';

export type Bit = 0 | 1;
type Operation = { op: GateOp | 'COPY'; inputs: string[]; output: string };
const schedules = new WeakMap<Netlist, Operation[]>();

/** Boolean operators share one truth-preserving implementation across evaluator targets. */
export function evaluateOperator(op: GateOp, a: Bit, b: Bit = 0): Bit {
  switch (op) {
    case 'NOT': return a ? 0 : 1;
    case 'AND': return (a & b) as Bit;
    case 'NAND': return (1 ^ (a & b)) as Bit;
    case 'OR': return (a | b) as Bit;
    case 'NOR': return (1 ^ (a | b)) as Bit;
    case 'XOR': return (a ^ b) as Bit;
    case 'XNOR': return (1 ^ a ^ b) as Bit;
  }
}

/** An iterative dependency schedule handles aliases and gates in either storage order. */
export function executionSchedule(netlist: Netlist): Operation[] {
  const cached = schedules.get(netlist);
  if (cached) return cached;
  if (netlist.inputs.length > LIMITS.inputs) throw new Error(`At most ${LIMITS.inputs} inputs can be evaluated exhaustively.`);
  const operations: Operation[] = [
    ...netlist.gates.map(g => ({ op: g.type, inputs: g.inputs, output: g.output })),
    ...netlist.aliases.map(a => ({ op: 'COPY' as const, inputs: [a.input], output: a.output })),
  ];
  const drivers = new Map<string, number>();
  operations.forEach((operation, index) => {
    if (drivers.has(operation.output) || netlist.inputs.includes(operation.output)) throw new Error(`Net '${operation.output}' has multiple drivers.`);
    drivers.set(operation.output, index);
  });
  const known = new Set([...netlist.inputs, '0', '1']);
  const unresolved = operations.map(operation => new Set(operation.inputs.filter(input => !known.has(input))));
  const consumers = new Map<string, number[]>();
  unresolved.forEach((dependencies, index) => dependencies.forEach(net => {
    const users = consumers.get(net) ?? [];
    users.push(index);
    consumers.set(net, users);
  }));
  const queue = operations.flatMap((_, index) => unresolved[index].size ? [] : [index]);
  const schedule: Operation[] = [];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    const operation = operations[index];
    schedule.push(operation);
    for (const user of consumers.get(operation.output) ?? []) {
      unresolved[user].delete(operation.output);
      if (unresolved[user].size === 0) queue.push(user);
    }
  }
  if (schedule.length !== operations.length || netlist.outputs.some(output => !known.has(output) && !drivers.has(output))) {
    throw new Error('The netlist contains a cycle or an undefined net.');
  }
  schedules.set(netlist, schedule);
  return schedule;
}

/** Returns every named signal and temporary net, using prototype-safe dictionaries. */
export function evaluateNetlist(netlist: Netlist, inputs: Record<string, Bit>): Record<string, Bit> {
  const values: Record<string, Bit> = Object.create(null);
  values['0'] = 0;
  values['1'] = 1;
  for (const input of netlist.inputs) values[input] = inputs[input] === 1 ? 1 : 0;
  for (const operation of executionSchedule(netlist)) {
    values[operation.output] = operation.op === 'COPY'
      ? values[operation.inputs[0]]
      : evaluateOperator(operation.op, values[operation.inputs[0]], values[operation.inputs[1]]);
  }
  return values;
}

/** Declaration order is MSB-first, with the all-zero input assignment first. */
export function inputsForRow(names: string[], index: number): Record<string, Bit> {
  const inputs: Record<string, Bit> = Object.create(null);
  names.forEach((name, position) => { inputs[name] = ((index >> (names.length - position - 1)) & 1) as Bit; });
  return inputs;
}

export function verifyEquivalence(original: Netlist, optimized: Netlist): EquivalenceResult {
  if (original.inputs.length !== optimized.inputs.length || original.inputs.some((name, i) => name !== optimized.inputs[i]) ||
      original.outputs.length !== optimized.outputs.length || original.outputs.some((name, i) => name !== optimized.outputs[i])) {
    return { verified: false, checkedRows: 0 };
  }
  if (original.inputs.length > LIMITS.inputs) throw new Error(`Equivalence checking is limited to ${LIMITS.inputs} inputs.`);
  const total = 2 ** original.inputs.length;
  for (let index = 0; index < total; index++) {
    const inputs = inputsForRow(original.inputs, index);
    const before = evaluateNetlist(original, inputs);
    const after = evaluateNetlist(optimized, inputs);
    if (original.outputs.some(name => before[name] !== after[name])) {
      return { verified: false, checkedRows: index + 1, counterexample: inputs };
    }
  }
  return { verified: true, checkedRows: total };
}

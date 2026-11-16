import { executionSchedule } from './evaluator';
import { LIMITS, type Expr, type Gate, type IRResult, type Netlist, type Program, type SemanticResult, type Span, type TACInstruction } from './types';

export function computeMetrics(netlist: Netlist): { gateCount: number; depth: number } {
  const depths = new Map<string, number>([...netlist.inputs, '0', '1'].map(name => [name, 0]));
  let depth = 0;
  for (const operation of executionSchedule(netlist)) {
    const value = Math.max(0, ...operation.inputs.map(net => depths.get(net) ?? 0)) + (operation.op === 'COPY' ? 0 : 1);
    depths.set(operation.output, value);
    depth = Math.max(depth, value);
  }
  return { gateCount: netlist.gates.length, depth };
}

/** Reconstruct a dependency-ordered TAC view after netlist transformations. */
export function netlistToIR(netlist: Netlist): IRResult {
  const gates = new Map(netlist.gates.map(gate => [gate.output, gate]));
  const aliases = new Map(netlist.aliases.map(alias => [alias.output, alias]));
  const tac: TACInstruction[] = executionSchedule(netlist).map((operation, index) => ({
    index: index + 1,
    op: operation.op,
    arg1: operation.inputs[0],
    ...(operation.inputs[1] !== undefined ? { arg2: operation.inputs[1] } : {}),
    result: operation.output,
    span: (gates.get(operation.output) ?? aliases.get(operation.output))!.span,
    ...(gates.has(operation.output) ? { gateId: gates.get(operation.output)!.id } : {}),
  }));
  return { tac, netlist, ...computeMetrics(netlist) };
}

export function generateIR(program: Program, semantic: SemanticResult): IRResult {
  const byKind = (kind: string) => semantic.symbols.filter(symbol => symbol.kind === kind).map(symbol => symbol.name);
  const netlist: Netlist = { inputs: byKind('input'), outputs: byKind('output'), wires: byKind('wire'), gates: [], aliases: [] };
  const assignments = new Map(program.body.flatMap(item => item.kind === 'Assignment' ? [[item.target.name, item] as const] : []));
  const reserved = new Set(semantic.symbols.map(symbol => symbol.name));
  const tac: TACInstruction[] = [];
  let temp = 0;
  const temporary = () => {
    let name: string;
    do { name = `t${++temp}`; } while (reserved.has(name));
    reserved.add(name);
    return name;
  };
  const copy = (input: string, output: string, span: Span) => {
    netlist.aliases.push({ input, output, span });
    tac.push({ index: tac.length + 1, op: 'COPY', arg1: input, result: output, span });
  };
  const emit = (expression: Expr, result?: string): string => {
    if (expression.kind === 'Identifier' || expression.kind === 'Literal') {
      const net = expression.kind === 'Identifier' ? expression.name : String(expression.value);
      if (result && result !== net) copy(net, result, expression.span);
      return result ?? net;
    }
    const inputs = expression.kind === 'Unary'
      ? [emit(expression.operand)]
      : [emit(expression.left), emit(expression.right)];
    const output = result ?? temporary();
    if (netlist.gates.length >= LIMITS.gates) throw new Error(`Circuit exceeds the ${LIMITS.gates}-gate limit. Split it into smaller circuits.`);
    const gate: Gate = { id: `g${netlist.gates.length + 1}`, type: expression.op, inputs, output, span: expression.span };
    netlist.gates.push(gate);
    tac.push({ index: tac.length + 1, op: gate.type, arg1: inputs[0], ...(inputs[1] ? { arg2: inputs[1] } : {}), result: output, span: expression.span, gateId: gate.id });
    return output;
  };
  for (const name of semantic.topologicalOrder) {
    const assignment = assignments.get(name);
    if (assignment) emit(assignment.expression, name);
  }
  return { tac, netlist, ...computeMetrics(netlist) };
}

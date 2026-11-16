import { evaluateOperator, executionSchedule, verifyEquivalence } from './evaluator';
import { generateIR, netlistToIR } from './ir';
import { type Expr, type IRResult, type Netlist, type OptimizationStep, type OptimizerResult, type Program, type SemanticResult, type Span } from './types';

export { verifyEquivalence } from './evaluator';

export function expressionText(expression: Expr): string {
  switch (expression.kind) {
    case 'Literal': return String(expression.value);
    case 'Identifier': return expression.name;
    case 'Unary': return `NOT ${expression.operand.kind === 'Binary' ? `(${expressionText(expression.operand)})` : expressionText(expression.operand)}`;
    case 'Binary': return `(${expressionText(expression.left)} ${expression.op} ${expressionText(expression.right)})`;
  }
}

/** Canonical structural identity treats commutative operands alike, never reassociates NAND/NOR. */
function expressionKey(expression: Expr): string {
  switch (expression.kind) {
    case 'Literal': return `#${expression.value}`;
    case 'Identifier': return `@${expression.name}`;
    case 'Unary': return `NOT(${expressionKey(expression.operand)})`;
    case 'Binary': return `${expression.op}(${[expressionKey(expression.left), expressionKey(expression.right)].sort().join(',')})`;
  }
}

export function simplifyExpression(expression: Expr, steps: OptimizationStep[] = []): Expr {
  if (expression.kind === 'Identifier' || expression.kind === 'Literal') return expression;
  const current: Expr = expression.kind === 'Unary'
    ? { ...expression, operand: simplifyExpression(expression.operand, steps) }
    : { ...expression, left: simplifyExpression(expression.left, steps), right: simplifyExpression(expression.right, steps) };
  const literal = (value: 0 | 1): Expr => ({ kind: 'Literal', value, span: current.span });
  const negate = (operand: Expr): Expr => ({ kind: 'Unary', op: 'NOT', operand, span: current.span });
  const apply = (rule: string, replacement: Expr): Expr => {
    steps.push({ rule, before: expressionText(current), after: expressionText(replacement), span: current.span });
    return simplifyExpression(replacement, steps);
  };
  if (current.kind === 'Unary') {
    if (current.operand.kind === 'Literal') return apply('Constant folding', literal(evaluateOperator('NOT', current.operand.value)));
    if (current.operand.kind === 'Unary') return apply('Double negation elimination', current.operand.operand);
    return current;
  }
  if (current.kind !== 'Binary') return current;
  const { left, right, op } = current;
  if (left.kind === 'Literal' && right.kind === 'Literal') return apply('Constant folding', literal(evaluateOperator(op, left.value, right.value)));
  const same = expressionKey(left) === expressionKey(right);
  const complements = (left.kind === 'Unary' && expressionKey(left.operand) === expressionKey(right)) ||
    (right.kind === 'Unary' && expressionKey(right.operand) === expressionKey(left));
  if (same) {
    if (op === 'AND' || op === 'OR') return apply('Idempotence', left);
    if (op === 'XOR' || op === 'XNOR') return apply('Idempotence', literal(op === 'XOR' ? 0 : 1));
    return apply('Idempotence', negate(left));
  }
  if (complements) {
    const value = (op === 'OR' || op === 'NAND' || op === 'XOR') ? 1 : 0;
    return apply('Complement law', literal(value));
  }
  const constant = left.kind === 'Literal' ? left : right.kind === 'Literal' ? right : undefined;
  const other = left.kind === 'Literal' ? right : left;
  if (!constant) return current;
  const bit = constant.value;
  switch (op) {
    case 'AND': return bit === 0 ? apply('Annihilator law', literal(0)) : apply('Identity law', other);
    case 'OR': return bit === 1 ? apply('Annihilator law', literal(1)) : apply('Identity law', other);
    case 'XOR': return bit === 0 ? apply('Identity law', other) : apply('XOR inversion', negate(other));
    case 'NAND': return bit === 0 ? apply('Annihilator law', literal(1)) : apply('Identity law', negate(other));
    case 'NOR': return bit === 1 ? apply('Annihilator law', literal(0)) : apply('Identity law', negate(other));
    case 'XNOR': return bit === 1 ? apply('Identity law', other) : apply('XNOR inversion', negate(other));
  }
}

function eliminateCommonSubexpressions(netlist: Netlist, steps: OptimizationStep[]): Netlist {
  const result: Netlist = { ...netlist, gates: [], aliases: [] };
  const gates = new Map(netlist.gates.map(gate => [gate.output, gate]));
  const aliases = new Map(netlist.aliases.map(alias => [alias.output, alias]));
  const replacements = new Map<string, string>();
  const expressions = new Map<string, string>();
  const resolve = (net: string): string => replacements.get(net) ?? net;
  for (const operation of executionSchedule(netlist)) {
    if (operation.op === 'COPY') {
      const alias = aliases.get(operation.output)!;
      const input = resolve(alias.input);
      replacements.set(alias.output, input);
      result.aliases.push({ ...alias, input });
      continue;
    }
    const gate = gates.get(operation.output)!;
    const inputs = gate.inputs.map(resolve);
    const signature = `${gate.type}:${(gate.type === 'NOT' ? inputs : [...inputs].sort()).join(',')}`;
    const existing = expressions.get(signature);
    if (existing !== undefined) {
      replacements.set(gate.output, existing);
      result.aliases.push({ input: existing, output: gate.output, span: gate.span });
      steps.push({ rule: 'Common subexpression elimination', before: `${gate.output} = ${gate.type} ${inputs.join(', ')}`, after: `${gate.output} = ${existing}`, span: gate.span });
    } else {
      expressions.set(signature, gate.output);
      result.gates.push({ ...gate, inputs });
    }
  }
  return result;
}

function eliminateDeadCode(netlist: Netlist, steps: OptimizationStep[]): Netlist {
  const definitions = new Map<string, { inputs: string[]; span: Span; text: string }>();
  netlist.gates.forEach(gate => definitions.set(gate.output, { inputs: gate.inputs, span: gate.span, text: `${gate.output} = ${gate.type} ${gate.inputs.join(', ')}` }));
  netlist.aliases.forEach(alias => definitions.set(alias.output, { inputs: [alias.input], span: alias.span, text: `${alias.output} = ${alias.input}` }));
  const live = new Set<string>();
  const pending = [...netlist.outputs];
  while (pending.length) {
    const net = pending.pop()!;
    if (live.has(net)) continue;
    live.add(net);
    pending.push(...(definitions.get(net)?.inputs ?? []));
  }
  definitions.forEach((definition, output) => {
    if (!live.has(output)) steps.push({ rule: 'Dead code elimination', before: definition.text, after: 'Removed: no path to an output', span: definition.span });
  });
  return {
    ...netlist,
    wires: netlist.wires.filter(wire => live.has(wire)),
    gates: netlist.gates.filter(gate => live.has(gate.output)),
    aliases: netlist.aliases.filter(alias => live.has(alias.output)),
  };
}

export function optimize(program: Program, semantic: SemanticResult, originalIR: IRResult): OptimizerResult {
  const steps: OptimizationStep[] = [];
  const optimizedProgram: Program = {
    ...program,
    body: program.body.map(item => item.kind === 'Assignment' ? { ...item, expression: simplifyExpression(item.expression, steps) } : item),
  };
  const simplified = generateIR(optimizedProgram, semantic);
  const netlist = eliminateDeadCode(eliminateCommonSubexpressions(simplified.netlist, steps), steps);
  const ir = netlistToIR(netlist);
  return {
    program: optimizedProgram,
    ir,
    steps,
    equivalence: verifyEquivalence(originalIR.netlist, ir.netlist),
    before: { gateCount: originalIR.gateCount, depth: originalIR.depth },
    after: { gateCount: ir.gateCount, depth: ir.depth },
  };
}

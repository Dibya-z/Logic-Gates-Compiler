import { DEFAULT_SPAN, LIMITS, type Assignment, type Diagnostic, type Expr, type Program, type SemanticResult, type Span, type SymbolEntry } from './types';

const RESERVED = new Set(['INPUT', 'OUTPUT', 'WIRE', 'AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR', 'XNOR']);

function identifiers(expression: Expr): Extract<Expr, { kind: 'Identifier' }>[] {
  const found: Extract<Expr, { kind: 'Identifier' }>[] = [];
  const pending = [expression];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.kind === 'Identifier') found.push(node);
    else if (node.kind === 'Unary') pending.push(node.operand);
    else if (node.kind === 'Binary') pending.push(node.right, node.left);
  }
  return found;
}

const key = (expression: Expr): string => {
  if (expression.kind === 'Literal') return String(expression.value);
  if (expression.kind === 'Identifier') return `id:${expression.name}`;
  if (expression.kind === 'Unary') return `NOT(${key(expression.operand)})`;
  return `${expression.op}(${key(expression.left)},${key(expression.right)})`;
};
const complements = (left: Expr, right: Expr) => (left.kind === 'Unary' && key(left.operand) === key(right)) || (right.kind === 'Unary' && key(right.operand) === key(left));
function constant(expression: Expr, known: Map<string, 0 | 1>): 0 | 1 | undefined {
  if (expression.kind === 'Literal') return expression.value;
  if (expression.kind === 'Identifier') return known.get(expression.name);
  if (expression.kind === 'Unary') {
    const operand = constant(expression.operand, known);
    return operand === undefined ? undefined : operand === 1 ? 0 : 1;
  }
  const a = constant(expression.left, known), b = constant(expression.right, known);
  if (a !== undefined && b !== undefined) {
    switch (expression.op) {
      case 'AND': return a & b ? 1 : 0;
      case 'NAND': return a & b ? 0 : 1;
      case 'OR': return a | b ? 1 : 0;
      case 'NOR': return a | b ? 0 : 1;
      case 'XOR': return a !== b ? 1 : 0;
      case 'XNOR': return a === b ? 1 : 0;
    }
  }
  if (expression.op === 'AND' && (a === 0 || b === 0)) return 0;
  if (expression.op === 'NAND' && (a === 0 || b === 0)) return 1;
  if (expression.op === 'OR' && (a === 1 || b === 1)) return 1;
  if (expression.op === 'NOR' && (a === 1 || b === 1)) return 0;
  if (complements(expression.left, expression.right)) {
    if (['OR', 'NAND', 'XOR'].includes(expression.op)) return 1;
    return 0;
  }
  if (key(expression.left) === key(expression.right)) {
    if (expression.op === 'XOR') return 0;
    if (expression.op === 'XNOR') return 1;
  }
  return undefined;
}

/** Collect declarations first, then check drivers and dependency order. */
export function analyze(program: Program): SemanticResult {
  const symbols: SymbolEntry[] = [];
  const byName = new Map<string, SymbolEntry>();
  const diagnostics: Diagnostic[] = [];
  const assignments = program.body.filter((item): item is Assignment => item.kind === 'Assignment');
  const report = (code: string, message: string, hint: string, span: Span, severity: Diagnostic['severity'] = 'error', related?: Diagnostic['related']) => {
    diagnostics.push({ phase: 'semantic', severity, code, message, hint, offset: span.offset, line: span.line, column: span.column, length: Math.max(1, span.length), ...(related ? { related } : {}) });
  };
  const reserved = (name: string, span: Span) => {
    if (RESERVED.has(name.toUpperCase())) report('SEM005', `"${name}" is a language keyword and cannot be used as a signal name.`, `Rename this signal, for example ${name.toLowerCase()}_signal.`, span);
  };
  for (const item of program.body) {
    if (item.kind !== 'Declaration') continue;
    for (const name of item.names) {
      reserved(name.name, name.span);
      const previous = byName.get(name.name);
      if (previous) {
        report('SEM002', `Signal '${name.name}' is already declared on line ${previous.declaredAt.line}.`, 'Declare each signal exactly once.', name.span, 'error', [{ message: 'First declaration', span: previous.declaredAt }]);
      } else {
        const symbol: SymbolEntry = { name: name.name, kind: item.signalKind, declaredAt: name.span, assignedAt: [], usedBy: [], usedByCount: 0 };
        symbols.push(symbol); byName.set(symbol.name, symbol);
      }
    }
  }
  const dependencies: SemanticResult['dependencies'] = [];
  const edgeKeys = new Set<string>();
  const targetSpans = new Map<string, Span>();
  for (const item of assignments) {
    const target = byName.get(item.target.name);
    reserved(item.target.name, item.target.span);
    if (!target) report('SEM001', `Assignment target '${item.target.name}' has not been declared.`, `Declare it with output ${item.target.name}; or wire ${item.target.name};.`, item.target.span);
    else {
      target.assignedAt.push(item.target.span);
      if (target.kind === 'input') report('SEM004', `Input '${target.name}' cannot be assigned inside the circuit.`, 'Drive inputs from the simulator, or change this declaration to wire/output.', item.target.span);
      if (target.assignedAt.length > 1) report('SEM003', `${target.kind} '${target.name}' is already assigned on line ${target.assignedAt[0].line}. A signal can have only one driver.`, 'Combine the expressions into one assignment or introduce a new wire.', item.target.span, 'error', [{ message: 'First driver', span: target.assignedAt[0] }]);
      else { target.driver = item.expression; targetSpans.set(target.name, item.target.span); }
    }
    for (const use of identifiers(item.expression)) {
      const signal = byName.get(use.name);
      if (!signal) report('SEM001', `Signal '${use.name}' is used but has not been declared.`, `Declare input ${use.name}; for an external signal, or declare and assign a wire.`, use.span);
      else {
        if (!signal.usedBy.includes(item.target.name)) signal.usedBy.push(item.target.name);
        signal.usedByCount = signal.usedBy.length;
        const edgeKey = JSON.stringify([use.name, item.target.name]);
        if (target && !edgeKeys.has(edgeKey)) { edgeKeys.add(edgeKey); dependencies.push({ from: use.name, to: item.target.name }); }
      }
    }
  }
  const inputs = symbols.filter(symbol => symbol.kind === 'input');
  if (inputs.length > LIMITS.inputs) report('SEM008', `This circuit declares ${inputs.length} inputs; truth tables support at most ${LIMITS.inputs} (${2 ** LIMITS.inputs} rows).`, 'Reduce the number of input signals or split the circuit.', inputs[LIMITS.inputs].declaredAt);
  if (!symbols.some(symbol => symbol.kind === 'output')) report('SEM009', 'The circuit has no declared output.', 'Declare an output and assign its driver, for example output y; y = 0;.', program.span ?? DEFAULT_SPAN);
  for (const symbol of symbols) {
    if (symbol.kind !== 'input' && !symbol.assignedAt.length) report('SEM006', `${symbol.kind} '${symbol.name}' is declared but never assigned.`, `Add exactly one driver: ${symbol.name} = expression;.`, symbol.declaredAt);
    if (!symbol.usedByCount && symbol.kind === 'input') report('SEM101', `Input '${symbol.name}' is unused.`, 'Use this input in a driver expression or remove its declaration.', symbol.declaredAt, 'warning');
    if (!symbol.usedByCount && symbol.kind === 'wire') report('SEM102', `Wire '${symbol.name}' is unused.`, 'Connect the wire to an output expression or remove it.', symbol.declaredAt, 'warning');
  }

  // Iterative DFS detects feedback without risking a JavaScript call-stack overflow.
  const adjacency = new Map(symbols.map(symbol => [symbol.name, [] as string[]]));
  const indegree = new Map(symbols.map(symbol => [symbol.name, 0]));
  for (const edge of dependencies) {
    adjacency.get(edge.from)!.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }
  const state = new Map<string, number>();
  for (const symbol of symbols) {
    if (state.has(symbol.name)) continue;
    const path = [symbol.name];
    const frames = [{ name: symbol.name, next: 0 }];
    state.set(symbol.name, 1);
    while (frames.length) {
      const frame = frames[frames.length - 1];
      const next = adjacency.get(frame.name)![frame.next++];
      if (next === undefined) { state.set(frame.name, 2); frames.pop(); path.pop(); continue; }
      if (state.get(next) === 1) {
        const cycle = [...path.slice(path.indexOf(next)), next];
        report('SEM007', `Combinational cycle detected: ${cycle.join(' → ')}.`, 'Break this feedback path. LogicHDL models combinational circuits without stored state.', targetSpans.get(next) ?? byName.get(next)!.declaredAt);
      } else if (!state.has(next)) { state.set(next, 1); frames.push({ name: next, next: 0 }); path.push(next); }
    }
  }
  const ready = symbols.filter(symbol => indegree.get(symbol.name) === 0).map(symbol => symbol.name);
  const topologicalOrder: string[] = [];
  for (let index = 0; index < ready.length; index++) {
    const name = ready[index]; topologicalOrder.push(name);
    for (const next of adjacency.get(name)!) {
      indegree.set(next, indegree.get(next)! - 1);
      if (!indegree.get(next)) ready.push(next);
    }
  }
  const known = new Map<string, 0 | 1>();
  for (const name of topologicalOrder) {
    const symbol = byName.get(name)!;
    if (!symbol.driver || symbol.kind === 'input') continue;
    const value = constant(symbol.driver, known);
    if (value === undefined) continue;
    known.set(name, value);
    if (symbol.kind === 'output') {
      report('SEM103', `Output '${name}' is driven by the constant ${value}.`, 'Confirm that a constant output is intended; inspect the optimizer for simplifications.', symbol.driver.span, 'warning');
      if (symbol.driver.kind !== 'Literal') report(value ? 'SEM104' : 'SEM105', `Output '${name}' is a ${value ? 'tautology (always 1)' : 'contradiction (always 0)'}.`, 'Check the expression for redundant or complementary signals.', symbol.driver.span, 'warning');
    }
  }
  return { symbols, dependencies, topologicalOrder, diagnostics };
}

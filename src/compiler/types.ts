/** Shared compiler contracts. This directory has no React or DOM dependencies. */
export type Phase = 'lexer' | 'parser' | 'semantic' | 'ir' | 'optimizer' | 'codegen';
export interface Span { offset: number; line: number; column: number; length: number }
export interface Diagnostic extends Span {
  phase: Phase;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  hint: string;
  related?: { message: string; span: Span }[];
}
export type BinaryOp = 'AND' | 'NAND' | 'XOR' | 'XNOR' | 'OR' | 'NOR';
export type GateOp = BinaryOp | 'NOT';
export type TokenType = 'KEYWORD_INPUT' | 'KEYWORD_OUTPUT' | 'KEYWORD_WIRE' | 'IDENT' | 'NUMBER' | GateOp | 'LPAREN' | 'RPAREN' | 'COMMA' | 'SEMICOLON' | 'ASSIGN' | 'EOF';
export interface Token extends Span { type: TokenType; lexeme: string }
export interface Identifier { kind: 'Identifier'; name: string; span: Span }
export interface Literal { kind: 'Literal'; value: 0 | 1; span: Span }
export interface Unary { kind: 'Unary'; op: 'NOT'; operand: Expr; span: Span }
export interface Binary { kind: 'Binary'; op: BinaryOp; left: Expr; right: Expr; span: Span }
export type Expr = Identifier | Literal | Unary | Binary;
export type SignalKind = 'input' | 'output' | 'wire';
export interface Declaration { kind: 'Declaration'; signalKind: SignalKind; names: Identifier[]; span: Span }
export interface Assignment { kind: 'Assignment'; target: Identifier; expression: Expr; span: Span }
export interface Program { kind: 'Program'; body: (Declaration | Assignment)[]; span: Span }
export interface ParseNode { id: string; label: string; span: Span; children: ParseNode[]; token?: Token }
export interface LexerResult { tokens: Token[]; diagnostics: Diagnostic[] }
export interface ParserResult { ast: Program; parseTree: ParseNode; diagnostics: Diagnostic[] }
export interface SymbolEntry {
  name: string; kind: SignalKind; declaredAt: Span; assignedAt: Span[];
  usedBy: string[]; usedByCount: number; driver?: Expr;
}
export interface DependencyEdge { from: string; to: string }
export interface SemanticResult {
  symbols: SymbolEntry[]; dependencies: DependencyEdge[]; topologicalOrder: string[]; diagnostics: Diagnostic[];
}
export interface TACInstruction {
  index: number; op: GateOp | 'COPY'; arg1: string; arg2?: string; result: string; span: Span; gateId?: string;
}
export interface Gate { id: string; type: GateOp; inputs: string[]; output: string; span: Span }
export interface Netlist {
  inputs: string[]; outputs: string[]; wires: string[]; gates: Gate[];
  /** Ordered copies bridge named signals and temporary nets without adding gates. */
  aliases: { output: string; input: string; span: Span }[];
}
export interface IRResult { tac: TACInstruction[]; netlist: Netlist; gateCount: number; depth: number }
export interface OptimizationStep { rule: string; before: string; after: string; span: Span }
export interface EquivalenceResult { verified: boolean; checkedRows: number; counterexample?: Record<string, 0 | 1> }
export interface OptimizerResult {
  program: Program; ir: IRResult; steps: OptimizationStep[]; equivalence: EquivalenceResult;
  before: { gateCount: number; depth: number }; after: { gateCount: number; depth: number };
}
export interface TruthRow { index: number; values: Record<string, 0 | 1> }
export interface CanonicalForm { output: string; minterms: number[]; maxterms: number[]; sop: string; pos: string; sopExpression: string; posExpression: string }
export interface TruthTable { inputs: string[]; outputs: string[]; wires: string[]; rows: TruthRow[]; forms: CanonicalForm[] }
export interface LayoutNode { id: string; kind: 'input' | 'output' | 'gate' | 'constant'; label: string; net: string; x: number; y: number; width: number; height: number; gate?: Gate }
export interface LayoutWire { id: string; net: string; points: { x: number; y: number }[]; color: string }
export interface CircuitLayout { width: number; height: number; nodes: LayoutNode[]; wires: LayoutWire[] }
export interface CodegenResult { truthTable: TruthTable; verilog: string; layout: CircuitLayout; svg: string }
export type StageStatus = 'success' | 'warning' | 'error' | 'skipped' | 'disabled';
export interface StageResult { phase: Phase; status: StageStatus; errorCount: number; blockedBy?: Phase; durationMs: number }
export interface CompilationResult {
  source: string; tokens: Token[]; ast?: Program; parseTree?: ParseNode; semantic?: SemanticResult;
  ir?: IRResult; optimizer?: OptimizerResult; codegen?: CodegenResult;
  diagnostics: Diagnostic[]; stages: StageResult[]; durationMs: number; optimized: boolean;
}
export const LIMITS = { sourceLength: 10000, tokens: 4000, depth: 96, inputs: 12, statements: 256, gates: 1024 } as const;
export const DEFAULT_SPAN: Span = { offset: 0, line: 1, column: 1, length: 1 };

import { DEFAULT_SPAN, LIMITS, type Assignment, type BinaryOp, type Declaration, type Diagnostic, type Expr, type Identifier, type ParseNode, type ParserResult, type Program, type Span, type Token, type TokenType } from './types';

class ParseFailure extends Error {}
const RESERVED = new Set<TokenType>(['KEYWORD_INPUT', 'KEYWORD_OUTPUT', 'KEYWORD_WIRE', 'AND', 'NAND', 'XOR', 'XNOR', 'OR', 'NOR', 'NOT']);
const BINARY = new Set<TokenType>(['AND', 'NAND', 'XOR', 'XNOR', 'OR', 'NOR']);

/** Recursive descent with concrete grammar nodes and semicolon panic recovery. */
export function parse(input: Token[]): ParserResult {
  const tokens = input.length && input[input.length - 1].type === 'EOF' ? input : [...input, { type: 'EOF' as const, lexeme: '', ...DEFAULT_SPAN, length: 0 }];
  const diagnostics: Diagnostic[] = [];
  let position = 0, serial = 0, depth = 0;
  const expressionDepth = new WeakMap<Expr, number>();
  const current = () => tokens[Math.min(position, tokens.length - 1)];
  const previous = () => tokens[Math.max(0, position - 1)];
  const spanFrom = (start: Span, end: Span): Span => ({ ...start, length: Math.max(0, end.offset + end.length - start.offset) });
  const root: ParseNode = { id: `p${++serial}`, label: 'program', span: { ...current() }, children: [] };
  const stack: ParseNode[] = [root];
  const consume = () => {
    const token = current();
    if (token.type !== 'EOF') position++;
    stack[stack.length - 1].children.push({ id: `p${++serial}`, label: `${token.type}${token.lexeme ? ` · ${token.lexeme}` : ''}`, span: { ...token }, children: [], token });
    return token;
  };
  const rule = <T>(label: string, operation: () => T): T => {
    const start = current();
    const node: ParseNode = { id: `p${++serial}`, label, span: { ...start }, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
    try { return operation(); }
    finally { node.span = spanFrom(start, position ? previous() : start); stack.pop(); }
  };
  const fail = (code: string, expected: string, hint: string, token = current()): never => {
    const found = token.type === 'EOF' ? 'end of program' : JSON.stringify(token.lexeme);
    diagnostics.push({ phase: 'parser', severity: 'error', code, message: `Expected ${expected}; found ${found}.`, hint, offset: token.offset, line: token.line, column: token.column, length: Math.max(1, token.length) });
    stack[stack.length - 1].children.push({ id: `p${++serial}`, label: `Error: expected ${expected}`, span: { ...token }, children: [] });
    throw new ParseFailure();
  };
  const expect = (type: TokenType, code: string, expected: string, hint: string) => current().type === type ? consume() : fail(current().type === 'EOF' && type !== 'SEMICOLON' ? 'SYN008' : code, expected, hint);
  const identifier = (): Identifier => {
    // Keep reserved words here so semantic analysis can explain invalid names precisely.
    if (current().type !== 'IDENT' && !RESERVED.has(current().type)) fail('SYN009', 'a signal name', 'Use a name beginning with a letter or underscore.');
    const name = consume();
    return { kind: 'Identifier', name: name.lexeme, span: { ...name } };
  };
  const rememberDepth = <T extends Expr>(expression: T, value: number): T => {
    if (value > LIMITS.depth) fail('SYN012', `an expression no deeper than ${LIMITS.depth} levels`, 'Split this expression into several named wires.', previous());
    expressionDepth.set(expression, value);
    return expression;
  };
  const primary = (): Expr => rule('primary', () => {
    const token = current();
    if (token.type === 'IDENT') { consume(); return rememberDepth({ kind: 'Identifier', name: token.lexeme, span: { ...token } }, 1); }
    if (token.type === 'NUMBER') { consume(); return rememberDepth({ kind: 'Literal', value: token.lexeme === '1' ? 1 : 0, span: { ...token } }, 1); }
    if (token.type === 'LPAREN') {
      consume();
      if (current().type === 'RPAREN') fail('SYN005', 'an expression inside parentheses', 'Put a signal, a literal, or a logic expression between ( and ).');
      const expression = expr();
      const close = expect('RPAREN', 'SYN002', '")" to match the opening parenthesis', 'Add the missing closing parenthesis.');
      expression.span = spanFrom(token, close);
      return expression;
    }
    if (BINARY.has(token.type)) fail('SYN010', 'an operand between the operators', 'Remove the extra operator or insert a signal, 0, or 1.');
    if (token.type === 'EOF') fail('SYN008', 'an operand before the end of the program', 'Complete the expression and end the statement with a semicolon.');
    return fail('SYN003', 'an operand (signal, 0, 1, NOT, or parenthesized expression)', 'Insert the missing operand.');
  });
  const unary = (): Expr => rule('unary', () => {
    depth++;
    try {
      if (depth > LIMITS.depth) fail('SYN012', `nesting no deeper than ${LIMITS.depth} levels`, 'Split nested expressions into named wires.');
      if (current().type === 'NOT') {
        const operator = consume();
        const operand = unary();
        return rememberDepth({ kind: 'Unary', op: 'NOT', operand, span: spanFrom(operator, operand.span) }, (expressionDepth.get(operand) ?? 1) + 1);
      }
      return primary();
    } finally { depth--; }
  });
  const binaryLevel = (label: string, lower: () => Expr, operators: TokenType[]): Expr => rule(label, () => {
    let left = lower();
    while (operators.includes(current().type)) {
      const operator = consume();
      const right = lower();
      left = rememberDepth({ kind: 'Binary', op: operator.type as BinaryOp, left, right, span: spanFrom(left.span, right.span) }, 1 + Math.max(expressionDepth.get(left) ?? 1, expressionDepth.get(right) ?? 1));
    }
    return left;
  });
  const andExpr = (): Expr => binaryLevel('andExpr', unary, ['AND', 'NAND']);
  const xorExpr = (): Expr => binaryLevel('xorExpr', andExpr, ['XOR', 'XNOR']);
  const orExpr = (): Expr => binaryLevel('orExpr', xorExpr, ['OR', 'NOR']);
  const expr = (): Expr => rule('expr', orExpr);
  const declaration = (): Declaration => rule('declaration', () => {
    const keyword = consume();
    if (current().type === 'SEMICOLON' || current().type === 'EOF') fail('SYN007', 'at least one signal name after the declaration keyword', 'Add one or more comma-separated names, for example input a, b;.');
    const names = [identifier()];
    while (current().type === 'COMMA') { consume(); names.push(identifier()); }
    const semi = expect('SEMICOLON', 'SYN001', '";" after the declaration', 'End each declaration with a semicolon.');
    return { kind: 'Declaration', signalKind: keyword.type === 'KEYWORD_INPUT' ? 'input' : keyword.type === 'KEYWORD_OUTPUT' ? 'output' : 'wire', names, span: spanFrom(keyword, semi) };
  });
  const statement = (): Assignment => rule('statement', () => {
    const target = identifier();
    expect('ASSIGN', 'SYN004', '"=" after the assignment target', 'Write assignments as signal = expression;.');
    const expression = expr();
    if (current().type === 'RPAREN') fail('SYN002', '";" after a balanced expression', 'Remove this extra closing parenthesis, or add its opening parenthesis.');
    const semi = expect('SEMICOLON', 'SYN001', '";" after the expression', 'End every assignment with a semicolon.');
    return { kind: 'Assignment', target, expression, span: spanFrom(target.span, semi) };
  });
  const body: Program['body'] = [];
  let itemCount = 0;
  while (current().type !== 'EOF') {
    if (++itemCount > LIMITS.statements) {
      diagnostics.push({ phase: 'parser', severity: 'error', code: 'SYN011', message: `Expected at most ${LIMITS.statements} declarations and assignments; found more.`, hint: 'Reduce the circuit size or combine declarations.', ...current(), length: Math.max(1, current().length) });
      break;
    }
    try {
      const token = current();
      if (['KEYWORD_INPUT', 'KEYWORD_OUTPUT', 'KEYWORD_WIRE'].includes(token.type) && tokens[position + 1]?.type !== 'ASSIGN') body.push(declaration());
      else if (token.type === 'IDENT' || RESERVED.has(token.type)) body.push(statement());
      else fail(token.type === 'RPAREN' ? 'SYN002' : 'SYN006', 'a declaration or assignment', 'Start with input, output, wire, or a signal assignment.');
    } catch (error) {
      if (!(error instanceof ParseFailure)) throw error;
      while (current().type !== 'SEMICOLON' && current().type !== 'EOF') consume();
      if (current().type === 'SEMICOLON') consume();
    }
  }
  consume();
  root.span = spanFrom(tokens[0], current());
  return { ast: { kind: 'Program', body, span: root.span }, parseTree: root, diagnostics };
}

import { LIMITS, type Diagnostic, type LexerResult, type Token, type TokenType } from './types';

const WORDS: Record<string, TokenType> = {
  INPUT: 'KEYWORD_INPUT', OUTPUT: 'KEYWORD_OUTPUT', WIRE: 'KEYWORD_WIRE',
  AND: 'AND', NAND: 'NAND', XOR: 'XOR', XNOR: 'XNOR', OR: 'OR', NOR: 'NOR', NOT: 'NOT',
};
const SYMBOLS: Record<string, TokenType> = {
  '&': 'AND', '|': 'OR', '^': 'XOR', '!': 'NOT', '~': 'NOT',
  '(': 'LPAREN', ')': 'RPAREN', ',': 'COMMA', ';': 'SEMICOLON', '=': 'ASSIGN',
};

/** A bounded, recovering character scanner. It never interprets source as JavaScript. */
export function lex(source: string): LexerResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  let offset = 0, line = 1, column = 1;
  const end = Math.min(source.length, LIMITS.sourceLength);
  const advance = () => {
    const char = source[offset++];
    if (char === '\n') { line++; column = 1; }
    else if (char === '\r') {
      if (source[offset] === '\n' && offset < end) offset++;
      line++; column = 1;
    } else column++;
  };
  const error = (code: string, message: string, hint: string, at: { offset: number; line: number; column: number }, length: number) => {
    diagnostics.push({ phase: 'lexer', severity: 'error', code, message, hint, ...at, length: Math.max(1, length) });
  };
  if (source.length > end) error('LEX005', `Source has ${source.length.toLocaleString()} characters; the limit is ${LIMITS.sourceLength.toLocaleString()}.`, 'Split the design into a smaller combinational circuit.', { offset: 0, line: 1, column: 1 }, 1);
  while (offset < end) {
    if (tokens.length >= LIMITS.tokens) {
      error('LEX006', `The program exceeds the ${LIMITS.tokens} token limit.`, 'Simplify the circuit or reduce repeated expressions.', { offset, line, column }, 1);
      break;
    }
    const char = source[offset];
    if (/\s/.test(char)) { advance(); continue; }
    const start = { offset, line, column };
    if (char === '#' || (char === '/' && source[offset + 1] === '/')) {
      while (offset < end && source[offset] !== '\n' && source[offset] !== '\r') advance();
      continue;
    }
    if (char === '/' && source[offset + 1] === '*') {
      advance(); advance();
      while (offset < end && !(source[offset] === '*' && source[offset + 1] === '/')) advance();
      if (offset >= end) error('LEX004', 'Unterminated block comment; expected "*/" before the end of the program.', 'Close the comment with */.', start, offset - start.offset);
      else { advance(); advance(); }
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      while (offset < end && /[A-Za-z0-9_]/.test(source[offset])) advance();
      const lexeme = source.slice(start.offset, offset);
      tokens.push({ ...start, length: offset - start.offset, lexeme, type: WORDS[lexeme.toUpperCase()] ?? 'IDENT' });
      continue;
    }
    if (/[0-9]/.test(char)) {
      while (offset < end && /[A-Za-z0-9_]/.test(source[offset])) advance();
      const lexeme = source.slice(start.offset, offset);
      if (lexeme === '0' || lexeme === '1') tokens.push({ ...start, length: 1, lexeme, type: 'NUMBER' });
      else if (/^\d+[A-Za-z_]/.test(lexeme) && !/^0[xXbBoO]/.test(lexeme)) error('LEX003', `Identifier "${lexeme}" starts with a digit.`, 'Start signal names with a letter or underscore, for example _' + lexeme + '.', start, lexeme.length);
      else error('LEX002', `Malformed number "${lexeme}"; LogicHDL supports only the single-bit literals 0 and 1.`, 'Replace this number with 0 or 1, or use a valid signal name.', start, lexeme.length);
      continue;
    }
    const type = SYMBOLS[char];
    if (type) { advance(); tokens.push({ ...start, length: 1, lexeme: char, type }); continue; }
    advance();
    error('LEX001', `Illegal character ${JSON.stringify(char)}.`, 'Remove this character; use letters, 0/1, declarations, and logic operators.', start, 1);
  }
  tokens.push({ type: 'EOF', lexeme: '', offset, line, column, length: 0 });
  return { tokens, diagnostics };
}

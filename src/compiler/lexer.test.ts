import { describe, expect, it } from 'vitest';
import { lex } from './lexer';

describe('lexer', () => {
  it('recognizes every keyword case-insensitively', () => {
    expect(lex('InPuT OUTPUT wire and NAND xor XNOR Or nor nOt').tokens.map(t => t.type)).toEqual(['KEYWORD_INPUT', 'KEYWORD_OUTPUT', 'KEYWORD_WIRE', 'AND', 'NAND', 'XOR', 'XNOR', 'OR', 'NOR', 'NOT', 'EOF']);
  });
  it('recognizes identifiers, literals and every punctuation token', () => {
    expect(lex('_a A9 0 1 ( ) , ; =').tokens.map(t => t.type)).toEqual(['IDENT', 'IDENT', 'NUMBER', 'NUMBER', 'LPAREN', 'RPAREN', 'COMMA', 'SEMICOLON', 'ASSIGN', 'EOF']);
  });
  it('normalizes all symbolic operators but preserves lexemes', () => {
    const result = lex('& | ^ ! ~');
    expect(result.tokens.slice(0, -1).map(t => [t.type, t.lexeme])).toEqual([['AND', '&'], ['OR', '|'], ['XOR', '^'], ['NOT', '!'], ['NOT', '~']]);
  });
  it('does not confuse keyword prefixes with keywords', () => expect(lex('inputted android not_a').tokens.map(t => t.type)).toEqual(['IDENT', 'IDENT', 'IDENT', 'EOF']));
  it('skips all three comment forms', () => expect(lex('// hi\na #bye\n/* many\nlines */ b').tokens.map(t => t.lexeme)).toEqual(['a', 'b', '']));
  it('tracks offsets, lines, columns and lengths through comments', () => expect(lex('/* x */\n  foo').tokens[0]).toEqual({ type: 'IDENT', lexeme: 'foo', offset: 10, line: 2, column: 3, length: 3 }));
  it('treats CRLF as one newline', () => expect(lex('a\r\n b\rc').tokens.slice(0, 3).map(t => [t.line, t.column])).toEqual([[1, 1], [2, 2], [3, 1]]));
  it.each(['@', '$', '\0', '☃'])('reports illegal character %j and keeps scanning', char => {
    const r = lex(`${char} a`);
    expect(r.diagnostics[0]).toMatchObject({ code: 'LEX001', line: 1, column: 1, length: 1 });
    expect(r.tokens[0].lexeme).toBe('a');
  });
  it.each(['2', '10', '0x1', '0b1', '123'])('rejects malformed number %s', number => expect(lex(number).diagnostics[0]).toMatchObject({ code: 'LEX002', length: number.length }));
  it.each(['3abc', '1_foo', '90cat'])('rejects digit-leading identifier %s', name => expect(lex(name).diagnostics[0].code).toBe('LEX003'));
  it('reports an unterminated block at its opening', () => expect(lex('a\n /* x').diagnostics[0]).toMatchObject({ code: 'LEX004', offset: 3, line: 2, column: 2, length: 4 }));
  it('recovers several lexical errors at once', () => expect(lex('@ a $ 2 3foo').diagnostics.map(d => d.code)).toEqual(['LEX001', 'LEX001', 'LEX002', 'LEX003']));
  it('emits EOF for an empty or whitespace-only program', () => {
    expect(lex('').tokens).toEqual([{ type: 'EOF', lexeme: '', offset: 0, line: 1, column: 1, length: 0 }]);
    expect(lex(' \n').tokens[0]).toMatchObject({ type: 'EOF', line: 2, column: 1 });
  });
  it('bounds oversized source with an actionable error', () => expect(lex(' '.repeat(10001)).diagnostics[0].code).toBe('LEX005'));
  it('bounds token counts', () => expect(lex('a '.repeat(4500)).diagnostics.some(d => d.code === 'LEX006')).toBe(true));
});

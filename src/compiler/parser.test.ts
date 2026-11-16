import { describe, expect, it } from 'vitest';
import { lex } from './lexer';
import { parse } from './parser';
import type { Assignment, Expr } from './types';

const parsed = (source: string) => parse(lex(source).tokens);
const expression = (source: string) => (parsed(`y = ${source};`).ast.body[0] as Assignment).expression;
const shape = (node: Expr): unknown => node.kind === 'Identifier' ? node.name : node.kind === 'Literal' ? node.value : node.kind === 'Unary' ? [node.op, shape(node.operand)] : [node.op, shape(node.left), shape(node.right)];

describe('recursive-descent parser', () => {
  it('parses declarations and assignments', () => expect(parsed('input a,b; output y; wire x; x=a; y=x;').ast.body.map(n => n.kind)).toEqual(['Declaration', 'Declaration', 'Declaration', 'Assignment', 'Assignment']));
  it('gives AND higher precedence than OR', () => expect(shape(expression('a OR b AND c'))).toEqual(['OR', 'a', ['AND', 'b', 'c']]));
  it('gives XOR precedence between AND and OR', () => expect(shape(expression('a OR b XOR c AND d'))).toEqual(['OR', 'a', ['XOR', 'b', ['AND', 'c', 'd']]]));
  it('associates binary NAND to the left', () => expect(shape(expression('a NAND b NAND c'))).toEqual(['NAND', ['NAND', 'a', 'b'], 'c']));
  it('associates unary NOT to the right', () => expect(shape(expression('NOT NOT a'))).toEqual(['NOT', ['NOT', 'a']]));
  it('parentheses override precedence', () => expect(shape(expression('(a OR b) AND c'))).toEqual(['AND', ['OR', 'a', 'b'], 'c']));
  it('accepts aliases at each precedence level', () => expect(shape(expression('!a & b ^ c | ~d'))).toEqual(['OR', ['XOR', ['AND', ['NOT', 'a'], 'b'], 'c'], ['NOT', 'd']]));
  it('has a stable simplified AST shape snapshot', () => expect(shape(expression('(a AND b) OR NOT c'))).toMatchInlineSnapshot(`
    [
      "OR",
      [
        "AND",
        "a",
        "b",
      ],
      [
        "NOT",
        "c",
      ],
    ]
  `));
  it('preserves source spans including parentheses', () => expect(expression('(a OR b)').span).toMatchObject({ offset: 4, line: 1, column: 5, length: 8 }));
  it('builds concrete rules and punctuation terminals', () => {
    const tree = JSON.stringify(parsed('y=a;').parseTree);
    for (const label of ['program', 'statement', 'expr', 'orExpr', 'xorExpr', 'andExpr', 'unary', 'primary', 'ASSIGN', 'SEMICOLON', 'EOF']) expect(tree).toContain(label);
  });
  it.each([
    ['input a', 'SYN001'], ['y=a', 'SYN001'], ['y=(a;', 'SYN002'], ['y=a);', 'SYN002'],
    ['y=a AND ;', 'SYN003'], ['y a;', 'SYN004'], ['y=();', 'SYN005'], [';','SYN006'],
    ['input;', 'SYN007'], ['y=', 'SYN008'], ['input a,;', 'SYN009'], ['y=a AND OR b;', 'SYN010'],
  ])('reports %s with code %s', (source, code) => {
    const diagnostic = parsed(source).diagnostics[0];
    expect(diagnostic.code).toBe(code); expect(diagnostic.message).toContain('Expected'); expect(diagnostic.message).toContain('found'); expect(diagnostic.hint.length).toBeGreaterThan(5);
  });
  it('recovers at semicolons and preserves valid subsequent items', () => {
    const result = parsed('x=; input a; z a; output y; y=a;');
    expect(result.diagnostics.map(d => d.code)).toEqual(['SYN003', 'SYN004']);
    expect(result.ast.body).toHaveLength(3);
    expect(JSON.stringify(result.parseTree)).toContain('Error: expected');
  });
  it('retains exact error line and column', () => expect(parsed('input a;\ny = a AND ;').diagnostics[0]).toMatchObject({ code: 'SYN003', line: 2, column: 11, length: 1 }));
  it('preserves reserved names for semantic diagnosis', () => expect(parsed('input AND; output y; y=1;').diagnostics).toHaveLength(0));
  it('supports empty source and partial EOF trees', () => {
    expect(parsed('').ast.body).toEqual([]);
    expect(parsed('y=NOT').parseTree.children.length).toBeGreaterThan(0);
  });
  it('bounds deeply nested parentheses', () => expect(parsed('y=' + '('.repeat(200) + 'a' + ')'.repeat(200) + ';').diagnostics[0].code).toBe('SYN012'));
  it('bounds long unary expressions', () => expect(parsed('y=' + 'NOT '.repeat(200) + 'a;').diagnostics[0].code).toBe('SYN012'));
  it('bounds long left-associated expressions', () => expect(parsed('y=' + Array(200).fill('a').join(' AND ') + ';').diagnostics[0].code).toBe('SYN012'));
  it('bounds top-level item counts', () => expect(parsed('a=1;'.repeat(257)).diagnostics.some(d => d.code === 'SYN011')).toBe(true));
});

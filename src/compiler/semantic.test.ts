import { describe, expect, it } from 'vitest';
import { lex } from './lexer';
import { parse } from './parser';
import { analyze } from './semantic';

const analyzed = (source: string) => analyze(parse(lex(source).tokens).ast);
const errors = (source: string) => analyzed(source).diagnostics.filter(d => d.severity === 'error');
describe('semantic analyzer', () => {
  it('supports forward declarations and out-of-order drivers', () => {
    const result = analyzed('y=w; w=a AND b; output y; wire w; input a,b;');
    expect(result.diagnostics).toEqual([]);
    expect(result.topologicalOrder).toEqual(['a', 'b', 'w', 'y']);
  });
  it('records symbol kind, declaration, assignments, uses and driver', () => {
    const result = analyzed('input a;\nwire w; output y;\nw=a; y=w AND w;');
    expect(result.symbols.find(s => s.name === 'w')).toMatchObject({ kind: 'wire', declaredAt: { line: 2, column: 6 }, assignedAt: [{ line: 3, column: 1 }], usedBy: ['y'], usedByCount: 1, driver: { kind: 'Identifier', name: 'a' } });
    expect(result.dependencies).toEqual([{ from: 'a', to: 'w' }, { from: 'w', to: 'y' }]);
  });
  it('reports undeclared use at the use location', () => expect(errors('output y;\ny=missing;')[0]).toMatchObject({ code: 'SEM001', line: 2, column: 3, length: 7 }));
  it('reports undeclared assignment targets', () => expect(errors('input a; output y; y=a; z=a;')[0]).toMatchObject({ code: 'SEM001', column: 25 }));
  it('reports duplicate declarations and relates the first site', () => expect(errors('input a;\nwire a; output y; y=1;')[0]).toMatchObject({ code: 'SEM002', line: 2, column: 6, related: [{ span: { line: 1, column: 7 } }] }));
  it.each(['output', 'wire'])('reports multiple %s drivers with both locations', kind => {
    const source = kind === 'output' ? 'output y;\ny=0;\ny=1;' : 'wire y; output z;\ny=0;\ny=1; z=y;';
    expect(errors(source).find(d => d.code === 'SEM003')).toMatchObject({ line: 3, column: 1, related: [{ span: { line: 2, column: 1 } }] });
  });
  it('rejects assignment to an input', () => expect(errors('input a; output y; a=0; y=a;')[0]).toMatchObject({ code: 'SEM004', column: 20 }));
  it.each(['AND', 'input', 'NoT'])('rejects reserved name %s', name => expect(errors(`input ${name}; output y; y=0;`).some(d => d.code === 'SEM005')).toBe(true));
  it.each(['output y;', 'wire w; output y; y=1;'])('reports unassigned signals in %s', source => expect(errors(source).some(d => d.code === 'SEM006')).toBe(true));
  it('detects direct feedback and shows its path', () => expect(errors('input a; output y; y=y AND a;').find(d => d.code === 'SEM007')?.message).toContain('y → y'));
  it('detects indirect feedback and shows its path', () => {
    const cycle = errors('wire w1,w2; output y; w1=w2; w2=w1; y=w1;').find(d => d.code === 'SEM007');
    expect(cycle?.message).toContain('w1 → w2 → w1');
  });
  it('detects a cycle disconnected from all outputs', () => expect(errors('wire x; output y; x=NOT x; y=1;').some(d => d.code === 'SEM007')).toBe(true));
  it('accepts exactly twelve inputs', () => expect(errors(`input ${Array.from({ length: 12 }, (_, i) => `a${i}`).join(',')}; output y; y=a0;`)).toEqual([]));
  it('rejects input thirteen at its declaration', () => {
    const source = `input ${Array.from({ length: 13 }, (_, i) => `a${i}`).join(',')}; output y; y=a0;`;
    const error = errors(source).find(d => d.code === 'SEM008');
    expect(error).toMatchObject({ line: 1, offset: source.indexOf('a12'), length: 3 });
  });
  it('requires a declared output, including on empty source', () => expect(errors('')[0].code).toBe('SEM009'));
  it('warns about unused input with its declaration location', () => expect(analyzed('input a,b; output y; y=a;').diagnostics.find(d => d.code === 'SEM101')).toMatchObject({ severity: 'warning', column: 9 }));
  it('warns about unused wires', () => expect(analyzed('input a; wire w; output y; w=a; y=a;').diagnostics.find(d => d.code === 'SEM102')).toMatchObject({ severity: 'warning', column: 15 }));
  it('warns on constant outputs', () => expect(analyzed('output y; y=0;').diagnostics.find(d => d.code === 'SEM103')).toMatchObject({ severity: 'warning', column: 13 }));
  it('warns on tautology and contradiction', () => {
    expect(analyzed('input a; output y; y=a OR NOT a;').diagnostics.map(d => d.code)).toContain('SEM104');
    expect(analyzed('input a; output y; y=a AND NOT a;').diagnostics.map(d => d.code)).toContain('SEM105');
  });
  it('propagates known constants through named wires', () => expect(analyzed('wire w; output y; y=NOT w; w=0;').diagnostics.map(d => d.code)).toContain('SEM104'));
  it('treats identifier names as case-sensitive', () => expect(errors('input a; output y; y=A;')[0].code).toBe('SEM001'));
  it('can use an output as an acyclic dependency', () => expect(errors('input a; output y,z; z=y; y=NOT a;')).toEqual([]));
  it('counts distinct users and deduplicates graph edges', () => expect(analyzed('input a; output y; y=a AND a;').symbols[0].usedByCount).toBe(1));
  it('orders every graph edge before its dependent', () => {
    const result = analyzed('input a,b; wire v,w; output y; y=v XOR w; w=b; v=a AND w;');
    for (const edge of result.dependencies) expect(result.topologicalOrder.indexOf(edge.from)).toBeLessThan(result.topologicalOrder.indexOf(edge.to));
  });
});

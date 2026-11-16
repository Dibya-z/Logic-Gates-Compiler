import { describe, expect, it } from 'vitest';
import { sourceFromHash, sourceToHash, phaseDump } from './lib';
import { compile } from './compiler';

describe('share links and phase export', () => {
  it.each(['', 'input a; output y; y=NOT a;', '// λ ∑ → ✓ 🙂 日本語\noutput y; y=1;', '\0\u0001\r\n#x & + / = %'])('round-trips valid UTF-8 source %j', source => expect(sourceFromHash(sourceToHash(source))).toBe(source));
  it('uses URL-safe base64 without padding', () => expect(sourceToHash('output y; y=1;')).toMatch(/^#code=[A-Za-z0-9_-]+$/));
  it('round-trips a maximum-length Unicode comment', () => {
    const source = '// ' + '語'.repeat(9997);
    expect(sourceFromHash(sourceToHash(source))).toBe(source);
  });
  it.each(['', '#', '#other=YQ', '#code=A', '#code=@@@', '#code=YQ====', '#code=_w', '#code=8ICA', '#code=' + 'A'.repeat(60000)])('rejects malformed or oversized share hash %j', hash => expect(sourceFromHash(hash)).toBeUndefined());
  it('serializes all phases to standalone, parseable JSON', () => {
    const result = compile('input a; output y; y=NOT a;');
    const dump = JSON.parse(phaseDump(result));
    expect(dump.source).toBe(result.source); expect(dump.tokens).toHaveLength(result.tokens.length);
    expect(dump.stages.map((stage: { phase: string }) => stage.phase)).toEqual(['lexer', 'parser', 'semantic', 'ir', 'optimizer', 'codegen']);
    expect(dump.optimizer.equivalence.verified).toBe(true);
    expect(dump.codegen.svg).toContain('<svg');
  });
});

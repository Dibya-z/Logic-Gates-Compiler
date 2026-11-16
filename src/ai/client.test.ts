import { describe, expect, it, vi } from 'vitest';
import { compile } from '../compiler';
import { DEFAULT_AI_MODEL, englishToLogic, explainDiagnostic, type AIOptions } from './client';

const valid = 'input a,b,c; output y; y=(a AND b) OR (a AND c) OR (b AND c);';
const key = 'test-memory-key';

function transport(texts: string[]) {
  return vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: texts.shift() ?? '' }] }), { status: 200 }));
}

describe('optional Claude transport and deterministic validation', () => {
  it('does not send a network request without a key', async () => {
    const fetcher = transport([valid]);
    await expect(englishToLogic('Build a majority gate', { apiKey: '', fetcher })).rejects.toThrow(/API key/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('validates the generated program with every real compiler phase before returning it', async () => {
    const fetcher = transport([valid]);
    const result = await englishToLogic('At least two inputs are high', { apiKey: key, fetcher });
    expect(result.source).toBe(valid);
    expect(result.attempts).toBe(1);
    expect(result.compilation.codegen!.truthTable.rows.map(row => row.values.y)).toEqual([0, 0, 0, 1, 0, 1, 1, 1]);
    expect(result.compilation.optimizer!.equivalence.verified).toBe(true);
    const request = fetcher.mock.calls[0];
    expect(request[0]).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse(request[1]!.body as string).model).toBe(DEFAULT_AI_MODEL);
    expect(request[1]!.headers).toMatchObject({ Authorization: `Bearer ${key}`, 'anthropic-dangerous-direct-browser-access': 'true' });
    expect(request[1]!.headers).not.toHaveProperty('anthropic-workspace-id');
  });

  it('sends an optional workspace ID only when it is present', async () => {
    const fetcher = transport([valid, valid]);
    await englishToLogic('Majority circuit', { apiKey: key, workspaceId: '  wrkspc_test123  ', fetcher });
    expect(fetcher.mock.calls[0][1]!.headers).toMatchObject({ 'anthropic-workspace-id': 'wrkspc_test123' });
    await englishToLogic('Majority circuit', { apiKey: key, workspaceId: ' ', fetcher });
    expect(fetcher.mock.calls[1][1]!.headers).not.toHaveProperty('anthropic-workspace-id');
  });

  it('retries an invalid program exactly once with actual compiler diagnostics', async () => {
    const invalid = 'input a; output y; y=a @ 1;';
    const fetcher = transport([invalid, 'input a; output y; y=a;']);
    const result = await englishToLogic('Copy a', { apiKey: key, fetcher });
    expect(result.attempts).toBe(2);
    expect(result.source).toBe('input a; output y; y=a;');
    expect(fetcher).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(fetcher.mock.calls[1][1]!.body as string);
    expect(retry.messages[1]).toEqual({ role: 'assistant', content: invalid });
    expect(retry.messages[2].content).toContain('LEX001');
    expect(retry.messages[2].content).toContain('Illegal character');
  });

  it('never returns an invalid response even when the single correction also fails', async () => {
    const fetcher = transport(['output y;', 'output y; y=missing;']);
    await expect(englishToLogic('A complete circuit', { apiKey: key, fetcher })).rejects.toThrow(/one correction attempt/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('accepts a single fenced program and validates its contents', async () => {
    const fetcher = transport(['```logichdl\noutput y; y=1;\n```']);
    const result = await englishToLogic('Constant high', { apiKey: key, fetcher });
    expect(result.source).toBe('output y; y=1;');
    expect(result.compilation.codegen!.truthTable.rows[0].values.y).toBe(1);
  });

  it('sends the selected diagnostic and source with an editable model for explanation', async () => {
    const source = 'output y; y=missing;';
    const diagnostic = compile(source).diagnostics.find(item => item.code === 'SEM001')!;
    const fetcher = transport(['Declare missing as an input.']);
    expect(await explainDiagnostic(source, diagnostic, { apiKey: key, model: 'claude-sonnet-4-5', fetcher })).toBe('Declare missing as an input.');
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.model).toBe('claude-sonnet-4-5');
    expect(body.messages[0].content).toContain('SEM001');
    expect(body.messages[0].content).toContain(source);
    expect(body.messages[0].content).toContain(diagnostic.hint);
  });

  it.each([400, 401, 403, 404, 429, 500])('handles HTTP %s without retrying or exposing credentials', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { message: key } }), { status }));
    const result = await englishToLogic('Build a gate', { apiKey: key, fetcher }).catch(error => error);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain(String(status));
    expect(result.message).not.toContain(key);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects an unreadable provider response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{broken', { status: 200 }));
    await expect(englishToLogic('Build a gate', { apiKey: key, fetcher })).rejects.toThrow(/unreadable response/);
  });

  it('handles an empty provider text response', async () => {
    const fetcher = transport(['']);
    await expect(englishToLogic('Build a gate', { apiKey: key, fetcher })).rejects.toThrow(/no text/);
  });

  it('rejects an empty or oversized description before network use', async () => {
    const fetcher = transport([valid]);
    await expect(englishToLogic(' ', { apiKey: key, fetcher })).rejects.toThrow(/Describe/);
    await expect(englishToLogic('a'.repeat(2001), { apiKey: key, fetcher })).rejects.toThrow(/2,000/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('cancels a request whose signal is already aborted', async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = transport([valid]);
    await expect(englishToLogic('Build a gate', { apiKey: key, signal: controller.signal, fetcher })).rejects.toThrow(/cancelled/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('aborts a stalled transport and reports the timeout', async () => {
    const fetcher: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    const options: AIOptions = { apiKey: key, fetcher, timeoutMs: 5 };
    await expect(englishToLogic('Build a gate', options)).rejects.toThrow(/timed out/);
  });
});

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, KeyRound, LoaderCircle, Send, Sparkles, X } from 'lucide-react';
import type { Diagnostic } from '../compiler/types';
import { DEFAULT_AI_MODEL, englishToLogic, explainDiagnostic } from '../ai/client';

export interface AIAssistantProps {
  source: string;
  diagnostics: Diagnostic[];
  onLoadSource: (source: string) => void;
  onClose: () => void;
  initialTab?: 'generate' | 'explain';
  initialDiagnosticIndex?: number;
}

export function AIAssistant({ source, diagnostics, onLoadSource, onClose, initialTab = 'generate', initialDiagnosticIndex = 0 }: AIAssistantProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [apiKey, setApiKey] = useState<string>(() => import.meta.env.VITE_ANTHROPIC_API_KEY ?? '');
  const [model, setModel] = useState(DEFAULT_AI_MODEL);
  const [workspaceId, setWorkspaceId] = useState('');
  const [tab, setTab] = useState<'generate' | 'explain'>(initialTab);
  const [description, setDescription] = useState('');
  const [selectedDiagnostic, setSelectedDiagnostic] = useState(Math.max(0, initialDiagnosticIndex));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [explanation, setExplanation] = useState('');
  const [generated, setGenerated] = useState<{ source: string; attempts: number } | null>(null);
  const ready = !!apiKey.trim() && !!model.trim();
  const diagnostic = diagnostics[Math.min(selectedDiagnostic, diagnostics.length - 1)];

  useEffect(() => {
    dialog.current?.showModal();
    return () => { activeRequest.current?.abort(); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true); setError(''); setGenerated(null); setExplanation('');
    try {
      const options = { apiKey, model, workspaceId, signal: controller.signal };
      if (tab === 'generate') {
        const result = await englishToLogic(description, options);
        if (!controller.signal.aborted) setGenerated({ source: result.source, attempts: result.attempts });
      } else if (diagnostic) {
        const text = await explainDiagnostic(source, diagnostic, options);
        if (!controller.signal.aborted) setExplanation(text);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'The request could not be completed.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function cancel() { activeRequest.current?.abort(); setBusy(false); }

  return <dialog ref={dialog} className="assistant-dialog" aria-labelledby="ai-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="drawer-header"><div><span className="eyebrow"><Sparkles size={13} />Optional assistant</span><h2 id="ai-title">A little help with your logic.</h2></div><button className="icon-button" aria-label="Close AI assistant" onClick={onClose}><X size={20} /></button></header>
    <p className="panel-note">Describe a circuit or explore a diagnostic. Generated programs always pass through the real compiler before you can load them.</p>
    <div className="ai-key-settings"><label htmlFor="ai-key"><KeyRound size={13} />Anthropic API key</label><div className="ai-key-row"><input id="ai-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={event => setApiKey(event.target.value)} disabled={busy} placeholder="Enter a session API key" /><button className="text-button" onClick={() => { cancel(); setApiKey(''); setError(''); }} disabled={!apiKey}>Clear key</button></div><label htmlFor="ai-model">Claude model ID</label><input id="ai-model" value={model} onChange={event => setModel(event.target.value)} disabled={busy} spellCheck={false} /><label htmlFor="ai-workspace">Workspace ID <span className="dim">(optional)</span></label><input id="ai-workspace" value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} disabled={busy} autoComplete="off" spellCheck={false} placeholder="For keys that are not scoped to one workspace" /><small>Requests send your prompt or source to Anthropic. Session keys stay in memory and are cleared when this drawer closes. A production deployment should use a server proxy.</small></div>
    <div className="segmented ai-tabs" aria-label="Assistant feature"><button aria-pressed={tab === 'generate'} className={tab === 'generate' ? 'active' : ''} onClick={() => setTab('generate')} disabled={busy}>English → LogicHDL</button><button aria-pressed={tab === 'explain'} className={tab === 'explain' ? 'active' : ''} onClick={() => setTab('explain')} disabled={busy}>Explain an error</button></div>
    <form onSubmit={submit} className="ai-form">
      {tab === 'generate' ? <><label htmlFor="circuit-description">What should the circuit do?</label><textarea id="circuit-description" rows={4} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} disabled={busy} placeholder="Output is 1 when at least two of a, b, c are 1." /><small>The compiler supports up to 12 inputs and combinational logic.</small></> : diagnostics.length ? <><label htmlFor="ai-diagnostic">Choose a diagnostic</label><select id="ai-diagnostic" value={Math.min(selectedDiagnostic, diagnostics.length - 1)} onChange={event => setSelectedDiagnostic(Number(event.target.value))} disabled={busy}>{diagnostics.map((item, index) => <option key={index} value={index}>{item.code} · line {item.line}: {item.message}</option>)}</select>{diagnostic && <div className="ai-diagnostic-preview"><code>{diagnostic.code} · {diagnostic.line}:{diagnostic.column}</code><p>{diagnostic.message}</p><small>{diagnostic.hint}</small></div>}</> : <p className="panel-note">This program has no diagnostics. Load a broken sample or edit the source to explore an error.</p>}
      {!ready && <p className="ai-key-notice"><KeyRound size={13} />Enter a key and model ID to enable the assistant.</p>}
      <div className="ai-actions"><button type="submit" className="primary-button" disabled={!ready || busy || (tab === 'generate' ? !description.trim() : !diagnostic)}>{busy ? <LoaderCircle className="spin" size={14} /> : <Send size={14} />}{busy ? 'Working…' : tab === 'generate' ? 'Generate circuit' : 'Explain diagnostic'}</button>{busy && <button type="button" className="text-button" onClick={cancel}>Cancel request</button>}</div>
    </form>
    {error && <p role="alert" className="ai-error">{error}</p>}
    {generated && <div className="ai-result"><span className="badge good"><Check size={12} />Compiler validated{generated.attempts === 2 ? ' after one correction' : ''}</span><pre><code>{generated.source}</code></pre><button className="primary-button" onClick={() => { onLoadSource(generated.source); onClose(); }}>Load into editor<ArrowRight size={14} /></button></div>}
    {explanation && <div className="ai-result"><h3>Diagnostic explanation</h3><p className="ai-explanation">{explanation}</p><small className="panel-note">AI advice may be imperfect. Compile the correction to check it.</small></div>}
  </dialog>;
}

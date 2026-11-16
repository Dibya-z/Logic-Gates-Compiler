import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, CircuitBoard, Code2, Download, FileCode2, GitBranch, Keyboard, Layers3, Link, Moon, Pause, Play, RotateCcw, ScanLine, Settings2, ShieldCheck, SkipForward, Sparkles, Sun, Terminal, X, XCircle, AlertTriangle, CirclePause } from 'lucide-react';
import { compile, evaluateNetlist, truthTableCSV, type Diagnostic, type Phase, type Span } from './compiler';
import { SAMPLES } from './data/samples';
import { sourceFromHash, sourceToHash, download, downloadPNG, phaseDump } from './lib';
import { CodeEditor, type EditorSelection } from './components/CodeEditor';
import { Circuit } from './components/Circuit';
import { flattenTree, astTree } from './components/Trees';
import { EquivalenceBadge, IRPanel, OptimizerPanel, ParserPanel, SemanticPanel, SignalControls, TokensPanel, TruthTablePanel, VerilogPanel } from './components/Panels';
import { AIAssistant } from './components/AIAssistant';

const PHASE_LABELS: Record<Phase, string> = { lexer: 'Lexer', parser: 'Parser', semantic: 'Semantic', ir: 'IR', optimizer: 'Optimizer', codegen: 'Codegen' };
const PHASE_ICONS = { lexer: ScanLine, parser: GitBranch, semantic: ShieldCheck, ir: Layers3, optimizer: Sparkles, codegen: CircuitBoard };
type OutputTab = 'circuit' | 'truth' | 'simulator' | 'verilog';

export default function App() {
  const [source, setSource] = useState(() => sourceFromHash(window.location.hash) ?? SAMPLES[0].source);
  const [optimized, setOptimized] = useState(true);
  const [result, setResult] = useState(() => compile(source));
  const [phase, setPhase] = useState<Phase>('codegen');
  const [tab, setTab] = useState<OutputTab>('circuit');
  const [selection, setSelection] = useState<EditorSelection>();
  const [cursor, setCursor] = useState(-1);
  const [selectedGate, setSelectedGate] = useState<string>();
  const [inputs, setInputs] = useState<Record<string, 0 | 1>>({});
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('logi-theme') ?? 'dark'; } catch { return 'dark'; } });
  const [help, setHelp] = useState(false);
  const [ai, setAI] = useState(false);
  const [aiDiagnostic, setAIDiagnostic] = useState<number>();
  const [exportsOpen, setExportsOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(true);
  const [stepMode, setStepMode] = useState(false);
  const [stepCount, setStepCount] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(400);
  const [concrete, setConcrete] = useState(true);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const select = useCallback((span: Span, gateId?: string) => {
    setSelection({ span, nonce: Date.now() + Math.random() });
    if (gateId !== undefined) setSelectedGate(gateId);
  }, []);
  const notify = useCallback((message: string) => {
    setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);
  const compileNow = useCallback(() => {
    clearTimeout(debounceTimer.current);
    setResult(compile(source, { optimize: optimized }));
  }, [source, optimized]);
  useEffect(() => {
    debounceTimer.current = setTimeout(compileNow, 250);
    return () => clearTimeout(debounceTimer.current);
  }, [compileNow]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101210' : '#f5f6f2');
    try { localStorage.setItem('logi-theme', theme); } catch { /* Theme remains in memory when browser storage is disabled. */ }
  }, [theme]);
  useEffect(() => {
    const update = () => { const shared = sourceFromHash(location.hash); if (shared !== undefined) setSource(shared); };
    window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    setStepCount(1); setPlaying(false); setSelectedGate(undefined);
    const error = result.stages.find(stage => stage.status === 'error');
    if (error) setPhase(error.phase);
  }, [result]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setHelp(false); setAI(false); setExportsOpen(false); } };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => { setStepCount(1); setPlaying(false); }, [concrete]);
  const tree = phase === 'parser' ? (concrete ? result.parseTree : result.ast ? astTree(result.ast) : undefined) : undefined;
  const teachingNodes = useMemo(() => tree ? flattenTree(tree) : [], [tree]);
  const stepTotal = phase === 'lexer' ? result.tokens.length : teachingNodes.length;
  useEffect(() => {
    if (!playing || !stepMode || !['lexer', 'parser'].includes(phase)) return;
    const timer = setInterval(() => setStepCount(count => {
      if (count >= stepTotal) { setPlaying(false); return count; }
      return count + 1;
    }), speed);
    return () => clearInterval(timer);
  }, [playing, stepMode, phase, stepTotal, speed]);
  useEffect(() => {
    if (!stepMode) return;
    const span = phase === 'lexer' ? result.tokens[stepCount - 1] : teachingNodes[stepCount - 1]?.span;
    if (span) select(span);
    // Tree nodes are derived from the current result; count and tree mode define the teaching cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepCount, stepMode, phase, concrete]);
  const ir = result.optimizer?.ir ?? result.ir;
  const values = useMemo(() => ir ? evaluateNetlist(ir.netlist, inputs) : {}, [ir, inputs]);
  const rowIndex = ir?.netlist.inputs.reduce((value, name) => value * 2 + (inputs[name] === 1 ? 1 : 0), 0) ?? 0;
  const errors = result.diagnostics.filter(d => d.severity === 'error');
  const warnings = result.diagnostics.filter(d => d.severity === 'warning');
  const currentStage = result.stages.find(stage => stage.phase === phase)!;
  const selectedSample = SAMPLES.find(sample => sample.source === source);
  const stale = source !== result.source || optimized !== result.optimized;
  const copy = async (text: string, success = 'Copied to clipboard') => {
    try { await navigator.clipboard.writeText(text); notify(success); }
    catch { notify('Clipboard access is unavailable. Use the export menu to save the file.'); }
  };
  const load = (next: string) => { setSource(next); setInputs({}); setStepMode(false); setPhase('codegen'); setTab('circuit'); };
  const toggleInput = (name: string) => setInputs(previous => ({ ...previous, [name]: previous[name] === 1 ? 0 : 1 }));
  const exportFile = async (kind: string) => {
    setExportsOpen(false);
    try {
      const exported = stale ? compile(source, { optimize: optimized }) : result;
      if (stale) setResult(exported);
      if (kind === 'json') download(phaseDump(exported), 'logi-compile.json', 'application/json');
      else if (kind === 'source') download(source, 'main.logic', 'text/plain');
      else if (exported.codegen) {
        if (kind === 'csv') download(truthTableCSV(exported.codegen.truthTable), 'truth-table.csv', 'text/csv');
        if (kind === 'svg') download(exported.codegen.svg, 'logic-circuit.svg', 'image/svg+xml');
        if (kind === 'png') await downloadPNG(exported.codegen.svg);
        if (kind === 'verilog') download(exported.codegen.verilog, 'logic_circuit.v', 'text/plain');
      }
    } catch (error) { notify(error instanceof Error ? error.message : 'Export failed. Please try again.'); }
  };

  return <div className="app-shell">
    <a className="skip-link" href="#source-panel">Skip to compiler</a>
    <header className="app-header"><a href={window.location.pathname} className="brand" aria-label="Logi-Compile home"><span className="brand-symbol"><CircuitBoard size={21} strokeWidth={1.7} /></span><span>logi<span className="brand-dash">—</span>compile<span className="brand-period">.</span></span><span className="version-tag">v1.0</span></a><nav aria-label="Main navigation"><button className="nav-active" onClick={() => { setHelp(false); setAI(false); }}>Workbench</button><button onClick={() => setHelp(true)}>Language reference<ArrowUpRight size={12} /></button></nav><div className="header-tools"><span className="local-status"><span className="status-dot live" />Runs in your browser</span><span className="header-divider" /><button className="icon-button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button><button className="icon-button" aria-label="How it works" onClick={() => setHelp(true)}><CircleHelp size={17} /></button></div></header>
    <main className="main-workbench">
      <div className="workspace-heading" data-enter><div><div className="eyebrow"><span />LogicHDL compiler workbench</div><h1>Logic, made visible<span>.</span></h1><p>Write a circuit. Follow every phase. See the logic come to life.</p></div><div className="workspace-actions"><button className="button subtle ai-trigger" onClick={() => { setAIDiagnostic(undefined); setAI(true); }}><Sparkles size={15} />AI assistant</button><button className="button subtle" onClick={() => { const hash = sourceToHash(source); history.replaceState(null, '', hash); void copy(window.location.href, 'Share link copied · source included'); }}><Link size={14} />Share</button><div className="export-dropdown"><button className="button subtle" aria-expanded={exportsOpen} onClick={() => setExportsOpen(!exportsOpen)}><Download size={14} />Export<ChevronDown size={12} /></button>{exportsOpen && <><button className="dropdown-dismiss" aria-label="Close export menu" onClick={() => setExportsOpen(false)} /><div className="export-menu" role="menu">{[['source', 'LogicHDL source', '.logic'], ['json', 'All compiler phases', '.json'], ['svg', 'Circuit diagram', '.svg'], ['png', 'Circuit image', '.png'], ['csv', 'Truth table', '.csv'], ['verilog', 'Verilog module', '.v']].map(([kind, label, ext]) => <button role="menuitem" key={kind} disabled={!['json', 'source'].includes(kind) && !result.codegen} onClick={() => void exportFile(kind)}><span>{label}</span><code>{ext}</code></button>)}</div></>}</div></div></div>
      <div className="workbench-grid">
        <aside className="source-column">
          <section className="source-panel panel" id="source-panel" aria-label="Source editor"><div className="source-title"><div><Code2 size={16} /><h2>Source code</h2></div><label className="sample-select"><span>Samples</span><select aria-label="Load sample program" value={selectedSample?.id ?? ''} onChange={event => { const sample = SAMPLES.find(s => s.id === event.target.value); if (sample) load(sample.source); }}><option value="" disabled>Custom program</option><optgroup label="Working circuits">{SAMPLES.filter(s => s.category === 'working').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup><optgroup label="Broken programs · diagnostics">{SAMPLES.filter(s => s.category === 'broken').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup></select><ChevronDown size={12} /></label></div><div className="file-tab"><FileCode2 size={13} /><span>main.logic</span><span className="file-dot" /><span className="language-tag">LogicHDL</span></div><CodeEditor source={source} diagnostics={stale ? [] : result.diagnostics} selection={selection} onChange={setSource} onCursor={setCursor} onCompile={compileNow} /><div className="editor-status"><span>{source.split('\n').length} lines<span>·</span>{source.length.toLocaleString()} chars</span><span>UTF-8<Code2 size={11} /></span></div><div className="compiler-controls"><div className="optimization-control"><Settings2 size={14} /><label htmlFor="optimize">Optimize circuit</label><button id="optimize" className={`toggle ${optimized ? 'on' : ''}`} role="switch" aria-checked={optimized} onClick={() => setOptimized(!optimized)} aria-label="Optimize circuit"><i /></button></div><button className="compile-button" onClick={compileNow}><Play size={13} fill="currentColor" />Compile source<span>⌘ ↵</span></button></div></section>
          <section className="program-card"><div className="small-label">{selectedSample?.name ?? 'Custom circuit'}<span className="source-extension">.logic</span></div><p>{selectedSample?.description ?? 'Edit the source to explore your own combinational logic circuit.'}</p><div className="program-counts"><span><b>{result.semantic?.symbols.filter(s => s.kind === 'input').length ?? '—'}</b> inputs</span><span><b>{result.semantic?.symbols.filter(s => s.kind === 'output').length ?? '—'}</b> outputs</span><span><b>{ir?.gateCount ?? '—'}</b> gates</span></div></section>
          <section className={`teaching-card ${stepMode ? 'enabled' : ''}`}><div><span className="teaching-icon"><GitBranch size={16} /></span><div><h3>Watch the compiler think</h3><p>Reveal tokens and tree nodes one step at a time.</p></div><button className={`toggle ${stepMode ? 'on' : ''}`} aria-label="Step-through mode" role="switch" aria-checked={stepMode} onClick={() => { setStepMode(!stepMode); setPhase('lexer'); setStepCount(1); setPlaying(false); }}><i /></button></div>{stepMode && <div className="teaching-controls"><div className="teaching-phase"><button className={phase === 'lexer' ? 'active' : ''} onClick={() => { setPhase('lexer'); setStepCount(1); setPlaying(false); }}>Lexer</button><ArrowRight size={12} /><button disabled={!result.parseTree} className={phase === 'parser' ? 'active' : ''} onClick={() => { setPhase('parser'); setStepCount(1); setPlaying(false); }}>Parser</button><span>{Math.min(stepCount, stepTotal)} / {stepTotal}</span></div><progress max={Math.max(1, stepTotal)} value={stepCount} /><div><button className="icon-button" title="Reset steps" aria-label="Reset steps" onClick={() => { setStepCount(1); setPlaying(false); }}><RotateCcw size={14} /></button><button className="step-play" aria-label={playing ? 'Pause stepping' : 'Play steps'} disabled={!['lexer', 'parser'].includes(phase) || stepCount >= stepTotal} onClick={() => setPlaying(!playing)}>{playing ? <Pause size={13} /> : <Play size={13} />}<span>{playing ? 'Pause' : 'Play'}</span></button><button className="icon-button" aria-label="Next step" disabled={!['lexer', 'parser'].includes(phase) || stepCount >= stepTotal} onClick={() => { setPlaying(false); setStepCount(Math.min(stepTotal, stepCount + 1)); }}><SkipForward size={15} /></button><label className="speed-select">Speed<select aria-label="Step speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value="800">0.5×</option><option value="400">1×</option><option value="200">2×</option><option value="100">4×</option></select></label></div></div>}</section>
          <button className="keyboard-tip" onClick={() => setHelp(true)}><Keyboard size={14} /><span>New to LogicHDL? Read the guide</span><ArrowUpRight size={12} /></button>
        </aside>
        <section className="results-column" aria-label="Compiler results"><div className="pipeline-heading"><span className="small-label">Compilation pipeline</span><span><span className={`status-dot ${errors.length ? 'error' : 'live'}`} />{stale ? 'Compiling…' : errors.length ? 'Needs attention' : 'Compilation successful'}<span className="mono">{result.durationMs.toFixed(1)} ms</span></span></div><div className="pipeline-bar" role="tablist" aria-label="Compiler phases">{result.stages.map((stage, index) => {
          const Icon = PHASE_ICONS[stage.phase];
          return <button key={stage.phase} id={`stage-${stage.phase}`} role="tab" aria-selected={phase === stage.phase} aria-controls="phase-panel" className={`pipeline-stage ${phase === stage.phase ? 'active' : ''} ${stage.status}`} onClick={() => { setPhase(stage.phase); setPlaying(false); setStepCount(1); }}><div><Icon size={15} /><span className="stage-number">0{index + 1}</span></div><strong>{PHASE_LABELS[stage.phase]}</strong><small>{stage.status === 'error' ? <XCircle size={10} /> : stage.status === 'warning' ? <AlertTriangle size={10} /> : ['skipped', 'disabled'].includes(stage.status) ? <CirclePause size={10} /> : <Check size={10} />}{stage.status === 'error' ? `${stage.errorCount} error${stage.errorCount === 1 ? '' : 's'}` : stage.status === 'disabled' ? 'Off' : stage.status === 'skipped' ? 'Skipped' : stage.status === 'warning' ? 'Warnings' : 'Passed'}{stage.status !== 'error' && <span className="stage-error-count" title="0 errors">0</span>}</small>{index < 5 && <ChevronRight className="pipeline-arrow" size={13} />}</button>;
        })}</div>
          <div className="output-panel panel" id="phase-panel" role="tabpanel" aria-labelledby={`stage-${phase}`}>
            {currentStage.status === 'skipped' ? <div className="empty-state"><CirclePause size={28} /><h2>{PHASE_LABELS[phase]} skipped</h2><p>Blocked by errors in Phase {result.stages.findIndex(s => s.phase === currentStage.blockedBy) + 1}: {PHASE_LABELS[currentStage.blockedBy!]}.</p><button className="button subtle" onClick={() => setPhase(currentStage.blockedBy!)}>See diagnostics<ArrowRight size={13} /></button></div> : <>
              {phase === 'lexer' && <TokensPanel result={result} activeOffset={cursor} onSelect={select} count={stepMode ? stepCount : Infinity} />}
              {phase === 'parser' && <ParserPanel result={result} activeOffset={cursor} onSelect={select} count={stepMode ? stepCount : Infinity} concrete={concrete} setConcrete={setConcrete} />}
              {phase === 'semantic' && result.semantic && <SemanticPanel result={result} onSelect={select} />}
              {phase === 'ir' && result.ir && <><IRPanel ir={result.ir} onSelect={select} selectedGate={selectedGate} /><div className="sub-panel"><h3>Instruction → circuit</h3><Circuit layout={result.codegen && !optimized ? result.codegen.layout : compileLayout(result.ir)} netlist={result.ir.netlist} selectedGate={selectedGate} onSelect={gate => select(gate.span, gate.id)} compact /></div></>}
              {phase === 'optimizer' && <OptimizerPanel result={result} onSelect={select} />}
              {phase === 'codegen' && result.codegen && ir && <><div className="output-tabs" role="tablist" aria-label="Output targets">{([['circuit', 'Circuit', CircuitBoard], ['truth', 'Truth table', Layers3], ['simulator', 'Simulator', Settings2], ['verilog', 'Verilog', Code2]] as const).map(([key, label, Icon]) => <button role="tab" aria-selected={tab === key} key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}><Icon size={14} />{label}</button>)}<button className="output-download icon-button" aria-label="Export current output" onClick={() => void exportFile(tab === 'verilog' ? 'verilog' : tab === 'truth' ? 'csv' : 'svg')}><Download size={14} /></button></div>{(tab === 'circuit' || tab === 'simulator') && <>{tab === 'simulator' && <SignalControls netlist={ir.netlist} inputs={inputs} values={values} onToggle={toggleInput} />}<Circuit layout={result.codegen.layout} netlist={ir.netlist} values={tab === 'simulator' ? values : undefined} selectedGate={selectedGate} onSelect={gate => select(gate.span, gate.id)} />{tab === 'simulator' && <div className="sim-row-info"><span className="status-dot live" /><span>Matching truth table row <b className="mono">{rowIndex.toString().padStart(2, '0')}</b></span><button className="text-button" onClick={() => setTab('truth')}>View row<ArrowRight size={12} /></button></div>}</>}{tab === 'truth' && <TruthTablePanel result={result} rowIndex={rowIndex} />}{tab === 'verilog' && <VerilogPanel source={result.codegen.verilog} onCopy={text => void copy(text)} />}<div className="circuit-stats"><div><span className="stat-icon"><CircuitBoard size={14} /></span><b>{ir.gateCount}</b><span>logic gates</span></div><div><span className="stat-icon"><Layers3 size={14} /></span><b>{ir.depth}</b><span>logic depth</span></div><div><span className="stat-icon"><GitBranch size={14} /></span><b>{result.codegen.truthTable.rows.length.toLocaleString()}</b><span>combinations</span></div><EquivalenceBadge result={result} /></div></>}
              {currentStage.status === 'error' && !['lexer', 'parser', 'semantic'].includes(phase) && <div className="empty-state"><XCircle size={26} /><h2>{PHASE_LABELS[phase]} could not finish</h2><p>See the diagnostics below for the cause and a suggested fix.</p></div>}
            </>}
          </div><div className="phase-footnote"><ShieldCheck size={12} /><span>Deterministic compiler. Hand-written phases. Every input combination checked.</span><span>6 phases<CheckCheck size={12} /></span></div>
        </section>
      </div>
      <section className="diagnostics-panel panel" aria-label="Compiler diagnostics"><button className="diagnostics-heading" aria-expanded={diagnosticsOpen} onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}><Terminal size={14} /><strong>Diagnostics</strong><span className={`diagnostic-count ${errors.length ? 'has-errors' : ''}`}>{errors.length}</span><span className="diagnostic-warning-count"><AlertTriangle size={12} />{warnings.length}</span><span className="diagnostics-summary">{errors.length ? `${errors.length} error${errors.length === 1 ? '' : 's'} to resolve` : warnings.length ? 'Compiled with warnings' : 'All checks passed'}</span><ChevronDown size={14} className={diagnosticsOpen ? '' : 'rotate-closed'} /></button>{diagnosticsOpen && <div className="diagnostic-list">{result.diagnostics.length ? result.diagnostics.map((d, index) => <div className={`diagnostic-item ${d.severity}`} key={`${d.code}-${index}`}><button onClick={() => { select(d); setPhase(d.phase); }}><span>{d.severity === 'error' ? <XCircle size={14} /> : <AlertTriangle size={14} />}</span><code>{d.code}</code><div><p>{d.message}</p><small>{d.hint}</small>{d.related?.map((r, i) => <small key={i} className="related-location">{r.message} · L{r.span.line}:{r.span.column}</small>)}</div><span className="diagnostic-location">L{d.line}:{d.column}</span><ArrowUpRight size={12} /></button>{d.severity === 'error' && <button className="explain-button" title="Explain this error with AI" onClick={() => { setAIDiagnostic(index); setAI(true); }}><Sparkles size={12} /><span>Explain</span></button>}</div>) : <div className="diagnostics-clean"><span className="check-circle"><Check size={12} /></span><span>No errors or warnings. Your circuit is ready.</span><span>Finished in {result.durationMs.toFixed(1)} ms</span></div>}</div>}</section>
      <footer className="app-footer"><span>Built for the curious mind.</span><span>LogicHDL<span>·</span>Compiler Design Lab<button onClick={() => setHelp(true)}>How it works<ArrowUpRight size={11} /></button></span></footer>
    </main>
    {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
    {(help || ai) && <div className="drawer-overlay" onMouseDown={event => { if (event.target === event.currentTarget) { setHelp(false); setAI(false); } }}>{help ? <HelpDrawer onClose={() => setHelp(false)} /> : <AIAssistant initialTab={aiDiagnostic === undefined ? 'generate' : 'explain'} initialDiagnosticIndex={aiDiagnostic} source={source} diagnostics={result.diagnostics} onLoadSource={next => { load(next); setAI(false); notify('Validated AI program loaded'); }} onClose={() => setAI(false)} />}</div>}
  </div>;
}

import { layoutCircuit } from './compiler/layout';
function compileLayout(ir: import('./compiler/types').IRResult) { return layoutCircuit(ir.netlist); }

function HelpDrawer({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null; close.current?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = dialog.current?.querySelectorAll<HTMLElement>('button, a, input, select, textarea, [tabindex="0"]');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap); return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, []);
  return <aside className="help-drawer" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="drawer-heading"><span><CircuitBoard size={18} />The LogicHDL guide</span><button ref={close} className="icon-button" aria-label="Close guide" onClick={onClose}><X size={18} /></button></div><div className="drawer-content"><div className="eyebrow">From source to signals</div><h2 id="help-title">A compiler you can see.</h2><p>Logi-Compile turns a small hardware description language into a real combinational circuit. Every panel shows data produced by a hand-written compiler phase.</p><h3>Your first circuit</h3><pre>{'input a, b, c;\noutput out;\nout = (a AND b) OR NOT c;'}</pre><p>Declare external signals with <code>input</code>, observable signals with <code>output</code>, and internal signals with <code>wire</code>. Assign each output and wire exactly once.</p><h3>Operators and precedence</h3><table><thead><tr><th>Priority</th><th>Operators</th><th>Aliases</th></tr></thead><tbody><tr><td>1 · highest</td><td>NOT</td><td>! ~</td></tr><tr><td>2</td><td>AND NAND</td><td>&amp;</td></tr><tr><td>3</td><td>XOR XNOR</td><td>^</td></tr><tr><td>4 · lowest</td><td>OR NOR</td><td>|</td></tr></tbody></table><p>Keywords ignore case. Identifiers distinguish case. Binary operators associate left. Parentheses override precedence. Boolean literals are exactly <code>0</code> and <code>1</code>.</p><h3>Follow the six phases</h3><ol>{[['Lexer', 'Scans characters into located tokens; comments disappear.'], ['Parser', 'Applies the grammar to build a concrete parse tree and a smaller AST.'], ['Semantic', 'Resolves names, validates drivers, and rejects combinational cycles.'], ['IR', 'Lowers expressions into topologically ordered three-address code and a gate netlist.'], ['Optimizer', 'Simplifies Boolean laws, shares repeated logic and removes dead gates. Every input combination verifies equivalence.'], ['Codegen', 'Produces a truth table, canonical SOP/POS, an SVG circuit and a Verilog module.']].map(([label, text]) => <li key={label}><b>{label}</b><p>{text}</p></li>)}</ol><h3>Explore the workbench</h3><p>Load a working or broken sample. Click tokens, tree nodes, signals, TAC rows, gates or diagnostics to highlight their source. The Simulator tab lets you toggle inputs and follow live signals.</p><p>Step-through mode reveals tokens and parser nodes with play, pause and speed controls. Share encodes the source in the URL. Export saves your source, all phase data, a truth-table CSV, circuit SVG/PNG or Verilog.</p><h3>Language limits</h3><p>10,000 characters, 4,000 tokens, 256 declarations/statements, 96 nested expression levels, 1,024 gates and 12 inputs (4,096 truth-table rows). Larger programs receive a source diagnostic.</p><h3>Comments and shortcuts</h3><pre>{'// a line comment\n# also a line comment\n/* a block comment */'}</pre><p><kbd>⌘ / Ctrl</kbd> + <kbd>Enter</kbd> compiles immediately. Typing compiles after 250 ms. Inputs may be referenced before their declarations; cycles and memory elements are unsupported.</p><h3>Optional AI assistant</h3><p>Connect an API key to explain a diagnostic or draft HDL from English. Requests send the current source or your description to Anthropic only when you press a generation button. Generated HDL must pass this compiler before it can be loaded.</p></div></aside>;
}

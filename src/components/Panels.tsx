import { useState } from 'react';
import { ArrowDown, ArrowRight, Check, Copy, GitBranch, Info, Layers3 } from 'lucide-react';
import type { CompilationResult, ParseNode, Span, SymbolEntry, Netlist, IRResult } from '../compiler/types';
import { layoutCircuit } from '../compiler/layout';
import { Circuit } from './Circuit';
import { TreeView, astTree } from './Trees';

export function TokensPanel({ result, onSelect, activeOffset, count = Infinity }: {
  result: CompilationResult; onSelect: (span: Span) => void; activeOffset: number; count?: number;
}) {
  return <><PanelIntro title="Lexical analysis" detail={`${result.tokens.length} tokens · comments and whitespace removed`} /><div className="table-scroll phase-table"><table><thead><tr><th>#</th><th>Type</th><th>Lexeme</th><th>Line:col</th><th>Length</th></tr></thead><tbody>{result.tokens.slice(0, count).map((token, index) => <tr key={index} className={activeOffset >= token.offset && activeOffset < token.offset + token.length ? 'selected-row clickable' : 'clickable'} tabIndex={0} aria-label={`Token ${index}: ${token.type} ${token.lexeme || 'end of file'}, line ${token.line}, column ${token.column}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(token); } }} onMouseEnter={() => onSelect(token)} onClick={() => onSelect(token)}><td className="dim">{index.toString().padStart(2, '0')}</td><td><span className={`token-chip token-${token.type === 'IDENT' ? 'ident' : token.type === 'NUMBER' ? 'number' : token.type.startsWith('KEYWORD') ? 'keyword' : 'operator'}`}>{token.type}</span></td><td><code>{token.lexeme || '∎'}</code></td><td className="dim mono">{token.line}:{token.column}</td><td className="dim">{token.length}</td></tr>)}</tbody></table></div></>;
}

export function ParserPanel({ result, onSelect, activeOffset, count = Infinity, concrete, setConcrete }: {
  result: CompilationResult; onSelect: (span: Span) => void; activeOffset: number; count?: number; concrete: boolean; setConcrete: (concrete: boolean) => void;
}) {
  const root: ParseNode | undefined = concrete ? result.parseTree : result.ast ? astTree(result.ast) : undefined;
  return <><PanelIntro title="Syntax analysis" detail="Click a node to trace its source." trailing={<div className="segmented"><button className={concrete ? 'active' : ''} onClick={() => setConcrete(true)}>Parse tree</button><button className={!concrete ? 'active' : ''} onClick={() => setConcrete(false)}>AST</button></div>} />{root && <TreeView root={root} visibleCount={count} activeOffset={activeOffset} onSelect={onSelect} />}</>;
}

export function SemanticPanel({ result, onSelect }: { result: CompilationResult; onSelect: (span: Span) => void }) {
  const [sort, setSort] = useState<'name' | 'kind' | 'declaredAt' | 'usedByCount'>('declaredAt');
  const [ascending, setAscending] = useState(true);
  const semantic = result.semantic!;
  const sorted = [...semantic.symbols].sort((a, b) => {
    const key = (s: SymbolEntry) => sort === 'declaredAt' ? s.declaredAt.offset : s[sort];
    const x = key(a), y = key(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * (ascending ? 1 : -1);
  });
  const header = (label: string, field: typeof sort) => <button className="sort-button" onClick={() => { if (sort === field) setAscending(!ascending); else { setSort(field); setAscending(true); } }}>{label}{sort === field && <ArrowDown size={11} style={{ transform: ascending ? undefined : 'rotate(180deg)' }} />}</button>;
  return <><PanelIntro title="Symbol table" detail={`${semantic.symbols.length} declared signals · ${semantic.dependencies.length} dependencies`} /><div className="table-scroll"><table><thead><tr><th>{header('Signal', 'name')}</th><th>{header('Kind', 'kind')}</th><th>{header('Declared', 'declaredAt')}</th><th>Assigned</th><th>{header('Used by', 'usedByCount')}</th><th>Driver</th></tr></thead><tbody>{sorted.map(symbol => <tr className="clickable" key={symbol.name} tabIndex={0} aria-label={`Signal ${symbol.name}, ${symbol.kind}, declared on line ${symbol.declaredAt.line}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(symbol.declaredAt); } }} onClick={() => onSelect(symbol.declaredAt)}><td className="mono">{symbol.name}</td><td><span className={`token-chip token-${symbol.kind === 'input' ? 'ident' : 'keyword'}`}>{symbol.kind}</span></td><td className="dim">L{symbol.declaredAt.line}</td><td className="dim">{symbol.assignedAt.map(s => `L${s.line}`).join(', ') || '—'}</td><td title={symbol.usedBy.join(', ')}>{symbol.usedByCount}</td><td className="mono dim driver-cell">{symbol.driver ? exprLabel(symbol.driver) : 'external input'}</td></tr>)}</tbody></table></div><div className="sub-panel"><h3><GitBranch size={14} /> Signal dependencies</h3><DependencyGraph result={result} onSelect={onSelect} /><div className="topo-order"><small>Evaluation order</small><div>{semantic.topologicalOrder.map((name, i) => <span key={name}>{i > 0 && <ArrowRight size={11} />}<code>{name}</code></span>)}</div></div></div></>;
}

function exprLabel(expr: import('../compiler/types').Expr): string {
  if (expr.kind === 'Identifier') return expr.name;
  if (expr.kind === 'Literal') return String(expr.value);
  if (expr.kind === 'Unary') return `NOT ${exprLabel(expr.operand)}`;
  return `(${exprLabel(expr.left)} ${expr.op} ${exprLabel(expr.right)})`;
}

function DependencyGraph({ result, onSelect }: { result: CompilationResult; onSelect: (span: Span) => void }) {
  const sem = result.semantic!;
  const ranks = new Map<string, number>();
  for (const name of sem.topologicalOrder) {
    const dependencies = sem.dependencies.filter(e => e.to === name).map(e => ranks.get(e.from) ?? 0);
    const symbol = sem.symbols.find(s => s.name === name);
    ranks.set(name, symbol?.kind === 'input' ? 0 : 1 + Math.max(0, ...dependencies));
  }
  const slots = new Map<number, number>();
  const positions = new Map(sem.symbols.map(s => {
    const rank = ranks.get(s.name) ?? 0, row = slots.get(rank) ?? 0; slots.set(rank, row + 1);
    return [s.name, { x: 40 + rank * 150, y: 24 + row * 60 }];
  }));
  const width = Math.max(420, 170 + Math.max(0, ...ranks.values()) * 150), height = Math.max(125, 45 + Math.max(0, ...slots.values()) * 60);
  return <div className="dependency-graph"><svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: Math.min(width, 520) }} role="img" aria-label="Signal dependency graph"><defs><marker id="dependency-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="currentColor" /></marker></defs>{sem.dependencies.map((edge, i) => {
    const from = positions.get(edge.from), to = positions.get(edge.to); if (!from || !to) return null;
    return <path key={i} d={`M${from.x + 82} ${from.y + 15} H${(from.x + to.x + 82) / 2} V${to.y + 15} H${to.x}`} markerEnd="url(#dependency-arrow)" />;
  })}{sem.symbols.map(s => { const p = positions.get(s.name)!; return <g key={s.name} className="graph-node" role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.declaredAt); } }} onClick={() => onSelect(s.declaredAt)}><rect x={p.x} y={p.y} width={82} height={30} rx={5} /><text x={p.x + 41} y={p.y + 20} textAnchor="middle">{s.name.length > 10 ? `${s.name.slice(0, 9)}…` : s.name}</text><title>{s.kind} {s.name}</title></g>; })}</svg></div>;
}

export function IRPanel({ ir, onSelect, selectedGate }: { ir: IRResult; onSelect: (span: Span, gateId?: string) => void; selectedGate?: string }) {
  return <><PanelIntro title="Intermediate representation" detail={`${ir.tac.length} instructions · topological evaluation order`} /><div className="table-scroll"><table><thead><tr><th>#</th><th>Operation</th><th>Argument 1</th><th>Argument 2</th><th>Result</th></tr></thead><tbody>{ir.tac.map(row => <tr key={row.index} className={`clickable ${row.gateId && row.gateId === selectedGate ? 'selected-row' : ''}`} tabIndex={0} aria-label={`Instruction ${row.index}: ${row.result} equals ${row.op} ${row.arg1}${row.arg2 ? ` and ${row.arg2}` : ''}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(row.span, row.gateId); } }} onClick={() => onSelect(row.span, row.gateId)}><td className="dim">{row.index}</td><td><span className="token-chip token-operator">{row.op}</span></td><td className="mono">{row.arg1}</td><td className="mono dim">{row.arg2 ?? '—'}</td><td className="mono accent">{row.result}</td></tr>)}</tbody></table></div><div className="sub-panel"><h3><Layers3 size={14} /> Gate netlist</h3><div className="netlist-list">{ir.netlist.gates.map(gate => <button key={gate.id} className={gate.id === selectedGate ? 'netlist-row selected' : 'netlist-row'} onClick={() => onSelect(gate.span, gate.id)}><span className="dim">{gate.id}</span><b>{gate.type}</b><code>{gate.inputs.join(', ')}</code><ArrowRight size={12} /><code className="accent">{gate.output}</code></button>)}{ir.netlist.aliases.map((a, i) => <button className="netlist-row" key={`alias-${i}`} onClick={() => onSelect(a.span)}><span className="dim">alias</span><b>COPY</b><code>{a.input}</code><ArrowRight size={12} /><code>{a.output}</code></button>)}</div></div></>;
}

export function OptimizerPanel({ result, onSelect }: { result: CompilationResult; onSelect: (span: Span) => void }) {
  const optimization = result.optimizer;
  if (!optimization) return <div className="empty-state"><Info size={25} /><h3>Optimization is turned off</h3><p>Enable optimization below the editor to simplify this circuit and verify equivalence.</p></div>;
  const { before, after } = optimization;
  return <><PanelIntro title="Circuit optimization" detail={`${optimization.steps.length} applied transformations`} trailing={<EquivalenceBadge result={result} />} /><div className="optimization-metrics"><div><small>Logic gates</small><strong>{before.gateCount}<ArrowRight size={19} />{after.gateCount}</strong><span>{before.gateCount - after.gateCount} gates removed</span></div><div><small>Logic depth</small><strong>{before.depth}<ArrowRight size={19} />{after.depth}</strong><span>{before.depth - after.depth} levels removed</span></div></div><div className="compare-circuits"><div><h3>Original circuit</h3><Circuit compact layout={layoutCircuit(result.ir!.netlist)} netlist={result.ir!.netlist} /></div><div><h3>Optimized circuit</h3><Circuit compact layout={layoutCircuit(optimization.ir.netlist)} netlist={optimization.ir.netlist} /></div></div><div className="sub-panel"><h3>Transformation log</h3>{optimization.steps.length ? <div className="optimization-log">{optimization.steps.map((step, i) => <button key={i} onClick={() => onSelect(step.span)}><div><span className="step-number">{String(i + 1).padStart(2, '0')}</span><b>{step.rule}</b><small>L{step.span.line}:{step.span.column}</small></div><code className="before">{step.before}</code><ArrowDown size={12} /><code className="after">{step.after}</code></button>)}</div> : <p className="panel-note">This circuit has no redundant logic under the implemented optimization laws.</p>}</div></>;
}

export function EquivalenceBadge({ result }: { result: CompilationResult }) {
  if (!result.optimizer) return <span className="badge neutral">Optimization off</span>;
  return <span className={`badge ${result.optimizer.equivalence.verified ? 'good' : 'bad'}`} title={`${result.optimizer.equivalence.checkedRows} input combinations compared`}><Check size={12} />{result.optimizer.equivalence.verified ? 'Equivalence verified' : 'Equivalence failed'}</span>;
}

export function TruthTablePanel({ result, rowIndex }: { result: CompilationResult; rowIndex: number }) {
  const [showWires, setShowWires] = useState(false);
  const [page, setPage] = useState(0);
  const table = result.codegen!.truthTable;
  const pages = Math.ceil(table.rows.length / 128), safePage = Math.min(page, pages - 1);
  const columns = [...table.inputs, ...(showWires ? table.wires : []), ...table.outputs];
  return <><div className="table-toolbar"><span>{table.rows.length.toLocaleString()} combinations · MSB first</span><label className="checkbox-label"><input type="checkbox" checked={showWires} onChange={e => setShowWires(e.target.checked)} />Include wires</label></div><div className="table-scroll truth-table"><table><thead><tr><th>Row</th>{columns.map(c => <th className={table.outputs.includes(c) ? 'output-col' : ''} key={c}>{c}<small>{table.outputs.includes(c) ? 'output' : table.inputs.includes(c) ? 'input' : 'wire'}</small></th>)}</tr></thead><tbody>{table.rows.slice(safePage * 128, (safePage + 1) * 128).map(row => <tr className={`${table.outputs.some(o => row.values[o]) ? 'high-row' : ''} ${row.index === rowIndex ? 'current-row' : ''}`} key={row.index}><td className="dim mono">{row.index.toString().padStart(2, '0')}{row.index === rowIndex && <span className="current-marker">live</span>}</td>{columns.map(c => <td key={c}><span className={`bit ${row.values[c] ? 'one' : 'zero'}`}>{row.values[c] ?? '—'}</span></td>)}</tr>)}</tbody></table></div>{pages > 1 && <div className="pagination"><button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous rows</button><span>Page {safePage + 1} of {pages}</span><button onClick={() => setPage(Math.floor(rowIndex / 128))}>Show live row</button><button disabled={safePage === pages - 1} onClick={() => setPage(safePage + 1)}>Next rows</button></div>}<div className="sub-panel canonical-forms"><h3>Canonical forms</h3>{table.forms.map(form => <details key={form.output}><summary><code>{form.output}</code><span title={form.sop}>{form.sop.length > 90 ? `${form.sop.slice(0, 88)}…` : form.sop}</span><span className="dim">SOP / POS</span></summary><dl><dt>Sum of products</dt><dd><code>{form.sop}</code><p>{form.sopExpression}</p></dd><dt>Product of sums</dt><dd><code>{form.pos}</code><p>{form.posExpression}</p></dd></dl></details>)}</div></>;
}

export function VerilogPanel({ source, onCopy }: { source: string; onCopy: (text: string) => void }) {
  return <><div className="table-toolbar"><span>logic_circuit.v · continuous assignments</span><button className="text-button" onClick={() => onCopy(source)}><Copy size={13} />Copy Verilog</button></div><pre className="verilog-code">{source.split('\n').map((line, i) => <div key={i}><span>{i + 1}</span><code className={line.trim().startsWith('//') ? 'comment-code' : ''}>{line || ' '}</code></div>)}</pre></>;
}

export function SignalControls({ netlist, inputs, onToggle, values }: { netlist: Netlist; inputs: Record<string, 0 | 1>; onToggle: (name: string) => void; values: Record<string, 0 | 1> }) {
  return <div className="simulation-controls"><div><span className="small-label">Input signals</span><div className="signal-switches">{netlist.inputs.length ? netlist.inputs.map(name => <button key={name} role="switch" aria-checked={inputs[name] === 1} aria-label={`Toggle input ${name}`} className={`signal-switch ${inputs[name] === 1 ? 'on' : ''}`} onClick={() => onToggle(name)}><span>{name}</span><i><b /></i><code>{inputs[name] === 1 ? 1 : 0}</code></button>) : <span className="panel-note">Constant circuit · no inputs</span>}</div></div><div><span className="small-label">Output signals</span><div className="signal-outputs">{netlist.outputs.map(name => <span key={name}><i className={values[name] ? 'lit' : ''} /><code>{name}</code><b className={values[name] ? 'accent' : ''}>{values[name] ?? 0}</b></span>)}</div></div></div>;
}

export function PanelIntro({ title, detail, trailing }: { title: string; detail: string; trailing?: React.ReactNode }) {
  return <div className="panel-intro"><div><h2>{title}</h2><p>{detail}</p></div>{trailing}</div>;
}

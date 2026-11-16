import type { CircuitLayout, Gate, LayoutNode, LayoutWire, Netlist } from './types';

const NET_COLORS = ['#8ebdff', '#dba6ef', '#edbd75', '#81cdb0', '#e5969f', '#b6c77b', '#a7a5ed', '#76c6d4'];
const GATE_WIDTH = 88;
const GATE_HEIGHT = 64;
const COLUMN_GAP = 116;
const ROW_GAP = 110;

/** Rank by logic depth, order by upstream barycentres, then separate occupied slots. */
export function layoutCircuit(netlist: Netlist): CircuitLayout {
  const aliases = new Map(netlist.aliases.map(alias => [alias.output, alias.input]));
  const resolve = (name: string) => {
    const visited = new Set<string>();
    while (aliases.has(name) && !visited.has(name)) { visited.add(name); name = aliases.get(name)!; }
    return name;
  };
  const ranks = new Map<string, number>(netlist.inputs.map(name => [name, 0]));
  ranks.set('0', 0); ranks.set('1', 0);
  let pending = [...netlist.gates];
  // Iterative to support alias chains and avoid call-stack dependence on input size.
  while (pending.length) {
    const ready = pending.filter(gate => gate.inputs.every(input => ranks.has(resolve(input))));
    if (!ready.length) throw new Error('Cannot lay out a netlist with a cycle or missing driver.');
    for (const gate of ready) ranks.set(gate.output, 1 + Math.max(...gate.inputs.map(input => ranks.get(resolve(input))!)));
    const processed = new Set(ready.map(gate => gate.id));
    pending = pending.filter(gate => !processed.has(gate.id));
  }
  const maxRank = Math.max(0, ...netlist.gates.map(gate => ranks.get(gate.output)!));
  const skippedNets = [...new Set([
    ...netlist.gates.flatMap(gate => gate.inputs.filter(input => ranks.get(gate.output)! - (ranks.get(resolve(input)) ?? 0) > 1).map(resolve)),
    ...netlist.outputs.filter(output => maxRank + 1 - (ranks.get(resolve(output)) ?? 0) > 1).map(resolve),
  ])];
  const topSpace = 55 + skippedNets.length * 10;
  const inputWidth = Math.max(76, Math.min(240, Math.max(0, ...netlist.inputs.map(name => name.length)) * 7 + 24));
  const outputWidth = Math.max(76, Math.min(240, Math.max(0, ...netlist.outputs.map(name => name.length)) * 7 + 24));
  const startX = inputWidth + COLUMN_GAP + 24;
  const xFor = (rank: number) => startX + (rank - 1) * (GATE_WIDTH + COLUMN_GAP);
  const sources = new Map<string, LayoutNode>();
  const nodes: LayoutNode[] = [];
  netlist.inputs.forEach((name, index) => {
    const node: LayoutNode = { id: `input-${index}`, kind: 'input', label: name, net: name, x: 24, y: topSpace + index * ROW_GAP, width: inputWidth, height: GATE_HEIGHT };
    nodes.push(node); sources.set(name, node);
  });
  const constants = [...new Set([...netlist.gates.flatMap(g => g.inputs), ...netlist.aliases.map(a => a.input), ...netlist.outputs].map(resolve).filter(name => name === '0' || name === '1'))];
  constants.forEach((name, index) => {
    const node: LayoutNode = { id: `constant-${name}`, kind: 'constant', label: name, net: name, x: 24, y: topSpace + (netlist.inputs.length + index) * ROW_GAP, width: inputWidth, height: GATE_HEIGHT };
    nodes.push(node); sources.set(name, node);
  });
  for (let rank = 1; rank <= maxRank; rank++) {
    const layer = netlist.gates.filter(gate => ranks.get(gate.output) === rank).map((gate, originalOrder) => {
      const positions = gate.inputs.map(input => sources.get(resolve(input))?.y ?? topSpace);
      return { gate, idealY: positions.reduce((a, b) => a + b, 0) / positions.length, originalOrder };
    }).sort((a, b) => a.idealY - b.idealY || a.originalOrder - b.originalOrder);
    let nextY = topSpace;
    for (const { gate, idealY } of layer) {
      const y = Math.max(nextY, idealY);
      const node: LayoutNode = { id: gate.id, kind: 'gate', label: gate.type, net: gate.output, gate, x: xFor(rank), y, width: GATE_WIDTH, height: GATE_HEIGHT };
      nodes.push(node); sources.set(gate.output, node); nextY = y + ROW_GAP;
    }
  }
  const outputNodes: LayoutNode[] = [];
  let nextOutputY = topSpace;
  netlist.outputs.forEach((name, index) => {
    const source = sources.get(resolve(name));
    if (!source) throw new Error(`Output '${name}' has no source for circuit layout.`);
    const y = Math.max(nextOutputY, source.y);
    const node: LayoutNode = { id: `output-${index}`, kind: 'output', label: name, net: name, x: xFor(maxRank + 1), y, width: outputWidth, height: GATE_HEIGHT };
    outputNodes.push(node); nodes.push(node); nextOutputY = y + ROW_GAP;
  });
  const wireColor = new Map<string, string>();
  const colorFor = (net: string) => {
    if (!wireColor.has(net)) wireColor.set(net, NET_COLORS[wireColor.size % NET_COLORS.length]);
    return wireColor.get(net)!;
  };
  const wires: LayoutWire[] = [];
  const connect = (input: string, target: LayoutNode, inputIndex: number, arity: number) => {
    const net = resolve(input);
    const source = sources.get(net);
    if (!source) throw new Error(`Net '${input}' has no source for circuit layout.`);
    const sourceX = source.x + source.width;
    const sourceY = source.y + source.height / 2;
    const targetY = target.y + target.height / 2 + (arity === 1 ? 0 : inputIndex === 0 ? -12 : 12);
    const laneX = target.x - 24 - inputIndex * 12;
    const points = [{ x: sourceX, y: sourceY }];
    const skipIndex = skippedNets.indexOf(net);
    const targetRank = target.kind === 'output' ? maxRank + 1 : ranks.get(target.net)!;
    if ((targetRank - (ranks.get(net) ?? 0)) > 1 && skipIndex >= 0) {
      const trackY = 22 + skipIndex * 10;
      const startLaneX = sourceX + 22 + (skipIndex % 6) * 9;
      points.push({ x: startLaneX, y: sourceY }, { x: startLaneX, y: trackY }, { x: laneX, y: trackY }, { x: laneX, y: targetY });
    } else points.push({ x: laneX, y: sourceY }, { x: laneX, y: targetY });
    points.push({ x: target.x, y: targetY });
    wires.push({ id: `wire-${wires.length}`, net, points, color: colorFor(net) });
  };
  for (const node of nodes) if (node.gate) node.gate.inputs.forEach((input, index) => connect(input, node, index, node.gate!.inputs.length));
  for (const node of outputNodes) connect(node.net, node, 0, 1);
  // Unused inputs are intentionally still visible in the unoptimized diagram.
  return { width: Math.max(400, ...nodes.map(node => node.x + node.width + 28)), height: Math.max(240, ...nodes.map(node => node.y + node.height + 48)), nodes, wires };
}

function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function gateSymbol(gate: Gate): string {
  const inverted = ['NOT', 'NAND', 'NOR', 'XNOR'].includes(gate.type);
  const isAnd = ['AND', 'NAND'].includes(gate.type);
  const isXor = ['XOR', 'XNOR'].includes(gate.type);
  let body: string;
  if (gate.type === 'NOT') body = '<path d="M12 8 L66 32 L12 56 Z"/><path class="gate-pin" d="M0 32 H12 M76 32 H88"/>';
  else if (isAnd) body = '<path d="M10 8 H42 A24 24 0 0 1 42 56 H10 Z"/><path class="gate-pin" d="M0 20 H10 M0 44 H10 M66 32 H88"/>';
  else body = `<path d="M10 8 Q36 32 10 56 Q51 59 74 32 Q51 5 10 8 Z"/><path class="gate-pin" d="M0 20 H19 M0 44 H19 M74 32 H88"/>${isXor ? '<path class="gate-pin" d="M3 8 Q29 32 3 56"/>' : ''}`;
  if (inverted) {
    const bubbleX = gate.type === 'NOT' ? 71 : isAnd ? 71 : 79;
    body += `<circle class="inversion-bubble" cx="${bubbleX}" cy="32" r="5"/>`;
  }
  return body;
}

/** Standalone SVG: the UI and exports use exactly the same gate geometry. */
export function renderCircuitSVG(layout: CircuitLayout, values?: Record<string, 0 | 1>, selectedGate?: string, titleId = 'circuit-title'): string {
  const live = values !== undefined;
  const wires = layout.wires.map(wire => {
    const high = values?.[wire.net] === 1;
    const stroke = live ? high ? '#85d79b' : '#68716c' : wire.color;
    return `<polyline class="circuit-wire${high ? ' signal-high' : ''}" data-net="${xml(wire.net)}" points="${wire.points.map(p => `${p.x},${p.y}`).join(' ')}" stroke="${stroke}"><title>${xml(wire.net)}${live ? ` = ${high ? 1 : 0}` : ''}</title></polyline>`;
  }).join('');
  const nodes = layout.nodes.map(node => {
    const label = xml(node.label);
    const selected = node.id === selectedGate;
    const high = values?.[node.net] === 1;
    if (node.gate) return `<g class="circuit-gate${selected ? ' selected-gate' : ''}${high ? ' signal-high' : live ? ' signal-low' : ''}" data-gate-id="${xml(node.gate.id)}" data-net="${xml(node.net)}" transform="translate(${node.x} ${node.y})" tabindex="0" role="button" aria-label="${label} gate, output ${xml(node.net)}${live ? ` equals ${high ? 1 : 0}` : ''}"><title>${label} → ${xml(node.net)} · line ${node.gate.span.line}</title>${gateSymbol(node.gate)}<text class="gate-label" x="40" y="83" text-anchor="middle">${label}</text>${live ? `<text class="signal-value${high ? '' : ' signal-zero'}" x="93" y="37">${high ? 1 : 0}</text>` : ''}</g>`;
    const input = node.kind !== 'output';
    const shortLabel = xml(node.label.length > 32 ? `${node.label.slice(0, 29)}…` : node.label);
    return `<g class="circuit-terminal ${node.kind}" data-net="${xml(node.net)}" transform="translate(${node.x} ${node.y})"><title>${label}${live ? ` = ${high ? 1 : 0}` : ''}</title><rect x="0" y="13" width="${node.width}" height="38" rx="7"/><text x="${node.width / 2}" y="37" text-anchor="middle">${shortLabel}</text><circle class="terminal-pin" cx="${input ? node.width : 0}" cy="32" r="3"/>${live ? `<text class="signal-value${high ? '' : ' signal-zero'}" x="${input ? -10 : node.width + 12}" y="37" text-anchor="${input ? 'end' : 'start'}">${high ? 1 : 0}</text>` : ''}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" class="logic-circuit" role="img" aria-labelledby="${xml(titleId)}"><title id="${xml(titleId)}">LogicHDL circuit diagram${live ? ' with live signal values' : ''}</title><style>.logic-circuit{--circuit-bg:#171b19;--circuit-ink:#dde5dc;--circuit-muted:#a7b0a7;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--circuit-bg)}.circuit-wire{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:stroke .18s}.circuit-gate{fill:var(--circuit-bg);stroke:var(--circuit-ink);stroke-width:2;cursor:pointer;outline:none}.gate-pin{fill:none}.gate-label{font-size:11px;fill:var(--circuit-muted);stroke:none;letter-spacing:1px}.circuit-gate:hover,.circuit-gate:focus,.selected-gate{stroke:#c2ed80;filter:drop-shadow(0 0 4px #c2ed8060)}.circuit-terminal rect{fill:var(--circuit-bg);stroke:#586659;stroke-width:1.5}.circuit-terminal text{fill:var(--circuit-ink);font-size:13px}.terminal-pin{fill:#a8b7aa}.signal-value{fill:#85d79b!important;font-size:12px;stroke:none}.signal-high{stroke:#85d79b}.signal-low{stroke:#68716c}.signal-zero{fill:#89928b!important}.inversion-bubble{fill:var(--circuit-bg)}</style>${wires}${nodes}</svg>`;
}

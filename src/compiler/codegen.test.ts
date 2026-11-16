import { describe, expect, it } from 'vitest';
import { SAMPLES } from '../data/samples';
import { generateCode, generateTruthTable, generateVerilog, truthTableCSV } from './codegen';
import { generateIR } from './ir';
import { layoutCircuit, renderCircuitSVG } from './layout';
import { lex } from './lexer';
import { parse } from './parser';
import { analyze } from './semantic';
import { DEFAULT_SPAN, type GateOp, type Netlist } from './types';

function irFor(source: string) {
  const scan = lex(source);
  expect(scan.diagnostics).toEqual([]);
  const parsed = parse(scan.tokens);
  expect(parsed.diagnostics).toEqual([]);
  const semantic = analyze(parsed.ast);
  expect(semantic.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  return generateIR(parsed.ast, semantic);
}

type Values = Record<string, 0 | 1>;
const bit = (n: number | boolean): 0 | 1 => n ? 1 : 0;
const references: Record<string, (v: Values) => Record<string, number>> = {
  example: v => ({ out: bit((v.a && v.b) || !v.c) }),
  'half-adder': v => ({ sum: v.a ^ v.b, carry: v.a & v.b }),
  'full-adder': v => ({ sum: (v.a + v.b + v.cin) % 2, cout: bit(v.a + v.b + v.cin >= 2) }),
  'mux-2': v => ({ y: v.sel ? v.d1 : v.d0 }),
  'mux-4': v => ({ y: v[`d${2 * v.s1 + v.s0}`] }),
  'xor-nand': v => ({ y: bit(v.a !== v.b) }),
  majority: v => ({ majority: bit(v.a + v.b + v.c >= 2) }),
  comparator: v => {
    const a = 2 * v.a1 + v.a0, b = 2 * v.b1 + v.b0;
    return { equal: bit(a === b), greater: bit(a > b), less: bit(a < b) };
  },
  parity: v => ({ odd: (v.a + v.b + v.c + v.d) % 2 }),
  'seven-segment': v => ({ segment_a: bit([0, 2, 3, 5, 6, 7, 8, 9].includes(8 * v.d + 4 * v.c + 2 * v.b + v.a)) }),
  'sr-cascade': v => ({ q_next: bit((v.s || v.q_in) && !v.r) }),
  optimization: v => ({ y: v.a & v.b, z: v.a & v.b }),
};

describe('truth table targets checked against independent reference functions', () => {
  for (const sample of SAMPLES.filter(sample => sample.category === 'working')) {
    it(`enumerates every input combination correctly for ${sample.name}`, () => {
      const table = generateTruthTable(irFor(sample.source).netlist);
      expect(table.rows.length).toBe(2 ** table.inputs.length);
      for (const row of table.rows) {
        expect(Object.fromEntries(table.inputs.map(name => [name, row.values[name]]))).toEqual(Object.fromEntries(table.inputs.map((name, i) => [name, (row.index >> (table.inputs.length - i - 1)) & 1])));
        expect(row.values).toMatchObject(references[sample.id](row.values));
      }
    });
  }

  it('hand-checked PDF example is 1,0,1,0,1,0,1,1 for 000 through 111', () => {
    const table = generateTruthTable(irFor(SAMPLES[0].source).netlist);
    expect(table.rows.map(row => row.values.out)).toEqual([1, 0, 1, 0, 1, 0, 1, 1]);
    expect(table.forms[0]).toMatchObject({ minterms: [0, 2, 4, 6, 7], maxterms: [1, 3, 5], sop: 'Σm(0,2,4,6,7)', pos: 'ΠM(1,3,5)' });
  });
  it('preserves input declaration order rather than alphabetical order', () => {
    const table = generateTruthTable(irFor('input z,a; output y; y=z XOR a;').netlist);
    expect(table.inputs).toEqual(['z', 'a']);
    expect(table.rows[1].values).toMatchObject({ z: 0, a: 1 });
    expect(table.rows[2].values).toMatchObject({ z: 1, a: 0 });
  });
  it('generates canonical SOP and POS expressions for XOR', () => {
    const table = generateTruthTable(irFor('input a,b; output y; y=a XOR b;').netlist);
    expect(table.forms[0]).toMatchObject({ sopExpression: '(NOT a AND b) OR (a AND NOT b)', posExpression: '(a OR b) AND (NOT a OR NOT b)' });
  });
  it('generates one row and correct canonical constants with no inputs', () => {
    const table = generateTruthTable(irFor('output high,low; high=1; low=0;').netlist);
    expect(table.rows).toHaveLength(1);
    expect(table.forms[0]).toMatchObject({ sopExpression: '1', posExpression: '1', minterms: [0], maxterms: [] });
    expect(table.forms[1]).toMatchObject({ sopExpression: '0', posExpression: '0', minterms: [], maxterms: [0] });
  });
  it('exports CSV in input/output order with optional wire columns', () => {
    const table = generateTruthTable(irFor('input a; output y; wire w; w=NOT a; y=w;').netlist);
    expect(truthTableCSV(table)).toBe('a,y\r\n0,1\r\n1,0');
    expect(truthTableCSV(table, true)).toBe('a,w,y\r\n0,1,1\r\n1,0,0');
  });
  it('rejects oversized direct truth-table requests', () => {
    const netlist: Netlist = { inputs: Array.from({ length: 13 }, (_, i) => `x${i}`), outputs: [], wires: [], gates: [], aliases: [] };
    expect(() => generateTruthTable(netlist)).toThrow('at most 12');
  });
});

describe('Verilog continuous assignment target', () => {
  it('uses exact bitwise operators and inversion for every gate', () => {
    const ir = irFor('input a,b; output p,q,r,s,t,u,v; p=a AND b; q=a NAND b; r=a OR b; s=a NOR b; t=a XOR b; u=a XNOR b; v=NOT a;');
    const verilog = generateVerilog(ir.netlist);
    expect(verilog).toContain('assign p = a & b;');
    expect(verilog).toContain('assign q = ~(a & b);');
    expect(verilog).toContain('assign r = a | b;');
    expect(verilog).toContain('assign s = ~(a | b);');
    expect(verilog).toContain('assign t = a ^ b;');
    expect(verilog).toContain('assign u = ~(a ^ b);');
    expect(verilog).toContain('assign v = ~a;');
    expect(verilog).toContain('endmodule');
  });
  it('writes single-bit constants and aliases without artificial buffers', () => {
    const result = generateVerilog(irFor('input a; output y,z; y=a; z=1;').netlist);
    expect(result).toContain('assign y = a;');
    expect(result).toContain("assign z = 1'b1;");
  });
  it('renames reserved Verilog identifiers without colliding with user names', () => {
    const result = generateVerilog(irFor('input module,lc_module; output y; y=module XOR lc_module;').netlist, 'module');
    expect(result).toContain('module lc_module (lc_module, lc_module_2, y);');
    expect(result).toContain('assign y = lc_module ^ lc_module_2;');
    expect(result).not.toContain('input wire module');
  });
  it('generates all targets from the same IR', () => {
    const ir = irFor(SAMPLES[1].source);
    const result = generateCode(ir);
    expect(result.truthTable.rows).toHaveLength(4);
    expect(result.verilog).toContain('assign sum = a ^ b;');
    expect(result.svg).toContain('XOR');
    expect(result.layout.nodes.filter(node => node.gate)).toHaveLength(ir.gateCount);
  });
});

describe('hand-written layered circuit layout and SVG', () => {
  for (const sample of SAMPLES.filter(sample => sample.category === 'working')) {
    it(`lays out ${sample.name} with separate gate boxes and orthogonal edges`, () => {
      const ir = irFor(sample.source), layout = layoutCircuit(ir.netlist);
      const gates = layout.nodes.filter(node => node.kind === 'gate');
      expect(gates).toHaveLength(ir.netlist.gates.length);
      for (let i = 0; i < gates.length; i++) for (let j = i + 1; j < gates.length; j++) {
        const a = gates[i], b = gates[j];
        expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
      }
      for (const wire of layout.wires) for (let i = 1; i < wire.points.length; i++) {
        const a = wire.points[i - 1], b = wire.points[i];
        expect(a.x === b.x || a.y === b.y).toBe(true);
      }
      const netColors = new Map<string, string>();
      for (const wire of layout.wires) {
        expect(netColors.get(wire.net) ?? wire.color).toBe(wire.color);
        netColors.set(wire.net, wire.color);
      }
      for (const node of layout.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(0); expect(node.y).toBeGreaterThanOrEqual(0);
        expect(node.x + node.width).toBeLessThan(layout.width);
        expect(node.y + node.height).toBeLessThan(layout.height);
      }
    });
  }
  it('resolves forward alias chains for both gate inputs and output labels', () => {
    const netlist: Netlist = {
      inputs: ['a'], outputs: ['y'], wires: ['w','v'],
      gates: [{ id: 'g1', type: 'NOT', inputs: ['w'], output: 'n', span: DEFAULT_SPAN }],
      aliases: [{ input: 'n', output: 'y', span: DEFAULT_SPAN }, { input: 'v', output: 'w', span: DEFAULT_SPAN }, { input: 'a', output: 'v', span: DEFAULT_SPAN }],
    };
    const layout = layoutCircuit(netlist);
    expect(layout.wires.map(wire => wire.net)).toEqual(['a', 'n']);
    expect(layout.nodes.find(node => node.kind === 'output')!.label).toBe('y');
  });
  it('renders conventional curved AND/OR/XOR symbols, triangles and four inversion bubbles', () => {
    const ops: GateOp[] = ['AND', 'OR', 'XOR', 'NOT', 'NAND', 'NOR', 'XNOR'];
    const netlist: Netlist = { inputs: ['a','b'], outputs: ops.map((_, i) => `y${i}`), wires: [], aliases: [], gates: ops.map((type, i) => ({ id: `g${i}`, type, inputs: type === 'NOT' ? ['a'] : ['a','b'], output: `y${i}`, span: DEFAULT_SPAN })) };
    const svg = renderCircuitSVG(layoutCircuit(netlist));
    expect(svg.match(/<circle class="inversion-bubble"/g)).toHaveLength(4);
    expect(svg).toContain('A24 24'); expect(svg).toContain('Q36 32'); expect(svg).toContain('L66 32');
    expect(svg.match(/data-gate-id=/g)).toHaveLength(7);
  });
  it('renders live values, a selected gate, and an accessible standalone SVG', () => {
    const ir = irFor('input a; output y; y=NOT a;');
    const svg = renderCircuitSVG(layoutCircuit(ir.netlist), { a: 0, y: 1 }, 'g1');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('aria-labelledby="circuit-title"');
    expect(svg).toContain('selected-gate'); expect(svg).toContain('with live signal values');
    expect(svg).toContain('equals 1'); expect(svg).toContain('#68716c');
  });
  it('escapes SVG labels and rejects invalid dependency graphs rather than looping', () => {
    const netlist: Netlist = { inputs: ['a<&'], outputs: ['y'], wires: [], gates: [], aliases: [{ output: 'y', input: 'a<&', span: DEFAULT_SPAN }] };
    expect(renderCircuitSVG(layoutCircuit(netlist))).toContain('a&lt;&amp;');
    const cyclic: Netlist = { inputs: [], outputs: ['y'], wires: [], aliases: [], gates: [{ id: 'g1', type: 'NOT', inputs: ['y'], output: 'y', span: DEFAULT_SPAN }] };
    expect(() => layoutCircuit(cyclic)).toThrow('cycle or missing driver');
  });
});

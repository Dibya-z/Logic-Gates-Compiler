import { useId, useState } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { renderCircuitSVG } from "../compiler/layout";
import type { CircuitLayout, Gate, Netlist } from "../compiler/types";

export function Circuit({
  layout,
  netlist,
  values,
  selectedGate,
  onSelect,
  compact = false,
}: {
  layout: CircuitLayout;
  netlist: Netlist;
  values?: Record<string, 0 | 1>;
  selectedGate?: string;
  onSelect?: (gate: Gate) => void;
  compact?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const titleId = useId().replace(/:/g, "") + "-circuit-title";
  const svg = renderCircuitSVG(layout, values, selectedGate, titleId);
  return (
    <div className={`circuit-area ${compact ? "compact" : ""}`}>
      <div className="canvas-label">
        <span className={`status-dot ${values ? "live" : ""}`} />
        {values ? "Live simulation" : "Combinational circuit"}
      </div>
      <div
        className="circuit-scroll"
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          const target = (event.target as Element).closest("[data-gate-id]");
          const gate = netlist.gates.find(
            (g) => g.id === target?.getAttribute("data-gate-id"),
          );
          if (gate) {
            event.preventDefault();
            onSelect?.(gate);
          }
        }}
        onClick={(event) => {
          const target = (event.target as Element).closest("[data-gate-id]");
          const gate = netlist.gates.find(
            (g) => g.id === target?.getAttribute("data-gate-id"),
          );
          if (gate) onSelect?.(gate);
        }}
      >
        <div
          className="circuit-graphic"
          style={{
            width: `${zoom * 100}%`,
            minWidth: compact ? 280 : 0,
            transformOrigin: "center",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
      {!compact && (
        <div className="canvas-bottom">
          <div className="canvas-legend">
            <span>
              <i className="legend-input" />
              Input
            </span>
            <span>
              <i className="legend-gate" />
              Logic gate
            </span>
            <span>
              <i className="legend-output" />
              Output
            </span>
          </div>
          <div className="zoom-controls">
            <button
              aria-label="Zoom out"
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            >
              <Minus size={13} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              aria-label="Zoom in"
              onClick={() => setZoom(Math.min(2.5, zoom + 0.25))}
            >
              <Plus size={13} />
            </button>
            <button aria-label="Reset circuit zoom" onClick={() => setZoom(1)}>
              <Maximize2 size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

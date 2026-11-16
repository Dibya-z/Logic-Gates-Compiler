import { useState } from "react";
import { ChevronRight, Braces, FileCode2 } from "lucide-react";
import type { Expr, ParseNode, Program, Span } from "../compiler/types";

export function astTree(program: Program): ParseNode {
  let id = 0;
  const node = (
    label: string,
    span: Span,
    children: ParseNode[] = [],
  ): ParseNode => ({ id: `ast-${id++}`, label, span, children });
  const expression = (expr: Expr): ParseNode => {
    if (expr.kind === "Identifier")
      return node(`Identifier · ${expr.name}`, expr.span);
    if (expr.kind === "Literal")
      return node(`Literal · ${expr.value}`, expr.span);
    if (expr.kind === "Unary")
      return node("Unary · NOT", expr.span, [expression(expr.operand)]);
    return node(`Binary · ${expr.op}`, expr.span, [
      expression(expr.left),
      expression(expr.right),
    ]);
  };
  return node(
    "Program",
    program.span,
    program.body.map((item) =>
      item.kind === "Declaration"
        ? node(
            `Declare · ${item.signalKind}`,
            item.span,
            item.names.map((name) => node(name.name, name.span)),
          )
        : node(`Assign · ${item.target.name}`, item.span, [
            expression(item.expression),
          ]),
    ),
  );
}

export function flattenTree(root: ParseNode): ParseNode[] {
  const result: ParseNode[] = [];
  const visit = (n: ParseNode) => {
    result.push(n);
    n.children.forEach(visit);
  };
  visit(root);
  return result;
}

export function TreeView({
  root,
  onSelect,
  visibleCount = Infinity,
  activeOffset,
}: {
  root: ParseNode;
  onSelect: (span: Span) => void;
  visibleCount?: number;
  activeOffset: number;
}) {
  const visibleIds = new Set(
    flattenTree(root)
      .slice(0, visibleCount)
      .map((n) => n.id),
  );
  return (
    <div className="tree-view" role="tree" aria-label="Compiler tree">
      <TreeBranch
        node={root}
        depth={0}
        visibleIds={visibleIds}
        onSelect={onSelect}
        activeOffset={activeOffset}
      />
    </div>
  );
}

function TreeBranch({
  node,
  depth,
  visibleIds,
  onSelect,
  activeOffset,
}: {
  node: ParseNode;
  depth: number;
  visibleIds: Set<string>;
  onSelect: (span: Span) => void;
  activeOffset: number;
}) {
  const [open, setOpen] = useState(true);
  if (!visibleIds.has(node.id)) return null;
  const active =
    activeOffset >= node.span.offset &&
    activeOffset < node.span.offset + node.span.length &&
    !node.children.length;
  return (
    <div
      role="treeitem"
      aria-expanded={node.children.length ? open : undefined}
    >
      <div
        className={`tree-node ${active ? "selected" : ""}`}
        style={{ paddingLeft: 16 + depth * 18 }}
      >
        {node.children.length ? (
          <button
            className="tree-chevron icon-button"
            aria-label={`${open ? "Collapse" : "Expand"} ${node.label}`}
            onClick={() => setOpen(!open)}
          >
            <ChevronRight
              size={13}
              style={{ transform: open ? "rotate(90deg)" : undefined }}
            />
          </button>
        ) : (
          <span className="tree-leaf" />
        )}
        <button className="tree-label" onClick={() => onSelect(node.span)}>
          {node.children.length ? (
            <Braces size={13} />
          ) : (
            <FileCode2 size={12} />
          )}
          <span>{node.label}</span>
          <small>
            {node.span.line}:{node.span.column}
          </small>
        </button>
      </div>
      {open && (
        <div role="group">
          {node.children.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              visibleIds={visibleIds}
              onSelect={onSelect}
              activeOffset={activeOffset}
            />
          ))}
        </div>
      )}
    </div>
  );
}

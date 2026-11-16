# Implementation decisions

1. This repository is the deliverable. Development and validation run locally; no hosted account or deployment is required.
2. Keywords are case-insensitive; signal identifiers are case-sensitive. `a` and `A` are different nets.
3. Declarations may follow assignments. Every output and wire must have exactly one driver. At least one output is required for target generation.
4. Limits: 10,000 source characters, 4,000 tokens, 256 top-level items, expression depth 96, 12 inputs. Limits produce diagnostics and block later phases.
5. Source positions use zero-based offsets and one-based lines/columns. Spans survive transformations for cross-highlighting.
6. SR-style sample means a feed-forward combinational cascade. A real feedback latch is intentionally rejected as a cycle.
7. Optimization is deterministic and its output is checked exhaustively against the original circuit. Gate counts exclude named wire copies.
8. Optional AI calls require an explicit user action and an API key. No key is persisted. The deterministic compiler needs no network connection.
9. The default target view is the optimized circuit. The IR panel always shows original TAC and its own original circuit, so an instruction keeps a visible gate even when optimization removes it.
10. The teaching stepper reveals precomputed, genuine tokens and tree nodes; it does not change the compiler algorithm or introduce artificial delays into compilation.
11. Truth tables retain every declared input, including unused inputs, in declaration order. The UI pages tables at 128 rows; CSV and JSON exports retain all rows. Dead internal wires disappear from optimized targets.
12. Canonical forms include both index lists and full Boolean expressions. Constant functions use `0`/`1` rather than an unnecessarily expanded expression.
13. The circuit layout reserves a separate layer for each depth and separates gate boxes vertically. Orthogonal routes can cross; this is a logic visualization, not physical placement-and-routing. Circuits fit the available width initially and can be zoomed and scrolled.
14. Signal copies are zero-cost aliases. Counts include actual logic gates, not copies or input/output terminals. CSE recognizes commutative operand order without reassociating NAND or NOR.
15. Sharing uses UTF-8 Base64url in the URL hash. It is encoding, not encryption or server storage. PNG export limits the longest dimension to 4,096 pixels.
16. The optional AI model defaults to `claude-sonnet-5-5`, verified against Anthropic's official model catalogue on 2026-11-16, and is editable. The client uses API version `2026-10-21`; an optional memory-only workspace ID supports unscoped keys. Live paid calls are not a prerequisite for compiler operation or verification.
17. The requested editor-and-results workbench takes precedence over presentation-site conventions such as full-screen marketing heroes, sales CTAs and decorative photographs. The design skill's contrast, focus and responsive observations were applied; its remaining presentation-layout findings are documented in TEST_REPORT.md.
18. Tests and review are automated/AI-assisted. The repository records generated code, observed failures and corrections without claiming an independent human reviewed it.

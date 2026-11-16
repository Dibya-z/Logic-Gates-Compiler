# Implementation decisions

1. This repository is the deliverable. Development and validation run locally; no hosted account or deployment is required.
2. Keywords are case-insensitive; signal identifiers are case-sensitive. `a` and `A` are different nets.
3. Declarations may follow assignments. Every output and wire must have exactly one driver. At least one output is required for target generation.
4. Limits: 10,000 source characters, 4,000 tokens, 256 top-level items, expression depth 96, 12 inputs. Limits produce diagnostics and block later phases.
5. Source positions use zero-based offsets and one-based lines/columns. Spans survive transformations for cross-highlighting.
6. SR-style sample means a feed-forward combinational cascade. A real feedback latch is intentionally rejected as a cycle.
7. Optimization is deterministic and its output is checked exhaustively against the original circuit. Gate counts exclude named wire copies.
8. Optional AI calls require an explicit user action and an API key. No key is persisted. The deterministic compiler needs no network connection.

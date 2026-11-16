# Build prompts

## Master brief

The full user brief is preserved in [MASTER_PROMPT.md](MASTER_PROMPT.md). It specifies an end-to-end university compiler project, LogicHDL grammar, six compiler phases, interactive UI, optimization equivalence checking, twelve working samples, broken cases, sixty or more tests, documentation, and eleven tested commits.

## Follow-up tasks

- Establish pure TypeScript contracts shared by independently implemented compiler phases.
- Implement a recovering hand-written scanner/parser with concrete grammar tree, AST, exact diagnostic codes and source locations.
- Implement semantic analysis, topological TAC/netlist generation, optimization, and exhaustive equivalence checking.
- Generate truth tables, canonical forms, Verilog and custom layered SVG circuits without graph libraries.
- Build an accessible compiler workbench with real phase data, CodeMirror diagnostics, cross-highlighting, simulator, teaching stepper, and exports.
- Independently audit behavior, test robustness with seeded garbage, hand-check reference truth tables, and verify the app in a browser.

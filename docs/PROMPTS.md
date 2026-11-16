# Build prompts

## Master brief

The full original brief is reproduced below; the standalone copy is [MASTER_PROMPT.md](MASTER_PROMPT.md). Formatting is normalized from the escaped chat message.

## Follow-up tasks

- Establish pure TypeScript contracts shared by independently implemented compiler phases.
- Implement a recovering hand-written scanner/parser with concrete grammar tree, AST, exact diagnostic codes and source locations.
- Implement semantic analysis, topological TAC/netlist generation, optimization, and exhaustive equivalence checking.
- Generate truth tables, canonical forms, Verilog and custom layered SVG circuits without graph libraries.
- Build an accessible compiler workbench with real phase data, CodeMirror diagnostics, cross-highlighting, simulator, teaching stepper, and exports.
- Independently audit behavior, test robustness with seeded garbage, hand-check reference truth tables, and verify the app in a browser.

## Browser verification follow-ups

- Audit legal JavaScript prototype-like signal names across the compiler and React simulator; fix inherited-property reads.
- Test keyboard source selection, TAC/gate cross-highlighting, and teaching-mode tree switches.
- Load every working and broken program in a real browser; exercise all six download formats and hash reloads.
- Verify circuit visibility, overflow and keyboard focus at desktop, tablet and mobile widths. Correct the export-menu stacking problem and responsive circuit fitting.
- Verify current Anthropic API headers against official documentation; add optional workspace IDs, cancellation and one compiler-guided correction retry.

## Complete master prompt

# "Logi-Compile", an Interactive Logic-Gate Compiler (end-to-end)

## 0. Your role and how to work

You are a senior compiler engineer and full-stack developer. Build the complete project described below, end to end, in this repository. Work autonomously in milestones (Section 10). Before writing code, post a short plan. After each milestone, run the tests and the app, fix what fails, and commit. Do not leave TODOs, mocks, placeholder text, or stubbed phases. Every phase must really work. If something is ambiguous, choose the simplest sensible option, record it in docs/DECISIONS.md, and continue without asking me.

## 1. Project summary

This is a university Compiler Design final project (AI Product Engineering Track). Build a web application that is a real compiler for a small Hardware Description Language (HDL) for combinational logic circuits.

- Input: a text program such as

  ```text
  input a, b, c;
  output out;
  out = (a AND b) OR NOT c;
  ```

- Output (target code): a truth table, a rendered circuit diagram (SVG), and optionally Verilog.
- The user types source code and instantly sees what EVERY compiler phase produced: tokens, parse tree, AST, symbol table, semantic diagnostics, intermediate representation (IR), optimization steps, and final code.

The grading criteria I must satisfy:

1. Complexity and relevance of the use case.
2. Correctness and accuracy of the generated target and intermediate code.
3. Edge cases handled: lexical, syntactic AND semantic errors, with helpful messages.
4. Phase-by-phase interactive visualization: tokens, parse tree/AST, symbol table, IR, and other outcomes.

Map every feature to one of these four, and cover them explicitly in the README (Section 9).

## 2. Tech stack (use exactly this unless impossible)

- TypeScript, React, Vite, Tailwind CSS, Vitest for tests. A pure client-side app with no backend required.
- The compiler core lives in `src/compiler/` as pure TypeScript with ZERO React or DOM imports, so it is testable alone and could run as a CLI.
- Hand-write the lexer, parser, semantic analyzer, IR generator, optimizer and code generators. Do NOT use parser generators or compiler-compiler libraries. Allowed libraries: UI components, a code editor component (CodeMirror 6 or Monaco), and an icon set.
- Draw the circuit as hand-generated SVG using your own layered layout algorithm (do not use a prebuilt graph-layout library).

## 3. The language ("LogicHDL")

Informal spec (formalize it in docs/GRAMMAR.md):

- Keywords are case-insensitive: input, output, wire, AND, OR, NOT, XOR, NAND, NOR, XNOR.
- Symbol aliases: `&` = AND, `|` = OR, `^` = XOR, `!` and `~` = NOT.
- Literals: `0` and `1`. Identifiers: `[A-Za-z_][A-Za-z0-9_]*`.
- Comments: `// ...` to end of line, `# ...` to end of line, and `/* ... */` blocks.
- Declarations: `input a, b;` `output y, z;` `wire w1;`
- Statements: `IDENT = expr;`
- Precedence, highest to lowest: NOT, then AND/NAND, then XOR/XNOR, then OR/NOR. Binary operators are left-associative. Parentheses override precedence.

Grammar (implement as recursive descent with precedence levels):

```ebnf
program     = { declaration | statement } EOF ;
declaration = ("input" | "output" | "wire") IDENT { "," IDENT } ";" ;
statement   = IDENT "=" expr ";" ;
expr        = orExpr ;
orExpr      = xorExpr  { ("OR"  | "NOR"  | "|") xorExpr } ;
xorExpr     = andExpr  { ("XOR" | "XNOR" | "^") andExpr } ;
andExpr     = unary    { ("AND" | "NAND" | "&") unary } ;
unary       = ("NOT" | "!" | "~") unary | primary ;
primary     = IDENT | "0" | "1" | "(" expr ")" ;
```

Statement order does not matter for signal definitions (it is combinational hardware), but cycles are illegal.

## 4. Compiler phases (each must expose structured data for the UI)

### Phase 1: Lexical analysis

- Hand-written scanner producing tokens {type, lexeme, line, column, length}.
- Token types: KEYWORD_*, IDENT, NUMBER(0/1), operators, LPAREN, RPAREN, COMMA, SEMICOLON, ASSIGN, EOF.
- Lexical errors, each with an error code: illegal character (e.g. `@`, `$`), malformed number (e.g. `2`, `10`, `0x1`), identifier starting with a digit (`3abc`), unterminated block comment. The lexer must recover and keep scanning so that several errors are reported at once.

### Phase 2: Syntax analysis

- Recursive-descent parser producing (a) a concrete Parse Tree showing the grammar rules applied, and (b) a simplified AST. Show both in the UI.
- Syntax errors: missing semicolon, unmatched or extra parenthesis, missing operand (`a AND ;`), two operators in a row, missing `=`, empty parentheses, stray tokens, declaration without names, unexpected EOF.
- Panic-mode error recovery: synchronize at `;` so multiple syntax errors can be reported in one run. Each error says what was expected and what was found.

### Phase 3: Semantic analysis

- Build a Symbol Table: name, kind (input/output/wire), declared at line, assigned at line(s), used-by count, driver expression.
- Errors (must all be implemented and tested):
  - E-SEM: use of an undeclared / undefined signal (the PDF rule "no undefined inputs").
  - E-SEM: an output or wire assigned more than once (the PDF rule "no output assigned twice"); report both locations.
  - E-SEM: assigning to an `input`.
  - E-SEM: duplicate declaration of a name; a keyword used as a name.
  - E-SEM: a declared output or wire never assigned.
  - E-SEM: a combinational cycle (e.g. `w1 = w2; w2 = w1;` or `x = x AND a;`). Show the cycle path.
  - E-SEM: more than 12 inputs (the truth table limit).
- Warnings: unused input, unused wire, output driven by a constant, tautology/contradiction hints.
- Build a signal dependency graph and compute a topological order, which is needed for IR generation.

### Phase 4: Intermediate code generation

- Generate Three-Address Code (TAC) in topological order using temporaries t1, t2, ..., for example:

  ```text
  t1 = AND a, b
  t2 = NOT c
  out = OR t1, t2
  ```

- Also produce a Netlist form: a list of gates with unique IDs, type, input nets and output net. This is the input to the circuit drawing.
- Show the TAC as a table: index, op, arg1, arg2, result.

### Phase 5: Optimization

- Implement these passes and log each applied rule (rule name, before, after, location):
  - Constant folding.
  - Identity/annihilator laws: x AND 1 = x, x AND 0 = 0, x OR 0 = x, x OR 1 = 1, x XOR 0 = x, x XOR 1 = NOT x.
  - Idempotence and complement: x AND x = x, x OR NOT x = 1, x AND NOT x = 0.
  - Double negation elimination.
  - Common subexpression elimination.
  - Dead code elimination.
- Show a before/after comparison of the gate count and logic depth.
- Verify correctness automatically: after optimization, exhaustively check that the optimized circuit is equivalent to the unoptimized one on all input combinations. Show a visible "Equivalence verified ✓" badge, and a failure state if it ever fails.
- A UI toggle lets the user turn optimization on and off.

### Phase 6: Code generation (targets)

- Truth table: all 2^n rows, inputs in declaration order, MSB first, 0 first; columns for every output (and optionally every wire). Highlight output=1 rows. Also show the canonical Sum-of-Products and Product-of-Sums forms (minterm/maxterm list, such as Σm(1,3,5)).
- Circuit diagram: SVG with standard gate symbols (AND, OR, NOT, XOR, NAND, NOR, XNOR, with inversion bubbles), input labels on the left, output labels on the right, orthogonal wires, no overlapping gates, and a layered left-to-right layout based on logic depth. Wires connecting the same net share the same color.
- Optional extra target: Verilog export (module with assign statements), with a copy button.
- Simulator: a toggle switch for each input, wires and gate outputs animate (green = 1, grey = 0), and the matching truth table row is highlighted live.

## 5. Error handling contract

- All phases return a unified Diagnostic: {phase, severity(error|warning|info), code (LEX001, SYN004, SEM007, ...), message, line, column, length, hint}.
- Every error message must be human-friendly and include a suggested fix, for example: "SEM003 line 5: output 'y' is already assigned on line 3. An output can have only one driver."
- If a phase fails, subsequent phases are marked "Skipped (blocked by errors in Phase X)" in the UI, but earlier phases still show their results. Syntax errors must still show the tokens and any partial parse tree.
- The compiler must never crash or hang on any input (empty input, whitespace only, 10,000 characters, deeply nested parentheses, binary garbage). Add recursion depth and size limits with a clear error.

## 6. Interactive UI requirements (this is a graded item, so make it excellent)

- Layout: the left side has a code editor with line numbers, syntax highlighting, and error underlines with hover messages. The right side has a horizontal "Pipeline Bar" with the phases as clickable stages: Lexer → Parser → Semantic → IR → Optimizer → Codegen. Each stage shows a status badge (✓ success, ⚠ warnings, ✗ errors, ⏸ skipped) and its error count. Clicking a stage shows its panel below.
- Live compilation on every keystroke (debounced about 250 ms) plus a "Compile" button.
- Panels:
  - Tokens: a table with colored type chips. Hovering or clicking a token highlights it in the editor and vice versa.
  - Parse Tree and AST: interactive SVG or collapsible trees, with a toggle between them. Clicking a node highlights its source span.
  - Symbol Table: a sortable table plus the dependency graph.
  - IR: the TAC table plus the Netlist. Clicking a TAC row highlights the gate in the circuit.
  - Optimizer: the list of applied rules with before/after circuits side by side and the gate-count delta.
  - Output: tabs for Truth Table, Circuit, Simulator, Verilog.
  - Diagnostics: a bottom panel listing all errors and warnings from all phases; clicking an item jumps to the line.
- "Step-through mode": a stepper that reveals the lexer tokens one at a time, and builds the parse tree node by node, so a professor can watch the compiler think. Include play/pause/step/speed controls.
- A Samples dropdown with at least 12 programs: half&full adder, 2:1 mux, 4:1 mux, XOR from NAND gates, 3-input majority, 2-bit comparator, parity generator, 7-segment decoder bit, SR-style cascade, the PDF example `out = (a AND b) OR NOT c`, and at least 6 deliberately BROKEN programs, one for each error category (lexical, syntax, undefined signal, double assignment, cycle, never assigned).
- Extras: dark/light mode, a share link (source encoded in the URL hash), and export buttons (JSON dump of all phase outputs, SVG/PNG of the circuit, CSV of the truth table, Verilog). The UI must be responsive and polished, with clean typography and an intentional design (no default-looking template). Include a short in-app "How it works" help drawer.

## 7. AI Product Engineering Track requirements

The track requires systematic use of Generative AI. Do both of the following:

1. Process evidence: maintain `docs/AI_USAGE_LOG.md` throughout the build. For each milestone record the prompt or task given, what the AI agent generated, what was manually verified or corrected, and the tests that prove it. Also include `docs/PROMPTS.md`, which contains this master prompt and the key follow-up prompts.
2. In-product AI features (optional but valuable; the compiler itself must stay 100% deterministic and fully functional with these switched off):
   - "Explain this error": sends a diagnostic plus the source to the Claude API (claude-sonnet-4-5 or the latest Sonnet model string) and displays a plain-English explanation and fix.
   - "English → LogicHDL": the user types "output is 1 when at least two of a, b, c are 1", the model returns a program, and that program is always passed through the real compiler for validation before being shown. If it fails to compile, auto-retry once with the error fed back.
   - Read the API key from an env variable `VITE_ANTHROPIC_API_KEY` or a user-entered key stored in memory only. Never commit keys. When no key is present, hide or disable these features gracefully and note in the README that a production deployment would proxy the call server-side.

## 8. Testing requirements

Use Vitest. Minimum 60 test cases, organized as:

- Lexer: every token type, every lexical error, line/column accuracy, comments.
- Parser: precedence and associativity (`a OR b AND c`, `NOT NOT a`, `a NAND b NAND c`), every syntax error, multi-error recovery, AST shape snapshots.
- Semantic: every error and warning in Section 4, with exact codes and locations.
- IR: TAC correctness for at least 8 programs, topological order.
- Optimizer: each rule, plus a property-style test that for 200 randomly generated expressions the optimized circuit is equivalent to the original on all inputs.
- Codegen: truth tables for all 12 samples checked against known-correct outputs (hand-verify a half adder, full adder, mux).
- Robustness/fuzz: random garbage strings and extreme sizes never throw an uncaught exception.

Run the full test suite and the production build (`npm run build`) before declaring each milestone done.

## 9. Documentation deliverables

- README.md: what it is, screenshots (generate or describe placement), quick start (`npm install`, `npm run dev`, `npm test`, `npm run build`), language reference with examples, architecture diagram, and a table "Rubric criterion → where it is demonstrated".
- docs/GRAMMAR.md: the formal grammar, token definitions, precedence table.
- docs/ARCHITECTURE.md: the phase pipeline, data structures (Token, AST nodes, SymbolTable, TAC, Netlist, Diagnostic), and the layered circuit-layout algorithm.
- docs/TEST_REPORT.md: a summary of the test results and edge cases covered.
- docs/AI_USAGE_LOG.md and docs/PROMPTS.md (Section 7).
- docs/DEMO_SCRIPT.md: a 5-minute scripted live demo for my viva (which sample to load, which error to introduce, what to point out in each phase).

## 10. Milestones (commit after each)

1. Project scaffold, folder structure, shared types (Token, AST, Diagnostic), test setup.
2. Lexer + tests.
3. Parser (parse tree + AST + error recovery) + tests.
4. Semantic analyzer + symbol table + cycle detection + tests.
5. IR generator (TAC + netlist) + evaluator/simulator + tests.
6. Optimizer + equivalence checker + tests.
7. Code generators: truth table, SOP/POS, Verilog, circuit layout and SVG renderer.
8. Full UI shell: editor, pipeline bar, all panels, diagnostics, samples.
9. Interactivity: cross-highlighting, step-through mode, simulator, exports, share link, dark mode.
10. Optional AI features (Section 7), robustness/fuzz pass, performance check (a 10-input program compiles in under 300 ms).
11. Documentation, demo script, final polish, final full test + build run.

## 11. Definition of done (verify and report against this at the end)

- [ ] `npm install && npm run dev` works from a clean clone; `npm test` and `npm run build` pass.
- [ ] The PDF example `input a,b,c; output out; out = (a AND b) OR NOT c;` yields the correct truth table (out = 1 for rows 000, 001?, ... verify by hand), the correct TAC, and a correct circuit.
- [ ] Every error category in Sections 4 and 5 is reproducible via a sample program and shows a clear message with line/column.
- [ ] All six phases display real data in the UI, with cross-highlighting working.
- [ ] No crash on any input in the fuzz test.
- [ ] Optimizer equivalence check passes on all samples.
- [ ] All documentation files in Section 9 exist and are accurate.

At the end, give me a final report: what was built, how to run it, test counts, known limitations, and a list of any decisions you made on my behalf.

analyse this and then ask me if you have any questions or doubts and you have majority of my permissions to complete this project you don't have to ask me every time for some review of this project, just give me an end to end project on this

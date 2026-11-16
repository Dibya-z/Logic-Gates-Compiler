# Verification report

Verified on 2026-11-16 using Node.js 24.22.3 on macOS arm64. Review and testing were performed by AI agents and automated tools. These results do not claim independent human verification.

## Results

| Check | Result |
| --- | --- |
| Vitest | **273 passed, 0 failed, 11 files** |
| TypeScript and Vite production build | Passed; separate application, React and editor bundles |
| Running development app | HTTP 200; document and actual React workbench verified |
| Real Chrome interactions | **17 checks passed**, zero browser console/page errors |
| Working/broken programs in Chrome | All **12 working + 21 broken** samples |
| Responsive layouts | 1440, 1024, 768 and 390 pixels; circuits visible, no document overflow |
| Seeded expression equivalence | **200 expressions**, every input combination |
| Seeded garbage robustness | **600 programs**, no uncaught exception |
| Ten-input full compilation | **16.89 ms worst**, 9.41 ms warm median; budget 300 ms |
| Package installation audit | 0 reported vulnerabilities after updating Vitest to 4.1.12 |
| Live paid Anthropic request | Not run; no API key supplied |

Machine-readable evidence is in [VERIFICATION.json](VERIFICATION.json) and [BENCHMARK.json](BENCHMARK.json). Times are measurements on this machine, not guarantees for other hardware.

## Test inventory

| File | Cases | Main coverage |
| --- | ---: | --- |
| `compiler/types.test.ts` | 2 | One-based locations and bounded exhaustive evaluation |
| `compiler/lexer.test.ts` | 24 | Every token family, aliases, comments, illegal characters, malformed numbers, digit-leading names, unclosed comments, CRLF locations and limits |
| `compiler/parser.test.ts` | 30 | Precedence, associativity, AST snapshot, grammar tree, every syntax error, partial results, multi-error recovery and depth limits |
| `compiler/semantic.test.ts` | 28 | Every semantic code and warning, source locations, related drivers, reserved names, undefined/undriven signals, forward declarations, cycles and input limit |
| `compiler/ir.test.ts` | 12 | Eight exact TAC programs, dependency order, all gate forms and collision-free temporary names |
| `compiler/evaluator.test.ts` | 15 | All Boolean operations, copy scheduling, prototype-safe names, equivalence and mismatch counterexamples |
| `compiler/optimizer.test.ts` | 35 | Each rewrite, CSE, DCE, metrics, source logs and 200 seeded exhaustive expression checks |
| `compiler/codegen.test.ts` | 38 | All twelve sample reference equations, SOP/POS, CSV, constants, renamed Verilog identifiers, SVG symbols and nonoverlapping orthogonal layout |
| `compiler/pipeline.test.ts` | 55 | Every sample, correct blocking phase, all-sample equivalence, hand-checked reference output, limits, 600 fuzz strings, prototype names and performance |
| `lib.test.ts` | 16 | Share-link encoding, Unicode round trips and malformed hashes |
| `ai/client.test.ts` | 18 | External HTTP boundary, real compiler validation, exactly one retry, invalid-source rejection, cancellation, timeout, response errors and optional workspace headers |
| **Total** | **273** | All tests pass |

The expression and garbage loops are checks inside test cases; they are not inflated into the case count. AI tests simulate only the external HTTP response. They run the actual deterministic compiler on generated source.

## Reference results independently checked

For `input a,b,c; output out; out=(a AND b) OR NOT c;`, rows `000` through `111` give **1,0,1,0,1,0,1,1**. In particular, `001` gives 0. The canonical lists are `Σm(0,2,4,6,7)` and `ΠM(1,3,5)`. TAC is `t1=AND a,b`, `t2=NOT c`, `out=OR t1,t2`; the diagram has three gates and depth two.

The half-adder reference checks `sum = (a+b) % 2`, `carry = floor((a+b)/2)`. The full adder uses the same arithmetic with carry-in. The mux references select the indicated data input using the select bits. Separate arithmetic/reference equations cover all other working samples, including the comparator and BCD segment. These reference functions are independent of the compiler evaluator.

## Browser evidence

`npm run test:browser` exercises actual CodeMirror editing and browser-generated downloads. It verifies:

1. Reference circuit and all eight truth-table outputs.
2. Keyboard token selection and editor-to-token highlighting.
3. Concrete tree and AST switching with source selection.
4. Sortable symbols and the real dependency graph.
5. TAC-to-gate and keyboard gate highlighting.
6. Real optimization logs and paired circuits.
7. Simulator switches, live outputs and matching truth rows.
8. Verilog text and clipboard contents.
9. Token/node teaching play, pause and step controls.
10. All 33 working and broken programs without a browser exception.
11. Diagnostic-specific AI entry, disabled no-key actions and key clearing.
12. Actual SVG, PNG, CSV, JSON, Verilog and LogicHDL downloads.
13. Share-hash reload.
14. Light/dark themes and keyboard-dismissed help.
15. Legal prototype-like signal names in the simulator.
16. Circuit visibility and document overflow at all four widths.

Some numbered items contain multiple assertions; the runner groups them into 17 named checks. Screenshots are in [screenshots/](screenshots/). Observed defects corrected during review included an export-menu stacking conflict, a token-end selection boundary, inherited-property reads in simulator inputs, keyboard activation gaps and unnecessarily clipped tablet circuits.

The presentation-site design checker did **not** pass: `GATE: OPEN 19 (rounds used up)`, with a partial runtime-evaluation failure. Its full findings and scope explanation are preserved in [DESIGN_REVIEW.md](DESIGN_REVIEW.md). Marketing hero/CTA/section rules were not applied to the explicitly requested compiler workbench. This result is separate from the passing functional browser suite.

## Reproduce

```sh
npm install
npm run check:milestone
npm run benchmark
```

For browser testing, start `npm run dev` in one terminal, then run `npm run test:browser` in another. The runner prefers installed Chrome on macOS. Otherwise run `npx playwright install chromium` first, or provide `LOGI_CHROME_PATH`. `LOGI_URL` can select another local port or a served production build. The runner writes fresh screenshots.

`LOGI_TEST_REPORT=/tmp/logi-tests.json npm run check:milestone` records the raw Vitest JSON while running the complete tests/build/server checkpoint. The compiler benchmark bundles pure TypeScript first, then measures all compiler phases and every target; module loading and React rendering are excluded.

## Clean committed-source verification

The final committed tree was exported with `git archive` into a fresh directory containing no `node_modules`, `dist`, `.env`, local Git state or editor setup. `npm ci --offline --no-audit` installed the lockfile from the package cache; then `npm run check:milestone` passed **273 tests**, built production assets and served the development document with HTTP 200. This verifies that local untracked files or prior build output are not required. The only subsequent changes record this result in documentation.

## Definition of done

- [x] Dependency installation, tests, production build and a running development app verified.
- [x] Reference truth table, TAC and circuit agree with the independent calculation.
- [x] Every requested lexical, syntax and semantic error category has a reproducible sample and located fix hint.
- [x] All six phase panels display actual data with source/gate cross-highlighting.
- [x] No uncaught exception in the fuzz and extreme-input checks.
- [x] Optimization equivalence passes on every working sample.
- [x] All requested documentation, prompts, AI evidence, screenshots and demo script exist.

## Practical limits

This is a bounded, single-bit combinational HDL: 12 inputs, 10,000 source characters, 4,000 tokens, 256 top-level items, expression depth 96 and 1,024 gates. Feedback/state, buses, timing simulation and globally minimal synthesis are outside its language. Long circuits can require zooming/scrolling; orthogonal wires may cross. PNG is capped at 4,096 pixels on its longest dimension.

Optional AI requests depend on an authorized provider account, available model and browser access policy. A production service should proxy requests and keep keys server-side. No live provider-response quality claim is made. No backend or provider account is needed for compilation, optimization, visualization, simulation or export.

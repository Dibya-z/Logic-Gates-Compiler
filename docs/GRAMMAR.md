# LogicHDL grammar and diagnostics

LogicHDL describes finite, single-bit, combinational logic. Source is plain text; no JavaScript is executed from a program. An empty program is syntactically valid but fails semantic analysis because it declares no output.

## Lexical rules

| Token class | Definition | Token type |
| --- | --- | --- |
| Declaration words | `input`, `output`, `wire`, ignoring case | `KEYWORD_INPUT`, `KEYWORD_OUTPUT`, `KEYWORD_WIRE` |
| Operator words | `AND`, `NAND`, `XOR`, `XNOR`, `OR`, `NOR`, `NOT`, ignoring case | Uppercase operator name |
| Operator aliases | `&`, `\|`, `^`, `!`, `~` | `AND`, `OR`, `XOR`, `NOT`, `NOT` |
| Identifier | `[A-Za-z_][A-Za-z0-9_]*`, excluding reserved words | `IDENT` |
| Single-bit literal | Exactly `0` or `1` | `NUMBER` |
| Punctuation | `(`, `)`, `,`, `;`, `=` | `LPAREN`, `RPAREN`, `COMMA`, `SEMICOLON`, `ASSIGN` |
| End of source | Inserted by scanner | `EOF` |

Keywords are case-insensitive; identifiers are case-sensitive. `INPUT a; output A; A = NOT a;` declares two distinct signals. A keyword cannot be reused as an identifier in any case. The parser retains reserved words in declaration/target positions where possible so semantic analysis can return a precise reserved-name diagnostic.

Whitespace is ignored. `//` and `#` start comments ending at the next line break. `/* ... */` comments span lines and do not nest. Comments produce no tokens. LF, CRLF and bare CR each advance one source line. Locations use zero-based character offsets, one-based lines/columns and character lengths; EOF has zero token length. Diagnostic lengths are at least one so the editor can display them.

Numbers are scanned as complete alphanumeric words before validation. `2`, `10` and `0x1` are malformed literals; `3abc` is a digit-leading identifier. Only ASCII letters and underscore may start identifiers. Illegal characters are diagnosed and skipped, allowing additional lexical errors to be reported during the same scan.

## Formal EBNF

Quoted alphabetic terminals are matched case-insensitively. Braces mean repetition, `|` means alternatives, and `EOF` is the terminal inserted by the scanner.

```ebnf
program     = { declaration | statement }, EOF ;

declaration = ( "input" | "output" | "wire" ),
              IDENT, { ",", IDENT }, ";" ;

statement   = IDENT, "=", expr, ";" ;
expr        = orExpr ;
orExpr      = xorExpr, { ( "OR" | "NOR" | "|" ), xorExpr } ;
xorExpr     = andExpr, { ( "XOR" | "XNOR" | "^" ), andExpr } ;
andExpr     = unary, { ( "AND" | "NAND" | "&" ), unary } ;
unary       = ( "NOT" | "!" | "~" ), unary | primary ;
primary     = IDENT | "0" | "1" | "(", expr, ")" ;
```

## Precedence and associativity

| Priority | Operators | Associativity | Example |
| --- | --- | --- | --- |
| 4, highest | `NOT`, `!`, `~` | Prefix/right-recursive | `NOT NOT a` = `NOT (NOT a)` |
| 3 | `AND`, `NAND`, `&` | Left | `a NAND b NAND c` = `(a NAND b) NAND c` |
| 2 | `XOR`, `XNOR`, `^` | Left | `a XOR b XNOR c` = `(a XOR b) XNOR c` |
| 1 | `OR`, `NOR`, `\|` | Left | `a NOR b OR c` = `(a NOR b) OR c` |

`a OR b AND c` parses as `a OR (b AND c)`. Parentheses change grouping. NAND, NOR and XNOR are commutative for two operands, but NAND and NOR are not associative; the compiler never changes their grouping merely to normalize an expression.

## Boolean semantics

| a | b | AND | NAND | XOR | XNOR | OR | NOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0 | 0 | 1 | 0 | 1 | 0 | 1 |
| 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 |
| 1 | 0 | 0 | 1 | 1 | 0 | 1 | 0 |
| 1 | 1 | 1 | 0 | 0 | 1 | 1 | 0 |

`NOT 0 = 1`; `NOT 1 = 0`. Inputs represent externally driven nets. Outputs and wires each require exactly one driver. A wire/output may depend on another output. References and declarations may appear in any source order, provided the final signal graph is acyclic.

```text
// The source order is deliberately opposite the dependency order.
output y;
y = inverted AND a;
wire inverted;
inverted = NOT b;
input a, b;
```

The dependency graph contains `b → inverted → y` and `a → y`. The compiler emits the `inverted` driver before `y`.

All declared wires must be assigned, including unused wires. Unused inputs and assigned unused wires produce warnings. At least one output must be declared. A program with no inputs is allowed when it drives a constant output and has a one-row truth table.

## Recovery and phase blocking

The scanner continues past illegal characters and invalid number/name words. Unterminated block comments consume through end of source. The parser retains both completed AST items and a partial concrete grammar tree. On a syntax failure, it consumes through the next semicolon, then attempts the next top-level item. Messages state the expected item and found token and include a suggested fix.

The public `compile()` pipeline stops after the first phase containing errors. Later phases say which phase blocked them. Warnings do not block compilation. Consequently a lexical failure still exposes tokens; a syntax failure exposes tokens and its partial tree; semantic failures expose the symbol table and dependency graph.

## Diagnostic catalog

Every diagnostic has phase, severity, code, message, offset, line, column, length and hint. Duplicate declarations/drivers additionally include the earlier related source location. Codes below correspond to implemented diagnostics; syntax messages adapt their expected/found text to the actual location.

| Code | Severity | Meaning and fix |
| --- | --- | --- |
| `LEX001` | Error | Illegal character. Remove it or use a supported operator. |
| `LEX002` | Error | Malformed number. Use a single-bit `0` or `1`. |
| `LEX003` | Error | Identifier begins with a digit. Begin with a letter or underscore. |
| `LEX004` | Error | Unterminated block comment. Add `*/`. |
| `LEX005` | Error | Source exceeds 10,000 characters. Reduce the circuit size. |
| `LEX006` | Error | Token count exceeds 4,000. Reduce or reuse expressions. |
| `SYN001` | Error | Missing semicolon after a declaration or assignment. Add `;`. |
| `SYN002` | Error | Missing or extra closing parenthesis. Balance the grouping. |
| `SYN003` | Error | Missing operand. Supply a signal, literal, NOT expression, or group. |
| `SYN004` | Error | Missing assignment sign after a target. Add `=`. |
| `SYN005` | Error | Empty parentheses. Add an expression inside the group. |
| `SYN006` | Error | Stray top-level token. Start a declaration or assignment. |
| `SYN007` | Error | Declaration without names. Add one or more signal names. |
| `SYN008` | Error | Unexpected end of program inside an expression or expected item. Complete it. |
| `SYN009` | Error | Expected a signal name. Use a valid identifier, including after commas. |
| `SYN010` | Error | An operator appeared where an operand was required. Remove it or add the operand. |
| `SYN011` | Error | More than 256 top-level declarations/assignments. Reduce the program. |
| `SYN012` | Error | Expression structure or nested parsing exceeds depth 96. Introduce intermediate wires. |
| `SEM001` | Error | Use or assignment target was not declared. Declare the input, wire or output. |
| `SEM002` | Error | Duplicate declaration. Keep one declaration; both locations are reported. |
| `SEM003` | Error | Multiple assignments to the same signal. Keep one driver; both locations are reported. |
| `SEM004` | Error | Assignment to an input. Use an output or wire for internally driven logic. |
| `SEM005` | Error | Reserved keyword used as a signal name. Rename it. |
| `SEM006` | Error | Output or wire is declared but never assigned. Add exactly one driver. |
| `SEM007` | Error | Combinational dependency cycle. Break the displayed feedback path. |
| `SEM008` | Error | More than twelve inputs. Split the circuit or reduce its inputs. |
| `SEM009` | Error | No output is declared. Add and drive an output. |
| `SEM101` | Warning | Input is unused. Connect it or remove it. |
| `SEM102` | Warning | Wire is unused. Connect it or remove it. |
| `SEM103` | Warning | An output is driven by a provable constant. Confirm this is intended. |
| `SEM104` | Warning | Nonliteral expression is provably always 1, a tautology. Check redundant/complementary terms. |
| `SEM105` | Warning | Nonliteral expression is provably always 0, a contradiction. Check redundant/complementary terms. |
| `IR001` | Error | IR construction failed, including the 1,024-gate bound. Reduce the circuit. |
| `OPT001` | Error | Optimization failure or detected nonequivalence. Inspect the counterexample or disable optimization. |

The defensive pipeline boundary also converts unexpected phase exceptions into diagnostics rather than throwing to the UI (`LEX001`, `PAR001`, `SEM001`, `IR001`, `OPT001` or `COD001`, by phase). An ordinary valid input does not depend on this boundary for error handling; expected lexical, syntax and semantic errors use the specific codes above.

## Size limits

Limits are shared by the UI and compiler through `LIMITS` in `src/compiler/types.ts`. They bound source length (10,000), tokens (4,000), top-level items (256), recursive/AST depth (96), inputs (12) and gates (1,024). The input cap bounds exhaustive evaluation to `2^12 = 4096` rows. These bounds also apply when calling the compiler outside the browser.

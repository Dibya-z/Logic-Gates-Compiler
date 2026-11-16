import { lex } from './lexer';
import { parse } from './parser';
import { analyze } from './semantic';
import { generateIR } from './ir';
import { optimize } from './optimizer';
import { generateCode } from './codegen';
import { DEFAULT_SPAN, type CompilationResult, type Diagnostic, type Phase, type StageResult } from './types';

export * from './types';
export { lex, parse, analyze, generateIR, optimize, generateCode };
export { evaluateNetlist, verifyEquivalence } from './evaluator';
export { layoutCircuit, renderCircuitSVG } from './layout';
export { generateTruthTable, generateVerilog, truthTableCSV } from './codegen';

const PHASES: Phase[] = ['lexer', 'parser', 'semantic', 'ir', 'optimizer', 'codegen'];
const now = () => performance.now();

/** A bounded, deterministic compilation pipeline. Errors retain all earlier phase artifacts. */
export function compile(source: string, options: { optimize?: boolean } = {}): CompilationResult {
  const start = now();
  const result: CompilationResult = { source, tokens: [], diagnostics: [], stages: [], durationMs: 0, optimized: options.optimize !== false };
  let blockedBy: Phase | undefined;
  for (const phase of PHASES) {
    if (blockedBy) {
      result.stages.push({ phase, status: 'skipped', errorCount: 0, blockedBy, durationMs: 0 });
      continue;
    }
    const phaseStart = now();
    const diagnostics: Diagnostic[] = [];
    let disabled = false;
    try {
      switch (phase) {
        case 'lexer': {
          const lexical = lex(source); result.tokens = lexical.tokens; diagnostics.push(...lexical.diagnostics); break;
        }
        case 'parser': {
          const syntax = parse(result.tokens); result.ast = syntax.ast; result.parseTree = syntax.parseTree;
          diagnostics.push(...syntax.diagnostics); break;
        }
        case 'semantic': {
          result.semantic = analyze(result.ast!); diagnostics.push(...result.semantic.diagnostics); break;
        }
        case 'ir': result.ir = generateIR(result.ast!, result.semantic!); break;
        case 'optimizer': {
          if (!result.optimized) { disabled = true; break; }
          result.optimizer = optimize(result.ast!, result.semantic!, result.ir!);
          if (!result.optimizer.equivalence.verified) diagnostics.push({ ...DEFAULT_SPAN, phase, severity: 'error', code: 'OPT001',
            message: 'Optimization changed the circuit’s output. Target generation has been stopped.',
            hint: `Turn optimization off to use the original circuit. Counterexample: ${JSON.stringify(result.optimizer.equivalence.counterexample)}.` });
          break;
        }
        case 'codegen': result.codegen = generateCode(result.optimizer?.ir ?? result.ir!); break;
      }
    } catch (error) {
      diagnostics.push({ ...DEFAULT_SPAN, phase, severity: 'error', code: `${phase === 'ir' ? 'IR' : phase.slice(0, 3).toUpperCase()}001`,
        message: error instanceof Error ? error.message : 'This program could not be compiled.',
        hint: 'Reduce the circuit size or nesting and compile again. All earlier phase results remain available.' });
    }
    result.diagnostics.push(...diagnostics);
    const errorCount = diagnostics.filter(d => d.severity === 'error').length;
    const stage: StageResult = { phase, status: errorCount ? 'error' : disabled ? 'disabled' : diagnostics.some(d => d.severity === 'warning') ? 'warning' : 'success', errorCount, durationMs: now() - phaseStart };
    result.stages.push(stage);
    if (errorCount) blockedBy = phase;
  }
  result.durationMs = now() - start;
  return result;
}

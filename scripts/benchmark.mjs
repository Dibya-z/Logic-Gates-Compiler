import { build } from "vite";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

const bundled = await build({
  configFile: false,
  logLevel: "silent",
  build: {
    write: false,
    minify: false,
    lib: {
      entry: resolve("src/compiler/index.ts"),
      formats: ["es"],
      fileName: "compiler",
    },
  },
});
const output = Array.isArray(bundled) ? bundled[0] : bundled;
const entry = output.output.find(
  (item) => item.type === "chunk" && item.isEntry,
);
const { compile } = await import(
  "data:text/javascript;base64," + Buffer.from(entry.code).toString("base64")
);
{
  const names = Array.from({ length: 10 }, (_, index) => `a${index}`);
  const source = `input ${names.join(",")}; output parity,all_high; parity=${names.join(" XOR ")}; all_high=${names.join(" AND ")};`;
  const measurements = [];
  for (let run = 0; run < 11; run++) {
    const start = performance.now();
    const result = compile(source);
    const elapsed = performance.now() - start;
    if (!result.codegen || !result.optimizer?.equivalence.verified)
      throw new Error("Benchmark circuit did not compile and verify.");
    measurements.push(elapsed);
  }
  const sorted = measurements.slice(1).sort((a, b) => a - b);
  const report = {
    inputs: 10,
    outputs: 2,
    rows: 1024,
    originalGates: 18,
    includes: [
      "lexing",
      "parsing",
      "semantics",
      "IR",
      "optimization",
      "exhaustive equivalence",
      "truth table",
      "canonical forms",
      "Verilog",
      "layout",
      "SVG",
    ],
    excludes: ["loading TypeScript modules", "React rendering"],
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    coldMs: Number(measurements[0].toFixed(2)),
    warmMedianMs: Number(((sorted[4] + sorted[5]) / 2).toFixed(2)),
    worstMs: Number(Math.max(...measurements).toFixed(2)),
    limitMs: 300,
    passed: Math.max(...measurements) < 300,
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv[2] === "--output" && process.argv[3])
    await writeFile(process.argv[3], JSON.stringify(report, null, 2) + "\n");
  if (!report.passed) process.exitCode = 1;
}

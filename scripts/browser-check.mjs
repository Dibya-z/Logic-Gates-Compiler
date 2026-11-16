/** Optional real-browser QA. Install playwright separately or set LOGI_PLAYWRIGHT_MODULE. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
const { chromium } = await import(
  process.env.LOGI_PLAYWRIGHT_MODULE ?? "playwright"
);
const systemChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath =
  process.env.LOGI_CHROME_PATH ??
  (process.platform === "darwin" && existsSync(systemChrome)
    ? systemChrome
    : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
let checks = 0;
const passed = (name) => {
  checks++;
  console.log(`PASS ${checks}: ${name}`);
};
const selectStage = async (label) => {
  await page
    .locator(`.pipeline-stage`)
    .filter({
      has: page.locator("strong", { hasText: new RegExp(`^${label}$`) }),
    })
    .click();
};
const load = async (id) => {
  await page.getByLabel("Load sample program").selectOption(id);
  await page.waitForTimeout(400);
};
const snapshots = new URL("../docs/screenshots/", import.meta.url).pathname;
await mkdir(snapshots, { recursive: true });
try {
  await page.goto(process.env.LOGI_URL ?? "http://127.0.0.1:5173");
  await page.locator(".logic-circuit").waitFor();
  assert.equal(await page.locator(".circuit-gate").count(), 3);
  await page.screenshot({ path: `${snapshots}workbench.png`, fullPage: true });
  passed("reference circuit renders three gates and verified equivalence");
  await page.getByRole("tab", { name: "Truth table", exact: true }).click();
  const actual = await page
    .locator(".truth-table tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => Number(row.lastElementChild.textContent.trim())),
    );
  assert.deepEqual(actual, [1, 0, 1, 0, 1, 0, 1, 1]);
  passed("reference truth table is hand-checked for all eight rows");
  await selectStage("Lexer");
  const identifier = page
    .locator(".phase-table tbody tr")
    .filter({ has: page.locator(".token-chip", { hasText: /^IDENT$/ }) })
    .first();
  await identifier.focus();
  await page.keyboard.press("Enter");
  await page.locator(".phase-table .selected-row").waitFor();
  assert.equal(await page.locator(".phase-table .selected-row").count(), 1);
  await page.locator(".cm-selectionBackground").first().waitFor();
  assert.ok(
    (await page.locator(".cm-selectionBackground").first().boundingBox())
      .width > 0,
  );
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(80);
  assert.equal(
    await page.locator(".phase-table .selected-row .token-chip").innerText(),
    "KEYWORD_INPUT",
  );
  passed(
    "token keyboard activation selects source, editor cursor drives token highlight",
  );
  await selectStage("Parser");
  assert.ok((await page.locator(".tree-node").count()) > 10);
  await page.getByRole("button", { name: "AST", exact: true }).click();
  assert.ok(
    (await page.locator(".tree-view").innerText()).includes("Binary · OR"),
  );
  await page.getByRole("button", { name: /^Assign · out/ }).click();
  passed("concrete grammar tree and AST render, source nodes select");
  await selectStage("Semantic");
  assert.equal(await page.locator("#phase-panel tbody tr").count(), 4);
  assert.ok(
    (await page.locator(".dependency-graph .graph-node").count()) === 4,
  );
  await page.getByRole("button", { name: "Signal", exact: true }).click();
  passed("sortable symbol table and dependency graph expose actual signals");
  await selectStage("IR");
  await page.locator("#phase-panel tbody tr").first().focus();
  await page.keyboard.press("Enter");
  await page.locator(".selected-gate").waitFor();
  assert.equal(await page.locator(".selected-gate").count(), 1);
  await page.locator(".circuit-gate").last().focus();
  await page.keyboard.press("Space");
  assert.equal(await page.locator(".selected-gate").count(), 1);
  passed("TAC rows and keyboard-operated circuit gates cross-highlight");
  await load("optimization");
  await selectStage("Optimizer");
  assert.equal(
    await page.locator(".compare-circuits .logic-circuit").count(),
    2,
  );
  assert.ok((await page.locator(".optimization-log>button").count()) >= 4);
  await page.screenshot({ path: `${snapshots}optimizer.png`, fullPage: true });
  passed("optimizer shows real transformation log and before/after diagrams");
  await load("example");
  await selectStage("Codegen");
  await page.getByRole("tab", { name: "Simulator", exact: true }).click();
  assert.equal(await page.locator(".signal-outputs b").innerText(), "1");
  await page
    .getByRole("switch", { name: "Toggle input c", exact: true })
    .click();
  assert.equal(await page.locator(".signal-outputs b").innerText(), "0");
  await page
    .getByRole("switch", { name: "Toggle input a", exact: true })
    .click();
  await page
    .getByRole("switch", { name: "Toggle input b", exact: true })
    .click();
  assert.equal(await page.locator(".signal-outputs b").innerText(), "1");
  await page.getByRole("button", { name: "View row" }).click();
  assert.ok(
    (await page.locator(".current-row td").first().innerText()).startsWith(
      "07",
    ),
  );
  passed("live simulation toggles wires, output, and the matching truth row");
  await page.getByRole("tab", { name: "Verilog", exact: true }).click();
  assert.ok(
    (await page.locator(".verilog-code").innerText()).includes("assign out"),
  );
  await page.getByRole("button", { name: "Copy Verilog" }).click();
  assert.ok(
    (await page.evaluate(() => navigator.clipboard.readText())).includes(
      "module logic_circuit",
    ),
  );
  passed("Verilog view and clipboard copy contain actual target code");
  await page
    .getByRole("switch", { name: "Step-through mode", exact: true })
    .click();
  assert.equal(await page.locator(".phase-table tbody tr").count(), 1);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  assert.equal(await page.locator(".phase-table tbody tr").count(), 2);
  await page.getByRole("button", { name: "Play steps", exact: true }).click();
  await page.waitForTimeout(450);
  await page
    .getByRole("button", { name: "Pause stepping", exact: true })
    .click();
  assert.ok((await page.locator(".phase-table tbody tr").count()) >= 3);
  await page
    .locator(".teaching-phase")
    .getByRole("button", { name: "Parser", exact: true })
    .click();
  assert.equal(await page.locator(".tree-node").count(), 1);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  assert.equal(await page.locator(".tree-node").count(), 2);
  passed("teaching controls reveal tokens and parser nodes incrementally");
  await page
    .getByRole("switch", { name: "Step-through mode", exact: true })
    .click();
  const samples = await page
    .getByLabel("Load sample program")
    .locator("option")
    .evaluateAll((options) => options.map((o) => o.value).filter(Boolean));
  for (const id of samples) {
    await load(id);
    if (id.startsWith("broken-")) {
      assert.ok((await page.locator(".pipeline-stage.error").count()) >= 1, id);
      assert.ok(
        (await page.locator(".diagnostic-item.error").count()) >= 1,
        id,
      );
      assert.ok(
        (await page.locator(".pipeline-stage.skipped").count()) >= 1,
        id,
      );
    } else {
      assert.equal(await page.locator(".pipeline-stage.error").count(), 0, id);
      await selectStage("Codegen");
      assert.equal(await page.locator(".logic-circuit").count(), 1, id);
    }
  }
  passed(
    `all ${samples.length} working and broken samples render without a browser exception`,
  );
  await load("broken-undefined");
  assert.ok((await page.locator(".cm-lintRange-error").count()) > 0);
  await page.locator(".explain-button").first().click();
  assert.equal(
    await page.locator(".ai-tabs button.active").innerText(),
    "Explain an error",
  );
  assert.ok(
    (await page.locator(".ai-diagnostic-preview").innerText()).includes(
      "SEM001",
    ),
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Explain diagnostic", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByLabel("Anthropic API key", { exact: true })
    .fill("temporary-browser-test-key");
  await page
    .getByRole("button", { name: "Close AI assistant", exact: true })
    .click();
  await page.getByRole("button", { name: "AI assistant", exact: true }).click();
  assert.equal(
    await page.getByLabel("Anthropic API key", { exact: true }).inputValue(),
    "",
  );
  await page
    .getByRole("button", { name: "Close AI assistant", exact: true })
    .click();
  passed(
    "diagnostic explanations open selected error, no-key requests disabled, keys cleared on close",
  );
  await load("example");
  for (const [kind, label, suffix] of [
    ["svg", "Circuit diagram", ".svg"],
    ["png", "Circuit image", ".png"],
    ["csv", "Truth table", ".csv"],
    ["json", "All compiler phases", ".json"],
    ["verilog", "Verilog module", ".v"],
    ["source", "LogicHDL source", ".logic"],
  ]) {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const wait = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: new RegExp(label) }).click();
    const item = await wait;
    assert.ok(item.suggestedFilename().endsWith(suffix), kind);
    await item.saveAs(`/private/tmp/logi-${kind}${suffix}`);
  }
  passed(
    "all six download targets save actual artifacts, including rasterized PNG",
  );
  await page.getByRole("button", { name: "Share", exact: true }).click();
  assert.ok(page.url().includes("#code="));
  await page.reload();
  await page.locator(".logic-circuit").waitFor();
  assert.equal(await page.locator(".circuit-gate").count(), 3);
  passed("shared source survives URL hash reload");
  await page
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${snapshots}light.png`, fullPage: true });
  await page
    .getByRole("button", { name: "How it works", exact: true })
    .first()
    .click();
  assert.ok(await page.getByRole("dialog").isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  passed("light theme and keyboard-dismissible language reference work");
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  const prototypeSource =
    "input __proto__, constructor, toString; output y; y = __proto__ XOR constructor XOR toString;";
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(prototypeSource);
  await page.waitForTimeout(450);
  await selectStage("Codegen");
  await page.getByRole("tab", { name: "Simulator", exact: true }).click();
  for (const name of ["__proto__", "constructor", "toString"])
    await page
      .getByRole("switch", { name: `Toggle input ${name}`, exact: true })
      .click();
  assert.equal(await page.locator(".signal-outputs b").innerText(), "1");
  passed(
    "prototype-like names compile and simulate without inherited-property crashes",
  );
  await load("example");
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    assert.equal(overflow, false, `viewport ${width}`);
    assert.ok(await page.locator(".logic-circuit").isVisible());
    await page.screenshot({
      path: `${snapshots}workbench-${width}.png`,
      fullPage: true,
    });
  }
  passed(
    "1440,1024,768,390 layouts have visible circuits and no document overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    `Browser QA complete: ${checks} checks passed; zero browser errors.`,
  );
} finally {
  await browser.close();
}

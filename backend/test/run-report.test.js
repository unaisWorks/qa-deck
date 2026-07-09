const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { exec } = require("node:child_process");

const { readRunReport, QA_DECK_REPORTER_SOURCE } = require("../server.js");

function makeReportDir(report, screenshots = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-deck-report-test-"));
  fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(report));
  for (const [name, bytes] of Object.entries(screenshots)) {
    fs.writeFileSync(path.join(dir, name), bytes);
  }
  return dir;
}

test("readRunReport returns null when no report exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-deck-report-test-"));
  assert.equal(readRunReport(dir), null);
});

test("readRunReport embeds failure screenshots as data URIs", () => {
  const dir = makeReportDir(
    {
      exitStatus: 1,
      summary: { passed: 1, failed: 1, error: 0, skipped: 0 },
      tests: [
        { nodeid: "tests/test_a.py::test_ok", outcome: "passed", duration: 0.5, message: null, screenshot: null },
        { nodeid: "tests/test_a.py::test_bad", outcome: "failed", duration: 1.2, message: "AssertionError", screenshot: "shot.png" },
      ],
    },
    { "shot.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]) }
  );

  const report = readRunReport(dir);
  assert.equal(report.exitStatus, 1);
  assert.equal(report.tests.length, 2);
  assert.equal(report.tests[0].screenshot, null);
  assert.ok(report.tests[1].screenshot.startsWith("data:image/png;base64,"));
});

test("readRunReport drops oversized or missing screenshots instead of failing", () => {
  const big = Buffer.alloc(2 * 1024 * 1024, 1);
  const dir = makeReportDir(
    {
      exitStatus: 1,
      summary: { passed: 0, failed: 2, error: 0, skipped: 0 },
      tests: [
        { nodeid: "t::big", outcome: "failed", duration: 1, message: "x", screenshot: "big.png" },
        { nodeid: "t::gone", outcome: "failed", duration: 1, message: "x", screenshot: "missing.png" },
      ],
    },
    { "big.png": big }
  );

  const report = readRunReport(dir);
  assert.equal(report.tests[0].screenshot, null);
  assert.equal(report.tests[1].screenshot, null);
});

test("readRunReport tolerates malformed report json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-deck-report-test-"));
  fs.writeFileSync(path.join(dir, "report.json"), "{not json");
  assert.equal(readRunReport(dir), null);
});

test("reporter plugin source is valid python and writes a report", async (t) => {
  const probe = await new Promise((resolve) => {
    exec("python3 -m pytest --version", (err) => resolve(!err));
  });
  if (!probe) {
    // Fall back to syntax-only validation when pytest is unavailable.
    const pyProbe = await new Promise((resolve) => {
      exec("python3 --version", (err) => resolve(!err));
    });
    if (!pyProbe) return t.skip("python3 not available");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-deck-plugin-test-"));
    fs.writeFileSync(path.join(dir, "qa_deck_reporter.py"), QA_DECK_REPORTER_SOURCE);
    const ok = await new Promise((resolve) => {
      exec(`python3 -c "import ast; ast.parse(open('qa_deck_reporter.py').read())"`, { cwd: dir }, (err) => resolve(!err));
    });
    assert.ok(ok, "plugin source must be valid python");
    return;
  }

  // Full behavioral check: run pytest with the plugin on a mixed pass/fail suite.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-deck-plugin-test-"));
  fs.writeFileSync(path.join(dir, "qa_deck_reporter.py"), QA_DECK_REPORTER_SOURCE);
  fs.writeFileSync(
    path.join(dir, "test_sample.py"),
    "def test_pass():\n    assert True\n\ndef test_fail():\n    assert False, 'expected failure'\n"
  );
  const reportDir = path.join(dir, ".qa-deck-report");

  await new Promise((resolve) => {
    exec("python3 -m pytest -p qa_deck_reporter -q", {
      cwd: dir,
      env: { ...process.env, QA_DECK_REPORT_DIR: reportDir },
    }, () => resolve());
  });

  const report = readRunReport(reportDir);
  assert.ok(report, "report.json must be written");
  assert.equal(report.summary.passed, 1);
  assert.equal(report.summary.failed, 1);
  const failed = report.tests.find((entry) => entry.outcome === "failed");
  assert.ok(failed.message.includes("expected failure"));
});

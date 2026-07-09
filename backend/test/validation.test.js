const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateSeleniumPythonBundleLayout,
  validatePythonSyntaxInWorkspace,
  validateGeneratedBundle,
  writeRuntimeWorkspace,
  cleanupWorkspace,
  serializeGeneratedScriptsToFiles,
  sanitizeAiJson,
} = require("../server.js");

const PAGE_BUNDLE = [
  { filename: "base_test.py", content: "class BaseTest:\n    pass\n" },
  { filename: "pytest.ini", content: "[pytest]\n" },
  { filename: "pages/login_page.py", content: "class LoginPage:\n    pass\n" },
  { filename: "tests/test_login.py", content: "def test_login():\n    assert True\n" },
];

test("page layout: complete bundle passes", () => {
  assert.deepEqual(validateSeleniumPythonBundleLayout(PAGE_BUNDLE, "page"), []);
});

test("page layout: missing pytest.ini is reported", () => {
  const files = PAGE_BUNDLE.filter((f) => f.filename !== "pytest.ini");
  const errors = validateSeleniumPythonBundleLayout(files, "page");
  assert.ok(errors.some((e) => e.includes("pytest.ini")), errors.join("; "));
});

test("page layout: missing page object and test file are both reported", () => {
  const files = PAGE_BUNDLE.filter((f) => !f.filename.startsWith("pages/") && !f.filename.startsWith("tests/"));
  const errors = validateSeleniumPythonBundleLayout(files, "page");
  assert.ok(errors.some((e) => e.includes("pages/")));
  assert.ok(errors.some((e) => e.includes("test file")));
});

test("project-bundle layout: requires conftest, tests/conftest, requirements and data files", () => {
  const errors = validateSeleniumPythonBundleLayout(PAGE_BUNDLE, "project-bundle");
  assert.ok(errors.some((e) => e.includes("conftest.py")));
  assert.ok(errors.some((e) => e.includes("requirements.txt")));
  assert.ok(errors.some((e) => e.includes("data/")));
});

const JOURNEY_BUNDLE = [
  { filename: "base_test.py", content: "class BaseTest:\n    pass\n" },
  { filename: "conftest.py", content: "import pytest\n" },
  { filename: "pytest.ini", content: "[pytest]\n" },
  { filename: "test_data.py", content: "DATA = {}\n" },
  { filename: "pages/login_page.py", content: "class LoginPage:\n    pass\n" },
  { filename: "tests/test_step_login.py", content: "def test_login():\n    assert True\n" },
];

test("journey layout: complete bundle passes", () => {
  assert.deepEqual(validateSeleniumPythonBundleLayout(JOURNEY_BUNDLE, "journey"), []);
});

test("journey layout: conftest.py is required", () => {
  const files = JOURNEY_BUNDLE.filter((f) => f.filename !== "conftest.py");
  const errors = validateSeleniumPythonBundleLayout(files, "journey");
  assert.ok(errors.some((e) => e.includes("conftest.py")), errors.join("; "));
});

test("journey layout: accepts step tests at the workspace root", () => {
  const files = JOURNEY_BUNDLE.map((f) =>
    f.filename === "tests/test_step_login.py" ? { ...f, filename: "test_step_login.py" } : f
  );
  assert.deepEqual(validateSeleniumPythonBundleLayout(files, "journey"), []);
});

test("journey layout: injected test_data.py does not satisfy the test-file requirement", () => {
  const files = JOURNEY_BUNDLE.filter((f) => f.filename !== "tests/test_step_login.py");
  const errors = validateSeleniumPythonBundleLayout(files, "journey");
  assert.ok(errors.some((e) => e.includes("journey/step test file")), errors.join("; "));
});

test("non-selenium frameworks skip bundle validation", async () => {
  const validation = await validateGeneratedBundle([], "playwright-typescript", "page");
  assert.equal(validation.status, "passed");
  assert.deepEqual(validation.errors, []);
});

test("layout failure short-circuits before any workspace run", async () => {
  const validation = await validateGeneratedBundle(
    [{ filename: "tests/test_only.py", content: "def test_a():\n    pass\n" }],
    "selenium-python",
    "page"
  );
  assert.equal(validation.status, "failed");
  assert.ok(validation.errors.length >= 2);
});

test("journey bundle passes full validation (or skips collection when pytest is absent)", async (t) => {
  const probe = await new Promise((resolve) => {
    const { exec } = require("node:child_process");
    exec("python3 --version", (err) => resolve(!err));
  });
  if (!probe) return t.skip("python3 not available");

  const validation = await validateGeneratedBundle(JOURNEY_BUNDLE, "selenium-python", "journey");
  assert.equal(validation.status, "passed", validation.errors.join("; "));
  assert.equal(validation.generationMode, "journey");
});

test("journey bundle with a python syntax error fails full validation", async (t) => {
  const probe = await new Promise((resolve) => {
    const { exec } = require("node:child_process");
    exec("python3 --version", (err) => resolve(!err));
  });
  if (!probe) return t.skip("python3 not available");

  const files = JOURNEY_BUNDLE.map((f) =>
    f.filename === "tests/test_step_login.py" ? { ...f, content: "def broken(:\n" } : f
  );
  const validation = await validateGeneratedBundle(files, "selenium-python", "journey");
  assert.equal(validation.status, "failed");
  assert.ok(validation.errors.some((e) => e.includes("Syntax validation failed")), validation.errors.join("; "));
});

test("python syntax validation flags broken files and accepts valid ones", async (t) => {
  const probe = await new Promise((resolve) => {
    const { exec } = require("node:child_process");
    exec("python3 --version", (err) => resolve(!err));
  });
  if (!probe) return t.skip("python3 not available");

  const tmpDir = await writeRuntimeWorkspace(
    [
      { filename: "good.py", content: "x = 1\n" },
      { filename: "bad.py", content: "def broken(:\n" },
    ],
    "selenium-python",
    { headless: true }
  );
  try {
    const errors = await validatePythonSyntaxInWorkspace(tmpDir);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes("bad.py"));
  } finally {
    cleanupWorkspace(tmpDir);
  }
});

test("serializeGeneratedScriptsToFiles keeps python bundle key order and drops empty entries", () => {
  const files = serializeGeneratedScriptsToFiles(
    {
      tests: { filename: "tests/test_x.py", content: "pass" },
      base: null,
      pageObject: { filename: "pages/x.py", content: "pass" },
      config: { filename: "pytest.ini", content: "[pytest]" },
    },
    "selenium-python"
  );
  assert.deepEqual(
    files.map((f) => f.key),
    ["config", "pageObject", "tests"]
  );
});

test("sanitizeAiJson strips markdown fences", () => {
  const raw = "```json\n{\"a\": 1}\n```";
  assert.deepEqual(JSON.parse(sanitizeAiJson(raw)), { a: 1 });
});

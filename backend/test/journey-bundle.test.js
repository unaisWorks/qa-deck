const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildJourneyGenerationSummary,
  buildJourneySharedFiles,
  normalizeJourneyScriptBundle,
  slimJourneySteps,
} = require("../server.js");

const JOURNEY = {
  name: "Checkout Flow",
  steps: [
    { id: "s1", order: 1, title: "Login", url: "https://shop.example.com/login", transitionStatus: "recorded" },
    { id: "s2", order: 2, title: "Cart", url: "https://shop.example.com/cart", transitionStatus: "recorded" },
  ],
};

const BROKEN_JOURNEY = {
  name: "Checkout Flow",
  steps: [
    { id: "s1", order: 1, title: "Login", url: "https://shop.example.com/login", transitionStatus: "recorded" },
    { id: "s2", order: 2, title: "Cart", url: "https://shop.example.com/cart", transitionStatus: "missing" },
  ],
};

function aiBundle() {
  return {
    files: [
      { filename: "pages/login_page.py", content: "class LoginPage:\n    pass\n", group: "page" },
      { filename: "tests/test_journey_checkout.py", content: "def test_journey():\n    pass\n", group: "journey" },
      { filename: "tests/test_step_login.py", content: "def test_login():\n    pass\n", group: "step", stepId: "s1" },
      { filename: "tests/test_step_login.py", content: "duplicate", group: "step", stepId: "s1" },
    ],
    summary: { notes: ["note"] },
  };
}

test("journey summary: recorded transitions make the journey executable", () => {
  const summary = buildJourneyGenerationSummary(JOURNEY);
  assert.equal(summary.journeyExecutable, true);
  assert.deepEqual(summary.missingTransitions, []);
  assert.equal(summary.totalSteps, 2);
});

test("journey summary: missing transition disables journey execution", () => {
  const summary = buildJourneyGenerationSummary(BROKEN_JOURNEY);
  assert.equal(summary.journeyExecutable, false);
  assert.equal(summary.missingTransitions.length, 1);
  assert.equal(summary.missingTransitions[0].stepId, "s2");
});

test("selenium journey shared files include the pytest runtime skeleton", () => {
  const names = buildJourneySharedFiles("selenium-python", JOURNEY, []).map((f) => f.filename);
  for (const required of ["base_test.py", "conftest.py", "pytest.ini", "test_data.py"]) {
    assert.ok(names.includes(required), `expected ${required} in ${names.join(", ")}`);
  }
});

test("normalize: injects shared files, dedupes, and sorts shared→page→journey→step", () => {
  const summary = buildJourneyGenerationSummary(JOURNEY);
  const bundle = normalizeJourneyScriptBundle(aiBundle(), "selenium-python", JOURNEY, [], summary);

  const filenames = bundle.files.map((f) => f.filename);
  assert.equal(new Set(filenames).size, filenames.length, "filenames must be unique");
  assert.ok(filenames.includes("base_test.py"));
  assert.ok(filenames.includes("conftest.py"));

  const groups = bundle.files.map((f) => f.group);
  const order = { shared: 0, page: 1, journey: 2, step: 3 };
  const ranks = groups.map((g) => order[g] ?? 9);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `groups not sorted: ${groups.join(",")}`);

  assert.equal(bundle.summary.journeyExecutable, true);
  assert.deepEqual(bundle.summary.notes, ["note"]);
});

test("normalize: drops journey-group files when transitions are missing", () => {
  const summary = buildJourneyGenerationSummary(BROKEN_JOURNEY);
  const bundle = normalizeJourneyScriptBundle(aiBundle(), "selenium-python", BROKEN_JOURNEY, [], summary);

  assert.ok(
    bundle.files.every((f) => f.group !== "journey"),
    "journey-group files must be filtered when the journey is not executable"
  );
  assert.ok(bundle.files.some((f) => f.group === "step"), "step files must be kept");
  assert.equal(bundle.summary.journeyExecutable, false);
});

test("slimJourneySteps forwards enabled assertions and drops disabled/blank ones", () => {
  const journey = {
    name: "Flow",
    steps: [
      {
        id: "s1",
        order: 1,
        title: "Login",
        url: "https://shop.example.com/login",
        path: "/login",
        transitionStatus: "recorded",
        assertions: [
          { id: "a1", type: "url-contains", value: "/login", label: "URL contains /login", enabled: true },
          { id: "a2", type: "element-visible", value: "#form", label: "Form visible", enabled: false },
          { id: "a3", type: "weird-type", value: "toast appears", enabled: true },
          { id: "a4", type: "custom", value: "   ", enabled: true },
        ],
      },
    ],
  };

  const [step] = slimJourneySteps(journey);
  assert.equal(step.assertions.length, 2);
  assert.deepEqual(step.assertions[0], { type: "url-contains", value: "/login", label: "URL contains /login" });
  assert.equal(step.assertions[1].type, "custom", "unknown types coerce to custom");
});

test("slimJourneySteps caps assertions at 8 and tolerates steps without any", () => {
  const journey = {
    name: "Flow",
    steps: [
      {
        id: "s1",
        assertions: Array.from({ length: 12 }, (_, i) => ({ type: "custom", value: `assert ${i}`, enabled: true })),
      },
      { id: "s2" },
    ],
  };

  const [first, second] = slimJourneySteps(journey);
  assert.equal(first.assertions.length, 8);
  assert.deepEqual(second.assertions, []);
});

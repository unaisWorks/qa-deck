const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { exec } = require("node:child_process");

// Point the store at a throwaway dir before requiring the server module.
const AUTH_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "qa-deck-auth-test-"));
process.env.QA_DECK_AUTH_DIR = AUTH_DIR;

const {
  saveAuthProfile,
  listAuthProfiles,
  readAuthState,
  deleteAuthProfile,
  summarizeAuthProfile,
  buildJourneySharedFiles,
  QA_DECK_AUTH_SOURCE,
} = require("../server.js");

const SAMPLE_STATE = {
  cookies: [
    { name: "session", value: "secret-token-123", domain: "app.example.com", path: "/", expires: 1893456000 },
    { name: "csrf", value: "abc", domain: "app.example.com", path: "/" },
  ],
  origins: [
    { origin: "https://app.example.com", localStorage: [{ name: "authToken", value: "jwt-secret" }] },
  ],
};

test("summarizeAuthProfile exposes counts but never secret values", () => {
  const meta = summarizeAuthProfile({
    id: "abc",
    name: "Prod login",
    origin: "https://app.example.com",
    createdAt: "2026-01-01T00:00:00Z",
    storageState: SAMPLE_STATE,
  });
  assert.equal(meta.cookieCount, 2);
  assert.equal(meta.originCount, 1);
  assert.equal(meta.localStorageKeys, 1);
  const serialized = JSON.stringify(meta);
  assert.ok(!serialized.includes("secret-token-123"));
  assert.ok(!serialized.includes("jwt-secret"));
  assert.ok(!("storageState" in meta));
});

test("saveAuthProfile persists state and listAuthProfiles returns only metadata", () => {
  const saved = saveAuthProfile({ name: "Login A", origin: "https://app.example.com", storageState: SAMPLE_STATE });
  assert.ok(saved.id);
  assert.equal(saved.cookieCount, 2);
  assert.ok(!("storageState" in saved));

  const list = listAuthProfiles();
  const found = list.find((p) => p.id === saved.id);
  assert.ok(found, "saved profile must appear in list");
  assert.ok(!JSON.stringify(list).includes("secret-token-123"), "list must not leak secrets");
});

test("readAuthState returns raw state for run injection, deleteAuthProfile removes it", () => {
  const saved = saveAuthProfile({ name: "Login B", origin: "https://app.example.com", storageState: SAMPLE_STATE });
  const state = readAuthState(saved.id);
  assert.equal(state.cookies[0].value, "secret-token-123");

  assert.equal(deleteAuthProfile(saved.id), true);
  assert.equal(readAuthState(saved.id), null);
  assert.equal(deleteAuthProfile(saved.id), false);
});

test("readAuthState rejects path-traversal / malformed ids", () => {
  assert.equal(readAuthState("../server"), null);
  assert.equal(readAuthState("../../etc/passwd"), null);
  assert.equal(readAuthState(""), null);
  assert.equal(readAuthState(null), null);
});

test("journey bundles ship the auth loader as a shared file", () => {
  const journey = { name: "Flow", steps: [{ id: "s1", order: 1, url: "https://app.example.com/login", transitionStatus: "recorded" }] };
  const names = buildJourneySharedFiles("selenium-python", journey, []).map((f) => f.filename);
  assert.ok(names.includes("qa_deck_auth.py"), names.join(", "));
});

test("auth loader source is valid python", async (t) => {
  const probe = await new Promise((resolve) => exec("python3 --version", (err) => resolve(!err)));
  if (!probe) return t.skip("python3 not available");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-deck-auth-py-"));
  fs.writeFileSync(path.join(dir, "qa_deck_auth.py"), QA_DECK_AUTH_SOURCE);
  const ok = await new Promise((resolve) => {
    exec(`python3 -c "import ast; ast.parse(open('qa_deck_auth.py').read())"`, { cwd: dir }, (err) => resolve(!err));
  });
  assert.ok(ok, "qa_deck_auth.py must be valid python");
});

test("auth loader is a safe no-op when auth_state.json is absent", async (t) => {
  const probe = await new Promise((resolve) => exec("python3 --version", (err) => resolve(!err)));
  if (!probe) return t.skip("python3 not available");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-deck-auth-noop-"));
  fs.writeFileSync(path.join(dir, "qa_deck_auth.py"), QA_DECK_AUTH_SOURCE);
  const out = await new Promise((resolve) => {
    exec(
      `python3 -c "import qa_deck_auth as a; print(a.has_saved_auth(), a.apply_saved_auth(None))"`,
      { cwd: dir },
      (err, stdout) => resolve((stdout || "").trim())
    );
  });
  assert.equal(out, "False False");
});

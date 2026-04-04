/**
 * QA Deck — Backend API Server
 * Pure Node.js, no external dependencies.
 * 
 * Endpoints:
 *   POST /api/generate-tests    → Claude generates test cases from page data
 *   POST /api/generate-script   → Claude generates automation scripts
 *   POST /api/save-project      → Save project to file system
 *   GET  /api/projects          → List saved projects
 *   GET  /api/health            → Health check
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const os = require("os");
const { RecorderSessionManager } = require("./recorder/recorder.js");
const { actionsToSteps, actionsToCode, actionsToJourneySegments } = require("./recorder/converter.js");
const { generateCICD } = require("./recorder/cicd.js");

const recorderManager = new RecorderSessionManager();

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3747;
const PROJECTS_DIR = path.join(__dirname, "projects");
const ALLOWED_ORIGINS = [
  "chrome-extension://",       // any chrome extension
  "http://localhost",
  "http://127.0.0.1",
  "https://qadeck.com",        // production website
  "https://www.qadeck.com",
  process.env.WEBSITE_ORIGIN,  // custom origin via env (e.g. Vercel preview URLs)
].filter(Boolean);

if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });


// Sanitize AI JSON output — strips markdown fences and escapes literal control
// characters that Claude sometimes emits inside string values (e.g. raw newlines
// in generated code blocks), which cause JSON.parse to throw "Bad control character".
function sanitizeAiJson(text) {
  const stripped = text.replace(/^```json\s*/m, "").replace(/\s*```$/m, "").trim();
  return stripped.replace(/"(?:[^"\\]|\\.)*"/gs, (match) =>
    match
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, (c) =>
        `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)
  );
}

const TESTCASE_PACK_ORDER = ["smoke", "regression", "e2e"];
const TESTCASE_CATEGORIES = new Set([
  "functional",
  "negative",
  "boundary",
  "navigation",
  "ui",
  "accessibility",
  "e2e",
  "performance",
  "security",
]);

function deriveLegacySuite(caseKind, packs) {
  if (packs.includes("smoke")) return "smoke";
  if (packs.includes("regression")) return "regression";
  if (packs.includes("e2e") || caseKind === "flow") return "e2e";
  return "page";
}

function normalizePackMembership(caseKind, packs) {
  const normalized = Array.from(new Set((packs || []).filter((pack) => TESTCASE_PACK_ORDER.includes(pack))));
  return TESTCASE_PACK_ORDER.filter((pack) => normalized.includes(pack) && (caseKind === "flow" || pack !== "e2e"));
}

function normalizeGeneratedCaseKind(raw, fallback = "page") {
  const explicit = String(raw?.caseKind || "").toLowerCase().trim();
  if (["page", "flow", "step"].includes(explicit)) return explicit;

  const scope = String(raw?.scope || "").toLowerCase().trim();
  if (scope === "journey") return "flow";
  if (scope === "step") return "step";

  const suite = String(raw?.suite || "").toLowerCase().trim();
  if (suite === "e2e") return fallback === "step" ? "step" : "flow";

  const category = String(raw?.category || "").toLowerCase().trim();
  if (category === "e2e") return fallback === "step" ? "step" : "flow";

  return fallback;
}

function normalizeGeneratedPacks(raw, caseKind) {
  const explicit = Array.isArray(raw?.packs)
    ? raw.packs.map((pack) => String(pack || "").toLowerCase().trim())
    : [];
  if (explicit.length) return normalizePackMembership(caseKind, explicit);

  const tags = Array.isArray(raw?.tags) ? raw.tags.map((tag) => String(tag || "").toLowerCase()) : [];
  const suite = String(raw?.suite || "").toLowerCase().trim();
  const next = [];

  if (suite === "smoke" || tags.includes("smoke")) next.push("smoke");
  if (suite === "regression" || tags.includes("regression")) next.push("regression");
  if (suite === "e2e" || tags.includes("e2e") || tags.includes("flow")) next.push("e2e");

  return normalizePackMembership(caseKind, next);
}

function normalizeGeneratedCategory(rawCategory, caseKind, packs) {
  const category = String(rawCategory || "").toLowerCase().trim();
  if (TESTCASE_CATEGORIES.has(category) && !["smoke", "regression", "page"].includes(category)) {
    return category;
  }
  if (caseKind === "flow" || packs.includes("e2e")) return "e2e";
  return "functional";
}

// Rate limiter — localhost is unlimited (recorder polls every 600ms)
const rateLimiter = new Map();
const LOCAL_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function checkRateLimit(ip) {
  if (LOCAL_IPS.has(ip)) return true; // no limit for localhost
  const now = Date.now();
  const hits = (rateLimiter.get(ip) || []).filter(t => now - t < 60_000);
  hits.push(now);
  rateLimiter.set(ip, hits);
  return hits.length <= 300;
}

function normalizeRuntimePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.\.(\/|\\)/g, "");
}

function resolveRuntimeScriptTargets(file, framework) {
  const filename = normalizeRuntimePath(file?.filename || "script.txt");
  const key = String(file?.key || "");
  const hasExplicitPath = filename.includes("/");
  if (hasExplicitPath) return [filename];

  const isPython = framework === "selenium-python" || framework === "playwright-python";
  if (!isPython) return [filename];

  if (key === "pageObject") return [`pages/${filename}`, `page_objects/${filename}`];
  if (["tests", "accessibility", "perfTest", "visualTest"].includes(key) || /^test_/i.test(filename)) {
    return [`tests/${filename}`];
  }

  return [filename];
}

function buildRuntimePythonConftest() {
  return `import os
import sys

ROOT = os.path.dirname(__file__)
for relative in ("pages", "page_objects"):
    candidate = os.path.join(ROOT, relative)
    if os.path.isdir(candidate) and candidate not in sys.path:
        sys.path.insert(0, candidate)
`;
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS — allow chrome extensions and localhost
  const origin = req.headers.origin || "";
  const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  
  res.setHeader("Access-Control-Allow-Origin", allowed ? origin : "null");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const ip = req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    return jsonResponse(res, 429, { error: "Rate limit exceeded. Max 20 requests/minute." });
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = `${req.method} ${url.pathname}`;

  try {
    if (route === "GET /api/health" || route === "HEAD /api/health") return handleHealth(req, res);
    if (route === "POST /api/generate-tests") return await handleGenerateTests(req, res);
    if (route === "POST /api/generate-script") return await handleGenerateScript(req, res);
    if (route === "POST /api/generate-journey-tests") return await handleGenerateJourneyTests(req, res);
    if (route === "POST /api/generate-journey-script") return await handleGenerateJourneyScript(req, res);
    if (route === "POST /api/run-tests") return await handleRunTests(req, res);
    if (route === "POST /api/save-project") return await handleSaveProject(req, res);
    if (route === "GET /api/projects") return handleListProjects(req, res);
    if (url.pathname.startsWith("/api/projects/")) {
      if (req.method === "GET") return handleGetProject(req, res, url);
      if (req.method === "DELETE") return handleDeleteProject(req, res, url);
    }

    // CI/CD config generation
    if (route === "POST /api/generate-cicd") return await handleGenerateCICD(req, res);

    // Recorder routes
    if (url.pathname === "/api/record/start" && req.method === "POST") return await handleRecordStart(req, res);
    if (url.pathname === "/api/record/sessions" && req.method === "GET") return handleRecordSessions(req, res);
    if (url.pathname.startsWith("/api/record/")) {
      const parts = url.pathname.split("/");
      const sessionId = parts[3];
      const action = parts[4];
      if (action === "actions" && req.method === "GET") return handleRecordActions(req, res, sessionId);
      if (action === "stop"    && req.method === "POST") return await handleRecordStop(req, res, sessionId);
      if (action === "convert" && req.method === "POST") return await handleRecordConvert(req, res, sessionId);
      if (action === "testcases" && req.method === "POST") return await handleRecordTestCases(req, res, sessionId);
    }

    // Page proxy — strips X-Frame-Options, injects capture script
    if (req.method === "GET" && url.pathname === "/api/proxy") return await handleProxy(req, res, url);
    // Proxy asset passthrough — serves CSS/JS/images for proxied pages
    if (req.method === "GET" && (url.pathname === "/api/proxy-asset" || url.pathname.startsWith("/api/proxy-asset/"))) {
      return await handleProxyAsset(req, res, url);
    }

    // Serve dashboard static files
    if (req.method === "GET") return serveStatic(req, res, url);

    jsonResponse(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[Server Error]", err);
    jsonResponse(res, 500, { error: "Internal server error", detail: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 QA Deck Backend running`);
  console.log(`   Dashboard:    http://localhost:${PORT}`);
  console.log(`   API Health:   http://localhost:${PORT}/api/health\n`);
});

// ─── Route handlers ───────────────────────────────────────────────────────────

function handleHealth(req, res) {
  jsonResponse(res, 200, {
    status: "ok",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    projects: fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith(".json")).length,
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Run Tests ────────────────────────────────────────────────────────────────

async function handleRunTests(req, res) {
  const body = await readBody(req);
  const { scripts, framework, headless = true } = body;

  if (!scripts?.length) return jsonResponse(res, 400, { error: "scripts array is required" });
  if (!framework)       return jsonResponse(res, 400, { error: "framework is required" });

  // SSE headers — no Content-Length so we can stream
  const origin = req.headers.origin || "";
  const allowed = ["chrome-extension://", "http://localhost", "http://127.0.0.1"].some(o => origin.startsWith(o));
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  });

  function sseEvent(payload) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  // ── Dependency check ──────────────────────────────────────────────────────

  const depChecks = {
    "selenium-python":    { cmds: ["python3 -m pytest --version", "python3 -c \"import selenium\""],
                            install: "pip install pytest selenium webdriver-manager" },
    "playwright-python":  { cmds: ["python3 -m pytest --version", "python3 -c \"from playwright.sync_api import sync_playwright\""],
                            install: "pip install pytest pytest-playwright && playwright install chromium" },
    "playwright-typescript": { cmds: ["node -e \"require('@playwright/test')\""],
                            install: "npm install && npx playwright install chromium" },
    "selenium-java":      { cmds: ["mvn --version"],
                            install: "macOS: brew install maven  |  Windows/Linux: https://maven.apache.org/install.html" },
  };

  const check = depChecks[framework];
  if (check) {
    for (const cmd of check.cmds) {
      const [bin, ...args] = cmd.split(" ");
      const ok = await new Promise(resolve => {
        const c = spawn(bin, args, { shell: true });
        c.on("close", code => resolve(code === 0));
        c.on("error", () => resolve(false));
      });
      if (!ok) {
        sseEvent({
          type: "missing-deps",
          message: `Missing dependency for ${framework}: ${cmd.split(" ").slice(0, 3).join(" ")} not found.`,
          installCmd: check.install,
        });
        res.end();
        return;
      }
    }
  }

  // ── Write script files to temp dir ───────────────────────────────────────

  let tmpDir;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qadeck-run-"));
    for (const f of scripts) {
      const targets = resolveRuntimeScriptTargets(f, framework);
      for (const target of targets) {
        const filePath = path.join(tmpDir, target);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, patchHeadless(f.content, target, framework, headless));
      }
    }

    if (framework === "selenium-python" || framework === "playwright-python") {
      const runtimeConftest = buildRuntimePythonConftest();
      const rootConftest = path.join(tmpDir, "conftest.py");
      const testsConftest = path.join(tmpDir, "tests", "conftest.py");
      const pagesInit = path.join(tmpDir, "pages", "__init__.py");
      const pageObjectsInit = path.join(tmpDir, "page_objects", "__init__.py");

      if (!fs.existsSync(path.dirname(testsConftest))) fs.mkdirSync(path.dirname(testsConftest), { recursive: true });
      if (!fs.existsSync(path.dirname(pagesInit))) fs.mkdirSync(path.dirname(pagesInit), { recursive: true });
      if (!fs.existsSync(path.dirname(pageObjectsInit))) fs.mkdirSync(path.dirname(pageObjectsInit), { recursive: true });

      fs.writeFileSync(rootConftest, runtimeConftest);
      fs.writeFileSync(testsConftest, runtimeConftest);
      fs.writeFileSync(pagesInit, "");
      fs.writeFileSync(pageObjectsInit, "");
    }
  } catch (err) {
    sseEvent({ type: "error", message: "Failed to write script files: " + err.message });
    res.end();
    return;
  }

  // ── Spawn test runner ─────────────────────────────────────────────────────

  const runConfigs = {
    "selenium-python":       { bin: "python3", args: ["-m", "pytest", "-v", "--tb=short"] },
    "playwright-python":     { bin: "python3", args: ["-m", "pytest", "-v", "--tb=short"] },
    "playwright-typescript": { bin: "node_modules/.bin/playwright", args: ["test", "--reporter=list"] },
    "selenium-java":         { bin: "mvn", args: ["test", "-Dsurefire.useFile=false"] },
  };

  const runCfg = runConfigs[framework] || runConfigs["selenium-python"];
  sseEvent({
    type: "start",
    message: `Running: ${runCfg.bin} ${runCfg.args.join(" ")} (headless=${headless ? "true" : "false"})`,
  });

  const child = spawn(runCfg.bin, runCfg.args, { cwd: tmpDir, shell: process.platform === "win32" });
  let stdout = "";
  const liveResults = [];
  const parseLiveStdout = createLiveResultParser(framework);
  let runFinished = false;
  let stopRequested = false;

  function cleanupRunArtifacts() {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }

  function terminateRun(reason = "Run stopped by client") {
    if (runFinished) return;
    stopRequested = true;
    runFinished = true;
    if (!child.killed) {
      try { child.kill("SIGTERM"); } catch (_) {}
      setTimeout(() => {
        if (!child.killed) {
          try { child.kill("SIGKILL"); } catch (_) {}
        }
      }, 1500);
    }
    cleanupRunArtifacts();
    console.log(`[Run Tests] ${reason}`);
  }

  res.on("close", () => {
    if (!runFinished) terminateRun();
  });

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    sseEvent({ type: "stdout", text });
    const updates = parseLiveStdout(text);
    for (const result of updates) {
      const existingIndex = liveResults.findIndex((entry) => entry.name === result.name);
      if (existingIndex >= 0) liveResults[existingIndex] = result;
      else liveResults.push(result);
      sseEvent({ type: "test-result", result });
    }
  });

  child.stderr.on("data", (chunk) => {
    sseEvent({ type: "stderr", text: chunk.toString() });
  });

  child.on("error", (err) => {
    runFinished = true;
    sseEvent({ type: "error", message: err.message });
    res.end();
    cleanupRunArtifacts();
  });

  child.on("close", (code) => {
    if (stopRequested) {
      cleanupRunArtifacts();
      return;
    }
    runFinished = true;
    const results = parseTestResults(stdout, framework);
    sseEvent({ type: "done", exitCode: code, results });
    res.end();
    cleanupRunArtifacts();
  });
}

// Patch template base files to apply the requested headless setting.
// Templates default to non-headless (visible browser); we inject headless args when headless=true.
// Uses regex matching so minor whitespace/formatting differences in stored content don't break it.
function patchHeadless(content, filename, framework, headless) {
  const base = path.basename(filename);

  // ── selenium-python: patch any saved python file with webdriver.Chrome(...) ──
  if (framework === "selenium-python" && filename.endsWith(".py")) {
    let patched = content
      .replace(/^[ \t]*__qadeck_headless_options\s*=\s*webdriver\.ChromeOptions\(\)\s*\n?/gm, "")
      .replace(/^[ \t]*__qadeck_headless_options\.add_argument\(\s*["']--headless(?:=new)?["']\s*\)\s*\n?/gm, "")
      .replace(/webdriver\.Chrome\(\s*options\s*=\s*__qadeck_headless_options\s*,\s*/g, "webdriver.Chrome(")
      .replace(/webdriver\.Chrome\(\s*options\s*=\s*__qadeck_headless_options\s*\)/g, "webdriver.Chrome()");

    if (!headless) {
      return patched.replace(
        /^[ \t]*[A-Za-z_][A-Za-z0-9_]*\.add_argument\(\s*["']--headless(?:=new)?["']\s*\)\s*\n?/gm,
        ""
      );
    }

    const optionVars = new Set();
    patched.replace(/webdriver\.Chrome\((.*)\)/g, (_match, args) => {
      const optionsMatch = args.match(/(?:^|,)\s*options\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:,|$)/);
      if (optionsMatch?.[1]) optionVars.add(optionsMatch[1]);
      return _match;
    });

    for (const optionVar of optionVars) {
      const headlessArgRe = new RegExp(
        `^[ \\t]*${escapeRegExp(optionVar)}\\.add_argument\\(\\s*["']--headless(?:=new)?["']\\s*\\)\\s*$`,
        "m"
      );
      if (headlessArgRe.test(patched)) continue;

      const optionsDefRe = new RegExp(
        `^([ \\t]*)${escapeRegExp(optionVar)}\\s*=\\s*(?:Options|webdriver\\.ChromeOptions)\\(\\)\\s*$`,
        "m"
      );
      patched = patched.replace(optionsDefRe, (line, indent) =>
        `${line}\n${indent}${optionVar}.add_argument("--headless=new")`
      );
    }

    return patched.replace(
      /^([ \t]*)([\w.]+\s*=\s*)?webdriver\.Chrome\((?!.*options\s*=)(.*)\)\s*$/gm,
      (_match, indent, assignment = "", args = "") => {
        const trimmedArgs = args.trim();
        const chromeArgs = trimmedArgs
          ? `options=__qadeck_headless_options, ${trimmedArgs}`
          : "options=__qadeck_headless_options";
        return [
          `${indent}__qadeck_headless_options = webdriver.ChromeOptions()`,
          `${indent}__qadeck_headless_options.add_argument("--headless=new")`,
          `${indent}${assignment}webdriver.Chrome(${chromeArgs})`,
        ].join("\n");
      }
    );
  }

  // ── playwright-python: patch any saved python file with launch(...) ──────
  if (framework === "playwright-python" && filename.endsWith(".py")) {
    if (headless) {
      if (/headless\s*=/.test(content)) {
        return content.replace(/headless\s*=\s*\w+/g, "headless=True");
      }
      return content.replace(/(\.launch\s*\()/, "$1headless=True, ");
    } else {
      if (/headless\s*=/.test(content)) {
        return content.replace(/headless\s*=\s*\w+/g, "headless=False");
      }
      return content;
    }
  }

  // ── playwright-typescript: playwright.config.ts ──────────────────────────
  if (framework === "playwright-typescript" && base === "playwright.config.ts") {
    if (headless) {
      if (/headless\s*:/.test(content)) {
        return content.replace(/headless\s*:\s*(true|false)/gi, "headless: true");
      }
      // inject into use: {} block
      return content.replace(/(use\s*:\s*\{)/, "$1\n    headless: true,");
    } else {
      if (/headless\s*:/.test(content)) {
        return content.replace(/headless\s*:\s*(true|false)/gi, "headless: false");
      }
      return content;
    }
  }

  // ── selenium-java: BaseTest.java ─────────────────────────────────────────
  if (framework === "selenium-java" && base === "BaseTest.java") {
    if (headless) {
      if (/--headless/.test(content)) return content;
      // options.addArguments("--start-maximized") → add headless alongside it
      if (/options\.addArguments\(/.test(content)) {
        return content.replace(
          /(options\.addArguments\([^)]*)\)/,
          '$1, "--headless=new")'
        );
      }
      // No addArguments call — inject before driver creation
      return content.replace(
        /(ChromeOptions\s+options\s*=\s*new\s+ChromeOptions\(\);)/,
        '$1\n        options.addArguments("--headless=new");'
      );
    } else {
      return content.replace(/,?\s*"--headless=new"/g, "");
    }
  }

  return content;
}

function parseTestResults(stdout, framework) {
  const results = [];
  const lines = stdout.split("\n");

  for (const line of lines) {
    const parsed = parseTestResultLine(line, framework);
    if (parsed) results.push(parsed);
  }

  return results;
}

function createLiveResultParser(framework) {
  let buffer = "";

  return (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    return lines
      .map((line) => parseTestResultLine(line, framework))
      .filter(Boolean);
  };
}

function parseTestResultLine(line, framework) {
  if (framework === "selenium-python" || framework === "playwright-python") {
    // pytest -v output: "tests/test_form.py::TestClass::test_name PASSED  [ 50%]"
    const match = line.match(/^([\w/\\.\-]+::[\w\[\]-]+)\s+(PASSED|FAILED|ERROR|SKIPPED)(?:\s+\[.*?\])?\s*(?:\((.+?)\))?/);
    if (!match) return null;
    return {
      name: match[1].split("::").pop(),
      status: match[2].toLowerCase(),
      duration: match[3] || null,
    };
  }

  if (framework === "playwright-typescript") {
    // Playwright list reporter: "  ✓  test name (123ms)" or "  ×  test name (456ms)"
    const match = line.match(/^\s*([✓✗×])\s+(.+?)(?:\s+\((\d+ms)\))?$/);
    if (!match) return null;
    return {
      name: match[2].trim(),
      status: match[1] === "✓" ? "passed" : "failed",
      duration: match[3] || null,
    };
  }

  if (framework === "selenium-java") {
    const match = line.match(/^\s*(PASS|FAIL|ERROR|SKIP)\s+(.+)/i);
    if (!match) return null;
    return {
      name: match[2].trim(),
      status: match[1].toLowerCase(),
      duration: null,
    };
  }

  return null;
}

async function handleGenerateTests(req, res) {
  const body = await readBody(req);
  const { pageData, apiKey, exploratoryMode } = body;

  if (!pageData) return jsonResponse(res, 400, { error: "pageData is required" });
  if (!apiKey) return jsonResponse(res, 400, { error: "apiKey is required" });

  console.log(`[Generate Tests] Page: ${pageData.meta?.url} | Type: ${pageData.meta?.pageType} | Exploratory: ${!!exploratoryMode}`);

  const prompt = buildTestCasePrompt(pageData, exploratoryMode);
  const result = await callAI(apiKey, prompt, 4096,
    "You are an expert QA automation engineer. Generate precise, actionable test cases from web page analysis data. Respond with valid JSON only — no markdown, no explanation.");

  if (!result.success) return jsonResponse(res, 502, { error: result.error });

  let testCases;
  try {
    const clean = sanitizeAiJson(result.text);
    const parsed = JSON.parse(clean);
    testCases = parsed.testCases || parsed;
    if (!Array.isArray(testCases)) throw new Error("Expected array of test cases");
  } catch (err) {
    console.error("[Parse Error]", err.message, "\nRaw:", result.text.slice(0, 200));
    return jsonResponse(res, 502, { error: "Failed to parse AI response", detail: err.message });
  }

  // Normalise and validate each test case
  testCases = testCases.map((tc, i) => {
    const caseKind = normalizeGeneratedCaseKind(tc, "page");
    const packs = normalizeGeneratedPacks(tc, caseKind);
    return {
      id: tc.id || `TC${String(i + 1).padStart(3, "0")}`,
      title: tc.title || "Untitled test case",
      category: normalizeGeneratedCategory(tc.category, caseKind, packs),
      priority: tc.priority || "medium",
      preconditions: tc.preconditions || "",
      steps: Array.isArray(tc.steps) ? tc.steps : [],
      expectedResult: tc.expectedResult || tc.expected_result || "",
      locators: tc.locators || {},
      testData: tc.testData || tc.test_data || {},
      tags: tc.tags || [],
      approved: tc.approved !== false,
      caseKind,
      packs,
      suite: deriveLegacySuite(caseKind, packs),
      scope: "page",
      source: tc.source || "page",
    };
  });

  console.log(`[Generate Tests] ✓ ${testCases.length} test cases generated`);
  jsonResponse(res, 200, { success: true, testCases, count: testCases.length });
}

// ─── Template-driven files (never AI-generated) ──────────────────────────────
// base_test, config, and pytest.ini are always correct — no AI hallucination risk
function injectTemplateFiles(scripts, framework, pageData) {
  const url = pageData?.meta?.url || "https://example.com";

  if (framework === "selenium-python") {
    scripts.base = {
      filename: "base_test.py",
      content: `from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


_ACTIVE_DRIVER = None


def set_active_driver(driver):
    global _ACTIVE_DRIVER
    _ACTIVE_DRIVER = driver
    return driver


def get_active_driver():
    return _ACTIVE_DRIVER


def resolve_driver(driver=None):
    return driver or _ACTIVE_DRIVER


class DeferredDriverProxy:
    def _resolve(self):
        driver = resolve_driver()
        if driver is None:
            raise RuntimeError("QA Deck could not resolve an active Selenium driver for this generated file.")
        return driver

    def __getattr__(self, name):
        return getattr(self._resolve(), name)


class LazyElement:
    def __init__(self, driver_ref, by, value):
        self._driver_ref = driver_ref
        self._by = by
        self._value = value

    def _resolve(self):
        driver = resolve_driver(self._driver_ref() if callable(self._driver_ref) else self._driver_ref)
        if driver is None:
            raise RuntimeError("QA Deck could not resolve an active Selenium driver for this page object.")
        return WebDriverWait(driver, 10).until(EC.presence_of_element_located((self._by, self._value)))

    def __getattr__(self, name):
        return getattr(self._resolve(), name)


class LazyElements:
    def __init__(self, driver_ref, by, value):
        self._driver_ref = driver_ref
        self._by = by
        self._value = value

    def _resolve(self):
        driver = resolve_driver(self._driver_ref() if callable(self._driver_ref) else self._driver_ref)
        if driver is None:
            raise RuntimeError("QA Deck could not resolve an active Selenium driver for this page object.")
        return WebDriverWait(driver, 10).until(lambda d: d.find_elements(self._by, self._value))

    def __iter__(self):
        return iter(self._resolve())

    def __getitem__(self, item):
        return self._resolve()[item]

    def __len__(self):
        return len(self._resolve())


class BaseTest:
    """Base test class — browser setup and teardown."""

    def __init__(self, driver=None):
        self.driver = resolve_driver(driver)
        self.wait = WebDriverWait(self.driver, 10) if self.driver else None

    def setup_method(self):
        """Launch Chrome before each test."""
        options = Options()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        # Selenium 4.18+ includes Selenium Manager — no chromedriver download needed
        self.driver = set_active_driver(webdriver.Chrome(options=options))
        self.driver.maximize_window()
        self.wait = WebDriverWait(self.driver, 10)
        self.driver.get("${url}")

    def teardown_method(self):
        """Quit Chrome after each test."""
        if hasattr(self, "driver") and self.driver:
            self.driver.quit()
        set_active_driver(None)
`.replace("${url}", url),
    };

    scripts.config = {
      filename: "pytest.ini",
      content: `[pytest]
addopts = -v --tb=short --junit-xml=report.xml
testpaths = tests
`,
    };
  }

  if (framework === "playwright-python") {
    scripts.base = {
      filename: "conftest.py",
      content: `import pytest
from playwright.sync_api import sync_playwright


@pytest.fixture(scope="function")
def page():
    """Playwright page fixture — launches browser per test."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context()
        pg = ctx.new_page()
        pg.goto("${url}")
        yield pg
        ctx.close()
        browser.close()
`.replace("${url}", url),
    };

    scripts.config = {
      filename: "pytest.ini",
      content: `[pytest]
addopts = -v --tb=short --junit-xml=report.xml
testpaths = tests
`,
    };
  }

  if (framework === "playwright-typescript") {
    scripts.base = {
      filename: "playwright.config.ts",
      content: `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: '${url}',
    headless: false,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['html'], ['junit', { outputFile: 'report.xml' }]],
});
`.replace("${url}", url),
    };
  }

  if (framework === "selenium-java") {
    scripts.base = {
      filename: "BaseTest.java",
      content: `package tests;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import java.time.Duration;

public class BaseTest {
    protected WebDriver driver;
    protected WebDriverWait wait;

    @BeforeMethod
    public void setUp() {
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--no-sandbox", "--disable-dev-shm-usage");
        driver = new ChromeDriver(options); // Selenium Manager handles chromedriver
        driver.manage().window().maximize();
        wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        driver.get("${url}");
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) driver.quit();
    }
}
`.replace("${url}", url),
    };
  }

  return scripts;
}

// ─── Post-processor: inject missing imports the AI forgot ────────────────────
function fixGeneratedScripts(scripts, framework) {
  if (framework === "selenium-python" || framework === "playwright-python") {
    // Required imports for every Python test file
    const seleniumImports = [
      "from selenium.webdriver.support.ui import WebDriverWait",
      "from selenium.webdriver.support import expected_conditions as EC",
      "from selenium.webdriver.common.by import By",
      "from selenium.common.exceptions import TimeoutException, NoSuchElementException",
    ];
    const playwrightImports = [
      "import pytest",
      "from playwright.sync_api import expect",
    ];
    const requiredImports = framework === "selenium-python" ? seleniumImports : playwrightImports;

    // Fix each Python file that uses these names but doesn't import them
    for (const key of ["tests", "base", "pageObject"]) {
      const file = scripts[key];
      if (!file?.content) continue;

      let content = file.content;
      const missing = requiredImports.filter(imp => {
        // Check if the symbol is used but not imported
        const symbol = imp.split(" ").pop(); // last word = the imported name
        const isUsed = content.includes(symbol.split(" as ").pop()); // handle "as EC"
        const alreadyImported = content.includes(imp);
        return isUsed && !alreadyImported;
      });

      if (missing.length > 0) {
        // Find first import line to insert after the existing imports block
        const lines = content.split("\n");
        let lastImportLine = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith("import ") || lines[i].startsWith("from ")) {
            lastImportLine = i;
          }
        }
        lines.splice(lastImportLine + 1, 0, ...missing);
        scripts[key] = { ...file, content: lines.join("\n") };
        console.log(`[Fix Imports] Added ${missing.length} missing imports to ${file.filename}`);
      }
    }
  }

  if (framework === "playwright-typescript") {
    // Ensure test file imports from @playwright/test
    const file = scripts.tests;
    if (file?.content && !file.content.includes("@playwright/test")) {
      scripts.tests = {
        ...file,
        content: `import { test, expect, Page } from '@playwright/test';\n` + file.content,
      };
    }
  }

  return scripts;
}

async function handleGenerateScript(req, res) {
  const body = await readBody(req);
  const { testCases, pageData, framework, format, customAssertions, networkCalls, visualTesting, perfAssertions, environments, datasetsMap, apiKey } = body;

  if (!testCases?.length) return jsonResponse(res, 400, { error: "testCases are required" });
  if (!framework) return jsonResponse(res, 400, { error: "framework is required" });
  if (!apiKey) return jsonResponse(res, 400, { error: "apiKey is required" });

  // Route to BDD generator if format=bdd
  if (format === "bdd") {
    return handleGenerateBDDScript(testCases, pageData, framework, apiKey, res);
  }

  console.log(`[Generate Script] Framework: ${framework} | Test cases: ${testCases.length}${customAssertions?.length ? ` | Custom assertions: ${customAssertions.length}` : ""}${networkCalls?.length ? ` | Network assertions: ${networkCalls.length}` : ""}`);

  // Step 1: Build page object + test data deterministically — no AI, no hallucinated locators
  const pageObject = generatePageObject(pageData, framework);
  const testData = generateTestData(testCases, pageData, framework);
  console.log(`[Generate Script] ✓ Page object generated deterministically (${pageObject.filename}, ${pageObject.content.length} chars)`);

  // Step 2: Ask AI only for test methods, giving it the page object API it must use
  const pageObjectApi = _extractApiSummary(pageObject.content, framework);
  const prompt = buildTestsOnlyPrompt(testCases, pageData, framework, pageObject.filename, pageObjectApi, networkCalls, customAssertions, datasetsMap);
  const result = await callAI(apiKey, prompt, 4096,
    "You are a senior QA automation engineer. Write test methods using the provided page object. Respond ONLY with valid JSON — no markdown fences, no extra text.");

  if (!result.success) return jsonResponse(res, 502, { error: result.error });

  let scripts;
  try {
    const clean = sanitizeAiJson(result.text);
    const aiPart = JSON.parse(clean);
    if (!aiPart.tests?.filename || !aiPart.tests?.content) throw new Error("Missing tests file in AI response");
    scripts = { pageObject, testData, tests: aiPart.tests };
  } catch (err) {
    console.error("[Script Parse Error]", err.message);
    return jsonResponse(res, 502, { error: "Failed to parse script response", detail: err.message });
  }

  // Inject template-driven files — these never come from AI to avoid import/setup bugs
  scripts = injectTemplateFiles(scripts, framework, pageData);

  // Post-process: fix any remaining missing imports the AI forgot
  scripts = fixGeneratedScripts(scripts, framework);

  // Generate 6th file — accessibility tests (template-based, no AI call)
  if (pageData?.accessibility) {
    scripts.accessibility = buildAccessibilityScript(pageData, framework);
    console.log(`[Generate Script] ✓ Accessibility test file added (${scripts.accessibility.filename})`);
  }

  // Generate performance assertion tests (opt-in)
  if (perfAssertions && pageData?.performance) {
    scripts.perfTest = buildPerformanceScript(pageData, framework);
    console.log(`[Generate Script] ✓ Performance test file added (${scripts.perfTest.filename})`);
  }

  // Generate 7th file — visual regression tests (opt-in)
  if (visualTesting) {
    scripts.visualTest = buildVisualRegressionScript(pageData, framework);
    console.log(`[Generate Script] ✓ Visual regression test file added (${scripts.visualTest.filename})`);
  }

  // Generate environment config files (opt-in)
  if (environments?.length > 0) {
    scripts.envConfigs = buildEnvironmentConfigs(environments, pageData, framework);
    console.log(`[Generate Script] ✓ ${environments.length} environment config files added`);
  }

  console.log(`[Generate Script] ✓ ${Object.keys(scripts).length} files generated`);
  jsonResponse(res, 200, { success: true, scripts });
}

async function handleGenerateJourneyTests(req, res) {
  const body = await readBody(req);
  const { journey, apiKey } = body;

  if (!journey?.steps?.length) return jsonResponse(res, 400, { error: "journey with steps is required" });
  if (!apiKey) return jsonResponse(res, 400, { error: "apiKey is required" });

  const prompt = buildJourneyTestPrompt(journey);
  const result = await callAI(
    apiKey,
    prompt,
    6144,
    "You are a senior QA automation engineer. Generate journey-level and step-level web test cases. Respond ONLY with valid JSON."
  );

  if (!result.success) return jsonResponse(res, 502, { error: result.error });

  let testCases;
  try {
    const clean = sanitizeAiJson(result.text);
    const parsed = JSON.parse(clean);
    testCases = Array.isArray(parsed) ? parsed : parsed.testCases;
    if (!Array.isArray(testCases)) throw new Error("Expected testCases array");
  } catch (err) {
    console.error("[Journey Test Parse Error]", err.message);
    return jsonResponse(res, 502, { error: "Failed to parse journey test response", detail: err.message });
  }

  const normalized = normalizeJourneyTestCases(testCases, journey);
  jsonResponse(res, 200, {
    success: true,
    testCases: normalized,
    summary: buildJourneyGenerationSummary(journey),
  });
}

async function handleGenerateJourneyScript(req, res) {
  const body = await readBody(req);
  const { journey, testCases, framework, apiKey } = body;

  if (!journey?.steps?.length) return jsonResponse(res, 400, { error: "journey with steps is required" });
  if (!testCases?.length) return jsonResponse(res, 400, { error: "testCases are required" });
  if (!framework) return jsonResponse(res, 400, { error: "framework is required" });
  if (!apiKey) return jsonResponse(res, 400, { error: "apiKey is required" });

  const approvedCases = testCases.filter((tc) => tc.approved !== false);
  const summary = buildJourneyGenerationSummary(journey);
  const prompt = buildJourneyScriptPrompt(journey, approvedCases, framework, summary);
  const result = await callAI(
    apiKey,
    prompt,
    8192,
    "You are a senior QA automation engineer. Generate a multi-page automation bundle. Respond ONLY with valid JSON."
  );

  if (!result.success) return jsonResponse(res, 502, { error: result.error });

  let bundle;
  try {
    const clean = sanitizeAiJson(result.text);
    bundle = JSON.parse(clean);
  } catch (err) {
    console.error("[Journey Script Parse Error]", err.message);
    return jsonResponse(res, 502, { error: "Failed to parse journey script response", detail: err.message });
  }

  const normalized = normalizeJourneyScriptBundle(bundle, framework, journey, approvedCases, summary);
  jsonResponse(res, 200, { success: true, bundle: normalized });
}

async function handleSaveProject(req, res) {
  const body = await readBody(req);
  const { project } = body;
  if (!project) return jsonResponse(res, 400, { error: "project is required" });

  const id = project.id || crypto.randomUUID();
  const filename = path.join(PROJECTS_DIR, `${id}.json`);
  const data = { ...project, id, savedAt: new Date().toISOString() };

  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  console.log(`[Save Project] Saved: ${id}`);
  jsonResponse(res, 200, { success: true, id });
}

function countGeneratedScriptFiles(scripts) {
  if (!scripts) return 0;
  if (Array.isArray(scripts.files)) return scripts.files.length;
  return Object.values(scripts).filter((file) => file && typeof file === "object" && file.filename && file.content).length;
}

function buildLocalArtifactCounts(project, mode, latestArtifacts) {
  if (project.artifactCounts && typeof project.artifactCounts === "object") {
    return {
      scans: Number(project.artifactCounts.scans || 0),
      journeys: Number(project.artifactCounts.journeys || 0),
      testCases: Number(project.artifactCounts.testCases || 0),
      scriptFiles: Number(project.artifactCounts.scriptFiles || 0),
      cicdFiles: Number(project.artifactCounts.cicdFiles || 0),
      notes: Number(project.artifactCounts.notes || 0),
    };
  }

  if (latestArtifacts && typeof latestArtifacts === "object") {
    const journeySteps = Array.isArray(latestArtifacts.journey?.steps) ? latestArtifacts.journey.steps : [];
    return {
      scans: mode === "journey"
        ? journeySteps.filter((step) => !!step?.pageData).length
        : (latestArtifacts.scan ? 1 : 0),
      journeys: mode === "journey" && latestArtifacts.journey ? 1 : 0,
      testCases: Array.isArray(latestArtifacts.testcases) ? latestArtifacts.testcases.length : 0,
      scriptFiles: Array.isArray(latestArtifacts.scriptFiles) ? latestArtifacts.scriptFiles.length : 0,
      cicdFiles: latestArtifacts.cicd && typeof latestArtifacts.cicd === "object" ? Object.keys(latestArtifacts.cicd).length : 0,
      notes: Array.isArray(latestArtifacts.notes?.stepNotes) ? latestArtifacts.notes.stepNotes.length : 0,
    };
  }

  const page = Array.isArray(project.pages) ? project.pages[0] || {} : {};
  return {
    scans: mode === "journey"
      ? (Array.isArray(project.steps) ? project.steps.filter((step) => !!step?.pageData).length : 0)
      : (project.currentPageData ? 1 : 0),
    journeys: mode === "journey" ? 1 : 0,
    testCases: Array.isArray(project.generated?.testCases)
      ? project.generated.testCases.length
      : Array.isArray(page.testCases)
        ? page.testCases.length
        : 0,
    scriptFiles: countGeneratedScriptFiles(project.generated?.scripts || page.scripts || project.scripts),
    cicdFiles: project.cicdGeneratedConfigs && typeof project.cicdGeneratedConfigs === "object"
      ? Object.keys(project.cicdGeneratedConfigs).length
      : project.cicd && typeof project.cicd === "object"
        ? Object.keys(project.cicd).length
        : 0,
    notes: Array.isArray(project.notes?.stepNotes) ? project.notes.stepNotes.length : 0,
  };
}

function handleListProjects(req, res) {
  const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith(".json"));
  const projects = files.map(f => {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), "utf8"));
      const mode = data.mode || (Array.isArray(data.steps) ? "journey" : "page");
      const versions = Array.isArray(data.versions)
        ? [...data.versions].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        : [];
      const latestVersionId = data.latestVersionId || versions[0]?.id || "";
      const latestArtifacts = latestVersionId && data.artifactsByVersion
        ? data.artifactsByVersion[latestVersionId] || null
        : null;
      const artifactCounts = buildLocalArtifactCounts(data, mode, latestArtifacts);
      const pageCount = mode === "journey"
        ? (latestArtifacts?.journey?.steps?.length || data.steps?.length || 0)
        : (data.pages?.length || 1);
      const sourceUrl = data.sourceUrl || data.url || data.currentPageData?.meta?.url || data.steps?.[0]?.url || data.pages?.[0]?.url || "";

      return {
        id: data.id,
        name: data.name,
        url: sourceUrl,
        sourceUrl,
        savedAt: data.savedAt,
        createdAt: data.createdAt || data.savedAt,
        updatedAt: data.updatedAt || data.savedAt,
        lastOpenedAt: data.lastOpenedAt || null,
        mode,
        status: data.status || "draft",
        tags: Array.isArray(data.tags) ? data.tags : [],
        syncState: data.syncState || "local",
        activeFramework: data.activeFramework || data.generated?.activeFramework || "selenium-python",
        latestVersionId,
        artifactCounts,
        testCaseCount: artifactCounts.testCases,
        pageCount,
      };
    } catch { return null; }
  }).filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt || b.savedAt || 0) - new Date(a.updatedAt || a.savedAt || 0));
  jsonResponse(res, 200, { success: true, projects });
}

function handleGetProject(req, res, url) {
  const id = url.pathname.split("/").pop();
  const filename = path.join(PROJECTS_DIR, `${id}.json`);
  if (!fs.existsSync(filename)) return jsonResponse(res, 404, { error: "Project not found" });
  try {
    const data = JSON.parse(fs.readFileSync(filename, "utf8"));
    jsonResponse(res, 200, { success: true, project: data });
  } catch {
    jsonResponse(res, 500, { error: "Failed to read project" });
  }
}

// ─── Claude API caller ────────────────────────────────────────────────────────

// ─── Universal AI caller — detects provider from key format ──────────────────

function callAI(apiKey, prompt, maxTokens, system) {
  if (!apiKey) return Promise.resolve({ success: false, error: "No API key provided" });

  // Detect provider from key prefix
  if (apiKey.startsWith("sk-ant-") || apiKey.startsWith("sk-ant")) {
    return callClaude(apiKey, { system, prompt, maxTokens: maxTokens || 3000 });
  }
  if (apiKey.startsWith("AIza")) {
    return callGemini(apiKey, prompt, system, maxTokens || 3000);
  }
  if (apiKey.startsWith("xai-")) {
    return callGrok(apiKey, prompt, system, maxTokens || 3000);
  }
  if (apiKey.startsWith("gsk_")) {
    return callGroq(apiKey, prompt, system, maxTokens || 3000);
  }
  if (apiKey.startsWith("LA-")) {
    return callMetaLlama(apiKey, prompt, system, maxTokens || 3000);
  }
  if (apiKey.startsWith("sk-") || apiKey.startsWith("sk-proj-")) {
    return callOpenAI(apiKey, prompt, system, maxTokens || 3000);
  }
  // Unknown format — try Claude anyway
  return callClaude(apiKey, { system, prompt, maxTokens: maxTokens || 3000 });
}

// ── Claude (Anthropic) ────────────────────────────────────────────────────────
function callClaude(apiKey, { system, prompt, maxTokens = 3000 }) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    });

    const req = https.request({
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          if (p.error) return resolve({ success: false, error: p.error.message || "Claude API error" });
          resolve({ success: true, text: p.content?.[0]?.text || "" });
        } catch { resolve({ success: false, error: "Failed to parse Claude response" }); }
      });
    });
    req.on("error", e => resolve({ success: false, error: e.message }));
    req.setTimeout(60000, () => { req.destroy(); resolve({ success: false, error: "Claude API timeout" }); });
    req.write(body);
    req.end();
  });
}

// ── Gemini (Google) ───────────────────────────────────────────────────────────
function callGemini(apiKey, prompt, system, maxTokens) {
  return new Promise((resolve) => {
    const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
    });

    const path = `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const req = https.request({
      hostname: "generativelanguage.googleapis.com",
      path,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          if (p.error) return resolve({ success: false, error: p.error.message || "Gemini error" });
          const text = p.candidates?.[0]?.content?.parts?.[0]?.text || "";
          resolve({ success: true, text });
        } catch { resolve({ success: false, error: "Failed to parse Gemini response" }); }
      });
    });
    req.on("error", e => resolve({ success: false, error: e.message }));
    req.setTimeout(60000, () => { req.destroy(); resolve({ success: false, error: "Gemini API timeout" }); });
    req.write(body);
    req.end();
  });
}

// ── OpenAI (GPT-4o-mini) ──────────────────────────────────────────────────────
function callOpenAI(apiKey, prompt, system, maxTokens) {
  return new Promise((resolve) => {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const body = JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: maxTokens,
      messages,
      temperature: 0.3,
    });

    const req = https.request({
      hostname: "api.openai.com",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Authorization": `Bearer ${apiKey}`,
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          if (p.error) return resolve({ success: false, error: p.error.message || "OpenAI error" });
          const text = p.choices?.[0]?.message?.content || "";
          resolve({ success: true, text });
        } catch { resolve({ success: false, error: "Failed to parse OpenAI response" }); }
      });
    });
    req.on("error", e => resolve({ success: false, error: e.message }));
    req.setTimeout(60000, () => { req.destroy(); resolve({ success: false, error: "OpenAI API timeout" }); });
    req.write(body);
    req.end();
  });
}


// ── Grok (xAI) ───────────────────────────────────────────────────────────────
function callGrok(apiKey, prompt, system, maxTokens) {
  return new Promise((resolve) => {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const body = JSON.stringify({
      model: "grok-beta",
      max_tokens: maxTokens,
      messages,
      temperature: 0.3,
    });

    const req = https.request({
      hostname: "api.x.ai",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        "Authorization": `Bearer ${apiKey}`,
      },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          if (p.error) return resolve({ success: false, error: p.error.message || "Grok error" });
          const text = p.choices?.[0]?.message?.content || "";
          resolve({ success: true, text });
        } catch { resolve({ success: false, error: "Failed to parse Grok response" }); }
      });
    });
    req.on("error", e => resolve({ success: false, error: e.message }));
    req.setTimeout(60000, () => { req.destroy(); resolve({ success: false, error: "Grok API timeout" }); });
    req.write(body);
    req.end();
  });
}

// ── Llama via Groq ────────────────────────────────────────────────────────────
function callGroq(apiKey, prompt, system, maxTokens) {
  return new Promise((resolve) => {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const body = JSON.stringify({ model: "llama-3.3-70b-versatile", max_tokens: maxTokens, messages, temperature: 0.3 });

    const req = https.request({
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "Authorization": `Bearer ${apiKey}` },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          if (p.error) return resolve({ success: false, error: p.error.message || "Groq error" });
          resolve({ success: true, text: p.choices?.[0]?.message?.content || "" });
        } catch { resolve({ success: false, error: "Failed to parse Groq response" }); }
      });
    });
    req.on("error", e => resolve({ success: false, error: e.message }));
    req.setTimeout(60000, () => { req.destroy(); resolve({ success: false, error: "Groq API timeout" }); });
    req.write(body);
    req.end();
  });
}

// ── Llama via Meta API ────────────────────────────────────────────────────────
function callMetaLlama(apiKey, prompt, system, maxTokens) {
  return new Promise((resolve) => {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const body = JSON.stringify({ model: "Llama-4-Scout-17B-16E-Instruct", max_tokens: maxTokens, messages, temperature: 0.3 });

    const req = https.request({
      hostname: "api.llama.com",
      path: "/compat/v1/chat/completions",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "Authorization": `Bearer ${apiKey}` },
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const p = JSON.parse(data);
          if (p.error) return resolve({ success: false, error: p.error.message || "Meta Llama error" });
          resolve({ success: true, text: p.choices?.[0]?.message?.content || "" });
        } catch { resolve({ success: false, error: "Failed to parse Meta Llama response" }); }
      });
    });
    req.on("error", e => resolve({ success: false, error: e.message }));
    req.setTimeout(60000, () => { req.destroy(); resolve({ success: false, error: "Meta Llama API timeout" }); });
    req.write(body);
    req.end();
  });
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildTestCasePrompt(pageData, exploratoryMode = false) {
  const { meta, forms, buttons, links, tables, pageStructure, navigation, modals, alerts } = pageData;

  // Slim down for token efficiency
  const slim = {
    url: meta.url,
    title: meta.title,
    pageType: meta.pageType,
    framework: meta.framework,
    forms: (forms || []).map(f => ({
      purpose: f.purpose,
      fields: (f.fields || []).map(fi => ({
        label: fi.label,
        type: fi.type,
        required: fi.required,
        locator: fi.locator,
        placeholder: fi.placeholder,
      })),
      validationRules: f.validationRules,
      submitButton: f.submitButton?.text,
    })),
    buttons: (buttons || []).slice(0, 20).map(b => ({
      text: b.text,
      action: b.action,
      disabled: b.disabled,
      locator: b.locator,
    })),
    internalLinks: (links || []).filter(l => !l.isExternal).slice(0, 12).map(l => ({
      text: l.text,
      path: l.path,
      locator: l.locator,
    })),
    tables: (tables || []).map(t => ({
      purpose: t.purpose,
      headers: t.headers,
      hasActions: t.hasActions,
      hasSearch: t.hasSearch,
      hasSorting: t.hasSorting,
      hasPagination: t.hasPagination,
    })),
    modals: (modals || []).length,
    alerts: (alerts || []).map(a => ({ type: a.type, text: a.text.slice(0, 80) })),
    pageFeatures: pageStructure,
    hasNavigation: (navigation || []).length > 0,
  };

  const modeBlock = exploratoryMode
    ? `Generate 10-15 test cases focusing EXCLUSIVELY on:
1. Boundary values (min/max length, zero, negative numbers, empty vs whitespace-only)
2. Negative cases (invalid formats, wrong data types, SQL injection patterns, script tags in inputs)
3. Race conditions and double-submit scenarios (clicking submit twice rapidly)
4. Session edge cases (expired session, concurrent logins, back-button after logout)
5. Unusual user behaviour (rapid clicks, tab-key navigation, copy-paste, very long strings >1000 chars, Unicode and RTL characters)
6. State transition errors (submitting partially-filled forms, interrupting multi-step flows)

Do NOT generate happy-path or positive tests. Every test case must target a potential defect.`
    : `Generate 10-15 test cases covering ALL of:
1. Happy path (positive flows with valid data)
2. Negative cases (empty fields, invalid format, wrong credentials, boundary values)
3. UI state validation (error messages appear, loading states, disabled buttons)
4. Navigation flows (links go to correct pages)
5. Form validation (required fields, format rules, max length)
6. Edge cases specific to this page type`;

  return `Analyse this web page and generate comprehensive QA test cases.

PAGE DATA:
${JSON.stringify(slim, null, 2)}

${modeBlock}

Use the EXACT locators from the page data above in the "locators" field.

Respond with ONLY this JSON (no markdown, no explanation):
{
  "testCases": [
    {
      "id": "TC001",
      "title": "Concise one-line description of what is verified",
      "category": "functional|negative|boundary|ui|navigation|accessibility|performance|security",
      "caseKind": "page",
      "packs": ["smoke", "regression"],
      "priority": "high|medium|low",
      "preconditions": "State required before this test (e.g. 'User is not logged in')",
      "steps": [
        "1. Navigate to <url>",
        "2. Perform <action> on <element>",
        "3. Observe <result>"
      ],
      "expectedResult": "Specific, measurable expected outcome",
      "locators": {
        "descriptive_name": "actual_css_or_xpath_from_page_data"
      },
      "testData": {
        "key": "value"
      },
      "tags": ["smoke", "auth"]
    }
  ]
}`;
}

// ─── Extract real page signals from scanned DOM ───────────────────────────────
// This prevents the AI from guessing selectors like .error-message or title_contains()
function extractPageSignals(pageData) {
  const elements = pageData?.elements || [];
  const url      = pageData?.meta?.url || "";
  const urlPath  = (() => { try { return new URL(url).pathname; } catch { return "/"; } })();

  const errorEls   = [];
  const successEls = [];
  const formEls    = [];
  const alertEls   = [];

  for (const el of elements) {
    const tag       = (el.tag       || "").toLowerCase();
    const id        = (el.id        || "").toLowerCase();
    const cls       = (el.className || el.class || "").toLowerCase();
    const dataTest  = el.dataTest   || el["data-test"] || "";
    const role      = (el.role      || "").toLowerCase();
    const text      = (el.text      || el.innerText || "").slice(0, 80);
    const ariaLabel = (el.ariaLabel || el["aria-label"] || "").toLowerCase();

    // Best available selector (priority: data-test > id > css)
    const sel = dataTest ? `[data-test="${dataTest}"]`
              : el.id    ? `#${el.id}`
              : el.css   || "";

    if (!sel) continue;

    const isError   = id.includes("error")   || cls.includes("error")   || dataTest.toLowerCase().includes("error")   || role === "alert" || ariaLabel.includes("error");
    const isSuccess = id.includes("success") || cls.includes("success") || dataTest.toLowerCase().includes("success") || id.includes("welcome");
    const isAlert   = cls.includes("alert")  || role === "alert"        || cls.includes("notification")               || cls.includes("toast");
    const isForm    = ["input","select","textarea","button"].includes(tag);

    if (isError)   errorEls.push({ tag, sel, text });
    else if (isAlert) alertEls.push({ tag, sel, text });
    if (isSuccess) successEls.push({ tag, sel, text });
    if (isForm)    formEls.push({ tag, type: el.type || "", sel, name: el.name || "", placeholder: el.placeholder || "" });
  }

  return {
    urlPath,
    errorEls:   errorEls.slice(0, 5),
    alertEls:   alertEls.slice(0, 5),
    successEls: successEls.slice(0, 5),
    formEls:    formEls.slice(0, 20),
    allSelectors: elements
      .filter(e => e.dataTest || e.id)
      .slice(0, 30)
      .map(e => ({
        tag: e.tag,
        sel: e.dataTest ? `[data-test="${e.dataTest}"]` : `#${e.id}`,
        text: (e.text || "").slice(0, 40),
        type: e.type || ""
      }))
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETERMINISTIC SCRIPT GENERATOR
// Page objects and test data are built directly from the scan — no AI required.
// AI is called only for the test method bodies (action sequences + assertions).
// ═══════════════════════════════════════════════════════════════════════════════

function _toSnake(str) {
  return String(str || "element").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1") || "element";
}
function _toCamel(str) { return _toSnake(str).replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
function _toPascalEl(str) { const c = _toCamel(str); return c.charAt(0).toUpperCase() + c.slice(1); }
function _toScreaming(str) { return _toSnake(str).toUpperCase(); }
function _elLabel(el) { return el.label || el.ariaLabel || el.text || el.name || el.testId || el.tag || "element"; }

function _actionType(el) {
  const tag = (el.tag || "").toLowerCase(), type = (el.type || "").toLowerCase();
  if (tag === "select") return "select";
  if (tag === "textarea") return "fill";
  if (tag === "input") {
    if (["text","email","password","search","tel","url","number","date","time"].includes(type)) return "fill";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "file") return "upload";
    return "fill";
  }
  return "click";
}

function _seleniumByTuple(el) {
  const s = el.locatorStrategy || "css", loc = el.locator || "";
  const q = (value) => JSON.stringify(String(value || ""));
  const m = {
    "test-id": `By.CSS_SELECTOR, ${q(loc)}`,
    "id": `By.ID, ${q(loc.replace(/^#/, ""))}`,
    "name": `By.NAME, ${q(loc)}`,
    "xpath": `By.XPATH, ${q(loc)}`,
    "css": `By.CSS_SELECTOR, ${q(loc)}`,
    "aria-label": `By.CSS_SELECTOR, ${q(loc)}`,
  };
  return `(${m[s] || `By.CSS_SELECTOR, ${q(loc)}`})`;
}
function _seleniumByJava(el) {
  const s = el.locatorStrategy || "css", loc = el.locator || "";
  const q = (value) => JSON.stringify(String(value || ""));
  const m = {
    "test-id": `By.cssSelector(${q(loc)})`,
    "id": `By.id(${q(loc.replace(/^#/, ""))})`,
    "name": `By.name(${q(loc)})`,
    "xpath": `By.xpath(${q(loc)})`,
    "css": `By.cssSelector(${q(loc)})`,
    "aria-label": `By.cssSelector(${q(loc)})`,
  };
  return m[s] || `By.cssSelector(${q(loc)})`;
}
function _pwLocPy(el) {
  const s = el.locatorStrategy || "css", loc = el.locator || "";
  const q = (value) => JSON.stringify(String(value || ""));
  if (s === "test-id" && el.testId) return `page.get_by_test_id(${q(el.testId)})`;
  if (s === "aria-label" && el.ariaLabel) return `page.get_by_label(${q(el.ariaLabel)})`;
  if (s === "xpath") return `page.locator(${q(`xpath=${loc}`)})`;
  return `page.locator(${q(loc)})`;
}
function _pwLocTs(el) {
  const s = el.locatorStrategy || "css", loc = el.locator || "";
  const q = (value) => JSON.stringify(String(value || ""));
  if (s === "test-id" && el.testId) return `page.getByTestId(${q(el.testId)})`;
  if (s === "aria-label" && el.ariaLabel) return `page.getByLabel(${q(el.ariaLabel)})`;
  if (s === "xpath") return `page.locator(${q(`xpath=${loc}`)})`;
  return `page.locator(${q(loc)})`;
}

function _collectElements(pageData) {
  const seen = new Set(), all = [];
  const add = (el) => { if (!el?.locator || seen.has(el.locator)) return; seen.add(el.locator); all.push(el); };
  for (const form of (pageData?.forms || [])) for (const field of (form.fields || [])) add(field);
  for (const el of (pageData?.inputs || [])) add(el);
  for (const btn of (pageData?.buttons || [])) add(btn);
  return all;
}

function _genSelPy(elements, className, url) {
  const locs = elements.map(el => `    ${_toScreaming(_elLabel(el))} = ${_seleniumByTuple(el)}`).join("\n");
  const methods = elements.map(el => {
    const C = _toScreaming(_elLabel(el)), at = _actionType(el), n = _toSnake(_elLabel(el)), lbl = _elLabel(el);
    if (at === "fill") return `\n    def enter_${n}(self, value: str):\n        """Enter text in ${lbl}."""\n        el = self.wait.until(EC.element_to_be_clickable(self.${C}))\n        el.clear()\n        el.send_keys(value)`;
    if (at === "click") return `\n    def click_${n}(self):\n        """Click ${lbl}."""\n        self.wait.until(EC.element_to_be_clickable(self.${C})).click()`;
    if (at === "select") return `\n    def select_${n}(self, option: str):\n        from selenium.webdriver.support.ui import Select\n        Select(self.wait.until(EC.visibility_of_element_located(self.${C}))).select_by_visible_text(option)`;
    if (at === "checkbox") return `\n    def check_${n}(self):\n        el = self.wait.until(EC.element_to_be_clickable(self.${C}))\n        if not el.is_selected(): el.click()\n\n    def uncheck_${n}(self):\n        el = self.wait.until(EC.element_to_be_clickable(self.${C}))\n        if el.is_selected(): el.click()`;
    return `\n    def click_${n}(self):\n        self.wait.until(EC.element_to_be_clickable(self.${C})).click()`;
  }).join("\n");
  return `from selenium.webdriver.common.by import By\nfrom selenium.webdriver.support import expected_conditions as EC\nfrom selenium.webdriver.support.ui import WebDriverWait\nfrom base_test import BaseTest, resolve_driver\n\n\nclass ${className}(BaseTest):\n    """Page Object for ${url}"""\n\n    # ── Locators ──────────────────────────────────────────────────────────────\n${locs}\n\n    # ── Actions ───────────────────────────────────────────────────────────────${methods}\n`;
}

function _genPwPy(elements, className, url) {
  const inits = elements.map(el => `        self.${_toSnake(_elLabel(el))} = ${_pwLocPy(el)}`).join("\n");
  const methods = elements.map(el => {
    const n = _toSnake(_elLabel(el)), at = _actionType(el), lbl = _elLabel(el);
    if (at === "fill") return `\n    def enter_${n}(self, value: str):\n        self.${n}.fill(value)`;
    if (at === "click") return `\n    def click_${n}(self):\n        self.${n}.click()`;
    if (at === "select") return `\n    def select_${n}(self, option: str):\n        self.${n}.select_option(option)`;
    if (at === "checkbox") return `\n    def check_${n}(self):\n        self.${n}.check()\n\n    def uncheck_${n}(self):\n        self.${n}.uncheck()`;
    return `\n    def click_${n}(self):\n        self.${n}.click()`;
  }).join("\n");
  return `from playwright.sync_api import Page, expect\n\n\nclass ${className}:\n    """Page Object for ${url}"""\n\n    def __init__(self, page: Page):\n        self.page = page\n        # ── Locators ──────────────────────────────────────────────────────────\n${inits}\n\n    # ── Actions ───────────────────────────────────────────────────────────────${methods}\n`;
}

function _genPwTs(elements, className, url) {
  const props = elements.map(el => `  readonly ${_toCamel(_elLabel(el))}: Locator;`).join("\n");
  const inits = elements.map(el => `    this.${_toCamel(_elLabel(el))} = ${_pwLocTs(el)};`).join("\n");
  const methods = elements.map(el => {
    const n = _toCamel(_elLabel(el)), p = _toPascalEl(_elLabel(el)), at = _actionType(el);
    if (at === "fill") return `\n  async enter${p}(value: string): Promise<void> {\n    await this.${n}.fill(value);\n  }`;
    if (at === "click") return `\n  async click${p}(): Promise<void> {\n    await this.${n}.click();\n  }`;
    if (at === "select") return `\n  async select${p}(option: string): Promise<void> {\n    await this.${n}.selectOption(option);\n  }`;
    if (at === "checkbox") return `\n  async check${p}(): Promise<void> {\n    await this.${n}.check();\n  }\n\n  async uncheck${p}(): Promise<void> {\n    await this.${n}.uncheck();\n  }`;
    return `\n  async click${p}(): Promise<void> {\n    await this.${n}.click();\n  }`;
  }).join("\n");
  return `import { Page, Locator } from '@playwright/test';\n\nexport class ${className} {\n${props}\n\n  constructor(readonly page: Page) {\n${inits}\n  }\n${methods}\n}\n`;
}

function _genSelJava(elements, className, url) {
  const locs = elements.map(el => `    private static final By ${_toScreaming(_elLabel(el))} = ${_seleniumByJava(el)};`).join("\n");
  const methods = elements.map(el => {
    const C = _toScreaming(_elLabel(el)), p = _toPascalEl(_elLabel(el)), at = _actionType(el);
    if (at === "fill") return `\n    public void enter${p}(String value) {\n        wait.until(ExpectedConditions.elementToBeClickable(${C})).sendKeys(value);\n    }`;
    if (at === "click") return `\n    public void click${p}() {\n        wait.until(ExpectedConditions.elementToBeClickable(${C})).click();\n    }`;
    if (at === "select") return `\n    public void select${p}(String option) {\n        new Select(wait.until(ExpectedConditions.visibilityOfElementLocated(${C}))).selectByVisibleText(option);\n    }`;
    if (at === "checkbox") return `\n    public void check${p}() {\n        WebElement el = wait.until(ExpectedConditions.elementToBeClickable(${C}));\n        if (!el.isSelected()) el.click();\n    }`;
    return `\n    public void click${p}() {\n        wait.until(ExpectedConditions.elementToBeClickable(${C})).click();\n    }`;
  }).join("\n");
  return `import org.openqa.selenium.By;\nimport org.openqa.selenium.WebDriver;\nimport org.openqa.selenium.WebElement;\nimport org.openqa.selenium.support.ui.ExpectedConditions;\nimport org.openqa.selenium.support.ui.Select;\nimport org.openqa.selenium.support.ui.WebDriverWait;\n\n/**\n * Page Object for ${url}\n */\npublic class ${className} extends BaseTest {\n\n    // ── Locators ──────────────────────────────────────────────────────────────\n${locs}\n\n    public ${className}(WebDriver driver, WebDriverWait wait) {\n        super(driver, wait);\n    }\n\n    // ── Actions ───────────────────────────────────────────────────────────────${methods}\n}\n`;
}

function generatePageObject(pageData, framework) {
  const elements = _collectElements(pageData);
  const pageType = pageData?.meta?.pageType || "page";
  const url = pageData?.meta?.url || "";
  const className = toPascalCase(pageType) + "Page";
  const isJava = framework === "selenium-java", isTs = framework === "playwright-typescript";
  const filename = isTs ? `${_toSnake(pageType)}_page.ts` : isJava ? `${className}.java` : `${_toSnake(pageType)}_page.py`;
  let content = "";
  if (framework === "selenium-python")       content = _genSelPy(elements, className, url);
  else if (framework === "playwright-python")   content = _genPwPy(elements, className, url);
  else if (framework === "playwright-typescript") content = _genPwTs(elements, className, url);
  else if (framework === "selenium-java")     content = _genSelJava(elements, className, url);
  return { filename, content };
}

function generateTestData(testCases, pageData, framework) {
  const isTs = framework === "playwright-typescript", isJava = framework === "selenium-java";
  const filename = isTs ? "test_data.ts" : isJava ? "test_data.json" : "test_data.py";
  const merged = {};
  for (const tc of (testCases || [])) {
    if (tc.testData && typeof tc.testData === "object") Object.assign(merged, tc.testData);
  }
  for (const el of _collectElements(pageData)) {
    const t = (el.type || "").toLowerCase(), k = `valid_${_toSnake(_elLabel(el))}`;
    if (merged[k]) continue;
    if (t === "email") merged[k] = "test@example.com";
    else if (t === "password") merged[k] = "TestPassword123!";
    else if (t === "tel") merged[k] = "+1-555-000-0000";
    else if (t === "url") merged[k] = "https://example.com";
    else if (t === "number") merged[k] = 42;
    else if (t === "date") merged[k] = "2024-01-15";
  }
  if (isJava) return { filename, content: JSON.stringify(merged, null, 2) };
  if (isTs) return { filename, content: `export const testData = ${JSON.stringify(merged, null, 2)};\n` };
  const py = JSON.stringify(merged, null, 2).replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None");
  return { filename, content: `# Auto-generated test data\nTEST_DATA = ${py}\n` };
}

function _extractApiSummary(pageObjectContent, framework) {
  return pageObjectContent.split("\n").filter(line => {
    if (framework === "playwright-typescript") return /^\s+async\s+\w+\(/.test(line);
    if (framework === "selenium-java") return /^\s+public\s+\w+\s+\w+\(/.test(line);
    return /^\s+def\s+\w+\(self/.test(line);
  }).map(l => l.trim()).join("\n");
}

function buildTestsOnlyPrompt(testCases, pageData, framework, pageObjectFilename, pageObjectApi, networkCalls, customAssertions, datasetsMap) {
  const pageType = pageData?.meta?.pageType || "page";
  const isTs = framework === "playwright-typescript", isJava = framework === "selenium-java";
  const ext = isJava ? "java" : isTs ? "ts" : "py";
  const baseUrl = pageData?.meta?.url || "https://example.com";
  const filename = `test_${_toSnake(pageType)}.${ext}`;
  const slim = (testCases || []).slice(0, 15).map(tc => ({ id: tc.id, title: tc.title, steps: tc.steps, expectedResult: tc.expectedResult, testData: tc.testData || {}, customAssertions: tc.customAssertions || [] }));

  const netSection = networkCalls?.length
    ? `\nNETWORK CALLS TO ASSERT:\n${networkCalls.map((n, i) => { try { return `${i+1}. ${n.method} ${new URL(n.url).pathname} → ${n.statusCode}`; } catch { return `${i+1}. ${n.method} ${n.url} → ${n.statusCode}`; } }).join("\n")}\n`
    : "";

  const customSection = customAssertions?.length
    ? `\nGLOBAL CUSTOM ASSERTIONS (inject in the most relevant test method):\n${customAssertions.map((a, i) => `${i+1}. ${a.type} — locator: ${a.locator}${a.value ? ` — expected: "${a.value}"` : ""}`).join("\n")}\n`
    : "";

  const datasetSection = datasetsMap && Object.keys(datasetsMap).length
    ? `\nDATA-DRIVEN DATASETS (parametrize these test methods):\n${Object.entries(datasetsMap).map(([id, rows]) => `${id}: ${rows.length} rows — keys: ${Object.keys(rows[0] || {}).join(", ")}\n  Data: ${JSON.stringify(rows)}`).join("\n")}\n`
    : "";

  return `Generate ONLY the test class file for ${framework}.

PAGE OBJECT: ${pageObjectFilename} (already generated — import and use it)
BASE URL: ${baseUrl}

AVAILABLE PAGE OBJECT METHODS (use ONLY these — never call driver.find_element or page.locator directly):
${pageObjectApi}
${netSection}${customSection}${datasetSection}
TEST CASES (${slim.length}):
${JSON.stringify(slim, null, 2)}

Rules:
- One test method per test case named test_{id}_{snake_title}
- Use ONLY the page object methods listed above for all interactions
- Assertions: WebDriverWait + EC (Selenium) or expect() (Playwright) — no time.sleep
- Test data from TEST_DATA/testData imports — no hardcoded credentials
- Each test is fully independent (setup in setup_method / beforeEach)
- If customAssertions are present in a test case, inject them at the end of that test method

Respond with ONLY this JSON (no markdown fences):
{"tests":{"filename":"${filename}","content":"<full test class with all imports>"}}`;
}

// ─────────────────────────────────────────────────────────────────────────────

function buildScriptPrompt(testCases, pageData, framework, customAssertions, networkCalls, datasetsMap) {
  const pageType = pageData?.meta?.pageType || "page";
  const pageUrl  = pageData?.meta?.url || "https://example.com";
  const className = toPascalCase(pageType);
  const signals  = extractPageSignals(pageData);

  // Collect flaky elements from scan data
  const flakyElements = [
    ...(pageData?.buttons || []).filter(b => b.flaky),
    ...(pageData?.inputs || []).filter(i => i.flaky),
    ...((pageData?.forms || []).flatMap(f => (f.fields || []).filter(fi => fi.flaky))),
  ];

  const fwConfig = {
    "selenium-python": {
      lang: "Python", runner: "pytest", ext: "py",
      configFile: "pytest.ini", baseClass: "BaseTest",
      imports: "from selenium import webdriver\nfrom selenium.webdriver.common.by import By\nfrom selenium.webdriver.support.ui import WebDriverWait\nfrom selenium.webdriver.support import expected_conditions as EC",
    },
    "selenium-java": {
      lang: "Java", runner: "TestNG", ext: "java",
      configFile: "testng.xml", baseClass: "BaseTest",
      imports: "import org.openqa.selenium.*;\nimport org.openqa.selenium.chrome.ChromeDriver;\nimport org.openqa.selenium.support.ui.*;\nimport org.testng.annotations.*;",
    },
    "playwright-python": {
      lang: "Python", runner: "pytest-playwright", ext: "py",
      configFile: "pytest.ini", baseClass: "BaseTest",
      imports: "import pytest\nfrom playwright.sync_api import Page, expect",
    },
    "playwright-typescript": {
      lang: "TypeScript", runner: "Playwright Test", ext: "ts",
      configFile: "playwright.config.ts", baseClass: "",
      imports: "import { test, expect, Page } from '@playwright/test';",
    },
  };

  const cfg = fwConfig[framework] || fwConfig["selenium-python"];
  const ext = cfg.ext;

  // Only send approved test cases, slimmed down.
  // Embed any assertions the user pinned to a specific TC directly on that TC object
  // so the AI has unambiguous per-method injection instructions.
  const slimCases = testCases.map(tc => {
    const pinned = (customAssertions || []).filter(a => a.tcId === tc.id);
    const entry = {
      id: tc.id,
      title: tc.title,
      priority: tc.priority,
      preconditions: tc.preconditions,
      steps: tc.steps,
      expectedResult: tc.expectedResult,
      locators: tc.locators,
      testData: tc.testData,
    };
    if (pinned.length > 0) {
      entry.customAssertions = pinned.map(a => ({
        type: a.type, locator: a.locator, value: a.value, attrName: a.attrName,
      }));
    }
    return entry;
  });

  // Assertions not pinned to a TC — AI still tries to match by locator (legacy behaviour)
  const globalAssertions = (customAssertions || []).filter(a => !a.tcId);

  // Build page signals section for the prompt
  const signalsSection = `
REAL PAGE DOM SIGNALS (extracted from live scan — use ONLY these selectors, never guess):
- Current page URL path: ${signals.urlPath}
${signals.errorEls.length   ? `- Error/validation elements found: ${JSON.stringify(signals.errorEls)}` : "- No error elements found in scan (use URL change or element disappearance to detect errors)"}
${signals.alertEls.length   ? `- Alert/notification elements: ${JSON.stringify(signals.alertEls)}` : ""}
${signals.successEls.length ? `- Success indicator elements: ${JSON.stringify(signals.successEls)}` : ""}
- All confirmed selectors on page (data-test / id): ${JSON.stringify(signals.allSelectors)}

ASSERTION RULES based on real DOM:
- SUCCESS after form submit: use EC.url_contains("${signals.urlPath.split("/").filter(Boolean).pop() || ""}") OR EC.visibility_of_element_located() for a known post-action element
- ERROR after form submit: use ${signals.errorEls[0]?.sel || signals.alertEls[0]?.sel ? `EC.visibility_of_element_located((By.CSS_SELECTOR, "${signals.errorEls[0]?.sel || signals.alertEls[0]?.sel}"))` : "EC.url_contains() to confirm page did not change, or presence of form still on page"}
- NEVER use EC.title_contains() unless the page title is confirmed above
- ONLY use selectors from the "confirmed selectors" list above
`;

  return `Generate a complete, production-ready ${framework} automation test suite.

FRAMEWORK: ${framework}
LANGUAGE: ${cfg.lang}
TEST RUNNER: ${cfg.runner}
PAGE TYPE: ${pageType}
BASE URL: ${pageUrl}
PAGE CLASS NAME: ${className}Page
${signalsSection}
TEST CASES (${slimCases.length} total):
${JSON.stringify(slimCases, null, 2)}
${globalAssertions.length ? `
CUSTOM ASSERTIONS (user-defined, no specific TC pinned — inject in the most relevant test method by matching locator):
${globalAssertions.map((a, i) => {
  const typeMap = { text_equals: "assert element text equals", is_visible: "assert element is visible", not_exists: "assert element does NOT exist", attr_equals: `assert attribute '${a.attrName}' equals`, url_contains: "assert page URL contains", count_equals: "assert element count equals" };
  return `${i+1}. ${typeMap[a.type] || a.type} — locator: ${a.locator}${a.value ? ` — expected: "${a.value}"` : ""}`;
}).join("\n")}
` : ""}
- Any test case with a "customAssertions" array in the TEST CASES JSON above MUST inject those assertions at the end of that specific test method — these are user-verified and override AI-guessed assertions for that step
${networkCalls?.length ? `
NETWORK / API ASSERTIONS (captured from real browser interactions — MUST assert these in tests):
${networkCalls.map((n, i) => {
  const urlObj = (() => { try { return new URL(n.url); } catch { return null; } })();
  const path = urlObj ? urlObj.pathname : n.url;
  return `${i+1}. ${n.method} ${path} → expected status ${n.statusCode}`;
}).join("\n")}
Framework-specific assertion patterns to use:
${framework === "playwright-typescript" ? `- const resp = await page.waitForResponse(r => r.url().includes('PATH') && r.request().method() === 'METHOD'); expect(resp.status()).toBe(STATUS);` : ""}
${framework === "playwright-python" ? `- with page.expect_response(lambda r: 'PATH' in r.url and r.request.method == 'METHOD') as resp_info:\n    # trigger action\nassert resp_info.value.status == STATUS` : ""}
${framework === "selenium-python" ? `# REST Assured-style API assertion (add as comment + requests snippet):\n# import requests\n# response = requests.METHOD('BASE_URL/PATH')\n# assert response.status_code == STATUS` : ""}
${framework === "selenium-java" ? `// REST Assured assertion:\n// given().when().METHOD("BASE_URL/PATH").then().statusCode(STATUS);` : ""}
- Add network assertions in the test method that triggers the relevant API call
` : ""}
${datasetsMap && Object.keys(datasetsMap).length > 0 ? `
DATA-DRIVEN DATASETS (MUST parametrize these test methods):
${Object.entries(datasetsMap).map(([tcId, rows]) => {
  const keys = Object.keys(rows[0] || {});
  const paramName = framework.includes("java") ? "@DataProvider" : framework.includes("typescript") ? "test.each" : "@pytest.mark.parametrize";
  return `Test ${tcId}: ${rows.length} dataset rows | Keys: ${keys.join(", ")}\n  Datasets: ${JSON.stringify(rows)}\n  Use ${paramName} to run this test ${rows.length} times, once per row`;
}).join("\n")}
- Wrap ONLY the listed test methods with the parametrize decorator/annotation
- Use the dataset keys as method parameters and substitute them in place of hardcoded values
` : ""}
${pageData?.iframes?.filter(f => f.elements?.length > 0).length > 0 ? `
IFRAME ELEMENTS (must use frame-switching locators):
${pageData.iframes.filter(f => f.elements?.length > 0).map(f =>
  `iFrame: ${f.locator} (${f.elements.length} elements)\n  ${framework.includes("playwright") ? `Playwright: page.frameLocator('${f.locator}').locator(...)` : `Selenium: driver.switch_to.frame("${f.name || f.locator}") → find element → driver.switch_to.default_content()`}`
).join("\n")}
` : ""}
${pageData?.shadowElements?.filter(s => s.elements?.length > 0).length > 0 ? `
SHADOW DOM ELEMENTS (use piercing selectors):
${pageData.shadowElements.filter(s => s.elements?.length > 0).map(s =>
  `Host: ${s.host} → elements: ${s.elements.map(e => e.locator).join(", ")}\n  ${framework.includes("playwright") ? `Playwright: page.locator('${s.host} >> ${s.elements[0]?.locator || "input"}')` : `Selenium: driver.execute_script("return document.querySelector('${s.host}').shadowRoot.querySelector('...')")`}`
).join("\n")}
` : ""}
IMPORTANT — DO NOT generate base_test.py or config files. They are handled by templates.
Generate ONLY these 3 files. Use proper ${cfg.lang} syntax throughout.

Requirements:
- Follow Page Object Model (POM) strictly — no locators in test files
- Use explicit waits (WebDriverWait / page.wait_for / expect) — NO time.sleep
- Add docstrings/comments for every method and test
- Include ALL locators from test cases in the Page Object as class-level constants
- Parameterise test data — no hardcoded values in tests
- Each test must be independent (no shared state)
- ONLY use selectors confirmed in the DOM signals above — never guess
- For success: use EC.url_contains() or EC.visibility_of_element_located()
- For errors: use EC.visibility_of_element_located() with the real error selector from DOM signals
${flakyElements.length > 0 ? `- FLAKINESS WARNING: ${flakyElements.length} element(s) have unstable locators. For each flaky locator used, add a comment: # FLAKY: consider replacing with data-testid or stable attribute\n  Flaky locators: ${flakyElements.map(e => e.locator).join(", ")}` : ""}
${framework === "selenium-python" ? `- test_*.py imports are provided by template — DO NOT repeat them, just write the class body` : ""}

Respond ONLY with this JSON (no markdown fences, no extra text):
{
  "pageObject": {
    "filename": "${pageType.toLowerCase()}_page.${ext}",
    "content": "Page Object class with ALL locators as class constants and action methods"
  },
  "testData": {
    "filename": "test_data.${ext}",
    "content": "All test data including valid inputs, invalid inputs, boundary values"
  },
  "tests": {
    "filename": "test_${pageType.toLowerCase()}.${ext}",
    "content": "Full test class with one test method per test case, using POM — include all imports at top"
  }
}`;
}

// ─── Performance Assertion Script (template-based) ────────────────────────────

function buildPerformanceScript(pageData, framework) {
  const pageType = (pageData?.meta?.pageType || "page").toLowerCase();
  const url = pageData?.meta?.url || "https://example.com";
  const perf = pageData.performance || {};
  const loadThreshold  = perf.suggestedThresholds?.loadTime  || 3000;
  const fcpThreshold   = perf.suggestedThresholds?.fcp       || 2500;
  const ttfbThreshold  = perf.suggestedThresholds?.ttfb      || 800;

  if (framework === "playwright-typescript") {
    return {
      filename: `test-performance-${pageType}.spec.ts`,
      content: `import { test, expect } from '@playwright/test';

/**
 * Performance Assertion Tests — ${pageType}
 * Measured baseline: Load=${perf.loadTime || "N/A"}ms, FCP=${perf.fcp || "N/A"}ms, TTFB=${perf.ttfb || "N/A"}ms
 * Thresholds: Load<${loadThreshold}ms, FCP<${fcpThreshold}ms, TTFB<${ttfbThreshold}ms
 */

test.describe('Performance SLA — ${pageType}', () => {
  test('page load time is within SLA', async ({ page }) => {
    const start = Date.now();
    await page.goto('${url}');
    await page.waitForLoadState('load');
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(${loadThreshold}); // SLA: <${loadThreshold}ms
  });

  test('first contentful paint is within SLA', async ({ page }) => {
    await page.goto('${url}');
    const fcp = await page.evaluate(() => {
      const entry = performance.getEntriesByName('first-contentful-paint')[0];
      return entry ? Math.round(entry.startTime) : null;
    });
    if (fcp !== null) expect(fcp).toBeLessThan(${fcpThreshold}); // SLA: <${fcpThreshold}ms
  });

  test('time to first byte is within SLA', async ({ page }) => {
    await page.goto('${url}');
    const ttfb = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return nav ? Math.round(nav.responseStart - nav.startTime) : null;
    });
    if (ttfb !== null) expect(ttfb).toBeLessThan(${ttfbThreshold}); // SLA: <${ttfbThreshold}ms
  });
});`,
    };
  }

  if (framework === "playwright-python") {
    return {
      filename: `test_performance_${pageType}.py`,
      content: `"""
Performance Assertion Tests — ${pageType}
Measured baseline: Load=${perf.loadTime || "N/A"}ms, FCP=${perf.fcp || "N/A"}ms, TTFB=${perf.ttfb || "N/A"}ms
Thresholds: Load<${loadThreshold}ms, FCP<${fcpThreshold}ms, TTFB<${ttfbThreshold}ms
"""
import time
import pytest
from playwright.sync_api import Page

LOAD_THRESHOLD_MS  = ${loadThreshold}
FCP_THRESHOLD_MS   = ${fcpThreshold}
TTFB_THRESHOLD_MS  = ${ttfbThreshold}
PAGE_URL = '${url}'


def test_page_load_time(page: Page):
    """Page load time must be within SLA."""
    start = time.time()
    page.goto(PAGE_URL)
    page.wait_for_load_state('load')
    load_ms = (time.time() - start) * 1000
    assert load_ms < LOAD_THRESHOLD_MS, f"Load time {load_ms:.0f}ms exceeds SLA of {LOAD_THRESHOLD_MS}ms"


def test_first_contentful_paint(page: Page):
    """FCP must be within SLA."""
    page.goto(PAGE_URL)
    fcp = page.evaluate("""() => {
      const entry = performance.getEntriesByName('first-contentful-paint')[0];
      return entry ? Math.round(entry.startTime) : null;
    }""")
    if fcp is not None:
        assert fcp < FCP_THRESHOLD_MS, f"FCP {fcp}ms exceeds SLA of {FCP_THRESHOLD_MS}ms"


def test_time_to_first_byte(page: Page):
    """TTFB must be within SLA."""
    page.goto(PAGE_URL)
    ttfb = page.evaluate("""() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return nav ? Math.round(nav.responseStart - nav.startTime) : null;
    }""")
    if ttfb is not None:
        assert ttfb < TTFB_THRESHOLD_MS, f"TTFB {ttfb}ms exceeds SLA of {TTFB_THRESHOLD_MS}ms"`,
    };
  }

  // Selenium fallback (Python or Java — uses JS executor)
  if (framework === "selenium-java") {
    return {
      filename: `PerformanceTest${toPascalCase(pageType)}.java`,
      content: `/**
 * Performance Assertion Tests — ${pageType}
 * Measured baseline: Load=${perf.loadTime || "N/A"}ms, FCP=${perf.fcp || "N/A"}ms, TTFB=${perf.ttfb || "N/A"}ms
 */
import org.openqa.selenium.*;
import org.openqa.selenium.chrome.ChromeDriver;
import org.testng.Assert;
import org.testng.annotations.*;

public class PerformanceTest${toPascalCase(pageType)} {
    private WebDriver driver;
    private static final long LOAD_THRESHOLD_MS = ${loadThreshold};
    private static final long TTFB_THRESHOLD_MS = ${ttfbThreshold};

    @BeforeMethod
    public void setUp() { driver = new ChromeDriver(); }

    @Test
    public void testPageLoadTime() {
        long start = System.currentTimeMillis();
        driver.get("${url}");
        long loadTime = System.currentTimeMillis() - start;
        Assert.assertTrue(loadTime < LOAD_THRESHOLD_MS,
            "Load time " + loadTime + "ms exceeds SLA of " + LOAD_THRESHOLD_MS + "ms");
    }

    @Test
    public void testTimeToFirstByte() {
        driver.get("${url}");
        Long ttfb = (Long) ((JavascriptExecutor) driver).executeScript(
            "const nav = performance.getEntriesByType('navigation')[0]; " +
            "return nav ? Math.round(nav.responseStart - nav.startTime) : null;");
        if (ttfb != null) {
            Assert.assertTrue(ttfb < TTFB_THRESHOLD_MS,
                "TTFB " + ttfb + "ms exceeds SLA of " + TTFB_THRESHOLD_MS + "ms");
        }
    }

    @AfterMethod
    public void tearDown() { if (driver != null) driver.quit(); }
}`,
    };
  }

  // selenium-python
  return {
    filename: `test_performance_${pageType}.py`,
    content: `"""
Performance Assertion Tests — ${pageType}
Measured baseline: Load=${perf.loadTime || "N/A"}ms, FCP=${perf.fcp || "N/A"}ms, TTFB=${perf.ttfb || "N/A"}ms
Thresholds: Load<${loadThreshold}ms, TTFB<${ttfbThreshold}ms
"""
import time
import pytest
from selenium import webdriver

LOAD_THRESHOLD_MS  = ${loadThreshold}
TTFB_THRESHOLD_MS  = ${ttfbThreshold}
PAGE_URL = '${url}'


@pytest.fixture
def driver():
    d = webdriver.Chrome()
    yield d
    d.quit()


def test_page_load_time(driver):
    """Page load time must be within SLA."""
    start = time.time()
    driver.get(PAGE_URL)
    load_ms = (time.time() - start) * 1000
    assert load_ms < LOAD_THRESHOLD_MS, f"Load time {load_ms:.0f}ms exceeds SLA of {LOAD_THRESHOLD_MS}ms"


def test_ttfb(driver):
    """TTFB must be within SLA."""
    driver.get(PAGE_URL)
    ttfb = driver.execute_script(
        "const nav = performance.getEntriesByType('navigation')[0]; "
        "return nav ? Math.round(nav.responseStart - nav.startTime) : null;"
    )
    if ttfb is not None:
        assert ttfb < TTFB_THRESHOLD_MS, f"TTFB {ttfb}ms exceeds SLA of {TTFB_THRESHOLD_MS}ms"`,
  };
}

// ─── Visual Regression Script (template-based, no AI call) ───────────────────

function buildVisualRegressionScript(pageData, framework) {
  const pageType = (pageData?.meta?.pageType || "page").toLowerCase();
  const url = pageData?.meta?.url || "https://example.com";

  if (framework === "playwright-typescript") {
    return {
      filename: `test-visual-${pageType}.spec.ts`,
      content: `import { test, expect } from '@playwright/test';

/**
 * Visual Regression Tests — ${pageType}
 * Run once with --update-snapshots to create baselines.
 * Usage: npx playwright test test-visual-${pageType}.spec.ts
 * Update baselines: npx playwright test test-visual-${pageType}.spec.ts --update-snapshots
 */

test.describe('Visual Regression — ${pageType}', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('${url}');
  });

  test('full page visual snapshot', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('${pageType}-full.png', {
      fullPage: true,
      threshold: 0.1,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('above-the-fold visual snapshot', async ({ page }) => {
    await expect(page).toHaveScreenshot('${pageType}-viewport.png', {
      threshold: 0.05,
    });
  });
});`,
    };
  }

  if (framework === "playwright-python") {
    return {
      filename: `test_visual_${pageType}.py`,
      content: `"""
Visual Regression Tests — ${pageType}
Run once with --snapshot-update to create baselines.
Usage: pytest test_visual_${pageType}.py
Update baselines: pytest test_visual_${pageType}.py --snapshot-update
Requires: pytest-playwright, syrupy
"""
import pytest
from playwright.sync_api import Page


@pytest.fixture
def page_loaded(page: Page):
    page.goto('${url}')
    page.wait_for_load_state('networkidle')
    return page


def test_full_page_snapshot(page_loaded, assert_snapshot):
    """Full page visual regression baseline."""
    assert_snapshot(page_loaded.screenshot(full_page=True), name='${pageType}-full.png')


def test_viewport_snapshot(page_loaded, assert_snapshot):
    """Above-the-fold visual regression baseline."""
    assert_snapshot(page_loaded.screenshot(), name='${pageType}-viewport.png')`,
    };
  }

  if (framework === "selenium-java") {
    return {
      filename: `VisualTest${toPascalCase(pageType)}.java`,
      content: `/**
 * Visual Regression Tests — ${pageType}
 * Uses Percy for visual diff. Requires: io.percy:percy-java-selenium
 * Run: mvn test -Dtest=VisualTest${toPascalCase(pageType)}
 * First run creates baselines in Percy dashboard.
 */
import io.percy.selenium.Percy;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.testng.annotations.*;

public class VisualTest${toPascalCase(pageType)} {
    private WebDriver driver;
    private Percy percy;

    @BeforeMethod
    public void setUp() {
        driver = new ChromeDriver();
        percy = new Percy(driver);
        driver.get("${url}");
    }

    @Test
    public void testFullPageVisual() {
        percy.snapshot("${pageType} - Full Page");
    }

    @Test
    public void testViewportVisual() {
        // Scroll to top first
        ((org.openqa.selenium.JavascriptExecutor) driver).executeScript("window.scrollTo(0, 0)");
        percy.snapshot("${pageType} - Viewport");
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) driver.quit();
    }
}`,
    };
  }

  // selenium-python
  return {
    filename: `test_visual_${pageType}.py`,
    content: `"""
Visual Regression Tests — ${pageType}
Uses pytest-image-snapshot for local diff comparison.
Install: pip install pytest-image-snapshot pillow
Usage: pytest test_visual_${pageType}.py
Update baselines: pytest test_visual_${pageType}.py --snapshot-update
"""
import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options


@pytest.fixture
def driver():
    opts = Options()
    d = webdriver.Chrome(options=opts)
    d.set_window_size(1280, 900)
    d.get('${url}')
    yield d
    d.quit()


def test_full_page_visual(driver, assert_image_snapshot):
    """Full page visual regression baseline."""
    screenshot = driver.get_screenshot_as_png()
    assert_image_snapshot(screenshot, '${pageType}_full.png', threshold=0.02)


def test_viewport_visual(driver, assert_image_snapshot):
    """Viewport visual regression baseline."""
    from selenium.webdriver.common.action_chains import ActionChains
    ActionChains(driver).scroll_by_amount(0, 0).perform()
    screenshot = driver.get_screenshot_as_png()
    assert_image_snapshot(screenshot, '${pageType}_viewport.png', threshold=0.01)`,
  };
}

// ─── Multi-Environment Config Generator ──────────────────────────────────────

function buildEnvironmentConfigs(environments, pageData, framework) {
  const ext = framework.includes("java") ? "json" : framework.includes("typescript") ? "json" : "json";
  const configs = environments.map(env => ({
    name: env.name,
    filename: `env_${env.name.toLowerCase().replace(/\s+/g, "_")}.${ext}`,
    content: JSON.stringify({
      name: env.name,
      baseUrl: env.baseUrl || pageData?.meta?.url || "https://example.com",
      ...(env.vars || {}),
    }, null, 2),
  }));

  const readme = `# Multi-Environment Configuration

## Environments
${environments.map(e => `- **${e.name}**: ${e.baseUrl || pageData?.meta?.url}`).join("\n")}

## Usage
${framework === "selenium-python" ? `\`\`\`bash\nENV=staging pytest\nENV=production pytest\n\`\`\`` : ""}
${framework === "playwright-typescript" ? `\`\`\`bash\nENV=staging npx playwright test\nENV=production npx playwright test\n\`\`\`` : ""}
${framework === "selenium-java" ? `\`\`\`bash\nmvn test -DENV=staging\nmvn test -DENV=production\n\`\`\`` : ""}
${framework === "playwright-python" ? `\`\`\`bash\nENV=staging pytest\nENV=production pytest\n\`\`\`` : ""}

The base class reads the \`ENV\` environment variable and loads the matching \`config/env_<name>.json\` file automatically.`;

  return { configs, readme };
}

function buildJourneyTestPrompt(journey) {
  const steps = slimJourneySteps(journey);

  return `Generate test cases for this ordered multi-page QA journey.

JOURNEY NAME: ${journey.name || "Untitled Journey"}
TOTAL STEPS: ${steps.length}
ORDERED STEPS:
${JSON.stringify(steps, null, 2)}

Requirements:
- Generate both journey-level and step-level test cases
- Journey-level cases must validate complete end-to-end outcomes across multiple pages
- Step-level cases must validate the local page or recorded segment for that step
- Use scope="journey" for end-to-end cases and scope="step" for step cases
- For step cases, include the correct stepId and stepOrder from the provided steps
- Keep output actionable for enterprise-style QA flows such as login, search, cart, checkout, approvals, refunds, or admin actions
- Prefer precise assertions and realistic negative cases
- Use exact step metadata and recorded actions where available

Respond ONLY with valid JSON:
{
  "testCases": [
    {
      "id": "optional",
      "title": "string",
      "category": "functional|negative|e2e|accessibility",
      "caseKind": "flow|step",
      "packs": ["smoke", "regression", "e2e"],
      "priority": "high|medium|low",
      "preconditions": "string",
      "steps": ["step"],
      "expectedResult": "string",
      "locators": {},
      "testData": {},
      "tags": [],
      "scope": "journey|step",
      "stepId": "required for step scope",
      "stepOrder": 1,
      "groupLabel": "optional"
    }
  ]
}`;
}

function buildJourneyScriptPrompt(journey, approvedCases, framework, summary) {
  const ext = framework.includes("java") ? "java" : framework.includes("typescript") ? "ts" : "py";
  const grouped = {
    journeyCases: approvedCases.filter((tc) => tc.scope === "journey").map(slimJourneyCaseForPrompt),
    stepCases: approvedCases.filter((tc) => tc.scope === "step").map(slimJourneyCaseForPrompt),
  };

  return `Generate a multi-page automation bundle for this journey.

FRAMEWORK: ${framework}
JOURNEY NAME: ${journey.name || "Untitled Journey"}
FULL JOURNEY EXECUTABLE: ${summary.journeyExecutable ? "yes" : "no"}
MISSING TRANSITIONS: ${JSON.stringify(summary.missingTransitions)}
ORDERED STEPS:
${JSON.stringify(slimJourneySteps(journey), null, 2)}
APPROVED TEST CASES:
${JSON.stringify(grouped, null, 2)}

Requirements:
- Return ONLY page objects, journey tests, and step tests in the files array
- Shared base/config/test-data files are injected separately, do not generate them
- Add one page object file per unique page context when possible
- Add separate step test files for the provided step cases
- ${summary.journeyExecutable ? "Add one end-to-end journey test file that stitches all recorded transitions in order" : "Do NOT add a journey group file because recorded transitions are missing; generate step-level files only"}
- Preserve step order in generated tests
- Use recorded transitions as the source of truth for executable navigation
- Keep filenames deterministic and implementation-ready
- For selenium-python:
  - Use Selenium 4 APIs only, never use find_element_by_* or find_elements_by_*
  - Do not locate elements inside page object __init__; store locators and resolve them in methods
  - Tests must either inherit BaseTest or use the shared driver fixture from conftest.py
  - Never depend on a manually preset global driver variable

Respond ONLY with valid JSON:
{
  "files": [
    {
      "filename": "pages/example_page.${ext}",
      "content": "file content",
      "group": "page|journey|step",
      "stepId": "optional"
    }
  ],
  "summary": {
    "journeyExecutable": ${summary.journeyExecutable ? "true" : "false"},
    "notes": ["optional note"]
  }
}`;
}

function slimJourneySteps(journey) {
  return (journey.steps || []).map((step, index) => ({
    id: step.id,
    order: step.order || index + 1,
    title: step.title,
    url: step.url,
    path: step.path,
    pageType: step.pageType,
    source: step.source,
    transitionStatus: step.transitionStatus,
    notes: step.notes || "",
    keyForms: slimStepForms(step.pageData),
    keyButtons: slimStepButtons(step.pageData),
    recordedSteps: (step.recordedSteps || []).slice(0, 10),
  }));
}

function slimStepForms(pageData) {
  return (pageData?.forms || []).slice(0, 3).map((form) => ({
    purpose: form.purpose,
    fields: (form.fields || []).slice(0, 6).map((field) => ({
      label: field.label,
      type: field.type,
      required: field.required,
      locator: field.locator,
    })),
    submitButton: form.submitButton?.text || null,
  }));
}

function slimStepButtons(pageData) {
  return (pageData?.buttons || []).slice(0, 8).map((button) => ({
    text: button.text,
    action: button.action,
    locator: button.locator,
  }));
}

function slimJourneyCaseForPrompt(testCase) {
  return {
    id: testCase.id,
    title: testCase.title,
    scope: testCase.scope,
    stepId: testCase.stepId || null,
    stepOrder: testCase.stepOrder || null,
    preconditions: testCase.preconditions || "",
    steps: testCase.steps || [],
    expectedResult: testCase.expectedResult || "",
    tags: testCase.tags || [],
  };
}

function normalizeJourneyTestCases(testCases, journey) {
  const stepMap = new Map((journey.steps || []).map((step, index) => [
    step.id,
    {
      ...step,
      order: step.order || index + 1,
    },
  ]));
  const seen = new Set();
  let journeyCount = 0;
  let stepCount = 0;

  return testCases.reduce((acc, raw, index) => {
    const scope = raw.scope === "step" ? "step" : "journey";
    const step =
      scope === "step"
        ? stepMap.get(raw.stepId) ||
          [...stepMap.values()].find((candidate) => candidate.order === Number(raw.stepOrder)) ||
          [...stepMap.values()][index % Math.max(stepMap.size, 1)]
        : null;

    if (scope === "journey") journeyCount += 1;
    if (scope === "step") stepCount += 1;

    const fallbackCaseKind = scope === "journey" ? "flow" : "step";
    const caseKind = normalizeGeneratedCaseKind(raw, fallbackCaseKind);
    let packs = normalizeGeneratedPacks(raw, caseKind);
    if (scope === "journey" && !packs.length) packs = normalizePackMembership(caseKind, ["e2e"]);
    const normalized = {
      id:
        raw.id ||
        (scope === "journey"
          ? `JY${String(journeyCount).padStart(3, "0")}`
          : `ST${String(stepCount).padStart(3, "0")}`),
      title:
        raw.title ||
        (scope === "journey"
          ? `Journey validation ${journeyCount}`
          : `Step ${step?.order || 1} validation ${stepCount}`),
      category: normalizeGeneratedCategory(raw.category, caseKind, packs),
      priority: raw.priority || "medium",
      preconditions: raw.preconditions || "",
      steps: Array.isArray(raw.steps) ? raw.steps : [],
      expectedResult: raw.expectedResult || raw.expected_result || "",
      locators: raw.locators || {},
      testData: raw.testData || raw.test_data || {},
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      approved: raw.approved !== false,
      caseKind,
      packs,
      suite: deriveLegacySuite(caseKind, packs),
      scope,
      stepId: scope === "step" ? step?.id || raw.stepId || null : null,
      stepOrder: scope === "step" ? step?.order || Number(raw.stepOrder) || null : null,
      source: raw.source || (scope === "journey" || scope === "step" ? "recording" : "page"),
      groupLabel:
        scope === "journey"
          ? "Journey Cases"
          : raw.groupLabel || `Step ${step?.order || raw.stepOrder || 1} — ${step?.title || "Recorded Step"}`,
    };

    const key = `${normalized.scope}|${normalized.stepId || "journey"}|${normalized.title.toLowerCase()}`;
    if (seen.has(key)) return acc;
    seen.add(key);
    acc.push(normalized);
    return acc;
  }, []);
}

function buildJourneyGenerationSummary(journey) {
  const missingTransitions = (journey.steps || [])
    .filter((step, index) => index > 0 && step.transitionStatus !== "recorded")
    .map((step, index) => ({
      stepId: step.id,
      order: step.order || index + 2,
      title: step.title,
      url: step.url,
    }));

  return {
    journeyExecutable: missingTransitions.length === 0,
    missingTransitions,
    totalSteps: journey.steps?.length || 0,
  };
}

function normalizeJourneyScriptBundle(bundle, framework, journey, approvedCases, summary) {
  const rawFiles = Array.isArray(bundle?.files) ? bundle.files : [];
  let files = rawFiles
    .filter((file) => file?.filename && file?.content)
    .map((file) => ({
      filename: String(file.filename).replace(/^\/+/, ""),
      content: String(file.content),
      group: ["page", "journey", "step", "shared"].includes(file.group) ? file.group : inferJourneyFileGroup(file.filename),
      stepId: file.stepId || null,
    }))
    .filter((file) => summary.journeyExecutable || file.group !== "journey");

  if (framework === "selenium-python") {
    files = files.map((file) => stabilizeSeleniumPythonJourneyFile(file));
  }

  const deduped = [];
  const seen = new Set();
  for (const file of files) {
    if (seen.has(file.filename)) continue;
    seen.add(file.filename);
    deduped.push(file);
  }

  const withShared = ensureJourneySharedFiles(deduped, framework, journey, approvedCases);
  return {
    framework,
    files: withShared.sort(sortJourneyFiles),
    summary: {
      journeyExecutable: summary.journeyExecutable,
      missingTransitions: summary.missingTransitions,
      notes: Array.isArray(bundle?.summary?.notes) ? bundle.summary.notes : [],
    },
  };
}

function inferJourneyFileGroup(filename = "") {
  const lower = filename.toLowerCase();
  if (lower.includes("page")) return "page";
  if (lower.includes("journey")) return "journey";
  if (lower.includes("step")) return "step";
  return "step";
}

function sortJourneyFiles(a, b) {
  const order = { shared: 0, page: 1, journey: 2, step: 3 };
  return (order[a.group] ?? 9) - (order[b.group] ?? 9) || a.filename.localeCompare(b.filename);
}

function ensureJourneySharedFiles(files, framework, journey, approvedCases) {
  const result = [...files];
  const existing = new Set(result.map((file) => file.filename));

  buildJourneySharedFiles(framework, journey, approvedCases).forEach((file) => {
    if (existing.has(file.filename)) return;
    result.push(file);
    existing.add(file.filename);
  });

  return result;
}

function stabilizeSeleniumPythonJourneyFile(file) {
  if (!file?.filename?.endsWith(".py")) return file;

  let content = normalizeLegacySeleniumPythonCalls(file.content);
  content = file.group === "page"
    ? hardenSeleniumPythonPageObject(content)
    : hardenSeleniumPythonTestFile(content);

  return { ...file, content };
}

function normalizeLegacySeleniumPythonCalls(content) {
  const replacements = [
    [/(\b[\w.]+)\.find_elements_by_css_selector\((.+?)\)/g, "$1.find_elements(By.CSS_SELECTOR, $2)"],
    [/(\b[\w.]+)\.find_element_by_css_selector\((.+?)\)/g, "$1.find_element(By.CSS_SELECTOR, $2)"],
    [/(\b[\w.]+)\.find_elements_by_xpath\((.+?)\)/g, "$1.find_elements(By.XPATH, $2)"],
    [/(\b[\w.]+)\.find_element_by_xpath\((.+?)\)/g, "$1.find_element(By.XPATH, $2)"],
    [/(\b[\w.]+)\.find_elements_by_id\((.+?)\)/g, "$1.find_elements(By.ID, $2)"],
    [/(\b[\w.]+)\.find_element_by_id\((.+?)\)/g, "$1.find_element(By.ID, $2)"],
    [/(\b[\w.]+)\.find_elements_by_name\((.+?)\)/g, "$1.find_elements(By.NAME, $2)"],
    [/(\b[\w.]+)\.find_element_by_name\((.+?)\)/g, "$1.find_element(By.NAME, $2)"],
    [/(\b[\w.]+)\.find_elements_by_class_name\((.+?)\)/g, "$1.find_elements(By.CLASS_NAME, $2)"],
    [/(\b[\w.]+)\.find_element_by_class_name\((.+?)\)/g, "$1.find_element(By.CLASS_NAME, $2)"],
    [/(\b[\w.]+)\.find_elements_by_link_text\((.+?)\)/g, "$1.find_elements(By.LINK_TEXT, $2)"],
    [/(\b[\w.]+)\.find_element_by_link_text\((.+?)\)/g, "$1.find_element(By.LINK_TEXT, $2)"],
    [/(\b[\w.]+)\.find_elements_by_partial_link_text\((.+?)\)/g, "$1.find_elements(By.PARTIAL_LINK_TEXT, $2)"],
    [/(\b[\w.]+)\.find_element_by_partial_link_text\((.+?)\)/g, "$1.find_element(By.PARTIAL_LINK_TEXT, $2)"],
    [/(\b[\w.]+)\.find_elements_by_tag_name\((.+?)\)/g, "$1.find_elements(By.TAG_NAME, $2)"],
    [/(\b[\w.]+)\.find_element_by_tag_name\((.+?)\)/g, "$1.find_element(By.TAG_NAME, $2)"],
  ];

  return replacements.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), content);
}

function hardenSeleniumPythonPageObject(content) {
  let next = content;
  if (
    next.includes("self.driver.find_element(") ||
    next.includes("self.driver.find_elements(") ||
    next.includes("resolve_driver(")
  ) {
    next = ensurePythonImport(next, "from selenium.webdriver.common.by import By");
    next = ensurePythonImport(next, "from base_test import LazyElement, LazyElements, resolve_driver");
  }

  next = next.replace(/super\(\)\.__init__\(\s*driver\s*\)/g, "super().__init__(resolve_driver(driver))");
  next = next.replace(/^(\s*)self\.driver\s*=\s*driver\s*$/gm, "$1self.driver = resolve_driver(driver)");
  next = next.replace(
    /^(\s*)self\.(\w+)\s*=\s*self\.driver\.find_elements\(\s*By\.([A-Z_]+)\s*,\s*(.+)\)\s*$/gm,
    "$1self.$2 = LazyElements(lambda: self.driver, By.$3, $4)"
  );
  next = next.replace(
    /^(\s*)self\.(\w+)\s*=\s*self\.driver\.find_element\(\s*By\.([A-Z_]+)\s*,\s*(.+)\)\s*$/gm,
    "$1self.$2 = LazyElement(lambda: self.driver, By.$3, $4)"
  );

  return next;
}

function hardenSeleniumPythonTestFile(content) {
  let next = content;
  next = ensurePythonImport(next, "from selenium.webdriver.common.by import By");
  next = ensurePythonImport(next, "from base_test import DeferredDriverProxy");

  if (!next.includes("driver = DeferredDriverProxy()")) {
    next = insertPythonAfterImports(next, "driver = DeferredDriverProxy()");
  }

  return next;
}

function ensurePythonImport(content, statement) {
  if (content.includes(statement)) return content;
  return `${statement}\n${content}`;
}

function insertPythonAfterImports(content, line) {
  const importBlock = content.match(/^(?:(?:from\s+\S+\s+import\s+.+|import\s+.+)\n)+/);
  if (!importBlock) return `${line}\n${content}`;
  return `${importBlock[0]}${line}\n${content.slice(importBlock[0].length)}`;
}

function buildJourneySharedFiles(framework, journey, approvedCases) {
  const baseUrl = journey.steps?.[0]?.url || "https://example.com";
  const safeJourneyName = toPascalCase(journey.name || "Journey");
  const files = [];

  if (framework === "selenium-python") {
    files.push({
      filename: "base_test.py",
      group: "shared",
      content: `from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


_ACTIVE_DRIVER = None


def set_active_driver(driver):
    global _ACTIVE_DRIVER
    _ACTIVE_DRIVER = driver
    return driver


def get_active_driver():
    return _ACTIVE_DRIVER


def resolve_driver(driver=None):
    return driver or _ACTIVE_DRIVER


class DeferredDriverProxy:
    def _resolve(self):
        driver = resolve_driver()
        if driver is None:
            raise RuntimeError("QA Deck could not resolve an active Selenium driver for this generated file.")
        return driver

    def __getattr__(self, name):
        return getattr(self._resolve(), name)


class LazyElement:
    def __init__(self, driver_ref, by, value):
        self._driver_ref = driver_ref
        self._by = by
        self._value = value

    def _resolve(self):
        driver = resolve_driver(self._driver_ref() if callable(self._driver_ref) else self._driver_ref)
        if driver is None:
            raise RuntimeError("QA Deck could not resolve an active Selenium driver for this page object.")
        return WebDriverWait(driver, 10).until(EC.presence_of_element_located((self._by, self._value)))

    def __getattr__(self, name):
        return getattr(self._resolve(), name)


class LazyElements:
    def __init__(self, driver_ref, by, value):
        self._driver_ref = driver_ref
        self._by = by
        self._value = value

    def _resolve(self):
        driver = resolve_driver(self._driver_ref() if callable(self._driver_ref) else self._driver_ref)
        if driver is None:
            raise RuntimeError("QA Deck could not resolve an active Selenium driver for this page object.")
        return WebDriverWait(driver, 10).until(lambda d: d.find_elements(self._by, self._value))

    def __iter__(self):
        return iter(self._resolve())

    def __getitem__(self, item):
        return self._resolve()[item]

    def __len__(self):
        return len(self._resolve())


class BaseTest:
    """Shared Selenium setup for QA Deck journeys."""

    def __init__(self, driver=None):
        self.driver = resolve_driver(driver)
        self.wait = WebDriverWait(self.driver, 10) if self.driver else None

    def setup_method(self):
        options = Options()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        self.driver = set_active_driver(webdriver.Chrome(options=options))
        self.driver.maximize_window()
        self.wait = WebDriverWait(self.driver, 10)
        self.driver.get("${baseUrl}")

    def teardown_method(self):
        if getattr(self, "driver", None):
            self.driver.quit()
        set_active_driver(None)
`,
    });
    files.push({
      filename: "conftest.py",
      group: "shared",
      content: `import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

from base_test import set_active_driver


@pytest.fixture(scope="function")
def driver():
    options = Options()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    driver = set_active_driver(webdriver.Chrome(options=options))
    driver.maximize_window()
    driver.get("${baseUrl}")
    yield driver
    driver.quit()
    set_active_driver(None)
`,
    });
    files.push({
      filename: "pytest.ini",
      group: "shared",
      content: `[pytest]
addopts = -v --tb=short --junit-xml=report.xml
testpaths = tests
`,
    });
    files.push({
      filename: "test_data.py",
      group: "shared",
      content: buildJourneyTestDataContent(framework, journey, approvedCases),
    });
  } else if (framework === "playwright-python") {
    files.push({
      filename: "conftest.py",
      group: "shared",
      content: `import pytest
from playwright.sync_api import sync_playwright


@pytest.fixture(scope="function")
def page():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto("${baseUrl}")
        yield page
        context.close()
        browser.close()
`,
    });
    files.push({
      filename: "pytest.ini",
      group: "shared",
      content: `[pytest]
addopts = -v --tb=short --junit-xml=report.xml
testpaths = tests
`,
    });
    files.push({
      filename: "test_data.py",
      group: "shared",
      content: buildJourneyTestDataContent(framework, journey, approvedCases),
    });
  } else if (framework === "playwright-typescript") {
    files.push({
      filename: "journey_base.ts",
      group: "shared",
      content: `import { Page, expect } from '@playwright/test';

export class JourneyBase {
  constructor(public page: Page) {}

  async open(path = '/') {
    await this.page.goto(path);
  }
}
`,
    });
    files.push({
      filename: "playwright.config.ts",
      group: "shared",
      content: `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: '${baseUrl}',
    headless: false,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['html'], ['junit', { outputFile: 'report.xml' }]],
});
`,
    });
    files.push({
      filename: "test_data.ts",
      group: "shared",
      content: buildJourneyTestDataContent(framework, journey, approvedCases),
    });
  } else if (framework === "selenium-java") {
    files.push({
      filename: "BaseTest.java",
      group: "shared",
      content: `import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;

import java.time.Duration;

public class BaseTest {
    protected WebDriver driver;
    protected WebDriverWait wait;

    @BeforeMethod
    public void setUp() {
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--no-sandbox", "--disable-dev-shm-usage");
        driver = new ChromeDriver(options);
        driver.manage().window().maximize();
        wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        driver.get("${baseUrl}");
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) driver.quit();
    }
}
`,
    });
    files.push({
      filename: "testng.xml",
      group: "shared",
      content: `<!DOCTYPE suite SYSTEM "https://testng.org/testng-1.0.dtd" >
<suite name="${safeJourneyName}Suite">
  <test name="${safeJourneyName}Journey">
    <classes>
      <class name="Test${safeJourneyName}Journey" />
    </classes>
  </test>
</suite>
`,
    });
    files.push({
      filename: "test_data.json",
      group: "shared",
      content: buildJourneyTestDataContent(framework, journey, approvedCases),
    });
  }

  return files;
}

function buildJourneyTestDataContent(framework, journey, approvedCases) {
  const payload = {
    journeyName: journey.name || "Untitled Journey",
    baseUrl: journey.steps?.[0]?.url || "https://example.com",
    steps: (journey.steps || []).map((step) => ({
      order: step.order,
      title: step.title,
      url: step.url,
      pageType: step.pageType,
      notes: step.notes || "",
    })),
    approvedCases: approvedCases.map((testCase) => ({
      id: testCase.id,
      title: testCase.title,
      scope: testCase.scope,
      stepId: testCase.stepId || null,
    })),
  };

  if (framework === "playwright-typescript") {
    return `export const journeyData = ${JSON.stringify(payload, null, 2)};\n`;
  }

  if (framework === "selenium-java") {
    return JSON.stringify(payload, null, 2);
  }

  return `journey_data = ${toPythonLiteral(payload)}\n`;
}

function toPythonLiteral(value) {
  return JSON.stringify(value, null, 2)
    .replace(/\btrue\b/g, "True")
    .replace(/\bfalse\b/g, "False")
    .replace(/\bnull\b/g, "None");
}

// ─── BDD / Gherkin Generator ──────────────────────────────────────────────────

async function handleGenerateBDDScript(testCases, pageData, framework, apiKey, res) {
  console.log(`[Generate BDD] Framework: ${framework} | Test cases: ${testCases.length}`);

  const prompt = buildBDDPrompt(testCases, pageData, framework);
  const result = await callAI(apiKey, prompt, 6144,
    "You are a senior QA automation engineer expert in BDD testing. Generate production-ready Gherkin feature files and step definitions. Respond ONLY with valid JSON — no markdown fences, no extra text.");

  if (!result.success) return jsonResponse(res, 502, { error: result.error });

  let scripts;
  try {
    const clean = sanitizeAiJson(result.text);
    scripts = JSON.parse(clean);
    if (!scripts.feature?.content || !scripts.steps?.content) {
      throw new Error("Missing required BDD files: feature and/or steps");
    }
  } catch (err) {
    console.error("[BDD Parse Error]", err.message);
    return jsonResponse(res, 502, { error: "Failed to parse BDD response", detail: err.message });
  }

  // Inject template-driven hooks/environment file (never AI-generated)
  scripts.hooks = buildBDDHooks(framework, pageData?.meta?.url || "https://example.com");

  console.log(`[Generate BDD] ✓ feature + steps + hooks generated`);
  jsonResponse(res, 200, { success: true, scripts });
}

function buildBDDPrompt(testCases, pageData, framework) {
  const pageType  = pageData?.meta?.pageType || "page";
  const pageUrl   = pageData?.meta?.url || "https://example.com";
  const className = toPascalCase(pageType);
  const signals   = extractPageSignals(pageData);

  const bddConfig = {
    "selenium-python":    { runner: "Behave",              stepImport: "from behave import given, when, then, step",                        stepExt: "py",   driverSetup: "context.driver" },
    "selenium-java":      { runner: "Cucumber-JVM (TestNG)",stepImport: "import io.cucumber.java.en.*;",                                     stepExt: "java", driverSetup: "SharedContext.driver" },
    "playwright-python":  { runner: "pytest-bdd",           stepImport: "from pytest_bdd import scenarios, given, when, then\nimport pytest", stepExt: "py",   driverSetup: "page" },
    "playwright-typescript": { runner: "@cucumber/cucumber",stepImport: "import { Given, When, Then } from '@cucumber/cucumber';",           stepExt: "ts",   driverSetup: "this.page" },
  };

  const cfg = bddConfig[framework] || bddConfig["selenium-python"];
  const ext = cfg.stepExt;

  const slimCases = testCases.map(tc => ({
    id: tc.id,
    title: tc.title,
    priority: tc.priority,
    steps: tc.steps,
    expectedResult: tc.expectedResult,
    locators: tc.locators || {},
    testData: tc.testData || {},
  }));

  return `Generate a complete BDD test suite in Gherkin format.

FRAMEWORK: ${framework}
BDD RUNNER: ${cfg.runner}
PAGE TYPE: ${pageType}
BASE URL: ${pageUrl}
PAGE CLASS: ${className}Page

REAL PAGE DOM SIGNALS (use ONLY these selectors — never guess):
- Confirmed selectors: ${JSON.stringify(signals.allSelectors)}
- Error elements: ${JSON.stringify(signals.errorEls)}
- Success elements: ${JSON.stringify(signals.successEls)}

TEST CASES TO CONVERT TO BDD (${slimCases.length} total):
${JSON.stringify(slimCases, null, 2)}

REQUIREMENTS:
feature file:
- Use "Feature: ${className}" at the top with a short description
- One "Scenario:" per test case (use the test case title as scenario name)
- Use Given/When/Then/And keywords — plain English, no code
- For data-driven cases: use "Scenario Outline:" with "<param>" and "Examples:" table

steps file:
- Start with: ${cfg.stepImport}
- Implement every step from the feature file
- Use ${cfg.driverSetup} for browser interactions
- Use ONLY confirmed DOM selectors from the signals above
- Use explicit waits — NO sleep() or time.sleep()
- Each step function must match its Gherkin text exactly (regex or exact string)

testData file:
- Constants file with all test values referenced in the feature file

Respond ONLY with this JSON (no markdown, no extra text):
{
  "feature":  { "filename": "${pageType.toLowerCase()}.feature",      "content": "Feature: ..." },
  "steps":    { "filename": "${pageType.toLowerCase()}_steps.${ext}", "content": "step definitions..." },
  "testData": { "filename": "test_data.${ext}",                        "content": "test data constants..." }
}`;
}

function buildBDDHooks(framework, baseUrl) {
  if (framework === "selenium-python") {
    return {
      filename: "environment.py",
      content: `# Behave hooks — setup and teardown
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

BASE_URL = "${baseUrl}"

def before_scenario(context, scenario):
    opts = Options()
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    context.driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()), options=opts
    )
    context.driver.implicitly_wait(10)
    context.base_url = BASE_URL

def after_scenario(context, scenario):
    context.driver.quit()
`,
    };
  }

  if (framework === "selenium-java") {
    return {
      filename: "Hooks.java",
      content: `package hooks;

import io.cucumber.java.After;
import io.cucumber.java.Before;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import steps.SharedContext;

public class Hooks {

    @Before
    public void setUp() {
        ChromeOptions options = new ChromeOptions();
        options.addArguments("--no-sandbox", "--disable-dev-shm-usage");
        SharedContext.driver = new ChromeDriver(options);
        SharedContext.driver.manage().window().maximize();
        SharedContext.baseUrl = "${baseUrl}";
    }

    @After
    public void tearDown() {
        if (SharedContext.driver != null) {
            SharedContext.driver.quit();
        }
    }
}
`,
    };
  }

  if (framework === "playwright-python") {
    return {
      filename: "conftest.py",
      content: `# pytest-bdd conftest — Playwright fixtures
import pytest
from playwright.sync_api import sync_playwright

BASE_URL = "${baseUrl}"

@pytest.fixture(scope="session")
def browser_instance():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        yield browser
        browser.close()

@pytest.fixture
def page(browser_instance):
    context = browser_instance.new_context(base_url=BASE_URL)
    pg = context.new_page()
    yield pg
    context.close()
`,
    };
  }

  // playwright-typescript — @cucumber/cucumber
  return {
    filename: "hooks.ts",
    content: `import { Before, After, setDefaultTimeout, setWorldConstructor } from '@cucumber/cucumber';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

const BASE_URL = '${baseUrl}';

setDefaultTimeout(30 * 1000);

setWorldConstructor(function () {
  this.baseUrl = BASE_URL;
});

Before(async function () {
  const browser: Browser = await chromium.launch({ headless: true });
  const context: BrowserContext = await browser.newContext({ baseURL: BASE_URL });
  this.page = (await context.newPage()) as Page;
  this.browser = browser;
});

After(async function () {
  await this.browser?.close();
});
`,
  };
}

// ─── Accessibility Script Generator ──────────────────────────────────────────

function buildAccessibilityScript(pageData, framework) {
  const acc      = pageData.accessibility || {};
  const issues   = acc.issues || [];
  const url      = pageData.meta?.url || "https://example.com";
  const pageType = (pageData.meta?.pageType || "page").toLowerCase();

  if (framework === "playwright-typescript") {
    const issueChecks = issues.slice(0, 10).map(issue =>
      `  // Verify: ${issue.type} on <${issue.element}>\n` +
      `  expect(violations.find(v => v.id === '${issue.type}')).toBeUndefined();`
    ).join("\n");

    return {
      filename: `accessibility_${pageType}.spec.ts`,
      content: `import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility tests for ${pageType}
 * Generated by QA Deck — uses @axe-core/playwright
 * Install: npm install --save-dev @axe-core/playwright
 */
test.describe('Accessibility — ${pageType}', () => {

  test('no critical or serious violations', async ({ page }) => {
    await page.goto('${url}');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(blocking, \`Critical/serious violations: \${blocking.map(v => v.id).join(', ')}\`).toHaveLength(0);
  });

  test('no moderate violations', async ({ page }) => {
    await page.goto('${url}');
    const results = await new AxeBuilder({ page }).analyze();
    const moderate = results.violations.filter(v => v.impact === 'moderate');
    expect(moderate.length, \`Moderate violations: \${moderate.map(v => v.id).join(', ')}\`).toBe(0);
  });
${issueChecks ? `
  test('specific issues from scan are resolved', async ({ page }) => {
    await page.goto('${url}');
    const results = await new AxeBuilder({ page }).analyze();
    const violations = results.violations;
${issueChecks}
  });` : ""}
${acc.inputsWithoutLabels > 0 ? `
  test('all inputs have accessible labels', async ({ page }) => {
    await page.goto('${url}');
    const results = await new AxeBuilder({ page }).withRules(['label']).analyze();
    expect(results.violations, 'Inputs without labels found').toHaveLength(0);
  });` : ""}

});
`,
    };
  }

  if (framework === "playwright-python") {
    const issueChecks = issues.slice(0, 10).map(issue =>
      `    # Check: ${issue.type} on <${issue.element}>\n` +
      `    assert not any(v["id"] == "${issue.type}" for v in violations), f"Issue not resolved: ${issue.type}"`
    ).join("\n");

    return {
      filename: `test_accessibility_${pageType}.py`,
      content: `"""
Accessibility tests for ${pageType}
Generated by QA Deck — uses axe-playwright-python
Install: pip install axe-playwright-python
"""
import pytest
from axe_playwright_python import Axe


@pytest.fixture(scope="module")
def axe_results(page):
    page.goto("${url}")
    axe = Axe()
    return axe.run(page)


def test_no_critical_violations(axe_results):
    """Assert axe-core reports zero critical violations."""
    critical = [v for v in axe_results["violations"] if v["impact"] == "critical"]
    assert len(critical) == 0, f"Critical violations: {[v['id'] for v in critical]}"


def test_no_serious_violations(axe_results):
    """Assert axe-core reports zero serious violations."""
    serious = [v for v in axe_results["violations"] if v["impact"] == "serious"]
    assert len(serious) == 0, f"Serious violations: {[v['id'] for v in serious]}"
${issueChecks ? `

def test_known_issues_resolved(page):
    """Assert specific issues found during DOM scan are resolved."""
    axe = Axe()
    results = axe.run(page)
    violations = results["violations"]
${issueChecks}` : ""}
${acc.inputsWithoutLabels > 0 ? `

def test_all_inputs_have_labels(axe_results):
    """Assert no inputs are missing accessible labels."""
    label_violations = [v for v in axe_results["violations"] if v["id"] == "label"]
    assert len(label_violations) == 0, f"Inputs without labels: {len(label_violations)} violation(s)"` : ""}
`,
    };
  }

  if (framework === "selenium-java") {
    return {
      filename: `AccessibilityTest.java`,
      content: `package tests;

import com.deque.html.axecore.selenium.AxeBuilder;
import com.deque.html.axecore.results.Results;
import com.deque.html.axecore.results.Rule;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.testng.Assert;
import org.testng.annotations.*;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Accessibility tests for ${pageType}
 * Generated by QA Deck — uses axe-core-maven-html
 * Add to pom.xml: com.deque.html.axe-core:axe-core-maven-html
 */
public class AccessibilityTest {

    private WebDriver driver;

    @BeforeClass
    public void setUp() {
        driver = new ChromeDriver();
        driver.get("${url}");
    }

    @Test
    public void noCriticalViolations() {
        Results results = new AxeBuilder().analyze(driver);
        List<Rule> critical = results.getViolations().stream()
            .filter(r -> "critical".equals(r.getImpact()))
            .collect(Collectors.toList());
        Assert.assertEquals(critical.size(), 0,
            "Critical a11y violations: " + critical.stream().map(Rule::getId).collect(Collectors.joining(", ")));
    }

    @Test
    public void noSeriousViolations() {
        Results results = new AxeBuilder().analyze(driver);
        List<Rule> serious = results.getViolations().stream()
            .filter(r -> "serious".equals(r.getImpact()))
            .collect(Collectors.toList());
        Assert.assertEquals(serious.size(), 0,
            "Serious a11y violations: " + serious.stream().map(Rule::getId).collect(Collectors.joining(", ")));
    }
${acc.inputsWithoutLabels > 0 ? `
    @Test
    public void allInputsHaveLabels() {
        Results results = new AxeBuilder().withRules(java.util.Arrays.asList("label")).analyze(driver);
        Assert.assertEquals(results.getViolations().size(), 0, "Inputs without accessible labels found");
    }` : ""}

    @AfterClass
    public void tearDown() {
        if (driver != null) driver.quit();
    }
}
`,
    };
  }

  // Default: selenium-python
  const issueChecks = issues.slice(0, 10).map(issue =>
    `    # Check: ${issue.type} on <${issue.element}>\n` +
    `    assert not any(v["id"] == "${issue.type}" for v in violations), f"Issue not resolved: ${issue.type}"`
  ).join("\n");

  return {
    filename: `test_accessibility_${pageType}.py`,
    content: `"""
Accessibility tests for ${pageType}
Generated by QA Deck — uses axe-selenium-python
Install: pip install axe-selenium-python
"""
import pytest
from axe_selenium_python import Axe


@pytest.fixture
def axe(driver):
    return Axe(driver)


def test_no_critical_violations(driver, axe):
    """Assert zero critical violations."""
    driver.get("${url}")
    axe.inject()
    results = axe.run()
    critical = [v for v in results["violations"] if v["impact"] == "critical"]
    assert len(critical) == 0, f"Critical violations: {[v['id'] for v in critical]}"


def test_no_serious_violations(driver, axe):
    """Assert zero serious violations."""
    driver.get("${url}")
    axe.inject()
    results = axe.run()
    serious = [v for v in results["violations"] if v["impact"] == "serious"]
    assert len(serious) == 0, f"Serious violations: {[v['id'] for v in serious]}"
${issueChecks ? `

def test_known_issues_resolved(driver, axe):
    """Assert specific issues found during DOM scan are resolved."""
    driver.get("${url}")
    axe.inject()
    results = axe.run()
    violations = results["violations"]
${issueChecks}` : ""}
${acc.inputsWithoutLabels > 0 ? `

def test_all_inputs_have_labels(driver, axe):
    """Assert no inputs are missing accessible labels."""
    driver.get("${url}")
    axe.inject()
    results = axe.run()
    label_violations = [v for v in results["violations"] if v["id"] == "label"]
    assert len(label_violations) == 0, f"Inputs without labels: {len(label_violations)} violation(s)"` : ""}
`,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 2_000_000) reject(new Error("Request too large")); // 2MB limit
    });
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function toPascalCase(str) {
  return (str || "page").split(/[-_\s]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

// ─── Static file server (dashboard) ──────────────────────────────────────────

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff2":"font/woff2",
};

function serveStatic(req, res, url) {
  // Root → serve dashboard
  let filePath = url.pathname === "/" || url.pathname === ""
    ? path.join(__dirname, "dashboard", "index.html")
    : path.join(__dirname, "dashboard", url.pathname);

  // Security: prevent path traversal
  const resolved = path.resolve(filePath);
  const dashboardDir = path.resolve(__dirname, "dashboard");
  if (!resolved.startsWith(dashboardDir)) {
    return jsonResponse(res, 403, { error: "Forbidden" });
  }

  if (!fs.existsSync(resolved)) {
    // SPA fallback
    filePath = path.join(__dirname, "dashboard", "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": mime, "Content-Length": content.length });
    res.end(content);
  } catch {
    jsonResponse(res, 500, { error: "Failed to serve file" });
  }
}

// ─── Delete project ───────────────────────────────────────────────────────────

function handleDeleteProject(req, res, url) {
  const id = url.pathname.split("/").pop();
  if (!id || id === "projects") return jsonResponse(res, 400, { error: "Project ID required" });

  const filename = path.join(PROJECTS_DIR, `${id}.json`);
  if (!fs.existsSync(filename)) return jsonResponse(res, 404, { error: "Project not found" });

  try {
    fs.unlinkSync(filename);
    console.log(`[Delete Project] Deleted: ${id}`);
    jsonResponse(res, 200, { success: true, id });
  } catch (err) {
    jsonResponse(res, 500, { error: "Failed to delete project", detail: err.message });
  }
}

// ─── Recorder route handlers ──────────────────────────────────────────────────

async function handleRecordStart(req, res) {
  const body = await readBody(req);
  const { startUrl, sessionId: requestedId } = body;

  if (!startUrl) return jsonResponse(res, 400, { error: "startUrl is required" });

  try {
    const { sessionId, recorder } = await recorderManager.createSession({
      startUrl,
      sessionId: requestedId,
      headless: false,
    });

    console.log(`[Recorder] Session started: ${sessionId} → ${startUrl}`);
    jsonResponse(res, 200, { success: true, sessionId, startUrl });
  } catch (err) {
    console.error("[Recorder] Start error:", err.message);
    jsonResponse(res, 500, { error: "Failed to start recording: " + err.message });
  }
}

function handleRecordSessions(req, res) {
  const sessions = recorderManager.listSessions();
  jsonResponse(res, 200, { success: true, sessions });
}

function handleRecordActions(req, res, sessionId) {
  const recorder = recorderManager.getSession(sessionId);
  if (!recorder) return jsonResponse(res, 404, { error: "Session not found" });

  const status = recorder.getStatus();
  const actions = recorder.getActions();
  jsonResponse(res, 200, { success: true, actions, ...status });
}

async function handleRecordStop(req, res, sessionId) {
  try {
    const actions = await recorderManager.destroySession(sessionId);
    if (!actions) return jsonResponse(res, 404, { error: "Session not found" });

    console.log(`[Recorder] Session stopped: ${sessionId} — ${actions.length} actions`);
    const steps = actionsToSteps(actions);
    const journeySegments = actionsToJourneySegments(actions);
    jsonResponse(res, 200, { success: true, actions, steps, journeySegments, actionCount: actions.length });
  } catch (err) {
    jsonResponse(res, 500, { error: "Failed to stop recording: " + err.message });
  }
}

async function handleRecordConvert(req, res, sessionId) {
  const body = await readBody(req);
  const { framework, className, apiKey } = body;

  // Get actions — either from live session or from body
  let actions = body.actions;
  if (!actions && sessionId !== "offline") {
    const recorder = recorderManager.getSession(sessionId);
    if (!recorder) return jsonResponse(res, 404, { error: "Session not found" });
    actions = recorder.getActions();
  }

  if (!actions?.length) return jsonResponse(res, 400, { error: "No actions to convert" });

  const fw = framework || "playwright-python";
  const cls = className || "RecordedPage";

  // Generate code from converter
  const code = actionsToCode(actions, fw, cls);
  const steps = actionsToSteps(actions);

  // Generate test case: Claude if API key provided, otherwise auto-build from actions
  let testCase = null;
  if (apiKey) {
    const claudeResult = await callAI(apiKey, buildRecordingPrompt(steps, actions, fw), 3000,
      "You are a QA automation expert. Convert recorded user actions into structured test cases. Respond ONLY with valid JSON.");
    if (claudeResult.success) {
      try {
        testCase = JSON.parse(sanitizeAiJson(claudeResult.text));
      } catch (_) {}
    }
  }
  // Always fall back to auto-generated test case if Claude didn't produce one
  if (!testCase) {
    testCase = autoGenerateTestCase(steps, actions, cls);
  }

  jsonResponse(res, 200, {
    success: true,
    code,
    steps,
    testCase,
    framework: fw,
    actionCount: actions.length,
  });
}

async function handleRecordTestCases(req, res, sessionId) {
  const body = await readBody(req);
  let { pageContext, actions, steps, scenarioTypes, suiteTypes, apiKey, sourceMode } = body;

  if (!actions && sessionId !== "offline") {
    const recorder = recorderManager.getSession(sessionId);
    if (!recorder) return jsonResponse(res, 404, { error: "Session not found" });
    actions = recorder.getActions();
  }

  actions = Array.isArray(actions) ? actions : [];
  const stepTexts = Array.isArray(steps)
    ? steps.map((step) => typeof step === "string" ? step : step?.text).filter(Boolean)
    : actionsToSteps(actions).map((step) => step.text);
  const normalizedTypes = normalizeScenarioTypes(scenarioTypes);
  const normalizedSuites = normalizeSuiteTypes(suiteTypes);

  if (!pageContext && !actions.length) {
    return jsonResponse(res, 400, { error: "pageContext or actions are required" });
  }

  let testCases = [];
  if (apiKey) {
    const aiResult = await callAI(
      apiKey,
      buildScenarioGenerationPrompt(pageContext, actions, stepTexts, normalizedTypes, normalizedSuites, sourceMode || "hybrid"),
      5000,
      "You are a senior QA engineer. Generate comprehensive web QA test cases. Return valid JSON only with a testCases array."
    );
    if (aiResult.success) {
      try {
        const parsed = JSON.parse(sanitizeAiJson(aiResult.text));
        testCases = Array.isArray(parsed) ? parsed : (parsed.testCases || []);
      } catch (_) {}
    }
  }

  if (!Array.isArray(testCases) || !testCases.length) {
    testCases = autoGenerateRecorderTestCases(pageContext, actions, stepTexts, normalizedTypes, normalizedSuites, sourceMode || "hybrid");
  }

  const normalized = dedupeTestCases(
    testCases.map((tc, index) => normalizeRecorderTestCase(tc, index, pageContext, actions, sourceMode || "hybrid"))
  );

  jsonResponse(res, 200, {
    success: true,
    testCases: normalized,
    count: normalized.length,
    suiteTypes: normalizedSuites,
    sourceMode: sourceMode || "hybrid",
  });
}

function buildRecordingPrompt(steps, actions, framework) {
  const stepTexts = steps.map((s, i) => `${i + 1}. ${s.text}`).join("\n");
  const locators = actions
    .filter(a => a.locator)
    .reduce((m, a) => { m[a.locator] = a.type; return m; }, {});

  return `Convert these recorded browser actions into a structured test case.

RECORDED STEPS:
${stepTexts}

LOCATORS USED:
${JSON.stringify(locators, null, 2)}

FRAMEWORK: ${framework}

Respond ONLY with this JSON:
{
  "id": "TC001",
  "title": "One-line description of what this test verifies",
  "category": "functional|negative|boundary|navigation|ui|accessibility|e2e",
  "caseKind": "flow",
  "packs": ["smoke", "regression", "e2e"],
  "priority": "high|medium|low",
  "preconditions": "What must be true before running this test",
  "steps": ["1. Step text", "2. Step text"],
  "expectedResult": "Specific, measurable expected outcome",
  "locators": { "descriptive_name": "locator_value" },
  "testData": { "key": "value for any data used" },
  "tags": ["recorded", "e2e"]
}`;
}

// ─── Auto test case builder (no API key needed) ──────────────────────────────

function autoGenerateTestCase(steps, actions, className) {
  const stepTexts = steps.map(s => s.text);
  const navigates = actions.filter(a => a.type === "navigate").map(a => a.url);
  const fills     = actions.filter(a => a.type === "fill");
  const clicks    = actions.filter(a => a.type === "click");
  const url       = navigates[0] || "";

  // Infer page type from URL and actions
  const urlLower = url.toLowerCase();
  const isLogin    = /login|signin/.test(urlLower) || fills.some(f => /pass/i.test(f.label || f.locator || ""));
  const isRegister = /register|signup/.test(urlLower);
  const isCheckout = /checkout|payment|cart/.test(urlLower);
  const isSearch   = /search/.test(urlLower) || clicks.some(c => /search/i.test(c.text || ""));

  // Infer title
  let title = "Recorded user flow";
  if (isLogin)    title = "User can log in with valid credentials";
  else if (isRegister) title = "User can complete registration";
  else if (isCheckout) title = "User can complete checkout flow";
  else if (isSearch)   title = "User can search and view results";
  else if (clicks.length) title = "User can " + (clicks[0].text || "interact with page").toLowerCase();

  // Infer preconditions
  let preconditions = "Browser is open and application is accessible";
  if (isLogin) preconditions = "User has a valid registered account";
  if (isRegister) preconditions = "User does not have an existing account";

  // Build expected result
  let expectedResult = "Flow completes without errors";
  if (isLogin)    expectedResult = "User is redirected to the dashboard/home page after successful login";
  if (isRegister) expectedResult = "Account is created and user receives confirmation";
  if (isCheckout) expectedResult = "Order is placed and confirmation page is shown";

  // Collect unique locators used
  const locators = {};
  actions.filter(a => a.locator).forEach(a => {
    const name = (a.label || a.locator)
      .replace(/[^a-zA-Z0-9 ]/g, " ").trim()
      .replace(/\s+/g, "_").toLowerCase().slice(0, 30) || "element";
    locators[name] = a.locator;
  });

  // Collect test data (fill values)
  const testData = {};
  fills.forEach(f => {
    const key = (f.label || f.inputType || "field")
      .replace(/[^a-zA-Z0-9 ]/g, "").trim()
      .replace(/\s+/g, "_").toLowerCase().slice(0, 30);
    if (f.inputType === "password") testData[key] = "***";
    else testData[key] = f.value || "";
  });

  // Tags
  const tags = ["recorded", "e2e"];
  if (isLogin)    tags.push("authentication");
  if (isCheckout) tags.push("checkout");
  if (isSearch)   tags.push("search");

  return {
    id: "TC001",
    title,
    category: "e2e",
    caseKind: "flow",
    packs: ["e2e"],
    priority: isLogin || isCheckout ? "high" : "medium",
    preconditions,
    steps: stepTexts,
    expectedResult,
    locators,
    testData,
    tags,
    suite: "e2e",
    approved: true,
  };
}

function normalizeScenarioTypes(types) {
  const allowed = ["positive", "negative", "boundary", "navigation", "ui", "accessibility", "all_possible"];
  const picked = Array.isArray(types) ? types.filter((type) => allowed.includes(type)) : [];
  if (!picked.length) return ["positive"];
  if (picked.includes("all_possible")) return allowed;
  return Array.from(new Set(picked));
}

function normalizeSuiteTypes(types) {
  const allowed = ["page", "e2e", "regression", "smoke"];
  const picked = Array.isArray(types) ? types.filter((type) => allowed.includes(type)) : [];
  return picked.length ? Array.from(new Set(picked)) : ["page"];
}

function inferRecorderSource(pageContext, actions, sourceMode) {
  if (sourceMode === "hybrid" && pageContext && actions?.length) return "hybrid";
  if (actions?.length) return "recording";
  if (pageContext) return "page";
  return "hybrid";
}

function ensureVerifyTitle(title, expectedResult) {
  const cleaned = String(title || "").replace(/\s+/g, " ").trim();
  if (cleaned && /^verify\b/i.test(cleaned)) {
    return cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
  }
  const subject = cleaned || "the selected scenario behaves correctly";
  const expected = String(expectedResult || "the expected result is displayed").replace(/\s+/g, " ").trim().replace(/\.$/, "");
  return `Verify ${subject.replace(/^verify\s+/i, "")} and expect ${expected}.`;
}

function normalizeRecorderTestCase(tc, index, pageContext, actions, sourceMode) {
  const expectedResult = String(tc.expectedResult || tc.expected_result || "").replace(/\s+/g, " ").trim();
  const tags = Array.isArray(tc.tags) ? tc.tags.map((tag) => String(tag).toLowerCase()) : [];
  const caseKind = normalizeGeneratedCaseKind(tc, String(tc.scope || "").toLowerCase() === "journey" ? "flow" : "page");
  let packs = normalizeGeneratedPacks(tc, caseKind);
  if (caseKind === "flow" && !packs.length) packs = normalizePackMembership(caseKind, ["e2e"]);
  return {
    id: String(tc.id || `TC${String(index + 1).padStart(3, "0")}`),
    title: ensureVerifyTitle(tc.title, expectedResult || "the expected result is displayed"),
    category: normalizeGeneratedCategory(tc.category, caseKind, packs),
    priority: String(tc.priority || "medium").toLowerCase(),
    preconditions: String(tc.preconditions || "").trim(),
    steps: Array.isArray(tc.steps) ? tc.steps.map((step) => String(step).trim()).filter(Boolean) : [],
    expectedResult,
    locators: tc.locators && typeof tc.locators === "object" ? tc.locators : {},
    testData: tc.testData && typeof tc.testData === "object" ? tc.testData : {},
    tags,
    caseKind,
    packs,
    suite: deriveLegacySuite(caseKind, packs),
    scope: tc.scope || (caseKind === "flow" ? "journey" : caseKind === "step" ? "step" : "page"),
    source: tc.source || inferRecorderSource(pageContext, actions, sourceMode),
  };
}

function dedupeTestCases(testCases) {
  const seen = new Set();
  return testCases.filter((tc) => {
    const key = String(tc.title || "").toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildScenarioGenerationPrompt(pageContext, actions, stepTexts, scenarioTypes, suiteTypes, sourceMode) {
  const slimPage = pageContext ? {
    url: pageContext.url,
    title: pageContext.title,
    headings: (pageContext.headings || []).slice(0, 8),
    forms: (pageContext.forms || []).slice(0, 6),
    inputs: (pageContext.inputs || []).slice(0, 12),
    buttons: (pageContext.buttons || []).slice(0, 12),
    links: (pageContext.links || []).slice(0, 12),
    tables: (pageContext.tables || []).slice(0, 6),
    alerts: (pageContext.alerts || []).slice(0, 6),
  } : null;

  return `Generate QA test cases for this recorder session.

SOURCE MODE: ${sourceMode}
TEST SUITES: ${suiteTypes.join(", ")}
SCENARIO TYPES: ${scenarioTypes.join(", ")}

PAGE CONTEXT:
${JSON.stringify(slimPage, null, 2)}

RECORDED STEPS:
${JSON.stringify(stepTexts, null, 2)}

RECORDED ACTIONS:
${JSON.stringify(actions.slice(0, 25), null, 2)}

Requirements:
- Return multiple test cases in a "testCases" array
- Every title must be one line and start with "Verify"
- Each title must say what is tested and what is expected
- Include detailed preconditions, explicit steps, and measurable expectedResult
- Use "caseKind" to describe whether a case is a page, flow, or step case
- Use "packs" to describe whether a case belongs to smoke, regression, or e2e reusable packs
- "page" coverage means local page validation, "e2e" means journey coverage, "regression" means broad retestable coverage, and "smoke" means critical happy-path checks
- Cover requested scenario types only; if "all_possible" is present, include a broad mix
- If the page has forms, include at least one positive and one negative test case
- Use source as page, recording, or hybrid

Respond ONLY with JSON:
{
  "testCases": [
    {
      "id": "TC001",
      "title": "Verify ... and expect ...",
      "category": "functional|negative|boundary|navigation|ui|accessibility|e2e",
      "priority": "high|medium|low",
      "caseKind": "page|flow|step",
      "packs": ["smoke", "regression", "e2e"],
      "preconditions": "What must be true before running this test",
      "steps": ["1. ...", "2. ..."],
      "expectedResult": "Specific measurable outcome",
      "locators": { "name": "locator" },
      "testData": { "key": "value" },
      "tags": ["tag"],
      "source": "page|recording|hybrid"
    }
  ]
}`;
}

function autoGenerateRecorderTestCases(pageContext, actions, stepTexts, scenarioTypes, suiteTypes, sourceMode) {
  const inputs = pageContext?.inputs || [];
  const buttons = pageContext?.buttons || [];
  const links = pageContext?.links || [];
  const tables = pageContext?.tables || [];
  const alerts = pageContext?.alerts || [];
  const forms = pageContext?.forms || [];
  const url = String(pageContext?.url || actions.find((action) => action.type === "navigate")?.url || "").toLowerCase();
  const source = inferRecorderSource(pageContext, actions, sourceMode);
  const testCases = [];
  const seen = new Set();

  const requiredInputs = inputs.filter((input) => input.required);
  const hasPassword = inputs.some((input) => /password/i.test(input.type || input.label || ""));
  const hasUserField = inputs.some((input) => /user|email|login/i.test(input.label || input.name || input.locator || ""));
  const isLogin = /login|signin|sign-in/.test(url) || (hasPassword && hasUserField);
  const isCheckout = /checkout|payment|cart|billing/.test(url);
  const formLocators = Object.fromEntries(requiredInputs.slice(0, 6).map((input) => [sanitizeKey(input.label || input.locator || "field"), input.locator || ""]));
  const buttonLocators = Object.fromEntries(buttons.slice(0, 6).map((button) => [sanitizeKey(button.text || button.locator || "button"), button.locator || ""]));
  const linkLocators = Object.fromEntries(links.slice(0, 6).map((link) => [sanitizeKey(link.text || link.href || "link"), link.locator || link.href || ""]));
  const wantsPage = suiteTypes.includes("page") || suiteTypes.includes("regression") || suiteTypes.includes("smoke");
  const wantsE2E = suiteTypes.includes("e2e") || suiteTypes.includes("regression") || suiteTypes.includes("smoke");
  const wantsRegression = suiteTypes.includes("regression");
  const wantsSmoke = suiteTypes.includes("smoke");

  const pushCase = (definition) => {
    const normalized = normalizeRecorderTestCase({
      ...definition,
      source: definition.source || source,
    }, testCases.length, pageContext, actions, sourceMode);
    const key = normalized.title.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      testCases.push(normalized);
    }
  };

  if (actions.length && wantsE2E) {
    pushCase({
      title: isLogin
        ? "Verify the recorded login flow completes successfully and expect the post-login page to open"
        : "Verify the recorded user flow completes successfully and expect the final screen to load",
      category: "e2e",
      suite: wantsSmoke ? "smoke" : wantsRegression ? "regression" : "e2e",
      priority: "high",
      preconditions: "The application is loaded and ready for interaction.",
      steps: stepTexts.length ? stepTexts : actionsToSteps(actions).map((step) => step.text),
      expectedResult: isLogin
        ? "The user is logged in successfully and the next page is displayed."
        : "The recorded flow completes without errors and the final state is shown.",
      locators: { ...formLocators, ...buttonLocators },
      testData: buildTestDataFromActions(actions),
      tags: ["recorded", "flow", wantsRegression ? "regression" : "e2e", wantsSmoke ? "smoke" : ""].filter(Boolean),
      source: actions.length && pageContext ? "hybrid" : "recording",
    });
  }

  if (scenarioTypes.includes("positive") && wantsPage) {
    if (isLogin) {
      pushCase({
        title: "Verify login succeeds with valid credentials and expect the inventory page to open",
        category: "functional",
        suite: wantsSmoke ? "smoke" : wantsRegression ? "regression" : "page",
        priority: "high",
        preconditions: "The user has valid login credentials.",
        steps: [
          `Navigate to ${pageContext?.url || "the login page"}.`,
          "Enter a valid username in the username field.",
          "Enter a valid password in the password field.",
          "Submit the login form.",
        ],
        expectedResult: "The inventory page opens and the user is authenticated.",
        locators: formLocators,
        testData: { username: "valid_user", password: "***" },
        tags: ["positive", "authentication", wantsRegression ? "regression" : "page", wantsSmoke ? "smoke" : ""].filter(Boolean),
      });
    } else if (forms.length) {
      pushCase({
        title: "Verify the main form accepts valid input and expect successful submission",
        category: "functional",
        suite: wantsSmoke ? "smoke" : wantsRegression ? "regression" : "page",
        priority: "high",
        preconditions: "The page is loaded and valid test data is available.",
        steps: [
          "Open the page under test.",
          "Enter valid values in the required form fields.",
          "Submit the form using the primary action.",
        ],
        expectedResult: "The form is submitted successfully and the success state is displayed.",
        locators: { ...formLocators, ...buttonLocators },
        testData: buildPlaceholderData(inputs, "valid"),
        tags: ["positive", "form", wantsRegression ? "regression" : "page", wantsSmoke ? "smoke" : ""].filter(Boolean),
      });
    } else if (buttons.length) {
      pushCase({
        title: "Verify the primary page action works and expect the next state to appear",
        category: "functional",
        suite: wantsSmoke ? "smoke" : wantsRegression ? "regression" : "page",
        priority: "medium",
        preconditions: "The page is loaded and ready for interaction.",
        steps: [
          "Open the target page.",
          `Click ${buttons[0].text || "the primary action button"}.`,
        ],
        expectedResult: "The intended next state or response is displayed.",
        locators: buttonLocators,
        testData: {},
        tags: ["positive", wantsRegression ? "regression" : "page", wantsSmoke ? "smoke" : ""].filter(Boolean),
      });
    }
  }

  if (scenarioTypes.includes("negative") && (wantsPage || wantsRegression)) {
    if (isLogin) {
      pushCase({
        title: "Verify login fails with invalid credentials and expect an error message",
        category: "negative",
        suite: wantsRegression ? "regression" : "page",
        priority: "high",
        preconditions: "The user is on the login page.",
        steps: [
          `Navigate to ${pageContext?.url || "the login page"}.`,
          "Enter an invalid username and password.",
          "Submit the login form.",
        ],
        expectedResult: "Authentication is rejected and an error message is displayed.",
        locators: { ...formLocators, ...buttonLocators },
        testData: { username: "invalid_user", password: "***" },
        tags: ["negative", "authentication", wantsRegression ? "regression" : "page"],
      });
    }
    if (requiredInputs.length) {
      pushCase({
        title: "Verify required fields block submission when left empty and expect validation feedback",
        category: "negative",
        suite: wantsRegression ? "regression" : "page",
        priority: "high",
        preconditions: "The page is loaded with the main form visible.",
        steps: [
          "Open the page with the form.",
          "Leave the required fields empty.",
          "Attempt to submit the form.",
        ],
        expectedResult: "Submission is blocked and validation messages or error states are shown.",
        locators: { ...formLocators, ...buttonLocators },
        testData: {},
        tags: ["negative", "validation", wantsRegression ? "regression" : "page"],
      });
    }
  }

  if (scenarioTypes.includes("boundary") && inputs.length && (wantsPage || wantsRegression)) {
    pushCase({
      title: "Verify boundary input values are handled correctly and expect stable validation behavior",
      category: "boundary",
      suite: wantsRegression ? "regression" : "page",
      priority: "medium",
      preconditions: "The form fields are available for input.",
      steps: [
        "Open the page containing editable input fields.",
        "Enter boundary-length values into the relevant fields.",
        "Submit or leave the fields to trigger validation.",
      ],
      expectedResult: "Boundary values are either accepted correctly or rejected with clear validation feedback.",
      locators: formLocators,
      testData: buildPlaceholderData(inputs, "boundary"),
      tags: ["boundary", wantsRegression ? "regression" : "page"],
    });
  }

  if (scenarioTypes.includes("navigation") && links.length && wantsPage) {
    pushCase({
      title: "Verify navigation links route to the expected destination and expect the target page to load",
      category: "navigation",
      suite: wantsSmoke ? "smoke" : wantsRegression ? "regression" : "page",
      priority: "medium",
      preconditions: "The page is loaded with visible navigation links.",
      steps: [
        "Open the current page.",
        `Click ${links[0].text || "the first visible navigation link"}.`,
      ],
      expectedResult: "The linked destination loads without broken navigation or unexpected errors.",
      locators: linkLocators,
      testData: {},
      tags: ["navigation", wantsRegression ? "regression" : "page", wantsSmoke ? "smoke" : ""].filter(Boolean),
    });
  }

  if (scenarioTypes.includes("ui") && wantsPage) {
    if (buttons.length) {
      pushCase({
        title: "Verify critical page controls are visible and usable and expect the UI state to remain stable",
        category: "ui",
        suite: wantsSmoke ? "smoke" : wantsRegression ? "regression" : "page",
        priority: "medium",
        preconditions: "The page has loaded completely.",
        steps: [
          "Open the current page.",
          "Inspect the key buttons and interactive controls.",
          "Confirm the primary controls are visible and actionable.",
        ],
        expectedResult: "Important controls are visible, enabled when appropriate, and rendered without layout issues.",
        locators: buttonLocators,
        testData: {},
        tags: ["ui", wantsRegression ? "regression" : "page", wantsSmoke ? "smoke" : ""].filter(Boolean),
      });
    }
    if (tables.length) {
      pushCase({
        title: "Verify table data and headers render correctly and expect the grid layout to remain readable",
        category: "ui",
        suite: wantsRegression ? "regression" : "page",
        priority: "medium",
        preconditions: "The page contains a data table.",
        steps: [
          "Open the page that contains table content.",
          "Review the visible table headers and rows.",
        ],
        expectedResult: "Table headers and rows render correctly with no broken layout or missing data labels.",
        locators: { table: tables[0].locator || "table" },
        testData: {},
        tags: ["ui", "table", wantsRegression ? "regression" : "page"],
      });
    }
  }

  if (scenarioTypes.includes("accessibility") && wantsPage) {
    pushCase({
      title: "Verify the main interactive elements are accessible and expect labels and keyboard behavior to be clear",
      category: "accessibility",
      suite: wantsRegression ? "regression" : "page",
      priority: "medium",
      preconditions: "The page is loaded and interactive elements are visible.",
      steps: [
        "Open the current page.",
        "Review visible input labels, placeholders, or accessible names.",
        "Navigate the primary controls with keyboard interaction.",
      ],
      expectedResult: "Core fields and controls expose clear names or labels and remain usable through keyboard navigation.",
      locators: { ...formLocators, ...buttonLocators, ...linkLocators },
      testData: {},
      tags: ["accessibility", wantsRegression ? "regression" : "page"],
    });
  }

  if (alerts.length && wantsPage) {
    pushCase({
      title: "Verify page feedback messages appear clearly and expect users to understand the outcome",
      category: "ui",
      suite: wantsRegression ? "regression" : "page",
      priority: "low",
      preconditions: "The page includes alerts, errors, or feedback messages.",
      steps: [
        "Trigger a page action that displays a feedback message.",
        "Observe the rendered alert or feedback state.",
      ],
      expectedResult: "Feedback messages are visible, readable, and clearly communicate the result of the action.",
      locators: Object.fromEntries(alerts.slice(0, 4).map((alert, index) => [`alert_${index + 1}`, alert.locator || alert.text])),
      testData: {},
      tags: ["ui", "feedback", wantsRegression ? "regression" : "page"],
    });
  }

  return testCases;
}

function sanitizeKey(value) {
  return String(value || "item").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase().slice(0, 32) || "item";
}

function buildPlaceholderData(inputs, mode) {
  const data = {};
  (inputs || []).slice(0, 6).forEach((input, index) => {
    const key = sanitizeKey(input.label || input.locator || `field_${index + 1}`);
    if (mode === "boundary") data[key] = "boundary_value";
    else if (/password/i.test(input.type || key)) data[key] = "***";
    else data[key] = "valid_value";
  });
  return data;
}

function buildTestDataFromActions(actions) {
  const data = {};
  (actions || []).filter((action) => action.type === "fill").forEach((action, index) => {
    const key = sanitizeKey(action.label || action.locator || `field_${index + 1}`);
    data[key] = /password/i.test(action.inputType || key) ? "***" : action.value || "";
  });
  return data;
}

// ─── CI/CD config handler ─────────────────────────────────────────────────────

async function handleGenerateCICD(req, res) {
  const body = await readBody(req);
  const {
    framework, projectName, pageType, baseUrl,
    browsers, parallel, reporters, slackWebhook,
    emailNotify, branches, prTrigger, testCaseCount,
    useAllure, nodeVersion, pythonVersion, javaVersion,
  } = body;

  if (!framework) return jsonResponse(res, 400, { error: "framework is required" });

  console.log(`[CI/CD] Generating configs for ${framework} — project: ${projectName}`);

  try {
    const configs = generateCICD({
      framework,
      projectName:    projectName   || "qa-tests",
      pageType:       pageType      || "page",
      baseUrl:        baseUrl       || "https://staging.example.com",
      browsers:       browsers      || ["chromium"],
      parallel:       parallel      ?? false,
      reporters:      reporters     || ["html", "junit"],
      slackWebhook:   slackWebhook  ?? false,
      emailNotify:    emailNotify   ?? false,
      branches:       branches      || ["main", "develop"],
      prTrigger:      prTrigger     ?? true,
      testCaseCount:  testCaseCount || 0,
      useAllure:      useAllure     ?? false,
      nodeVersion:    nodeVersion   || "20",
      pythonVersion:  pythonVersion || "3.11",
      javaVersion:    javaVersion   || "17",
    });

    console.log(`[CI/CD] ✓ Generated: ${Object.keys(configs).join(", ")}`);
    jsonResponse(res, 200, { success: true, configs });
  } catch (err) {
    console.error("[CI/CD] Error:", err.message);
    jsonResponse(res, 500, { error: "CI/CD generation failed: " + err.message });
  }
}

// ─── Page proxy (strips X-Frame-Options, injects capture script) ──────────────

async function handleProxy(req, res, url) {
  const target = url.searchParams.get("url");
  if (!target) return jsonResponse(res, 400, { error: "url param required" });
  if (!/^https?:\/\//i.test(target)) return jsonResponse(res, 400, { error: "Invalid URL" });

  try {
    const targetUrl = new URL(target);
    const origin = targetUrl.origin;

    const html = await proxyFetchHTML(target);

    // Inject our capture script + fix relative URLs
    const baseHref = `http://localhost:${PORT}/api/proxy-asset/${targetUrl.protocol.replace(":", "")}/${targetUrl.host}${targetUrl.pathname}${targetUrl.search}`;
    const baseTag = `<base href="${baseHref}"/>`;
    const captureScript = `<script>
(function(){
if(window.__QA_ACTIVE)return;
window.__QA_ACTIVE=true;window.__QA_Q=[];

function _proxyAsset(absUrl){
  try {
    var u = new URL(absUrl);
    return 'http://localhost:${PORT}/api/proxy-asset/' + u.protocol.replace(':','') + '/' + u.host + u.pathname + u.search;
  } catch(e) {
    return absUrl;
  }
}
var _PROXY_PAGE  = 'http://localhost:${PORT}/api/proxy?url=';
var _ORIGIN      = '${origin}';
var _TARGET_PATH = ${JSON.stringify(targetUrl.pathname + targetUrl.search + targetUrl.hash || "/")};

try {
  if (window.location.pathname !== _TARGET_PATH) {
    history.replaceState({}, '', _TARGET_PATH);
  }
} catch(e) {}

try {
  if (navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
    navigator.serviceWorker.register = function() {
      return Promise.resolve({
        installing: null,
        waiting: null,
        active: null,
        scope: window.location.origin + _TARGET_PATH,
        onupdatefound: null,
        unregister: function() { return Promise.resolve(true); },
        update: function() { return Promise.resolve(); }
      });
    };
  }
} catch(e) {}

// ── Intercept fetch so React dynamic imports work ──
var _origFetch = window.fetch;
window.fetch = function(input, init) {
  var url = (typeof input === 'string') ? input : (input && input.url) || '';
  // Rewrite same-origin or relative URLs through asset proxy
  if (url && !url.startsWith('http://localhost') && !url.startsWith('data:')) {
    try {
      var abs = url.startsWith('http') ? url : new URL(url, _ORIGIN).toString();
      if (abs.startsWith(_ORIGIN) || abs.startsWith('https://') || abs.startsWith('http://')) {
        var proxied = _proxyAsset(abs);
        if (typeof input === 'string') input = proxied;
        else input = new Request(proxied, input);
      }
    } catch(e) {}
  }
  return _origFetch.call(this, input, init);
};

// ── Intercept XHR for older-style apps ──
var _origXHROpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url) {
  if (url && typeof url === 'string' && !url.startsWith('http://localhost') && !url.startsWith('data:')) {
    try {
      var abs = url.startsWith('http') ? url : new URL(url, _ORIGIN).toString();
      url = _proxyAsset(abs);
    } catch(e) {}
  }
  return _origXHROpen.apply(this, [method, url].concat(Array.prototype.slice.call(arguments, 2)));
};

// ── Event capture ──
function _loc(e){if(!e)return null;var t=e.dataset&&(e.dataset.testid||e.dataset.test||e.dataset.cy);if(t)return'[data-testid="'+t+'"]';if(e.id)return'#'+e.id;var a=e.getAttribute('aria-label');if(a)return'[aria-label="'+a+'"]';if(e.name)return'[name="'+e.name+'"]';var g=(e.tagName||'').toLowerCase(),x=(e.textContent||e.value||'').trim().slice(0,40);return x?(g+':has-text("'+x+'")'):g;}
function _lbl(e){if(e.getAttribute('aria-label'))return e.getAttribute('aria-label');if(e.id){var l=document.querySelector('label[for="'+e.id+'"]');if(l)return l.textContent.trim();}return e.placeholder||null;}
function _push(o){o.ts=Date.now();window.__QA_Q.push(o);}
document.addEventListener('click',function(e){var el=e.target.closest('button,a,[role="button"],input[type="checkbox"],input[type="radio"]');if(!el)return;if(el.type==='checkbox')_push({type:'check',locator:_loc(el),checked:el.checked,label:_lbl(el)});else if(el.type==='radio')_push({type:'radio',locator:_loc(el),value:el.value,label:_lbl(el)});else _push({type:'click',locator:_loc(el),text:(el.textContent||el.value||'').trim().slice(0,60),tag:(el.tagName||'').toLowerCase()});},true);
document.addEventListener('blur',function(e){var el=e.target;if(!el||!['INPUT','TEXTAREA'].includes(el.tagName))return;if(['checkbox','radio','submit','button'].includes(el.type))return;if(!el.value)return;var last=window.__QA_Q[window.__QA_Q.length-1];if(last&&last.type==='fill'&&last.locator===_loc(el)&&last.value===el.value)return;_push({type:'fill',locator:_loc(el),value:el.value,inputType:el.type||'text',label:_lbl(el)});},true);
document.addEventListener('change',function(e){var el=e.target;if(!el||el.tagName!=='SELECT')return;var o=el.options[el.selectedIndex];_push({type:'select',locator:_loc(el),value:el.value,optionText:o?o.text:el.value,label:_lbl(el)});},true);
document.addEventListener('submit',function(e){_push({type:'submit',locator:_loc(e.target)});},true);
document.addEventListener('keydown',function(e){if(e.key==='Enter'&&!['BUTTON','A'].includes(e.target.tagName))_push({type:'press',key:'Enter',locator:_loc(e.target)});if(e.key==='Escape')_push({type:'press',key:'Escape'});},true);
console.log('[QA Deck] Proxy capture active on ${origin}');
})();
</script>`;

    const proxyAssetUrl = (rawUrl) => {
      try {
        const asset = new URL(rawUrl);
        return `http://localhost:${PORT}/api/proxy-asset/${asset.protocol.replace(":", "")}/${asset.host}${asset.pathname}${asset.search}`;
      } catch {
        return rawUrl;
      }
    };

    let patched = html;

    // Strip meta CSP/refresh tags that break proxied SPAs.
    patched = patched.replace(
      /<meta[^>]+http-equiv=["'](?:content-security-policy|refresh|x-frame-options)["'][^>]*>/gi,
      ""
    );

    // 1. Inject base URL + capture script at top of <head>
    if (/<head[^>]*>/i.test(patched)) {
      patched = patched.replace(/(<head[^>]*>)/i, `$1${baseTag}${captureScript}`);
    } else {
      patched = baseTag + captureScript + patched;
    }

    // 2. Rewrite absolute URLs (https://...) → proxy-asset
    patched = patched
      .replace(/(src|href)="(https?:\/\/[^"#?][^"]*)"/gi, (m, attr, u) =>
        `${attr}="${proxyAssetUrl(u)}"`)
      .replace(/(src|href)='(https?:\/\/[^'#?][^']*)'/gi, (m, attr, u) =>
        `${attr}='${proxyAssetUrl(u)}'`);

    // 3. Rewrite root-relative URLs (/path/...) → proxy-asset with origin prepended
    patched = patched
      .replace(/(src|href)="(\/(?!\/)[^"]*)"/gi, (m, attr, path) =>
        `${attr}="${proxyAssetUrl(origin + path)}"`)
      .replace(/(src|href)='(\/(?!\/)[^']*)'/gi, (m, attr, path) =>
        `${attr}='${proxyAssetUrl(origin + path)}'`);

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "ALLOWALL",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(patched);

  } catch (err) {
    jsonResponse(res, 502, { error: "Proxy fetch failed: " + err.message });
  }
}

// ─── Proxy HTML fetcher ───────────────────────────────────────────────────────
function proxyFetchHTML(target, depth) {
  depth = depth || 0;
  if (depth > 3) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(target);
    const lib = targetUrl.protocol === "https:" ? require("https") : require("http");
    const request = lib.request({
      hostname: targetUrl.hostname,
      path: targetUrl.pathname + targetUrl.search,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }, (proxyRes) => {
      if ([301,302,303,307,308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
        const next = new URL(proxyRes.headers.location, target).toString();
        resolve(proxyFetchHTML(next, depth + 1));
        return;
      }
      let data = "";
      proxyRes.on("data", c => data += c);
      proxyRes.on("end", () => resolve(data));
    });
    request.on("error", reject);
    request.setTimeout(10000, () => { request.destroy(); reject(new Error("Timeout")); });
    request.end();
  });
}

// Helper for redirect following
function handleProxyFetch(url, depth) {
  if (depth > 3) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(url);
    const lib = targetUrl.protocol === "https:" ? require("https") : require("http");
    const request = lib.request({
      hostname: targetUrl.hostname,
      path: targetUrl.pathname + targetUrl.search,
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0 Chrome/120" },
    }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        resolve(handleProxyFetch(new URL(res.headers.location, url).toString(), depth+1));
        return;
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    });
    request.on("error", reject);
    request.setTimeout(8000, () => { request.destroy(); reject(new Error("Timeout")); });
    request.end();
  });
}

// ─── Asset proxy (fetches CSS/JS/images for proxied pages) ───────────────────
async function handleProxyAsset(req, res, url) {
  let assetUrl = url.searchParams.get("url");
  if (!assetUrl && url.pathname.startsWith("/api/proxy-asset/")) {
    const suffix = url.pathname.slice("/api/proxy-asset/".length);
    const parts = suffix.split("/").filter(Boolean);
    const protocol = parts.shift();
    const host = parts.shift();
    const pathName = "/" + parts.join("/");
    if (protocol && host) {
      assetUrl = `${protocol}://${host}${pathName}${url.search || ""}`;
    }
  }

  if (!assetUrl || !/^https?:\/\//i.test(assetUrl)) {
    res.writeHead(400); res.end(); return;
  }
  try {
    const targetUrl = new URL(assetUrl);
    const lib = targetUrl.protocol === "https:" ? require("https") : require("http");
    await new Promise((resolve, reject) => {
      const request = lib.request({
        hostname: targetUrl.hostname,
        path:     targetUrl.pathname + targetUrl.search,
        method:   "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 Chrome/120",
          "Referer":    targetUrl.origin + "/",
          "Accept":     "*/*",
        },
      }, (proxyRes) => {
        // Follow one redirect
        if ([301,302,303,307,308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
          const loc = new URL(proxyRes.headers.location, assetUrl).toString();
          handleProxyAsset(req, { writeHead: res.writeHead.bind(res), end: res.end.bind(res), write: res.write.bind(res) }, new URL(`http://x/api/proxy-asset?url=${encodeURIComponent(loc)}`));
          resolve(); return;
        }
        const ct = proxyRes.headers["content-type"] || "application/octet-stream";
        res.writeHead(200, {
          "Content-Type": ct,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600",
        });
        proxyRes.pipe(res);
        proxyRes.on("end", resolve);
        proxyRes.on("error", reject);
      });
      request.on("error", (e) => { console.error("[proxy-asset]", e.message); res.writeHead(502); res.end(); reject(e); });
      request.setTimeout(8000, () => { request.destroy(); res.writeHead(504); res.end(); reject(new Error("timeout")); });
      request.end();
    });
  } catch (err) {
    if (!res.headersSent) { res.writeHead(502); res.end(); }
  }
}

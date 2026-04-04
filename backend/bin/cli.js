#!/usr/bin/env node

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const serverPath = path.join(__dirname, "..", "server.js");

// Check if Playwright Chromium is installed, install if not
function ensurePlaywright() {
  try {
    const cacheDir = path.join(require("os").homedir(), ".cache", "ms-playwright");
    const hasChromium = fs.existsSync(cacheDir) &&
      fs.readdirSync(cacheDir).some(d => d.startsWith("chromium"));
    if (!hasChromium) {
      console.log("Installing Playwright browser (first run only)...");
      execSync("npx playwright install chromium", { stdio: "inherit" });
    }
  } catch {
    // Non-fatal — server will show error when Capture is used
  }
}

ensurePlaywright();

console.log("\n🚀 QA Deck Backend starting...");
console.log("   Keep this Terminal window open while using Capture.\n");

const server = spawn("node", [serverPath], { stdio: "inherit" });

server.on("exit", (code) => process.exit(code ?? 0));

process.on("SIGINT", () => {
  server.kill("SIGINT");
  process.exit(0);
});

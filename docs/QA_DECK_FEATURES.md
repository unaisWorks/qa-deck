# QA Deck — Product Feature Documentation

> Version 1.0 | March 2026 | qadeck.com

---

## What Is QA Deck?

QA Deck is an AI-powered QA automation tool that turns any webpage into a ready-to-run test suite in seconds. It consists of three parts that work together:

| Component | What it is |
|---|---|
| **Chrome Extension** | Installed in Chrome — scans pages, generates tests, records interactions |
| **Local Backend** | Node.js server running on your machine — handles AI generation and code output |
| **Website (qadeck.com)** | Landing page, user accounts, and usage dashboard |

**Who it's for:** QA Engineers, SDETs, and developers who write automated tests.

**Key value:** Stop writing boilerplate. Scan a page → review AI-generated test cases → download a production-ready, runnable test project.

---

## Architecture Overview

```
Chrome Extension (Manifest V3)
    ├── Content Script     — DOM extraction, smart locators, element highlighting
    ├── Service Worker     — message router, direct Claude API fallback
    └── Sidepanel UI       — 5-tab interface (Scan, Test Cases, Script, CI/CD, Record)
              |
              | HTTP (localhost:3747)
              |
Backend (Node.js)
    ├── Claude AI          — claude-sonnet-4-6 model for test + script generation
    ├── Code Generator     — Page Object Model output, 4 frameworks
    ├── Playwright Recorder — session recording → code converter
    └── CI/CD Generator    — GitHub Actions & Jenkins configs
              |
Website (Next.js 14 — qadeck.com / Vercel)
    ├── Landing Page       — product overview, features, how-it-works
    ├── Auth               — signup/signin (email + Google SSO)
    └── Dashboard          — per-user usage statistics
              |
Firebase (Auth + Firestore)
    └── Usage tracking     — scans, tests generated, scripts downloaded, last active
```

**Dual-mode operation:** If the backend is running, all AI calls go through it (more reliable, faster). If it's offline, the extension calls the Claude API directly as a fallback — so the tool always works.

---

## Chrome Extension

### Tab 1 — Scan

Extracts every interactive element from the current webpage.

- Detects: inputs, buttons, links, dropdowns, checkboxes, textareas, forms
- Generates smart locators for each element using this priority order:
  `ID → name → data-testid → aria-label → CSS class → XPath`
- Highlights elements on the page with a coloured overlay
- Shows a list of all scanned elements in the sidepanel
- User can **deselect** individual elements before generating tests
- Works on any page: login forms, dashboards, product pages, checkout flows

### Tab 2 — Test Cases

Sends scanned elements to Claude AI and generates structured test cases.

- Generates **10–14 test cases** per scan
- Each test case includes:
  - Test title
  - Numbered steps
  - Expected result
- Test cases cover: form submission, navigation, element visibility, validation
- User can review and expand each test case before generating code
- Test cases are used as the basis for the script generated in the next tab

### Tab 3 — Script

Generates a complete, downloadable test project based on the test cases.

- Choose from **4 supported frameworks** (see below)
- Downloads as a **ZIP file** containing 5 files in a Page Object Model structure
- Locators in generated code exactly match what was scanned from the page

**Generated project structure (Python example):**
```
project/
├── base/base_page.py          # Common browser actions (click, type, wait)
├── pages/page_name.py         # Page Object — locators + interaction methods
├── tests/test_page_name.py    # Test cases with assertions
├── data/test_data.py          # Input values and expected results
└── config/config.py           # Base URL, browser settings, timeouts
```

### Tab 4 — CI/CD

Generates pipeline configuration files for running tests automatically.

- **GitHub Actions** — `.github/workflows/test.yml` triggered on push/PR
- **Jenkins** — `Jenkinsfile` with pipeline stages (install, test, report)
- Config includes correct install commands and test runner commands per framework
- Ready to drop into an existing repo

### Tab 5 — Record

Records real browser interactions and converts them to test code.

- Start recording → interact with the page normally (click, type, navigate)
- Stop recording → see a list of every captured action
- Convert recording to code in any of the 4 supported frameworks
- Captures: clicks, form inputs, navigation, page changes
- Generates realistic, human-like test flows based on actual usage

---

## Supported Frameworks

| Framework | Language | Test Runner | Notes |
|---|---|---|---|
| Selenium + Python | Python 3 | pytest | Most widely used in QA teams |
| Selenium + Java | Java | TestNG | Common in enterprise environments |
| Playwright + Python | Python 3 | pytest-playwright | Fast, reliable, modern |
| Playwright + TypeScript | TypeScript | Playwright Test | Full-stack teams, CI-friendly |

All four frameworks produce the same 5-file POM structure. Switch frameworks at any time before downloading — no rescanning needed.

---

## Smart Locator Strategy

QA Deck selects the most stable locator for each element automatically:

1. **`id`** — most stable, used if unique
2. **`name`** attribute — common on form fields
3. **`data-testid`** — explicit test hooks, highest confidence
4. **`aria-label`** — accessible label, semantically stable
5. **CSS class** — used when above are absent
6. **XPath** — fallback for complex elements

This means generated tests are less likely to break when the UI changes slightly.

---

## Website — qadeck.com

### Landing Page
- Product overview with feature highlights
- "How It Works" — 3-step walkthrough: Scan → Generate → Download
- Supported framework badges
- Links to sign up and install the extension

### Signup & Signin
- **Email + password** registration and login
- **Google SSO** — one-click sign in with Google account
- Secure Firebase Authentication backend
- After login → redirected to personal dashboard

### User Dashboard
Displays real-time usage stats pulled from Firestore:

| Stat | What it tracks |
|---|---|
| Scans Run | Number of times the Scan tab was used |
| Tests Generated | Total test cases generated across all sessions |
| Scripts Downloaded | Number of ZIP files downloaded |
| Last Active | Timestamp of the most recent activity |

New users see an "install the extension" prompt until their first scan.

---

## Auth & Usage Tracking (Extension)

- Sign in with Google directly from the extension sidepanel
- Uses `chrome.identity` + Firebase REST API (no SDK — fully CSP-compliant for Manifest V3)
- Usage events are logged automatically on:
  - Every **scan** → increments `scansRun`
  - Every **test generation** → increments `testsGenerated`
  - Every **script download** → increments `scriptsDownloaded`
- Events sync to Firestore instantly — dashboard updates in real time
- Sign out available from the sidepanel at any time

---

## Local Backend (Node.js)

- Runs on `localhost:3747`
- Start command: `node server.js` from the `qa-autopilot-backend/` directory
- Handles all Claude API calls (more reliable than extension calling API directly)
- Routes:
  - `POST /generate-tests` — test case generation
  - `POST /generate-script` — POM code generation
  - `POST /record` — recording session management
  - `POST /cicd` — CI/CD config generation
  - `GET /proxy` — health check / Claude proxy
- **If backend is offline:** extension detects this and falls back to direct Claude API calls automatically

---

## Setup Requirements

| Requirement | Details |
|---|---|
| Chrome browser | Latest stable version |
| Node.js | v18 or higher (for backend) |
| Claude API key | From console.anthropic.com |
| Firebase project | Optional — only needed for auth/usage tracking |

### Quick Start
1. Load the extension: `chrome://extensions` → Developer mode → Load unpacked → select `qa-autopilot/`
2. Start the backend: `cd qa-autopilot-backend && node server.js`
3. Navigate to any webpage in Chrome
4. Open the QA Deck sidepanel → click **Scan**
5. Review elements → click **Generate Tests** → click **Generate Script** → Download ZIP

---

## What's Next (Roadmap)

**Phase 1 — SDET Power Features**
- BDD / Gherkin mode (`.feature` files + step definitions)
- Negative test case generation (boundary, invalid input, error states)
- Visual Assertion Builder (click any element to define exact assertions)
- Test tagging (`@smoke`, `@regression`, `@critical`)
- Data-driven test generation (parametrize with CSV/JSON)

**Phase 2 — Enterprise Integrations**
- One-click bug report generator (URL + screenshot + console errors)
- iFrame and Shadow DOM auto-detection
- Multi-environment config (dev / staging / prod)
- Network capture and API response assertions
- Accessibility (a11y) testing tab — WCAG 2.1 AA audit

**Phase 3 — Advanced**
- Smart wait strategy detector (no more `time.sleep()`)
- Test coverage heatmap overlay
- TestRail / Jira Xray export
- Reusable step library (save login flows, reuse across tests)
- Performance assertion generator (LCP, page load SLAs)

---

*QA Deck — Built for testers who ship fast.*

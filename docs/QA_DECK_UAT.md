# QA Deck — UAT Checklist

> User Acceptance Testing | Version 1.0 | March 2026
> Complete all items before client handover. Check off each item as PASS or mark FAIL with notes.

---

## How to Use This Document

- **PASS** — feature works as described, no issues
- **FAIL** — issue found; note what happened and steps to reproduce
- **SKIP** — not applicable to this environment (note why)

**Test environments:**
- Extension: Chrome (latest stable) on macOS / Windows
- Website: `localhost:3000` (dev) or `qadeck.com` (production)
- Backend: `localhost:3747`

---

## Section 1 — Extension Installation

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 1.1 | Open `chrome://extensions` → enable Developer mode → Load unpacked → select `qa-autopilot/` folder | Extension loads without errors | | |
| 1.2 | Check extension icon appears in Chrome toolbar | QA Deck icon visible | | |
| 1.3 | Click extension icon → sidepanel opens | Sidepanel slides open on right side | | |
| 1.4 | Sidepanel shows 5 tabs: Scan, Test Cases, Script, CI/CD, Record | All 5 tabs visible and clickable | | |
| 1.5 | Reload extension after making no changes | Reloads cleanly, no errors in `chrome://extensions` | | |

---

## Section 2 — Scan Tab

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 2.1 | Navigate to a login page → click Scan | Elements list populates with inputs and buttons | | |
| 2.2 | Scan an ecommerce product page | Detects product form inputs, Add to Cart button, quantity field | | |
| 2.3 | Scan a dashboard with data tables | Detects interactive elements; table cells not over-counted | | |
| 2.4 | Verify locators shown per element | Each element shows at least one of: ID, name, CSS, XPath | | |
| 2.5 | Deselect 2 elements from the list → generate tests | Deselected elements do NOT appear in generated test cases | | |
| 2.6 | Scan a page with NO interactive elements | Graceful empty state shown — no crash | | |
| 2.7 | Scan a very long page (50+ elements) | All elements listed; sidepanel scrollable; no freeze | | |
| 2.8 | Element highlighting | Hovering an element in the list highlights it on the page | | |
| 2.9 | Re-scan the same page | Old results replaced cleanly with new scan | | |

---

## Section 3 — Test Cases Tab

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 3.1 | After scan, click "Generate Tests" | Loading indicator shown while generating | | |
| 3.2 | Generation completes | 10–14 test cases appear in the list | | |
| 3.3 | Expand a test case | Shows: title, numbered steps, expected result | | |
| 3.4 | Test cases are relevant to scanned page | Tests reference actual elements/actions from the page | | |
| 3.5 | Click "Generate Tests" without scanning first | Error message shown: "Please scan the page first" (or equivalent) | | |
| 3.6 | Generate tests with backend running | Tests generated via backend (check backend console logs) | | |
| 3.7 | Generate tests with backend OFFLINE | Tests still generate (fallback to direct Claude API) | | |
| 3.8 | Invalid / expired Claude API key | User-friendly error shown — no raw API error exposed | | |

---

## Section 4 — Script Tab (All 4 Frameworks)

Run each framework test independently. For each, verify the ZIP downloads and the contents are correct.

### 4A — Selenium + Python

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 4A.1 | Select "Selenium Python" → click Generate Script | ZIP file downloads | | |
| 4A.2 | Unzip and verify file structure | Contains: `base/`, `pages/`, `tests/`, `data/`, `config/` | | |
| 4A.3 | Open `tests/test_*.py` | Valid pytest test file with `def test_` functions | | |
| 4A.4 | Open `pages/page_*.py` | Page Object class with correct locators from scan | | |
| 4A.5 | Open `config/config.py` | Contains base URL, browser setting, timeout values | | |
| 4A.6 | Run `pytest` on the project | Tests execute (may fail on assertions — that's fine; no syntax errors) | | |

### 4B — Selenium + Java

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 4B.1 | Select "Selenium Java" → click Generate Script | ZIP file downloads | | |
| 4B.2 | Verify file structure | Contains Java class files in correct package structure | | |
| 4B.3 | Open test file | Valid TestNG `@Test` annotations present | | |
| 4B.4 | Open page object | Java class with `By` locators matching scanned elements | | |
| 4B.5 | Check imports | Correct Selenium + TestNG imports (no missing dependencies) | | |

### 4C — Playwright + Python

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 4C.1 | Select "Playwright Python" → click Generate Script | ZIP file downloads | | |
| 4C.2 | Open test file | Uses `playwright.sync_api`, valid `pytest` structure | | |
| 4C.3 | Open page object | Uses `page.locator()` with correct selectors | | |
| 4C.4 | Run `pytest --browser=chromium` | Tests execute without syntax errors | | |

### 4D — Playwright + TypeScript

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 4D.1 | Select "Playwright TypeScript" → click Generate Script | ZIP file downloads | | |
| 4D.2 | Open test file | Valid `@playwright/test` structure with `test()` blocks | | |
| 4D.3 | Open page object | TypeScript class with `Locator` types | | |
| 4D.4 | Run `npx playwright test` | Tests execute without compilation or syntax errors | | |

---

## Section 5 — CI/CD Tab

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 5.1 | Select "GitHub Actions" → Generate | Downloads or shows a valid `.yml` file | | |
| 5.2 | Open the `.yml` | Valid YAML syntax; contains `on: [push, pull_request]` trigger | | |
| 5.3 | Check install step | Correct package manager command for selected framework | | |
| 5.4 | Check test step | Correct test runner command (e.g. `pytest`, `npx playwright test`) | | |
| 5.5 | Select "Jenkins" → Generate | Downloads a valid `Jenkinsfile` | | |
| 5.6 | Open `Jenkinsfile` | Valid declarative pipeline with stages: Install, Test | | |
| 5.7 | Switch framework → regenerate CI/CD | CI config updates to match selected framework | | |

---

## Section 6 — Record Tab

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 6.1 | Click "Start Recording" | Recording indicator shown; Playwright session starts | | |
| 6.2 | Click several elements on the page | Each click captured in actions list | | |
| 6.3 | Type into a form field | Input action captured with actual typed text | | |
| 6.4 | Navigate to another URL | Navigation action captured | | |
| 6.5 | Click "Stop Recording" | Recording ends; full actions list displayed | | |
| 6.6 | Convert to Selenium Python | Valid Python Selenium code generated from recorded actions | | |
| 6.7 | Convert to Playwright TypeScript | Valid TypeScript Playwright code generated | | |
| 6.8 | Convert to all 4 frameworks | All 4 produce valid, framework-appropriate code | | |
| 6.9 | Record with no actions taken → stop | Graceful empty state — no crash | | |

---

## Section 7 — Backend

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 7.1 | Run `node server.js` in `qa-autopilot-backend/` | Server starts and logs "listening on port 3747" | | |
| 7.2 | Extension sidepanel shows backend as connected | Status indicator shows backend online | | |
| 7.3 | Generate tests with backend running | Request appears in backend console logs | | |
| 7.4 | Generate script with backend running | ZIP generated via backend, no errors | | |
| 7.5 | Kill backend process → generate tests | Extension falls back to direct Claude API; user sees fallback message | | |
| 7.6 | Restart backend → generate tests again | Backend reconnected; requests go through backend again | | |
| 7.7 | Send request with invalid Claude API key in backend | Backend returns user-friendly error; extension shows it cleanly | | |

---

## Section 8 — Website: Landing Page

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 8.1 | Load `localhost:3000` (or `qadeck.com`) | Page loads without errors | | |
| 8.2 | Navbar renders | Logo + nav links + Sign In + Get Started buttons visible | | |
| 8.3 | Click nav link "Features" | Scrolls to Features section | | |
| 8.4 | Click nav link "How it Works" | Scrolls to How it Works section | | |
| 8.5 | Hero section renders | Headline, subheadline, two CTA buttons, code preview visible | | |
| 8.6 | Features section renders | 3 feature cards visible with icons and descriptions | | |
| 8.7 | How It Works section renders | 3-step flow: Scan → Generate → Download | | |
| 8.8 | Frameworks section renders | Badges for all 4 supported frameworks | | |
| 8.9 | CTA banner renders | "Get Started" button navigates to `/signup` | | |
| 8.10 | Footer renders | Logo, links, copyright visible | | |
| 8.11 | Mobile view — 375px (iPhone) | Page layout not broken; text readable; no overflow | | |
| 8.12 | Tablet view — 768px (iPad) | Layout adapts correctly | | |
| 8.13 | Desktop view — 1440px | Full layout with correct spacing | | |
| 8.14 | No console errors | Browser console shows 0 errors on page load | | |

---

## Section 9 — Website: Signup

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 9.1 | Navigate to `/signup` | Signup form renders with Google button + email/password fields | | |
| 9.2 | Submit empty form | Validation errors shown for required fields | | |
| 9.3 | Enter invalid email format | Email validation error shown | | |
| 9.4 | Enter password under minimum length | Password validation error shown | | |
| 9.5 | Enter valid email + strong password → Submit | Account created; redirected to `/dashboard` | | |
| 9.6 | Click "Sign in with Google" | Redirected to Google OAuth page | | |
| 9.7 | Complete Google OAuth | Redirected back to app; landed on `/dashboard` | | |
| 9.8 | Try signing up with already-registered email | Error: "Email already in use" (or equivalent) | | |
| 9.9 | After signup → check Firestore | `users/{uid}` document created with email, name, createdAt | | |
| 9.10 | "Already have an account?" link | Navigates to `/signin` | | |

---

## Section 10 — Website: Signin

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 10.1 | Navigate to `/signin` | Signin form renders | | |
| 10.2 | Enter correct email + password | Signed in; redirected to `/dashboard` | | |
| 10.3 | Enter wrong password | Error: "Wrong password" or "Invalid credentials" | | |
| 10.4 | Enter non-existent email | Error: "No account found" or equivalent | | |
| 10.5 | Leave fields empty → submit | Validation errors shown | | |
| 10.6 | Click "Sign in with Google" → complete OAuth | Signed in; redirected to `/dashboard` | | |
| 10.7 | "Don't have an account?" link | Navigates to `/signup` | | |

---

## Section 11 — Website: Dashboard

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 11.1 | Visit `/dashboard` while signed in | Dashboard loads with user's name/avatar | | |
| 11.2 | All 4 stat cards visible | Scans Run, Tests Generated, Scripts Downloaded, Last Active | | |
| 11.3 | New user with 0 activity | All stats show 0; "Install the extension" CTA visible | | |
| 11.4 | Stats update after extension use | Run a scan → refresh dashboard → Scans Run increments | | |
| 11.5 | Last Active timestamp | Shows a valid date/time after any activity | | |
| 11.6 | Sign Out button | Signs out; redirected to `/signin` | | |
| 11.7 | Access `/dashboard` while NOT signed in | Redirected to `/signin` | | |
| 11.8 | Browser back button after sign out | Does NOT return to dashboard (session cleared) | | |
| 11.9 | Dashboard on mobile (375px) | Stat cards stack vertically; readable | | |

---

## Section 12 — Extension Auth & Usage Tracking

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 12.1 | Open extension sidepanel | Auth panel visible at bottom | | |
| 12.2 | Click "Sign in with Google" in extension | Google OAuth flow triggers | | |
| 12.3 | Complete Google sign-in | User avatar + display name shown in extension | | |
| 12.4 | Run a page scan (signed in) | `scansRun` increments in Firestore; dashboard shows updated count | | |
| 12.5 | Generate test cases (signed in) | `testsGenerated` increments in Firestore | | |
| 12.6 | Download a script ZIP (signed in) | `scriptsDownloaded` increments in Firestore | | |
| 12.7 | `lastActiveAt` on user doc | Updates after each usage event | | |
| 12.8 | Run scan while NOT signed in | Scan works normally; no Firestore error; usage not tracked | | |
| 12.9 | Sign out from extension | Auth panel returns to signed-out state | | |
| 12.10 | Sign back in | Usage tracking resumes correctly | | |

---

## Section 13 — Edge Cases & Error Handling

| # | Test | Expected Result | Status | Notes |
|---|---|---|---|---|
| 13.1 | Scan a page with only static content (no inputs/buttons) | Empty state message shown; no crash | | |
| 13.2 | Click "Generate Tests" before scanning | Error or prompt: "Scan the page first" | | |
| 13.3 | Click "Generate Script" before generating test cases | Error or prompt shown; no partial/broken output | | |
| 13.4 | Backend offline + no Claude API key set | Meaningful error shown; app does not crash | | |
| 13.5 | Scan while backend is restarting | Graceful retry or error message | | |
| 13.6 | Scan a page with 100+ elements | Completes without freezing or crashing | | |
| 13.7 | Open sidepanel on a `chrome://` page | Graceful message: "Cannot scan this page" | | |
| 13.8 | Open sidepanel on an extension page | Same graceful message | | |
| 13.9 | Network connection lost mid-generation | Error message shown; user can retry | | |
| 13.10 | Very slow page scan (5+ seconds) | Loading indicator shown throughout; no timeout crash | | |

---

## Section 14 — Cross-Platform

| # | Test | Platform | Expected Result | Status | Notes |
|---|---|---|---|---|---|
| 14.1 | Run extension | Chrome on macOS | All features work | | |
| 14.2 | Run extension | Chrome on Windows | All features work | | |
| 14.3 | Load website | Safari (macOS) | Landing page renders correctly | | |
| 14.4 | Load website | Firefox (latest) | Landing page renders correctly | | |
| 14.5 | Load website | Chrome on iOS | Responsive layout renders | | |
| 14.6 | Sign in via website | Safari | Google SSO redirect works | | |

---

## UAT Sign-Off

| Item | Value |
|---|---|
| **Tested by** | |
| **Test date** | |
| **Extension version** | v4 |
| **Backend version** | v4 |
| **Chrome version** | |
| **Overall result** | PASS / FAIL |
| **Blockers** | |
| **Notes** | |

---

### Known Limitations (at handover)

1. **Google sign-in in Chrome extension** requires the extension to be registered in Google Cloud Console OAuth credentials (same client ID as Firebase project).
2. **Recording tab** requires the local backend to be running (`node server.js`).
3. **iFrame and Shadow DOM** elements are not extracted during scan (Phase 2 roadmap item).
4. **Extension only works in Chrome** — not available for Firefox or Safari.
5. **Claude API key** must be configured before test/script generation works.

---

*QA Deck UAT Checklist — v1.0*

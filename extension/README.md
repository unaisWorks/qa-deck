# QA Deck — Chrome Extension

AI-powered test case and automation script generator for QA engineers.
Scan any page, generate structured test cases, and export Selenium or Playwright scripts in one click.

The extension can run in two modes:
- with the local backend running for recorder support, CI/CD generation, and disk-backed project storage
- in direct API mode, where generation calls are made from the extension itself

---

## Quick Setup

### 1. Get an API key

The current UI recognises these provider formats:
- Anthropic / Claude: `sk-ant-...`
- OpenAI: `sk-...` or `sk-proj-...`
- Google Gemini: `AIza...`
- xAI Grok: `xai-...`
- Groq-hosted Llama: `gsk_...`
- Meta-hosted Llama: `LA-...`

### 2. Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select this `qa-autopilot` folder

### 3. Open the side panel

- Click the QA Deck icon in the Chrome toolbar
- The side panel opens on the right side of the browser

### 4. Add your API key

- Click the settings icon in the panel header
- Paste your provider API key
- Click `Save settings`

### 5. Start scanning

- Navigate to any webpage
- Click `Start Scan`
- Review generated test cases and export scripts

---

## How It Works

### Core workflow

```text
1. SCAN          ->    2. REVIEW       ->    3. GENERATE
   Any webpage          Test cases            Full scripts
   including            Edit, approve,        Selenium Python/Java
   localhost and        delete, add           Playwright Python/TS
   authenticated        manual ones           Core file set plus
   pages                                      optional accessibility file
```

### Additional tabs

- `CI/CD` generates starter GitHub Actions, Jenkins, Docker Compose, and Makefile configs
- `Record` uses the backend recorder to capture a browser flow and turn it into steps, scripts, and test cases

### What gets extracted

The content script runs inside your real browser session and extracts:

| Element Type | What's Captured |
|---|---|
| Forms | Fields, labels, validation rules, submit buttons, form purpose |
| Inputs | Type, label, placeholder, required state, locator strategy |
| Buttons | Text, action type, disabled state |
| Links | Internal navigation links with paths |
| Tables | Headers, sorting, pagination, action buttons |
| Navigation | Menu items, active states |
| Modals | Dialogs, drawers, overlays |
| Alerts | Error messages, success toasts, warnings |
| Page structure | Tabs, carousels, date pickers, file uploads |
| Accessibility | ARIA, labels, and related metadata used for extra test generation |

### Locator priority

1. `data-testid` / `data-cy` / `data-qa`
2. Unique `id`
3. `aria-label`
4. `name`
5. Stable CSS selectors
6. XPath fallback

---

## Generated Script Structure

Every script generation produces 5 core files:

```text
project/
|-- base_test.py
|-- pages/
|   `-- login_page.py
|-- test_data.py
|-- tests/
|   `-- test_login.py
`-- pytest.ini
```

File names and structure adapt to the selected framework. When accessibility data is present, a sixth accessibility-focused file may also be included.

### Supported frameworks

| Framework | Language | Test Runner |
|---|---|---|
| Selenium | Python | pytest |
| Selenium | Java | TestNG |
| Playwright | Python | pytest-playwright |
| Playwright | TypeScript | Playwright Test |

---

## Features

### Element highlighter

Click any locator in the expanded test case view to highlight the element on the page and verify the selector before generating scripts.

### Smart locator generation

- Prefers `data-testid` and `aria-label`
- Avoids unstable generated class names where possible
- Falls back only when stronger locators are not available

### Inline editing

- Edit generated test cases in plain English
- Delete irrelevant cases
- Add manual cases
- Filter by priority or category

### Settings

- API key stored locally in Chrome storage
- Default framework preference
- Backend status indicator for local backend vs direct API mode

---

## Architecture

```text
Chrome Extension
|
|-- manifest.json
|
|-- src/content/
|   `-- content_script.js      DOM extractor and element highlighter
|
|-- src/background/
|   `-- service_worker.js      Message router, provider calls,
|                              backend fallback, project persistence
|
`-- src/sidepanel/
    |-- sidepanel.html         Side panel shell
    |-- sidepanel.css          Styles
    `-- sidepanel.js           UI controller for scan, review,
                               scripts, CI/CD, and recording
```

---

## Development

### No build step

This extension uses vanilla JS, CSS, and HTML. Edit files and click `Reload` on the extension card in `chrome://extensions`.

### Optional backend

The extension points at `http://localhost:3747` by default. Start `/Users/unais/Downloads/files/qa-autopilot-backend` if you want:
- disk-backed project saving
- recorder support
- local backend handling for generation requests
- backend-powered CI/CD config generation

### Testing the content script

Open DevTools on a target page and run:

```javascript
chrome.runtime.sendMessage({ type: "SCAN_PAGE" }, console.log);
```

---

## Privacy

- Page DOM data is sent to your selected AI provider for generation
- When the backend is running, requests are sent through your local backend on `localhost`
- Projects are stored either in `chrome.storage.local` or in the backend `projects/` folder
- API keys are stored in Chrome local storage by the extension UI

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Content script not responsive | Refresh the target page and try again |
| API errors | Re-check your API key and provider format in Settings |
| No elements found | Wait for the page to finish rendering, then scan again |
| Recorder is unavailable | Start the backend on `http://localhost:3747` |
| Extension won't load | Use a Chrome version with Manifest V3 support |

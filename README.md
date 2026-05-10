# QA Deck

> AI-powered test case and automation script generator — Chrome Extension

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Published-brightgreen)](https://chromewebstore.google.com/detail/qa-deck/gbccfimmhbdebhiihkgmcdajnbakojed)
[![License](https://img.shields.io/badge/License-MIT%20%2B%20Commons%20Clause-blue)](#license)

Point QA Deck at any webpage and get production-ready test cases and Selenium/Playwright automation scripts in seconds. No more manual boilerplate.

---

## What it does

1. **Scan** — Click the extension on any webpage. It extracts all interactive elements, forms, buttons, and navigation.
2. **Generate** — AI produces structured test cases covering positive, negative, and edge case scenarios.
3. **Export** — Get automation scripts in your preferred framework instantly.

---

## Supported AI Providers

| Provider | Key Format |
|----------|-----------|
| Claude (Anthropic) | `sk-ant-...` |
| OpenAI (GPT-4) | `sk-...` |
| Gemini (Google) | `AIza...` |
| Grok (xAI) | `xai-...` |
| Llama via Groq | `gsk_...` |
| Llama via Meta | `LA-...` |

Bring your own API key. Keys are stored locally in your browser only.

---

## Supported Frameworks

- Selenium Python
- Selenium Java
- Playwright Python
- Playwright TypeScript

---

## Project Structure

```
qa-deck/
├── extension/        # Chrome Extension (Manifest V3)
│   └── src/
│       ├── background/   # Service worker, AI routing
│       ├── content/      # Page scanner
│       └── sidepanel/    # UI
├── backend/          # Node.js API server (optional)
│   ├── server.js
│   └── projects/     # Saved projects (gitignored)
└── website/          # Next.js marketing site (qadeck.com)
```

---

## Architecture

```
Extension (Chrome)
    │
    ├── Scan page  →  content_script.js extracts DOM elements
    │
    ├── Generate   →  service_worker.js routes to AI provider
    │                  └── Backend (optional) or direct browser API call
    │
    └── Fallback   →  if backend offline, calls AI API directly
```

---

## Running Locally

### Extension
1. Clone the repo
2. Open `chrome://extensions`
3. Enable Developer Mode
4. Click **Load unpacked** → select the `extension/` folder

### Backend (optional)
```bash
cd backend
npm install
npm start
# Runs on http://localhost:3747
```

### Website
```bash
cd website
npm install
npm run dev
# Runs on http://localhost:3000
```

---

## Install from Chrome Web Store

[Install QA Deck](https://chromewebstore.google.com/detail/qa-deck/gbccfimmhbdebhiihkgmcdajnbakojed)

---

## License

MIT License with Commons Clause.
Free for personal and open source use. Commercial use requires written permission.
See [LICENSE](./LICENSE) for full terms.

---

Built by [Unais](https://github.com/unaisLearning) — open sourced as a community contribution to the QA and developer community.

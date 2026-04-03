# QA Deck — Backend API

Local Node.js backend for the QA Deck Chrome extension.

It provides:
- AI generation endpoints used by the extension
- disk-backed project storage
- a Playwright-powered recorder
- static dashboard pages for projects and recording

The server entry point is `server.js`.

## Start

In a clean checkout, install dependencies first:

```bash
npm install
npm start
# or
./start.sh
```

Server starts on `http://localhost:3747`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check and project count |
| POST | `/api/generate-tests` | Generate test cases from extracted page data |
| POST | `/api/generate-script` | Generate automation scripts |
| POST | `/api/save-project` | Save a project to disk |
| GET | `/api/projects` | List saved projects |
| GET | `/api/projects/:id` | Fetch a specific project |
| POST | `/api/generate-cicd` | Generate CI/CD starter files |
| POST | `/api/record/start` | Start a recorder session |
| GET | `/api/record/sessions` | List recorder sessions |
| GET | `/api/proxy` | Proxy a page into the recorder dashboard |

## Request format

### POST /api/generate-tests

```json
{
  "pageData": { "...": "From the extension content script" },
  "apiKey": "provider-specific key"
}
```

### POST /api/generate-script

```json
{
  "testCases": [],
  "pageData": {},
  "framework": "selenium-python | selenium-java | playwright-python | playwright-typescript",
  "apiKey": "provider-specific key"
}
```

## Architecture

```text
Extension                     Backend                    Provider API
   |                             |                           |
   |- SCAN_PAGE ---------------> | not involved              |
   |                             |                           |
   |- GENERATE_TESTS ----------> | POST /api/generate-tests  |
   |                             |-------------------------->|
   |                             |<--------------------------|
   |<----------------------------| { testCases: [...] }      |
   |                             |                           |
   |- GENERATE_SCRIPT ---------> | POST /api/generate-script |
   |                             |-------------------------->|
   |                             |<--------------------------|
   |<----------------------------| { scripts: {...} }        |
   |                             |                           |
   |- RECORD / CI-CD ----------> | local-only routes         |
```

If the backend is offline, the extension falls back to direct browser-side provider calls for test generation, script generation, and local project storage. Recorder features remain backend-only.

## Offline / Fallback mode

When the backend is unreachable:
- generation calls are made directly from the extension service worker
- projects are saved in `chrome.storage.local` instead of disk
- the side panel shows `Direct API mode`
- recorder and dashboard features are unavailable

## Projects storage

Projects are saved as JSON files in `./projects/`:

```text
projects/
  abc123.json
  def456.json
```

## Rate limiting

The current code allows up to 300 requests/minute per non-local IP and skips rate limiting for localhost recorder traffic. If you change that behavior, update this document at the same time.

## Port

Default:

```bash
PORT=3747 npm start
```

Override:

```bash
PORT=4000 npm start
```

## Notes for contributors

- `package.json` includes convenience scripts for `start` and `dev`
- `.env.example` documents only the environment variables currently used by the server
- `playwright` is required for recorder functionality
- generated project files and `node_modules/` should not be treated as source files

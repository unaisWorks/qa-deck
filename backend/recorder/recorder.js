/**
 * QA Deck — Playwright Recorder Engine (v3 - fully fixed)
 */

const { chromium } = require("playwright");
const { EventEmitter } = require("events");

class PlaywrightRecorder extends EventEmitter {
  constructor(options = {}) {
    super();
    this.startUrl    = options.startUrl || "about:blank";
    this.pollMs      = 500;
    this.headless    = options.headless || false;
    this.sessionId   = options.sessionId || Date.now().toString(36);
    this.browser     = null;
    this.context     = null;
    this.page        = null;
    this.actions     = [];       // ALL captured actions (persists across navigations)
    this.pollTimer   = null;
    this.isRecording = false;
    this.startTime   = null;
    this._counter    = 0;
  }

  _id() { return `a${++this._counter}`; }
  _t()  { return this.startTime ? Date.now() - this.startTime : 0; }

  // ── Injector script (runs inside browser) ─────────────────────────────────
  // IMPORTANT: this is a plain function — no Node.js closures allowed.
  static _injector() {
    if (window.__QA_ACTIVE) return;
    window.__QA_ACTIVE = true;
    window.__QA_QUEUE  = window.__QA_QUEUE || [];

    function locator(el) {
      if (!el) return null;
      try {
        // data-test / data-testid / data-cy
        const tid = el.dataset && (el.dataset.testid || el.dataset.test || el.dataset.cy || el.dataset.qa);
        if (tid) return '[data-testid="' + tid + '"]';
        // unique id
        if (el.id) {
          const escaped = el.id.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
          try { if (document.querySelectorAll('#' + escaped).length === 1) return '#' + el.id; } catch(e) {}
        }
        // aria-label
        const aria = el.getAttribute('aria-label');
        if (aria) return '[aria-label="' + aria.replace(/"/g, '\\"') + '"]';
        // name attr
        if (el.name) return '[name="' + el.name + '"]';
        // button/link by text
        const tag  = (el.tagName || '').toLowerCase();
        const text = (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        if ((tag === 'button' || tag === 'a') && text) {
          try {
            const matches = Array.from(document.querySelectorAll(tag))
              .filter(function(e) { return (e.textContent || '').trim().replace(/\s+/g,' ').slice(0,40) === text; });
            if (matches.length === 1) return tag + ':has-text("' + text.replace(/"/g, '\\"') + '")';
          } catch(e) {}
        }
        return tag || 'element';
      } catch(e) { return 'element'; }
    }

    function getLabel(el) {
      try {
        if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
        if (el.id) {
          const lbl = document.querySelector('label[for="' + el.id + '"]');
          if (lbl) return lbl.textContent.trim();
        }
        if (el.placeholder) return el.placeholder;
        const prev = el.previousElementSibling;
        if (prev && prev.tagName === 'LABEL') return prev.textContent.trim().slice(0, 60);
      } catch(e) {}
      return null;
    }

    function push(obj) {
      obj.ts = Date.now();
      window.__QA_QUEUE.push(obj);
    }

    // ── Click ──
    document.addEventListener('click', function(e) {
      try {
        const el = e.target.closest('button, a, [role="button"], input[type="checkbox"], input[type="radio"], label');
        if (!el) return;
        if (el.type === 'checkbox') {
          push({ type: 'check', locator: locator(el), checked: el.checked, label: getLabel(el) });
        } else if (el.type === 'radio') {
          push({ type: 'radio', locator: locator(el), value: el.value, label: getLabel(el) });
        } else {
          const text = (el.textContent || el.value || '').trim().replace(/\s+/g,' ').slice(0, 80);
          push({ type: 'click', locator: locator(el), text: text, tag: (el.tagName||'').toLowerCase() });
        }
      } catch(e) {}
    }, true);

    // ── Fill (on blur — always fires when user leaves a field) ──
    document.addEventListener('blur', function(e) {
      try {
        const el = e.target;
        if (!el || !['INPUT','TEXTAREA'].includes(el.tagName)) return;
        if (['checkbox','radio','submit','button','reset'].includes(el.type)) return;
        const val = el.value;
        if (!val && val !== '0') return;  // skip empty
        // Avoid duplicate if change event already captured same value
        const q = window.__QA_QUEUE;
        const last = q[q.length - 1];
        if (last && last.type === 'fill' && last.locator === locator(el) && last.value === val) return;
        push({ type: 'fill', locator: locator(el), value: val, inputType: el.type || 'text', label: getLabel(el) });
      } catch(e) {}
    }, true);

    // ── Select ──
    document.addEventListener('change', function(e) {
      try {
        const el = e.target;
        if (!el || el.tagName !== 'SELECT') return;
        const opt = el.options[el.selectedIndex];
        push({ type: 'select', locator: locator(el), value: el.value, optionText: opt ? opt.text : el.value, label: getLabel(el) });
      } catch(e) {}
    }, true);

    // ── Keyboard (Enter/Escape) ──
    document.addEventListener('keydown', function(e) {
      try {
        if (e.key === 'Enter') {
          const el = e.target;
          if (el && ['BUTTON','A'].includes(el.tagName)) return; // handled by click
          push({ type: 'press', key: 'Enter', locator: locator(el) });
        }
        if (e.key === 'Escape') push({ type: 'press', key: 'Escape' });
      } catch(e) {}
    }, true);

    // ── Form submit ──
    document.addEventListener('submit', function(e) {
      try { push({ type: 'submit', locator: locator(e.target) }); } catch(e) {}
    }, true);
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  async start() {
    if (this.isRecording) throw new Error("Already recording");

    this.browser = await chromium.launch({ headless: this.headless });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    // Inject before EVERY page/frame load — this is the most reliable way
    await this.context.addInitScript(PlaywrightRecorder._injector);

    // New popup/tab support
    this.context.on("page", (pg) => this._attachListeners(pg));

    this.page = await this.context.newPage();
    this._attachListeners(this.page);

    this.isRecording = true;
    this.startTime   = Date.now();
    this._counter    = 0;
    this.actions     = [];

    if (this.startUrl !== "about:blank") {
      await this.page.goto(this.startUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    }

    // Seed with initial navigate
    this.actions.push({ type: "navigate", url: this.startUrl, id: this._id(), sessionTime: 0, ts: Date.now() });

    this._startPolling();
    this.emit("started", { sessionId: this.sessionId });
    return this.sessionId;
  }

  // ── Stop ──────────────────────────────────────────────────────────────────
  async stop() {
    this._stopPolling();
    await this._poll().catch(() => {});   // final drain
    this.isRecording = false;
    const actions = [...this.actions];
    this.emit("stopped", { actions });
    await this.browser?.close().catch(() => {});
    this.browser = null; this.context = null; this.page = null;
    return actions;
  }

  // ── Polling ───────────────────────────────────────────────────────────────
  _startPolling() {
    this.pollTimer = setInterval(() => this._poll().catch(() => {}), this.pollMs);
  }

  _stopPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  async _poll() {
    if (!this.page || this.page.isClosed()) return;

    const raw = await this.page.evaluate(function() {
      var q = window.__QA_QUEUE || [];
      window.__QA_QUEUE = [];
      return q;
    }).catch(() => []);

    if (!raw || !raw.length) return;

    // Dedup: consecutive fills on same locator → keep last
    const deduped = [];
    for (let i = 0; i < raw.length; i++) {
      const curr = raw[i], next = raw[i + 1];
      if (curr.type === "fill" && next && next.type === "fill" && curr.locator === next.locator) continue;
      deduped.push(curr);
    }

    for (const a of deduped) {
      const action = { ...a, id: this._id(), sessionTime: this._t() };
      this.actions.push(action);
      this.emit("action", action);
    }
  }

  // ── Page listeners ────────────────────────────────────────────────────────
  _attachListeners(pg) {
    // Capture navigations (these come from Playwright, not the injected script)
    pg.on("framenavigated", (frame) => {
      if (frame !== pg.mainFrame()) return;
      const url = frame.url();
      if (!url || url === "about:blank" || url === this.startUrl) return;
      const action = { type: "navigate", url, id: this._id(), sessionTime: this._t(), ts: Date.now() };
      this.actions.push(action);
      this.emit("action", action);
    });

    // Dialogs
    pg.on("dialog", async (dialog) => {
      const action = { type: "dialog", dialogType: dialog.type(), message: dialog.message(), id: this._id(), sessionTime: this._t(), ts: Date.now() };
      this.actions.push(action);
      this.emit("action", action);
      await dialog.accept().catch(() => {});
    });

    // Re-inject on full page loads (multi-page apps, non-SPA)
    pg.on("load", async () => {
      try { await pg.evaluate(PlaywrightRecorder._injector); } catch (_) {}
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  getActions() { return [...this.actions]; }
  getStatus()  {
    return {
      isRecording:  this.isRecording,
      actionCount:  this.actions.length,
      duration:     this._t(),
      sessionId:    this.sessionId,
    };
  }
}

// ── Session manager ───────────────────────────────────────────────────────────
class RecorderSessionManager {
  constructor() { this.sessions = new Map(); }

  async createSession(options) {
    const recorder  = new PlaywrightRecorder(options);
    const sessionId = await recorder.start();
    this.sessions.set(sessionId, { recorder, startedAt: Date.now() });
    setTimeout(() => this.destroySession(sessionId).catch(() => {}), 30 * 60 * 1000);
    return { sessionId, recorder };
  }

  async destroySession(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    const actions = await s.recorder.stop();
    this.sessions.delete(sessionId);
    return actions;
  }

  getSession(sessionId)  { return this.sessions.get(sessionId)?.recorder || null; }

  listSessions() {
    return Array.from(this.sessions.entries()).map(([id, s]) => ({
      sessionId: id, ...s.recorder.getStatus(), startedAt: s.startedAt,
    }));
  }
}

module.exports = { PlaywrightRecorder, RecorderSessionManager };

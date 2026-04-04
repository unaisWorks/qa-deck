/**
 * QA Deck — Content Script
 * Runs inside the target page. Extracts a rich, structured
 * representation of all interactive elements for test generation.
 */

// Guard: content script may be injected multiple times (manifest + executeScript).
// Use an outer block instead of a top-level return so the file stays valid in browser script contexts.
if (typeof window.__qaDeckCS === "undefined") {
window.__qaDeckCS = true;

// ─── Inspect mode state ───────────────────────────────────────────────────────

let inspectMode = false;
let inspectHoverEl = null;
const WEBSITE_BRIDGE_SOURCE = "qadeck-website";
const EXTENSION_BRIDGE_SOURCE = "qadeck-extension";
const BRIDGE_REQUEST_TYPE = "QADECK_BRIDGE_REQUEST";
const BRIDGE_RESPONSE_TYPE = "QADECK_BRIDGE_RESPONSE";
function isAllowedWebsiteOrigin(origin) {
  if (!origin) return false;
  if (origin === "https://qadeck.com" || origin === "https://www.qadeck.com") return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}
const ALLOWED_BRIDGE_TYPES = new Set([
  "QADECK_PING",
  "QADECK_GET_CONNECTION_STATE",
  "QADECK_CONNECT_SESSION",
  "QADECK_OPEN_SIDEPANEL",
  "QADECK_OPEN_PROJECT_CONTEXT",
  "QADECK_DISCONNECT_SESSION",
  "QADECK_GET_API_KEY",
  "QADECK_RESCAN_PROJECT",
]);

announceExtensionPresence();

// ─── Message listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ status: "ready" });
    return true;
  }

  if (message.type === "EXTRACT_PAGE") {
    try {
      const result = extractPage();
      sendResponse({ success: true, data: result });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (message.type === "HIGHLIGHT_ELEMENT") {
    highlightElement(message.selector);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "CLEAR_HIGHLIGHTS") {
    clearHighlights();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "START_INSPECTING") {
    startInspecting();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "STOP_INSPECTING") {
    stopInspecting();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "TEST_LOCATOR") {
    const result = testLocator(message.selector, message.selectorType);
    sendResponse(result);
    return true;
  }

  if (message.type === "SHOW_COVERAGE_HEATMAP") {
    showCoverageHeatmap(message.covered || [], message.uncovered || []);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "CLEAR_COVERAGE_HEATMAP") {
    clearCoverageHeatmap();
    sendResponse({ success: true });
    return true;
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!isAllowedWebsiteOrigin(event.origin)) return;

  const payload = event.data;
  if (!payload || payload.source !== WEBSITE_BRIDGE_SOURCE || payload.type !== BRIDGE_REQUEST_TYPE) return;
  if (!payload.message?.type || !ALLOWED_BRIDGE_TYPES.has(payload.message.type)) return;

  if (!chrome?.runtime?.id) {
    window.postMessage(
      {
        source: EXTENSION_BRIDGE_SOURCE,
        type: BRIDGE_RESPONSE_TYPE,
        bridgeId: payload.bridgeId,
        response: { success: false, installed: false, error: "Extension context invalidated" },
      },
      event.origin
    );
    return;
  }

  try {
    chrome.runtime.sendMessage(payload.message, (response) => {
      const error = chrome.runtime.lastError?.message || null;
      window.postMessage(
        {
          source: EXTENSION_BRIDGE_SOURCE,
          type: BRIDGE_RESPONSE_TYPE,
          bridgeId: payload.bridgeId,
          response: error ? { success: false, installed: false, error } : response,
        },
        event.origin
      );
    });
  } catch (error) {
    window.postMessage(
      {
        source: EXTENSION_BRIDGE_SOURCE,
        type: BRIDGE_RESPONSE_TYPE,
        bridgeId: payload.bridgeId,
        response: {
          success: false,
          installed: false,
          error: error instanceof Error ? error.message : "Extension context invalidated",
        },
      },
      event.origin
    );
  }
});

function announceExtensionPresence() {
  try {
    document.documentElement?.setAttribute("data-qadeck-extension", "installed");
  } catch (_) {}

  try {
    chrome.runtime.sendMessage({ type: "QADECK_GET_CONNECTION_STATE" }, (response) => {
      const error = chrome.runtime.lastError?.message || null;
      window.postMessage(
        {
          source: EXTENSION_BRIDGE_SOURCE,
          type: "QADECK_BRIDGE_BOOTSTRAP",
          response: error
            ? { installed: true, connected: false, error }
            : { installed: true, ...(response || {}) },
        },
        window.location.origin
      );
    });
  } catch (_) {
    window.postMessage(
      {
        source: EXTENSION_BRIDGE_SOURCE,
        type: "QADECK_BRIDGE_BOOTSTRAP",
        response: { installed: true, connected: false },
      },
      window.location.origin
    );
  }
}

// ─── Main extractor ───────────────────────────────────────────────────────────

function extractPage() {
  return {
    meta: extractMeta(),
    forms: extractForms(),
    buttons: extractButtons(),
    links: extractLinks(),
    inputs: extractStandaloneInputs(),
    tables: extractTables(),
    navigation: extractNavigation(),
    modals: extractModals(),
    alerts: extractAlerts(),
    headings: extractHeadings(),
    pageStructure: extractPageStructure(),
    accessibility: extractAccessibilityInfo(),
    iframes: extractIframes(),
    shadowElements: extractShadowDOM(),
    performance: extractPerformanceMetrics(),
    timestamp: Date.now(),
  };
}

}

// ─── Performance Metrics ──────────────────────────────────────────────────────

function extractPerformanceMetrics() {
  try {
    const nav = window.performance?.getEntriesByType?.("navigation")?.[0] || {};
    const paint = window.performance?.getEntriesByType?.("paint") || [];
    const fp  = paint.find(p => p.name === "first-paint")?.startTime;
    const fcp = paint.find(p => p.name === "first-contentful-paint")?.startTime;
    const resources = window.performance?.getEntriesByType?.("resource") || [];

    return {
      loadTime:           nav.loadEventEnd  ? Math.round(nav.loadEventEnd  - nav.startTime) : null,
      domContentLoaded:   nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
      ttfb:               nav.responseStart ? Math.round(nav.responseStart - nav.startTime) : null,
      firstPaint:         fp  ? Math.round(fp)  : null,
      fcp:                fcp ? Math.round(fcp) : null,
      transferSize:       nav.transferSize   || null,
      resourceCount:      resources.length,
      // Suggest SLA thresholds based on measured values
      suggestedThresholds: {
        loadTime:         3000,
        fcp:              2500,
        ttfb:             800,
      },
    };
  } catch (_) {
    return null;
  }
}

// ─── iFrame extraction ────────────────────────────────────────────────────────

function extractIframes() {
  const frames = [];
  document.querySelectorAll("iframe").forEach((iframe, idx) => {
    const name = iframe.name || iframe.id || null;
    const src = iframe.src || null;
    const title = iframe.title || null;
    const locator = name
      ? `iframe[name="${name}"]`
      : iframe.id
      ? `#${iframe.id}`
      : `iframe:nth-of-type(${idx + 1})`;

    const base = { index: idx, name, src, title, locator, crossOrigin: false, elements: [] };

    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) {
        base.crossOrigin = true;
        base.note = "Cross-origin iframe — elements cannot be accessed";
      } else {
        // Same-origin: extract interactive elements
        base.elements = extractInteractiveFromRoot(doc);
      }
    } catch (_) {
      base.crossOrigin = true;
      base.note = "Cross-origin iframe — elements cannot be accessed";
    }

    frames.push(base);
  });
  return frames;
}

function extractInteractiveFromRoot(root) {
  const elements = [];
  const selector = [
    'input:not([type="hidden"])',
    "select",
    "textarea",
    "button",
    '[role="button"]',
    'a[href]',
  ].join(",");

  root.querySelectorAll(selector).forEach((el) => {
    try {
      const tag = el.tagName.toLowerCase();
      const id = el.id || null;
      const name = el.name || null;
      const text = el.textContent?.trim().slice(0, 60) || null;
      const ariaLabel = el.getAttribute("aria-label") || null;
      const testId = el.getAttribute("data-testid") || el.getAttribute("data-test") || null;
      const locator = id
        ? `#${id}`
        : testId
        ? `[data-testid="${testId}"]`
        : ariaLabel
        ? `[aria-label="${ariaLabel}"]`
        : name
        ? `[name="${name}"]`
        : `${tag}`;
      elements.push({ tag, id, name, text, ariaLabel, testId, locator });
    } catch (_) {}
  });
  return elements.slice(0, 20); // cap per-frame elements
}

// ─── Shadow DOM extraction ────────────────────────────────────────────────────

function extractShadowDOM() {
  const shadowElements = [];
  const allEls = document.querySelectorAll("*");
  allEls.forEach((el) => {
    if (!el.shadowRoot) return;
    const hostTag = el.tagName.toLowerCase();
    const hostId = el.id || null;
    const hostClass = el.className && typeof el.className === "string"
      ? el.className.split(" ").filter(Boolean)[0] || null
      : null;
    const hostSelector = hostId ? `#${hostId}` : hostClass ? `${hostTag}.${hostClass}` : hostTag;
    const children = extractInteractiveFromRoot(el.shadowRoot);
    if (children.length === 0) return;
    shadowElements.push({
      host: hostSelector,
      hostTag,
      elements: children,
      note: "Shadow DOM — use Playwright's locator piercing or Selenium JS executor",
    });
  });
  return shadowElements;
}

// ─── Meta information ─────────────────────────────────────────────────────────

function extractMeta() {
  return {
    url: window.location.href,
    path: window.location.pathname,
    title: document.title,
    description: getMeta("description"),
    keywords: getMeta("keywords"),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollHeight: document.body.scrollHeight,
    },
    hasAuth: detectAuthPage(),
    pageType: detectPageType(),
    framework: detectFramework(),
  };
}

function getMeta(name) {
  const el =
    document.querySelector(`meta[name="${name}"]`) ||
    document.querySelector(`meta[property="og:${name}"]`);
  return el ? el.getAttribute("content") : null;
}

function detectAuthPage() {
  const signals = [
    document.querySelector('input[type="password"]'),
    document.querySelector('[class*="login"]'),
    document.querySelector('[class*="signin"]'),
    document.querySelector('[id*="login"]'),
    /login|signin|sign-in|auth/i.test(window.location.pathname),
  ];
  return signals.some(Boolean);
}

function detectPageType() {
  const path = window.location.pathname.toLowerCase();
  const bodyText = document.body.innerText.toLowerCase().slice(0, 2000);

  if (/login|signin|sign-in/.test(path)) return "login";
  if (/register|signup|sign-up|create-account/.test(path)) return "registration";
  if (/checkout|payment|billing/.test(path)) return "checkout";
  if (/dashboard|home|overview/.test(path)) return "dashboard";
  if (/search|results/.test(path)) return "search";
  if (/profile|account|settings/.test(path)) return "settings";
  if (/product|item|detail/.test(path)) return "product";
  if (document.querySelector("table")) return "data-table";
  if (document.querySelector("form")) return "form";
  return "general";
}

function detectFramework() {
  const detected = [];
  if (window.React || document.querySelector("[data-reactroot]")) detected.push("React");
  if (window.angular || document.querySelector("[ng-app],[data-ng-app]")) detected.push("Angular");
  if (window.Vue || document.querySelector("[data-v-]")) detected.push("Vue");
  if (window.next) detected.push("Next.js");
  if (window.Ember) detected.push("Ember");
  return detected.length ? detected : ["Unknown"];
}

// ─── Forms ────────────────────────────────────────────────────────────────────

function extractForms() {
  return Array.from(document.querySelectorAll("form")).map((form, idx) => {
    const fields = extractFormFields(form);
    const submitBtn = form.querySelector('[type="submit"], button:not([type])');

    return {
      index: idx,
      id: form.id || null,
      name: form.name || null,
      action: form.action || null,
      method: form.method || "get",
      locator: getBestLocator(form),
      fields,
      submitButton: submitBtn ? elementInfo(submitBtn) : null,
      validationRules: extractValidationRules(form),
      hasRequired: fields.some((f) => f.required),
      fieldCount: fields.length,
      purpose: inferFormPurpose(form, fields),
    };
  });
}

function extractFormFields(form) {
  const selector =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea, [role="textbox"], [role="combobox"], [role="listbox"]';
  return Array.from(form.querySelectorAll(selector))
    .filter((el) => isVisible(el))
    .map((el) => extractInputDetail(el));
}

function extractValidationRules(form) {
  const rules = [];
  form.querySelectorAll("input, select, textarea").forEach((el) => {
    const r = {};
    if (el.required) r.required = true;
    if (el.minLength > 0) r.minLength = el.minLength;
    if (el.maxLength > 0 && el.maxLength < 524288) r.maxLength = el.maxLength;
    if (el.min) r.min = el.min;
    if (el.max) r.max = el.max;
    if (el.pattern) r.pattern = el.pattern;
    if (el.type === "email") r.emailFormat = true;
    if (el.type === "url") r.urlFormat = true;
    if (el.type === "number") r.numeric = true;
    if (Object.keys(r).length) {
      rules.push({ field: getBestLocator(el), rules: r });
    }
  });
  return rules;
}

function inferFormPurpose(form, fields) {
  const hasPassword = fields.some((f) => f.type === "password");
  const hasEmail = fields.some((f) => f.type === "email" || f.name?.includes("email"));
  const hasConfirmPassword = fields.some(
    (f) => f.name?.includes("confirm") || f.placeholder?.toLowerCase().includes("confirm")
  );
  const fieldCount = fields.length;

  if (hasPassword && hasEmail && !hasConfirmPassword && fieldCount <= 3) return "login";
  if (hasPassword && hasConfirmPassword) return "registration";
  if (hasPassword && !hasEmail) return "password-change";
  if (fields.some((f) => f.name?.includes("card") || f.name?.includes("cvv"))) return "payment";
  if (fields.some((f) => f.name?.includes("search") || f.type === "search")) return "search";
  if (fields.some((f) => f.name?.includes("address") || f.name?.includes("zip"))) return "address";
  if (fieldCount === 1 && fields[0]?.type === "email") return "newsletter";
  return "generic";
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

function extractStandaloneInputs() {
  // Inputs NOT inside a <form>
  const allInputs = document.querySelectorAll(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea'
  );
  return Array.from(allInputs)
    .filter((el) => !el.closest("form") && isVisible(el))
    .map(extractInputDetail);
}

function extractInputDetail(el) {
  const label = findLabel(el);
  return {
    tag: el.tagName.toLowerCase(),
    type: el.type || el.tagName.toLowerCase(),
    id: el.id || null,
    name: el.name || null,
    placeholder: el.placeholder || null,
    label: label,
    value: el.value || null,
    required: el.required,
    disabled: el.disabled,
    readOnly: el.readOnly,
    autocomplete: el.autocomplete || null,
    ariaLabel: el.getAttribute("aria-label") || null,
    ariaDescribedBy: el.getAttribute("aria-describedby") || null,
    testId: getTestId(el),
    locator: getBestLocator(el),
    locatorStrategy: getLocatorStrategy(el),
    options: el.tagName === "SELECT" ? extractSelectOptions(el) : null,
    validationMessage: el.validationMessage || null,
    flaky: isFlakyElement(el),
  };
}

function findLabel(el) {
  // 1. aria-labelledby
  const lblId = el.getAttribute("aria-labelledby");
  if (lblId) {
    const lbl = document.getElementById(lblId);
    if (lbl) return lbl.textContent.trim();
  }
  // 2. aria-label
  if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
  // 3. <label for="id">
  if (el.id) {
    const lbl = document.querySelector(`label[for="${el.id}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  // 4. wrapping <label>
  const wrapping = el.closest("label");
  if (wrapping) return wrapping.textContent.replace(el.value, "").trim();
  // 5. preceding sibling text
  const prev = el.previousElementSibling;
  if (prev && ["LABEL", "SPAN", "P", "DIV"].includes(prev.tagName)) {
    const text = prev.textContent.trim();
    if (text.length < 80) return text;
  }
  // 6. placeholder fallback
  return el.placeholder || null;
}

function extractSelectOptions(select) {
  return Array.from(select.options).map((o) => ({
    value: o.value,
    text: o.text,
    selected: o.selected,
    disabled: o.disabled,
  }));
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

function extractButtons() {
  const selector = [
    'button',
    '[role="button"]',
    'a[class*="btn"]',
    'a[class*="button"]',
    'input[type="button"]',
    'input[type="submit"]',
    'input[type="reset"]',
    '[class*="btn-"]:not(a)',
    '[class*="button-"]:not(a)',
  ].join(",");

  return Array.from(document.querySelectorAll(selector))
    .filter(isVisible)
    .map((el) => ({
      text: el.textContent.trim().slice(0, 100),
      type: el.type || el.tagName.toLowerCase(),
      id: el.id || null,
      ariaLabel: el.getAttribute("aria-label") || null,
      disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
      testId: getTestId(el),
      locator: getBestLocator(el),
      locatorStrategy: getLocatorStrategy(el),
      action: inferButtonAction(el),
      hasIcon: !!el.querySelector("svg, img, i[class*='icon']"),
      flaky: isFlakyElement(el),
    }))
    .filter((b) => b.text || b.ariaLabel); // skip invisible/icon-only without label
}

function inferButtonAction(el) {
  const text = (el.textContent + " " + (el.getAttribute("aria-label") || "")).toLowerCase();
  if (/submit|save|confirm|create|add|send|publish/.test(text)) return "submit";
  if (/cancel|close|dismiss|back/.test(text)) return "cancel";
  if (/delete|remove|clear/.test(text)) return "delete";
  if (/edit|update|change|modify/.test(text)) return "edit";
  if (/next|continue|proceed/.test(text)) return "navigate-next";
  if (/prev|previous/.test(text)) return "navigate-prev";
  if (/search|find|filter/.test(text)) return "search";
  if (/login|signin|sign in/.test(text)) return "auth";
  if (/logout|signout/.test(text)) return "deauth";
  if (/upload|attach/.test(text)) return "upload";
  if (/download|export/.test(text)) return "download";
  return "generic";
}

// ─── Links ────────────────────────────────────────────────────────────────────

function extractLinks() {
  return Array.from(document.querySelectorAll("a[href]"))
    .filter(isVisible)
    .filter((a) => {
      const href = a.getAttribute("href");
      return href && href !== "#" && !href.startsWith("javascript:");
    })
    .map((a) => ({
      text: a.textContent.trim().slice(0, 100),
      href: a.href,
      path: new URL(a.href, window.location.href).pathname,
      isExternal: a.hostname !== window.location.hostname,
      ariaLabel: a.getAttribute("aria-label") || null,
      testId: getTestId(a),
      locator: getBestLocator(a),
      opensNewTab: a.target === "_blank",
    }))
    .filter((l) => l.text || l.ariaLabel)
    .slice(0, 50); // cap at 50 to avoid overwhelming
}

// ─── Tables ───────────────────────────────────────────────────────────────────

function extractTables() {
  return Array.from(document.querySelectorAll("table, [role='grid'], [role='table']"))
    .filter(isVisible)
    .map((table, idx) => {
      const headers = Array.from(
        table.querySelectorAll("th, [role='columnheader']")
      ).map((th) => th.textContent.trim());
      const rows = table.querySelectorAll("tr, [role='row']");
      const hasActions = Array.from(
        table.querySelectorAll("button, a, [role='button']")
      ).length > 0;

      return {
        index: idx,
        locator: getBestLocator(table),
        headers,
        rowCount: rows.length,
        hasSorting: !!table.querySelector("[aria-sort]"),
        hasPagination: detectPagination(),
        hasSearch: !!document.querySelector('[placeholder*="search" i], [aria-label*="search" i]'),
        hasActions,
        hasCheckboxes: !!table.querySelector('input[type="checkbox"]'),
        purpose: headers.length ? `Data table with columns: ${headers.slice(0, 5).join(", ")}` : "Data table",
      };
    });
}

function detectPagination() {
  return !!(
    document.querySelector('[aria-label*="pagination" i]') ||
    document.querySelector('[class*="pagination"]') ||
    document.querySelector('[class*="pager"]') ||
    document.querySelector('button[aria-label*="next page" i]') ||
    document.querySelector('nav[aria-label*="page" i]')
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function extractNavigation() {
  return Array.from(document.querySelectorAll("nav, [role='navigation']"))
    .filter(isVisible)
    .map((nav) => {
      const items = Array.from(nav.querySelectorAll("a")).map((a) => ({
        text: a.textContent.trim(),
        href: a.href,
        active:
          a.getAttribute("aria-current") === "page" ||
          a.classList.contains("active") ||
          a.href === window.location.href,
        locator: getBestLocator(a),
      }));
      return {
        ariaLabel: nav.getAttribute("aria-label") || null,
        items: items.filter((i) => i.text).slice(0, 20),
        locator: getBestLocator(nav),
        type: nav.getAttribute("aria-label")?.toLowerCase().includes("breadcrumb")
          ? "breadcrumb"
          : items.some((i) => i.active)
          ? "main"
          : "secondary",
      };
    })
    .filter((n) => n.items.length > 0);
}

// ─── Modals & Dialogs ─────────────────────────────────────────────────────────

function extractModals() {
  const selectors = [
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[aria-modal="true"]',
    '[class*="modal"]',
    '[class*="dialog"]',
    '[class*="drawer"]',
    '[class*="overlay"]',
  ];

  return Array.from(document.querySelectorAll(selectors.join(",")))
    .filter(isVisible)
    .map((modal) => ({
      locator: getBestLocator(modal),
      ariaLabel: modal.getAttribute("aria-label") || modal.getAttribute("aria-labelledby") || null,
      hasClose: !!modal.querySelector('[aria-label*="close" i], [class*="close"], button[data-dismiss]'),
      hasForm: !!modal.querySelector("form"),
      buttons: Array.from(modal.querySelectorAll("button"))
        .filter(isVisible)
        .map((b) => b.textContent.trim())
        .filter(Boolean),
    }));
}

// ─── Alerts & Notifications ───────────────────────────────────────────────────

function extractAlerts() {
  const selectors = [
    '[role="alert"]',
    '[role="status"]',
    '[class*="alert"]',
    '[class*="notification"]',
    '[class*="toast"]',
    '[class*="banner"]',
    '[class*="message"]',
    '[class*="error"]',
    '[class*="success"]',
    '[class*="warning"]',
  ];

  return Array.from(document.querySelectorAll(selectors.join(",")))
    .filter(isVisible)
    .map((el) => ({
      locator: getBestLocator(el),
      text: el.textContent.trim().slice(0, 200),
      type: inferAlertType(el),
      isDismissible: !!el.querySelector('[aria-label*="close" i], [class*="close"]'),
    }))
    .filter((a) => a.text.length > 0);
}

function inferAlertType(el) {
  const cls = (el.getAttribute("class") || "").toLowerCase();
  const role = el.getAttribute("role") || "";
  if (/error|danger|invalid/.test(cls + role)) return "error";
  if (/success|valid|confirm/.test(cls + role)) return "success";
  if (/warn/.test(cls + role)) return "warning";
  if (/info|notice/.test(cls + role)) return "info";
  return "generic";
}

// ─── Headings / Page structure ────────────────────────────────────────────────

function extractHeadings() {
  return Array.from(document.querySelectorAll("h1, h2, h3"))
    .filter(isVisible)
    .map((h) => ({
      level: parseInt(h.tagName[1]),
      text: h.textContent.trim().slice(0, 150),
    }))
    .slice(0, 20);
}

function extractPageStructure() {
  return {
    hasHeader: !!document.querySelector("header, [role='banner']"),
    hasFooter: !!document.querySelector("footer, [role='contentinfo']"),
    hasNav: !!document.querySelector("nav, [role='navigation']"),
    hasSidebar: !!document.querySelector("aside, [role='complementary']"),
    hasMain: !!document.querySelector("main, [role='main']"),
    hasSearch: !!document.querySelector(
      '[type="search"], [role="search"], [placeholder*="search" i]'
    ),
    hasCarousel: !!document.querySelector('[class*="carousel"], [class*="slider"], [role="list"][aria-roledescription*="carousel" i]'),
    hasTabs: !!document.querySelector('[role="tab"], [role="tablist"]'),
    hasAccordion: !!document.querySelector('[class*="accordion"], [class*="collapse"]'),
    hasInfiniteScroll: !!document.querySelector('[class*="infinite"]'),
    hasDatePicker: !!document.querySelector('[class*="datepicker"], [type="date"], [class*="calendar"]'),
    hasFileUpload: !!document.querySelector('[type="file"]'),
    hasRichText: !!document.querySelector('[contenteditable="true"], [class*="editor"]'),
    hasCaptcha: !!document.querySelector('[class*="captcha"], [class*="recaptcha"]'),
  };
}

// ─── Accessibility ────────────────────────────────────────────────────────────

function extractAccessibilityInfo() {
  const issues = [];
  const inputs = document.querySelectorAll("input, select, textarea, button");

  inputs.forEach((el) => {
    const hasLabel =
      el.getAttribute("aria-label") ||
      el.getAttribute("aria-labelledby") ||
      (el.id && document.querySelector(`label[for="${el.id}"]`)) ||
      el.closest("label");

    if (!hasLabel && isVisible(el)) {
      issues.push({
        type: "missing-label",
        element: el.tagName.toLowerCase(),
        locator: getBestLocator(el),
      });
    }
  });

  return {
    hasSkipLink: !!document.querySelector('a[href="#main"], a[href="#content"]'),
    hasLandmarks: !!document.querySelector("main, nav, header, footer"),
    inputsWithoutLabels: issues.length,
    issues: issues.slice(0, 10),
    hasAriaLiveRegions: !!document.querySelector("[aria-live]"),
    hasFocusManagement: !!document.querySelector("[tabindex]"),
    colorContrastNote: "Requires visual inspection — use Lighthouse for full audit",
  };
}

// ─── Locator generation ───────────────────────────────────────────────────────

function elementInfo(el) {
  return {
    tag: el.tagName.toLowerCase(),
    text: el.textContent.trim().slice(0, 100),
    locator: getBestLocator(el),
    locatorStrategy: getLocatorStrategy(el),
    testId: getTestId(el),
  };
}

function getTestId(el) {
  return (
    el.getAttribute("data-testid") ||
    el.getAttribute("data-test") ||
    el.getAttribute("data-cy") ||
    el.getAttribute("data-qa") ||
    el.getAttribute("data-automation-id") ||
    null
  );
}

function getBestLocator(el) {
  // Priority order: testid > id > name > aria-label > css > xpath
  const testId = getTestId(el);
  if (testId) {
    const attr = ["data-testid", "data-test", "data-cy", "data-qa", "data-automation-id"].find(
      (a) => el.getAttribute(a) === testId
    );
    return `[${attr}="${testId}"]`;
  }

  if (el.id && isUniqueId(el.id)) {
    return `#${CSS.escape(el.id)}`;
  }

  if (el.getAttribute("aria-label")) {
    return `[aria-label="${el.getAttribute("aria-label")}"]`;
  }

  if (el.name && el.tagName !== "A") {
    const byName = document.querySelectorAll(`[name="${el.name}"]`);
    if (byName.length === 1) return `[name="${el.name}"]`;
  }

  // Build a stable CSS selector
  const css = buildCSSSelector(el);
  if (css) return css;

  // Fallback to XPath
  return buildXPath(el);
}

function getLocatorStrategy(el) {
  const testId = getTestId(el);
  if (testId) return "test-id";
  if (el.id && isUniqueId(el.id)) return "id";
  if (el.getAttribute("aria-label")) return "aria-label";
  if (el.name) return "name";
  return "css";
}

// Returns true if the element's locators are likely to be flaky/unstable
function isFlakyElement(el) {
  // Auto-generated ID: contains 4+ hex chars, long digit runs, or UUID-like patterns
  if (el.id && /[a-f0-9]{4,}|[0-9]{4,}|[a-z]+-[a-z0-9]{6,}/i.test(el.id)) return true;
  // CSS module / hashed class: className contains underscores + short hash
  const cls = typeof el.className === "string" ? el.className : "";
  if (/\b[a-zA-Z]+_[a-zA-Z0-9]{4,}\b/.test(cls)) return true;
  // Dynamic text: contains numbers that look like counters, amounts, timestamps
  const text = el.textContent?.trim() || "";
  if (/\$[\d,]+\.?\d*|\d{2}:\d{2}|\d{4}-\d{2}-\d{2}|\(\d+\)/.test(text)) return true;
  return false;
}

function isUniqueId(id) {
  return document.querySelectorAll(`#${CSS.escape(id)}`).length === 1;
}

function buildCSSSelector(el) {
  const parts = [];
  let current = el;

  for (let i = 0; i < 4; i++) {
    if (!current || current === document.body) break;

    let part = current.tagName.toLowerCase();

    // Add stable class (avoid dynamic class names)
    const stableClasses = Array.from(current.classList).filter(
      (c) => !/\d{3,}|[a-z]{1,2}_[a-z]/.test(c) && c.length > 1
    );
    if (stableClasses.length > 0 && stableClasses.length <= 3) {
      part += "." + stableClasses.slice(0, 2).join(".");
    }

    // Add type attribute for inputs
    if (current.type && current.type !== "text") {
      part += `[type="${current.type}"]`;
    }

    // Check uniqueness
    try {
      if (document.querySelectorAll(part).length === 1) {
        return part;
      }
    } catch (e) {
      // invalid selector, skip
    }

    parts.unshift(part);

    // Add nth-child if needed for uniqueness
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) => c.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        parts[0] += `:nth-of-type(${idx})`;
      }
    }

    const sel = parts.join(" > ");
    try {
      if (document.querySelectorAll(sel).length === 1) return sel;
    } catch (e) {
      // skip
    }

    current = current.parentElement;
  }

  return parts.join(" > ") || null;
}

function buildXPath(el) {
  if (el.id) return `//*[@id="${el.id}"]`;

  const parts = [];
  let current = el;

  while (current && current !== document.body) {
    let part = current.tagName.toLowerCase();

    if (current.getAttribute("aria-label")) {
      part += `[@aria-label="${current.getAttribute("aria-label")}"]`;
      parts.unshift(part);
      break;
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === current.tagName
      );
      if (siblings.length > 1) {
        part += `[${siblings.indexOf(current) + 1}]`;
      }
    }

    parts.unshift(part);
    current = parent;

    if (parts.length >= 5) break;
  }

  return "//" + parts.join("/");
}

// ─── Visibility check ─────────────────────────────────────────────────────────

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
    return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

// ─── Element highlighter ──────────────────────────────────────────────────────

let highlightOverlay = null;

function highlightElement(selector) {
  clearHighlights();
  try {
    const el = document.querySelector(selector);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    highlightOverlay = document.createElement("div");
    highlightOverlay.id = "__qa_deck_highlight__";
    Object.assign(highlightOverlay.style, {
      position: "fixed",
      top: rect.top + "px",
      left: rect.left + "px",
      width: rect.width + "px",
      height: rect.height + "px",
      border: "2px solid #1D9E75",
      backgroundColor: "rgba(29,158,117,0.12)",
      zIndex: "2147483647",
      pointerEvents: "none",
      borderRadius: "3px",
      boxSizing: "border-box",
      transition: "all 0.2s ease",
    });

    // Label
    const label = document.createElement("div");
    Object.assign(label.style, {
      position: "absolute",
      top: "-22px",
      left: "0",
      background: "#1D9E75",
      color: "white",
      fontSize: "10px",
      fontFamily: "monospace",
      padding: "2px 6px",
      borderRadius: "3px",
      whiteSpace: "nowrap",
    });
    label.textContent = selector.slice(0, 50);
    highlightOverlay.appendChild(label);
    document.body.appendChild(highlightOverlay);

    el.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) {
    // invalid selector — ignore
  }
}

function clearHighlights() {
  const existing = document.getElementById("__qa_deck_highlight__");
  if (existing) existing.remove();
  highlightOverlay = null;
}

// ─── Inspect mode ─────────────────────────────────────────────────────────────

function startInspecting() {
  inspectMode = true;
  inspectHoverEl = null;
  document.body.style.cursor = "crosshair";
  document.addEventListener("mouseover", onInspectHover, true);
  document.addEventListener("click", onInspectClick, true);
  document.addEventListener("keydown", onInspectKeydown, true);
}

function stopInspecting() {
  inspectMode = false;
  inspectHoverEl = null;
  document.body.style.cursor = "";
  document.removeEventListener("mouseover", onInspectHover, true);
  document.removeEventListener("click", onInspectClick, true);
  document.removeEventListener("keydown", onInspectKeydown, true);
  clearHighlights();
}

function onInspectHover(e) {
  if (!inspectMode) return;
  e.stopPropagation();
  if (inspectHoverEl === e.target) return;
  inspectHoverEl = e.target;
  // Use the element directly for the highlight overlay instead of a selector string
  const sel = getBestLocator(e.target);
  try { highlightElement(sel); } catch (_) {}
}

function onInspectClick(e) {
  if (!inspectMode) return;
  e.stopPropagation();
  e.preventDefault();
  const el = e.target;
  stopInspecting();
  const data = buildElementData(el);
  chrome.runtime.sendMessage({ type: "ELEMENT_SELECTED", data });
}

function onInspectKeydown(e) {
  if (e.key === "Escape") stopInspecting();
}

// ─── Element data builder ─────────────────────────────────────────────────────

function buildElementData(el) {
  const tag         = el.tagName.toLowerCase();
  const id          = el.id || null;
  const name        = el.getAttribute("name") || null;
  const rawText     = el.textContent?.trim().replace(/\s+/g, " ").slice(0, 80) || null;
  const text        = rawText || null;
  const ariaLabel   = el.getAttribute("aria-label") || null;
  const placeholder = el.getAttribute("placeholder") || null;
  const role        = el.getAttribute("role") || getImpliedRole(tag) || null;
  const testId      = getTestId(el);
  const css         = getBestLocator(el);
  const xpath       = buildXPath(el);
  const className   = el.classList.length > 0 ? el.classList[0] : null;
  const absXpath    = buildAbsoluteXPath(el);
  const posXpath    = buildPositionXPath(el);

  const iframeInfo = detectIframe(el);
  const shadowInfo = detectShadowDom(el);
  const info = { tag, id, name, text, ariaLabel, placeholder, role, testId, css, xpath, className, absXpath, posXpath, iframeInfo, shadowInfo };

  return {
    ...info,
    playwright:   buildPlaywrightLocators(info),
    seleniumPy:   buildSeleniumPyLocators(info),
    seleniumJava: buildSeleniumJavaLocators(info),
    cypress:      buildCypressLocators(info),
    webdriverio:  buildWebDriverIOLocators(info),
  };
}

function buildAbsoluteXPath(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const tag = node.tagName.toLowerCase();
    let idx = 1;
    let sib = node.previousSibling;
    while (sib) {
      if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === node.tagName) idx++;
      sib = sib.previousSibling;
    }
    parts.unshift(`${tag}[${idx}]`);
    node = node.parentNode;
  }
  return "/" + parts.join("/");
}

function buildPositionXPath(el) {
  const tag = el.tagName.toLowerCase();
  const all = Array.from(document.querySelectorAll(tag));
  const pos = all.indexOf(el) + 1;
  if (all.length === 1) return `//${tag}`;
  return `(//${tag})[${pos}]`;
}

function getImpliedRole(tag) {
  const roles = {
    button: "button", a: "link", input: "textbox", select: "combobox",
    textarea: "textbox", h1: "heading", h2: "heading", h3: "heading",
    nav: "navigation", main: "main", img: "img", form: "form",
  };
  return roles[tag] || null;
}

// ─── Quality helpers ──────────────────────────────────────────────────────────
//
//  BEST    — Purpose-built test attributes or semantic locators (data-testid, role+name, aria-label)
//  GOOD    — Unique, stable attributes (non-auto ID, name, placeholder)
//  OK      — Reasonably stable but can break on content/structure changes
//  FRAGILE — Breaks easily: class names, positions, text edits

function idQuality(id) {
  if (!id) return null;
  if (/^[\d]+$/.test(id)) return "ok";
  if (/^(ember|react|mui|ant-|el-|v-|mdc-|mat-|bs-|:r)/i.test(id)) return "ok";
  if (/\d{4,}/.test(id) || /[a-f0-9]{8}-[a-f0-9]{4}/i.test(id)) return "ok";
  return "best";
}

function cssQuality(css) {
  if (!css) return "ok";
  if (/\[data-test(id)?=|\[data-cy=|\[data-qa=|\[data-automation/.test(css)) return "best";
  if (/^#[^\s.[\]]+$/.test(css)) return "best";
  if (/\[(name|placeholder|aria-label|type|role)=/.test(css)) return "ok";
  if (/^\.[a-z]|^[a-z]+\.[a-z]/i.test(css) && !/\[/.test(css)) return "fragile";
  return "ok";
}

function xpathQuality(xpath) {
  if (!xpath) return "ok";
  if (/@(data-test|data-testid|data-cy)/.test(xpath)) return "best";
  if (/@(id|name|aria-label|placeholder)/.test(xpath)) return "ok";
  if (/text\(\)|contains\(/.test(xpath)) return "fragile";
  return "ok";
}

// ─── Locator generators ───────────────────────────────────────────────────────

function buildPlaywrightLocators(info) {
  const results = [];

  if (info.testId)
    results.push({ label: "getByTestId", code: `page.getByTestId('${esc(info.testId)}')`, quality: "best", reason: "data-testid is purpose-built for testing — survives CSS & content changes" });

  if (info.role && info.ariaLabel)
    results.push({ label: "getByRole", code: `page.getByRole('${info.role}', { name: '${esc(info.ariaLabel)}' })`, quality: "best", reason: "Semantic role mirrors how users see the element — very resilient" });
  else if (info.role && info.text)
    results.push({ label: "getByRole", code: `page.getByRole('${info.role}', { name: '${esc(info.text.slice(0,60))}' })`, quality: "best", reason: "Semantic role locator — stable as long as element purpose doesn't change" });

  if (info.ariaLabel)
    results.push({ label: "getByLabel", code: `page.getByLabel('${esc(info.ariaLabel)}')`, quality: "best", reason: "Label-based locator — stable for accessible forms" });

  if (info.placeholder)
    results.push({ label: "getByPlaceholder", code: `page.getByPlaceholder('${esc(info.placeholder)}')`, quality: "good", reason: "Placeholder text is relatively stable for input fields" });

  if (info.css) {
    const q = cssQuality(info.css);
    const r = q === "best" ? "Test attribute in CSS — purpose-built for automation" : q === "fragile" ? "Class-based CSS — breaks when styles are refactored" : "CSS selector — functional but sensitive to class name changes";
    results.push({ label: "locator (CSS)", code: `page.locator('${info.css}')`, quality: q, reason: r });
  }

  if (info.text && !["input","select","textarea"].includes(info.tag))
    results.push({ label: "getByText", code: `page.getByText('${esc(info.text.slice(0,60))}')`, quality: "ok", reason: "Text content can change with copy updates — use cautiously" });

  if (info.xpath)
    results.push({ label: "locator (XPath)", code: `page.locator('xpath=${info.xpath}')`, quality: xpathQuality(info.xpath), reason: "XPath is fragile — breaks on DOM restructuring" });

  if (info.posXpath)
    results.push({ label: "locator (Position)", code: `page.locator('xpath=${info.posXpath}')`, quality: "fragile", reason: "Position-based — breaks if elements are reordered" });

  return results;
}

function buildSeleniumPyLocators(info) {
  const results = [];

  if (info.id) {
    const q = idQuality(info.id);
    results.push({ label: "ID", code: `driver.find_element(By.ID, "${esc(info.id)}")`, quality: q, reason: q === "best" ? "Unique semantic ID — ideal for automation, highly stable" : "Auto-generated ID may change between sessions" });
  }
  if (info.name)
    results.push({ label: "Name", code: `driver.find_element(By.NAME, "${esc(info.name)}")`, quality: "good", reason: "Name attribute is stable for form fields" });

  if (info.css) {
    const q = cssQuality(info.css);
    const r = q === "best" ? "Test attribute — purpose-built for automation" : q === "fragile" ? "Class-based CSS — breaks when styles change" : "CSS selector — functional but may need maintenance";
    results.push({ label: "CSS", code: `driver.find_element(By.CSS_SELECTOR, "${info.css}")`, quality: q, reason: r });
  }

  if (info.id)
    results.push({ label: "ID (XPath)", code: `driver.find_element(By.XPATH, "//*[@id='${esc(info.id)}']")`, quality: idQuality(info.id), reason: "XPath by ID — same stability as By.ID but more explicit" });

  if (info.xpath)
    results.push({ label: "XPath", code: `driver.find_element(By.XPATH, "${info.xpath}")`, quality: xpathQuality(info.xpath), reason: xpathQuality(info.xpath) === "ok" ? "Attribute-based XPath — reasonably stable" : "Text or position XPath — brittle, breaks on content changes" });

  // Selenium 4 Relative Locators
  if (info.name || info.id || info.css) {
    const anchor = info.id ? `By.ID, "${esc(info.id)}"` : info.name ? `By.NAME, "${esc(info.name)}"` : `By.CSS_SELECTOR, "${info.css}"`;
    results.push({ label: "Relative (above)", code: `driver.find_element(locate_with(By.TAG_NAME, "${info.tag}").above(driver.find_element(${anchor})))`, quality: "good", reason: "Selenium 4 relative locator — good for elements without unique attributes" });
    results.push({ label: "Relative (near)", code: `driver.find_element(locate_with(By.TAG_NAME, "${info.tag}").near(driver.find_element(${anchor})))`, quality: "good", reason: "Selenium 4 relative locator — finds element spatially near a known element" });
  }

  if (info.className)
    results.push({ label: "ClassName", code: `driver.find_element(By.CLASS_NAME, "${info.className}")`, quality: "fragile", reason: "Class names change frequently with CSS refactoring" });

  results.push({ label: "TagName", code: `driver.find_element(By.TAG_NAME, "${info.tag}")`, quality: "fragile", reason: "Too generic — matches all elements of this type on the page" });

  if (info.absXpath)
    results.push({ label: "Absolute XPath", code: `driver.find_element(By.XPATH, "${info.absXpath}")`, quality: "fragile", reason: "Breaks on any DOM structure change — avoid in production tests" });

  if (info.posXpath)
    results.push({ label: "Position XPath", code: `driver.find_element(By.XPATH, "${info.posXpath}")`, quality: "fragile", reason: "Position-based — breaks if elements are reordered or added" });

  return results;
}

function buildSeleniumJavaLocators(info) {
  const results = [];

  if (info.id) {
    const q = idQuality(info.id);
    results.push({ label: "ID", code: `driver.findElement(By.id("${esc(info.id)}"))`, quality: q, reason: q === "best" ? "Unique semantic ID — ideal for automation, highly stable" : "Auto-generated ID may change between sessions" });
  }
  if (info.name)
    results.push({ label: "Name", code: `driver.findElement(By.name("${esc(info.name)}"))`, quality: "good", reason: "Name attribute is stable for form fields" });

  if (info.css) {
    const q = cssQuality(info.css);
    const r = q === "best" ? "Test attribute — purpose-built for automation" : q === "fragile" ? "Class-based CSS — breaks when styles change" : "CSS selector — functional but may need maintenance";
    results.push({ label: "CSS", code: `driver.findElement(By.cssSelector("${info.css}"))`, quality: q, reason: r });
  }

  if (info.id)
    results.push({ label: "ID (XPath)", code: `driver.findElement(By.xpath("//*[@id='${esc(info.id)}']"))`, quality: idQuality(info.id), reason: "XPath by ID — same stability as By.ID but more explicit" });

  if (info.xpath)
    results.push({ label: "XPath", code: `driver.findElement(By.xpath("${info.xpath}"))`, quality: xpathQuality(info.xpath), reason: xpathQuality(info.xpath) === "ok" ? "Attribute-based XPath — reasonably stable" : "Text or position XPath — brittle, breaks on content changes" });

  // Selenium 4 Relative Locators
  if (info.name || info.id || info.css) {
    const anchor = info.id ? `By.id("${esc(info.id)}")` : info.name ? `By.name("${esc(info.name)}")` : `By.cssSelector("${info.css}")`;
    results.push({ label: "Relative (above)", code: `driver.findElement(RelativeLocator.with(By.tagName("${info.tag}")).above(driver.findElement(${anchor})))`, quality: "good", reason: "Selenium 4 relative locator — good for elements without unique attributes" });
    results.push({ label: "Relative (near)", code: `driver.findElement(RelativeLocator.with(By.tagName("${info.tag}")).near(driver.findElement(${anchor})))`, quality: "good", reason: "Selenium 4 relative locator — finds element spatially near a known element" });
  }

  if (info.className)
    results.push({ label: "ClassName", code: `driver.findElement(By.className("${info.className}"))`, quality: "fragile", reason: "Class names change frequently with CSS refactoring" });

  results.push({ label: "TagName", code: `driver.findElement(By.tagName("${info.tag}"))`, quality: "fragile", reason: "Too generic — matches all elements of this type on the page" });

  if (info.absXpath)
    results.push({ label: "Absolute XPath", code: `driver.findElement(By.xpath("${info.absXpath}"))`, quality: "fragile", reason: "Breaks on any DOM structure change — avoid in production tests" });

  if (info.posXpath)
    results.push({ label: "Position XPath", code: `driver.findElement(By.xpath("${info.posXpath}"))`, quality: "fragile", reason: "Position-based — breaks if elements are reordered or added" });

  return results;
}

function buildCypressLocators(info) {
  const results = [];

  if (info.testId)
    results.push({ label: "get (testid)", code: `cy.get('[data-testid="${esc(info.testId)}"]')`, quality: "best", reason: "data-testid is purpose-built for testing — Cypress best practice" });

  if (info.id)
    results.push({ label: "get (#id)", code: `cy.get('#${esc(info.id)}')`, quality: idQuality(info.id), reason: idQuality(info.id) === "best" ? "Unique semantic ID — stable and readable" : "Auto-generated ID may be unstable" });

  if (info.ariaLabel)
    results.push({ label: "get (aria-label)", code: `cy.get('[aria-label="${esc(info.ariaLabel)}"]')`, quality: "best", reason: "ARIA label is semantic and accessible — highly stable" });

  if (info.name)
    results.push({ label: "get (name)", code: `cy.get('[name="${esc(info.name)}"]')`, quality: "good", reason: "Name attribute is stable for form elements" });

  if (info.placeholder)
    results.push({ label: "get (placeholder)", code: `cy.get('[placeholder="${esc(info.placeholder)}"]')`, quality: "good", reason: "Placeholder text is relatively stable for inputs" });

  if (info.css)
    results.push({ label: "get (CSS)", code: `cy.get('${info.css}')`, quality: cssQuality(info.css), reason: "CSS selector — works but may need updates after style changes" });

  if (info.text && !["input","select","textarea"].includes(info.tag))
    results.push({ label: "contains", code: `cy.contains('${esc(info.text.slice(0,60))}')`, quality: "ok", reason: "Text-based — breaks when copy/labels change" });

  if (info.xpath)
    results.push({ label: "xpath (plugin)", code: `cy.xpath('${info.xpath}')`, quality: "fragile", reason: "Requires cypress-xpath plugin — XPath breaks on DOM restructuring" });

  return results;
}

function buildWebDriverIOLocators(info) {
  const results = [];

  if (info.testId)
    results.push({ label: "$ (testid)", code: `$('[data-testid="${esc(info.testId)}"]')`, quality: "best", reason: "data-testid is purpose-built for testing" });

  if (info.ariaLabel)
    results.push({ label: "$ (aria)", code: `$('aria/${esc(info.ariaLabel)}')`, quality: "best", reason: "ARIA selector — semantic, accessible, and highly stable" });

  if (info.id)
    results.push({ label: "$ (#id)", code: `$('#${esc(info.id)}')`, quality: idQuality(info.id), reason: idQuality(info.id) === "best" ? "Unique semantic ID — ideal" : "Auto-generated ID may be unstable" });

  if (info.role && info.ariaLabel)
    results.push({ label: "$ (role)", code: `$('[role="${info.role}"][aria-label="${esc(info.ariaLabel)}"]')`, quality: "best", reason: "Role + aria-label combination is highly specific and stable" });

  if (info.name)
    results.push({ label: "$ (name)", code: `$('[name="${esc(info.name)}"]')`, quality: "good", reason: "Name attribute is stable for form elements" });

  if (info.placeholder)
    results.push({ label: "$ (placeholder)", code: `$('[placeholder="${esc(info.placeholder)}"]')`, quality: "good", reason: "Placeholder text is relatively stable" });

  if (info.css)
    results.push({ label: "$ (CSS)", code: `$('${info.css}')`, quality: cssQuality(info.css), reason: "CSS selector — may need updates after style refactoring" });

  if (info.text && !["input","select","textarea"].includes(info.tag))
    results.push({ label: "$ (text)", code: `$('=${esc(info.text.slice(0,60))}')`, quality: "ok", reason: "Exact text match — breaks when copy changes" });

  if (info.xpath)
    results.push({ label: "$ (XPath)", code: `$('${info.xpath}')`, quality: xpathQuality(info.xpath), reason: "XPath in WebdriverIO — fragile, breaks on DOM restructuring" });

  return results;
}

function detectIframe(el) {
  const root = el.getRootNode();
  if (root === document) {
    if (el.tagName && el.tagName.toLowerCase() === 'iframe') {
      return { inIframe: false, isIframe: true, frameId: el.id || el.name || null };
    }
    return { inIframe: false, isIframe: false };
  }
  return { inIframe: false, isIframe: false };
}

function detectShadowDom(el) {
  let node = el;
  while (node) {
    const root = node.getRootNode();
    if (root instanceof ShadowRoot) {
      const host = root.host;
      return {
        inShadowDom: true,
        hostTag: host.tagName.toLowerCase(),
        hostId: host.id || null,
        hostSelector: host.id ? `#${host.id}` : host.tagName.toLowerCase(),
      };
    }
    node = node.parentElement;
  }
  return { inShadowDom: false };
}

// Escape single/double quotes in locator values
function esc(str) {
  return str ? str.replace(/'/g, "\\'").replace(/"/g, '\\"') : str;
}

// ─── Test locator ─────────────────────────────────────────────────────────────

function testLocator(selector, selectorType) {
  try {
    clearHighlights();
    let elements;
    if (selectorType === "xpath") {
      const result = document.evaluate(
        selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
      );
      elements = Array.from({ length: result.snapshotLength }, (_, i) => result.snapshotItem(i));
    } else {
      elements = Array.from(document.querySelectorAll(selector));
    }
    if (elements.length === 0) return { success: true, count: 0 };
    // Highlight first matching element
    const firstSel = getBestLocator(elements[0]);
    try { highlightElement(firstSel); } catch (_) {}
    return { success: true, count: elements.length };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── Coverage Heatmap ────────────────────────────────────────────────────────

function showCoverageHeatmap(coveredLocators, uncoveredLocators) {
  clearCoverageHeatmap();
  const apply = (locators, color, label) => {
    for (const sel of locators) {
      try {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
          const badge = document.createElement("div");
          badge.className = "__qa_deck_coverage__";
          badge.style.cssText = `
            position:absolute;z-index:99999;pointer-events:none;
            background:${color};border-radius:3px;
            font-size:9px;font-family:monospace;color:#fff;
            padding:1px 5px;line-height:14px;white-space:nowrap;
            opacity:.85;box-shadow:0 1px 4px rgba(0,0,0,.3);
          `;
          badge.textContent = label;
          const rect = el.getBoundingClientRect();
          badge.style.top  = `${rect.top  + window.scrollY}px`;
          badge.style.left = `${rect.left + window.scrollX}px`;
          document.body.appendChild(badge);
          // Also add a thin border to the element itself
          el.__qa_deck_orig_outline = el.style.outline;
          el.style.outline = `2px solid ${color}`;
          el.classList.add("__qa_deck_coverage_el__");
        });
      } catch (_) {}
    }
  };
  apply(coveredLocators, "#1D9E75", "✓ covered");
  apply(uncoveredLocators, "#E24B4A", "✕ no test");
}

function clearCoverageHeatmap() {
  document.querySelectorAll(".__qa_deck_coverage__").forEach(el => el.remove());
  document.querySelectorAll(".__qa_deck_coverage_el__").forEach(el => {
    el.style.outline = el.__qa_deck_orig_outline || "";
    el.classList.remove("__qa_deck_coverage_el__");
  });
}

console.log("[QA Deck] Content script loaded on", window.location.href);

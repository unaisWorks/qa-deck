// PRODUCTION: replace with your Render URL before submitting to Chrome Web Store
// e.g. "https://qa-deck-backend.onrender.com"
const BACKEND_URL = "https://qa-deck-backend.onrender.com";
const USER_STORAGE_KEY = "qaDeckUser";
const PENDING_SESSION_STORAGE_KEY = "qaDeckPendingWebsiteSession";
const PENDING_PROJECT_CONTEXT_STORAGE_KEY = "qaDeckPendingProjectContext";

// ─── Network capture state ────────────────────────────────────────────────────
let networkLog = [];
let networkCaptureActive = false;
let networkCaptureTabId = null;

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!networkCaptureActive) return;
    if (networkCaptureTabId !== null && details.tabId !== networkCaptureTabId) return;
    if (!["xmlhttprequest", "fetch", "other"].includes(details.type)) return;
    // Skip non-API calls (images, fonts, scripts, css)
    const url = details.url;
    if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)(\?|$)/i.test(url)) return;
    const entry = {
      id: crypto.randomUUID(),
      method: details.method || "GET",
      url,
      statusCode: details.statusCode,
      timeStamp: details.timeStamp,
      selected: false,
    };
    networkLog.push(entry);
    // Limit log to last 50 calls to avoid bloat
    if (networkLog.length > 50) networkLog = networkLog.slice(-50);
    chrome.runtime.sendMessage({ type: "NETWORK_REQUEST_CAPTURED", entry }).catch(() => {});
  },
  { urls: ["<all_urls>"] }
);

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
  await chrome.sidePanel.setOptions({ tabId: tab.id, path: "src/sidepanel/sidepanel.html", enabled: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handlers = {
    QADECK_PING: handleBridgePing,
    QADECK_GET_CONNECTION_STATE: handleBridgeGetConnectionState,
    QADECK_CONNECT_SESSION: handleBridgeConnectSession,
    QADECK_OPEN_SIDEPANEL: handleBridgeOpenSidePanel,
    QADECK_OPEN_PROJECT_CONTEXT: handleBridgeOpenProjectContext,
    QADECK_GET_CURRENT_PAGE: handleBridgeGetCurrentPage,
    QADECK_DISCONNECT_SESSION: handleBridgeDisconnectSession,
    QADECK_GET_API_KEY: handleBridgeGetApiKey,
    QADECK_RESCAN_PROJECT: handleBridgeRescanProject,
    QADECK_ENSURE_ACTIVE_TAB_BRIDGE: handleBridgeEnsureActiveTabBridge,
    SCAN_PAGE: handleScanPage, GENERATE_TESTS: handleGenerateTests,
    GENERATE_JOURNEY_TESTS: handleGenerateJourneyTests,
    GENERATE_SCRIPT: handleGenerateScript, HIGHLIGHT_ELEMENT: handleHighlightElement,
    GENERATE_JOURNEY_SCRIPT: handleGenerateJourneyScript,
    CLEAR_HIGHLIGHTS: handleClearHighlights, GET_TAB_INFO: handleGetTabInfo,
    SAVE_PROJECT: handleSaveProject, LOAD_PROJECTS: handleLoadProjects,
    LOAD_PROJECT_DETAIL: handleLoadProjectDetail,
    SAVE_JOURNEY_DRAFT: handleSaveJourneyDraft, LOAD_JOURNEY_DRAFT: handleLoadJourneyDraft,
    CHECK_BACKEND: handleCheckBackend,
    START_INSPECTING: handleStartInspecting, STOP_INSPECTING: handleStopInspecting,
    ELEMENT_SELECTED: handleElementSelected, TEST_LOCATOR: handleTestLocator,
    START_NETWORK_CAPTURE: handleStartNetworkCapture,
    STOP_NETWORK_CAPTURE: handleStopNetworkCapture,
    GET_NETWORK_LOG: handleGetNetworkLog,
    SHOW_COVERAGE_HEATMAP: handleShowCoverageHeatmap,
  };
  const handler = handlers[message.type];
  if (handler) { handler(message, _sender, sendResponse); return true; }
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const handlers = {
    QADECK_PING: handleBridgePing,
    QADECK_GET_CONNECTION_STATE: handleBridgeGetConnectionState,
    QADECK_CONNECT_SESSION: handleBridgeConnectSession,
    QADECK_OPEN_SIDEPANEL: handleBridgeOpenSidePanel,
    QADECK_OPEN_PROJECT_CONTEXT: handleBridgeOpenProjectContext,
    QADECK_GET_CURRENT_PAGE: handleBridgeGetCurrentPage,
    QADECK_DISCONNECT_SESSION: handleBridgeDisconnectSession,
    QADECK_GET_API_KEY: handleBridgeGetApiKey,
    QADECK_RESCAN_PROJECT: handleBridgeRescanProject,
    QADECK_ENSURE_ACTIVE_TAB_BRIDGE: handleBridgeEnsureActiveTabBridge,
  };
  const handler = handlers[message?.type];
  if (handler) {
    handler(message, sender, sendResponse);
    return true;
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    chrome.runtime.sendMessage({ type: "TAB_CHANGED", tab: { id: tab.id, url: tab.url, title: tab.title } }).catch(() => {});
  } catch (_) {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    chrome.runtime.sendMessage({ type: "TAB_UPDATED", tab: { id: tabId, url: tab.url, title: tab.title } }).catch(() => {});
  }
});

async function handleGetTabInfo(_msg, _sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    sendResponse({ success: true, tab: { id: tab.id, url: tab.url, title: tab.title } });
  } catch (err) { sendResponse({ success: false, error: err.message }); }
}

async function handleBridgePing(_msg, _sender, sendResponse) {
  const stored = await chrome.storage.local.get([USER_STORAGE_KEY]);
  const user = stored[USER_STORAGE_KEY] || null;
  sendResponse({
    installed: true,
    connected: !!user,
    email: user?.email || null,
    uid: user?.uid || null,
    version: chrome.runtime.getManifest().version,
    success: true,
  });
}

async function handleBridgeGetConnectionState(_msg, _sender, sendResponse) {
  return handleBridgePing(_msg, _sender, sendResponse);
}

async function handleBridgeConnectSession(message, _sender, sendResponse) {
  if (!message?.customToken) {
    sendResponse({ success: false, error: "Missing custom token" });
    return;
  }

  const pendingSession = {
    id: crypto.randomUUID(),
    customToken: message.customToken,
    profile: message.profile || null,
    websiteOrigin: message.websiteOrigin || null,
    connectedAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
  };

  await chrome.storage.local.set({ [PENDING_SESSION_STORAGE_KEY]: pendingSession });
  chrome.runtime.sendMessage({ type: "QADECK_PENDING_SESSION_UPDATED" }).catch(() => {});
  sendResponse({ success: true, queued: true });
}

async function handleBridgeOpenSidePanel(_msg, sender, sendResponse) {
  try {
    const senderTabId = sender?.tab?.id;
    const [activeTab] = senderTabId
      ? [{ id: senderTabId }]
      : await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab?.id) {
      sendResponse({ success: false, opened: false, error: "No active tab available" });
      return;
    }

    await chrome.sidePanel.setOptions({
      tabId: activeTab.id,
      path: "src/sidepanel/sidepanel.html",
      enabled: true,
    });
    await chrome.sidePanel.open({ tabId: activeTab.id });
    sendResponse({ success: true, opened: true });
  } catch (err) {
    sendResponse({ success: false, opened: false, error: err.message });
  }
}

async function handleBridgeOpenProjectContext(message, sender, sendResponse) {
  if (!message?.projectId) {
    sendResponse({ success: false, opened: false, error: "Missing projectId" });
    return;
  }

  try {
    const requestedTab = message.requestedTab || "scan";
    const sourceUrl = message.sourceUrl || null;
    const targetTab = sourceUrl
      ? await findOrCreateRescanTab(sourceUrl)
      : sender?.tab?.id
        ? { id: sender.tab.id }
        : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

    if (!targetTab?.id) {
      sendResponse({ success: false, opened: false, error: "No app tab available" });
      return;
    }

    const pendingProjectContext = {
      id: crypto.randomUUID(),
      projectId: message.projectId,
      projectName: message.projectName || null,
      sourceUrl,
      requestedTab,
      requestedAt: new Date().toISOString(),
      targetTabId: targetTab.id,
    };

    await chrome.storage.local.set({ [PENDING_PROJECT_CONTEXT_STORAGE_KEY]: pendingProjectContext });
    chrome.runtime.sendMessage({
      type: "QADECK_PENDING_PROJECT_CONTEXT_UPDATED",
      context: pendingProjectContext,
    }).catch(() => {});

    await focusTabWindow(targetTab.id);
    await chrome.sidePanel.setOptions({
      tabId: targetTab.id,
      path: "src/sidepanel/sidepanel.html",
      enabled: true,
    });
    await chrome.sidePanel.open({ tabId: targetTab.id });

    sendResponse({ success: true, opened: true, tabId: targetTab.id });
  } catch (err) {
    sendResponse({ success: false, opened: false, error: err.message });
  }
}

async function handleBridgeDisconnectSession(_msg, _sender, sendResponse) {
  await chrome.storage.local.remove([
    USER_STORAGE_KEY,
    PENDING_SESSION_STORAGE_KEY,
    PENDING_PROJECT_CONTEXT_STORAGE_KEY,
    "qaDeckActiveProject",
  ]);
  chrome.identity.clearAllCachedAuthTokens(() => {});
  chrome.runtime.sendMessage({ type: "QADECK_SESSION_DISCONNECTED" }).catch(() => {});
  sendResponse({ success: true });
}

async function handleBridgeEnsureActiveTabBridge(_msg, _sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      sendResponse({ success: false, error: "No active tab available" });
      return;
    }

    await ensureTabContentScriptReady(tab.id, 5000);
    sendResponse({ success: true, tabId: tab.id });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleBridgeGetApiKey(_msg, _sender, sendResponse) {
  try {
    const stored = await chrome.storage.local.get(["apiKey"]);
    const apiKey = stored.apiKey || null;
    sendResponse({ success: true, apiKey });
  } catch (err) {
    sendResponse({ success: false, error: err.message, apiKey: null });
  }
}

async function handleBridgeRescanProject(message, _sender, sendResponse) {
  const { sourceUrl } = message;
  if (!sourceUrl) {
    sendResponse({ success: false, error: "No sourceUrl provided" });
    return;
  }
  try {
    const rescanTab = await findOrCreateRescanTab(sourceUrl);
    const tabId = rescanTab.id;
    if (!tabId) throw new Error("Unable to open the app tab for re-scan");

    await focusTabWindow(tabId);
    await waitForTabToFinishLoading(tabId, 20000);
    await ensureTabContentScriptReady(tabId, 12000);

    const result = await sendToTab(tabId, { type: "EXTRACT_PAGE" });
    if (!result?.success) throw new Error(result?.error || "DOM extraction failed");
    sendResponse({ success: true, scanData: result.data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleBridgeGetCurrentPage(_msg, _sender, sendResponse) {
  try {
    // Query the active tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      sendResponse({ pageLabel: "unknown", pageKey: "", url: "" });
      return;
    }

    // Send message to sidepanel to get current page metadata from state.currentPageData
    try {
      const sidepanelResponse = await chrome.runtime.sendMessage({
        type: "QADECK_PING_CURRENT_PAGE",
      });
      if (sidepanelResponse?.meta) {
        sendResponse({
          pageLabel: sidepanelResponse.meta.pageLabel || "unknown",
          pageKey: sidepanelResponse.meta.pageKey || "",
          url: sidepanelResponse.meta.url || tab.url || "",
        });
        return;
      }
    } catch (_) {
      // Sidepanel not responding - fall back to tab info
    }

    // Fallback: return tab URL (no page metadata available)
    sendResponse({
      pageLabel: tab.title || "unknown",
      pageKey: "",
      url: tab.url || "",
    });
  } catch (err) {
    sendResponse({
      pageLabel: "unknown",
      pageKey: "",
      url: "",
      error: err.message,
    });
  }
}

async function handleCheckBackend(_msg, _sender, sendResponse) {
  try {
    const res = await fetchTimeout(`${BACKEND_URL}/api/health`, { method: "GET" }, 3000);
    const data = await res.json();
    sendResponse({ success: true, online: true, data });
  } catch { sendResponse({ success: true, online: false }); }
}

async function handleScanPage(_msg, _sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/content/content_script.js"] }); } catch (_) {}
    const ping = await sendToTab(tab.id, { type: "PING" });
    if (!ping?.status) throw new Error("Content script not responsive — refresh the page and try again");
    const result = await sendToTab(tab.id, { type: "EXTRACT_PAGE" });
    if (!result?.success) throw new Error(result?.error || "DOM extraction failed");
    sendResponse({ success: true, data: result.data });
  } catch (err) { sendResponse({ success: false, error: err.message }); }
}

async function handleGenerateTests(message, _sender, sendResponse) {
  const { pageData, apiKey, exploratoryMode } = message;
  try {
    const res = await fetchTimeout(`${BACKEND_URL}/api/generate-tests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageData, apiKey, exploratoryMode: exploratoryMode || false }),
    }, 90000);
    const data = await res.json();
    if (data.success) {
      sendResponse({
        success: true,
        testCases: data.testCases,
        pageFingerprint: data.pageFingerprint || null,
        qualityReport: data.qualityReport || null,
        coverageSummary: data.coverageSummary || null,
      });
      return;
    }
    throw new Error(data.error);
  } catch (err) {
    if (isNetworkError(err)) return fallbackGenerateTests(message, sendResponse);
    sendResponse({ success: false, error: err.message });
  }
}

async function handleGenerateScript(message, _sender, sendResponse) {
  const { testCases, pageData, framework, format, customAssertions, networkCalls, visualTesting, perfAssertions, environments, datasetsMap, apiKey } = message;
  try {
    const res = await fetchTimeout(`${BACKEND_URL}/api/generate-script`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testCases, pageData, framework, format, customAssertions, networkCalls, visualTesting, perfAssertions, environments, datasetsMap, apiKey }),
    }, 90000);
    const data = await res.json();
    if (data.success) {
      sendResponse({
        success: true,
        scripts: data.scripts,
        files: data.files || null,
        validation: data.validation || null,
        generationMode: data.generationMode || "page",
      });
      return;
    }
    sendResponse({
      success: false,
      error: data.error,
      validation: data.validation || null,
      files: data.files || null,
      generationMode: data.generationMode || "page",
    });
    return;
  } catch (err) {
    if (isNetworkError(err)) return fallbackGenerateScript(message, sendResponse);
    sendResponse({ success: false, error: err.message });
  }
}

async function handleGenerateJourneyTests(message, _sender, sendResponse) {
  const { journey, apiKey } = message;
  try {
    const res = await fetchTimeout(`${BACKEND_URL}/api/generate-journey-tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journey, apiKey }),
    }, 90000);
    const data = await res.json();
    if (data.success) {
      sendResponse({ success: true, testCases: data.testCases, summary: data.summary });
      return;
    }
    throw new Error(data.error);
  } catch (err) {
    if (isNetworkError(err)) return fallbackGenerateJourneyTests(message, sendResponse);
    sendResponse({ success: false, error: err.message });
  }
}

async function handleGenerateJourneyScript(message, _sender, sendResponse) {
  const { journey, testCases, framework, apiKey } = message;
  try {
    const res = await fetchTimeout(`${BACKEND_URL}/api/generate-journey-script`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journey, testCases, framework, apiKey }),
    }, 120000);
    const data = await res.json();
    if (data.success) {
      sendResponse({ success: true, bundle: data.bundle, validation: data.validation || null });
      return;
    }
    if (data.validation) {
      sendResponse({ success: false, error: data.error, validation: data.validation, bundle: data.bundle || null });
      return;
    }
    throw new Error(data.error);
  } catch (err) {
    if (isNetworkError(err)) return fallbackGenerateJourneyScript(message, sendResponse);
    sendResponse({ success: false, error: err.message });
  }
}

async function handleHighlightElement(message, _sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await sendToTab(tab.id, { type: "HIGHLIGHT_ELEMENT", selector: message.selector });
    sendResponse({ success: true });
  } catch (err) { sendResponse({ success: false, error: err.message }); }
}

async function handleClearHighlights(_msg, _sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await sendToTab(tab.id, { type: "CLEAR_HIGHLIGHTS" });
    sendResponse({ success: true });
  } catch (err) { sendResponse({ success: false, error: err.message }); }
}

async function handleStartInspecting(_msg, _sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await sendToTab(tab.id, { type: "START_INSPECTING" });
    sendResponse({ success: true });
  } catch (err) { sendResponse({ success: false, error: err.message }); }
}

async function handleStopInspecting(_msg, _sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await sendToTab(tab.id, { type: "STOP_INSPECTING" });
    sendResponse({ success: true });
  } catch (err) { sendResponse({ success: false, error: err.message }); }
}

// Receives from content script, broadcasts to sidepanel
async function handleElementSelected(message, _sender, sendResponse) {
  chrome.runtime.sendMessage({ type: "ELEMENT_SELECTED", data: message.data }).catch(() => {});
  sendResponse({ success: true });
}

async function handleTestLocator(message, _sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await sendToTab(tab.id, {
      type: "TEST_LOCATOR",
      selector: message.selector,
      selectorType: message.selectorType,
    });
    sendResponse(result || { success: false, error: "No response from page" });
  } catch (err) { sendResponse({ success: false, error: err.message }); }
}

async function handleShowCoverageHeatmap(message, _sender, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = message.tabId || tab?.id;
    if (!tabId) { sendResponse({ success: false, error: "No active tab" }); return; }
    try { await chrome.scripting.executeScript({ target: { tabId }, files: ["src/content/content_script.js"] }); } catch (_) {}
    await sendToTab(tabId, { type: "SHOW_COVERAGE_HEATMAP", covered: message.covered || [], uncovered: message.uncovered || [] });
    sendResponse({ success: true });
  } catch (err) { sendResponse({ success: false, error: err.message }); }
}

async function handleStartNetworkCapture(message, _sender, sendResponse) {
  networkLog = [];
  networkCaptureActive = true;
  networkCaptureTabId = message.tabId ?? null;
  sendResponse({ success: true });
}

async function handleStopNetworkCapture(_msg, _sender, sendResponse) {
  networkCaptureActive = false;
  sendResponse({ success: true, networkLog: [...networkLog] });
}

async function handleGetNetworkLog(_msg, _sender, sendResponse) {
  sendResponse({ success: true, networkLog: [...networkLog] });
}

async function handleSaveProject(message, _sender, sendResponse) {
  try {
    const res = await fetchTimeout(`${BACKEND_URL}/api/save-project`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: message.project }),
    }, 5000);
    const data = await res.json();
    if (data.success) { sendResponse({ success: true, id: data.id }); return; }
  } catch (_) {}
  try {
    const stored = await chrome.storage.local.get(["projects"]);
    const projects = stored.projects || [];
    const id = message.project.id || crypto.randomUUID();
    const saved = { ...message.project, id, savedAt: new Date().toISOString() };
    const idx = projects.findIndex(p => p.id === id);
    if (idx >= 0) projects[idx] = saved; else projects.push(saved);
    await chrome.storage.local.set({ projects });
    sendResponse({ success: true, id });
  } catch (err) { sendResponse({ success: false, error: err.message }); }
}

async function handleLoadProjects(_msg, _sender, sendResponse) {
  try {
    const res = await fetchTimeout(`${BACKEND_URL}/api/projects`, { method: "GET" }, 5000);
    const data = await res.json();
    if (data.success) { sendResponse({ success: true, projects: data.projects }); return; }
  } catch (_) {}
  const stored = await chrome.storage.local.get(["projects"]);
  sendResponse({ success: true, projects: stored.projects || [] });
}

async function handleLoadProjectDetail(message, _sender, sendResponse) {
  const { id } = message;
  if (!id) {
    sendResponse({ success: false, error: "Project ID required" });
    return;
  }

  try {
    const res = await fetchTimeout(`${BACKEND_URL}/api/projects/${id}`, { method: "GET" }, 5000);
    const data = await res.json();
    if (data.success) {
      sendResponse({ success: true, project: data.project });
      return;
    }
  } catch (_) {}

  const stored = await chrome.storage.local.get(["projects"]);
  const project = (stored.projects || []).find((entry) => entry.id === id);
  if (!project) {
    sendResponse({ success: false, error: "Project not found" });
    return;
  }
  sendResponse({ success: true, project });
}

async function handleSaveJourneyDraft(message, _sender, sendResponse) {
  try {
    await chrome.storage.local.set({ journeyDraft: message.journey || null });
    sendResponse({ success: true });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function handleLoadJourneyDraft(_message, _sender, sendResponse) {
  try {
    const stored = await chrome.storage.local.get(["journeyDraft"]);
    sendResponse({ success: true, journey: stored.journeyDraft || null });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function fallbackGenerateTests(message, sendResponse) {
  const { pageData, apiKey, exploratoryMode } = message;
  try {
    const prompt = buildTestPrompt(pageData, exploratoryMode);
    const result = await callAI(apiKey, "You are a QA expert. Generate test cases from page data. Respond ONLY with valid JSON.", prompt, 4096);
    if (!result.success) throw new Error(result.error);
    const clean = sanitizeAiJson(result.text);
    let { testCases } = JSON.parse(clean);
    testCases = testCases.map((tc, i) => ({ id: tc.id || `TC${String(i+1).padStart(3,"0")}`, title: tc.title || "Untitled", category: tc.category || "functional", priority: tc.priority || "medium", preconditions: tc.preconditions || "", steps: tc.steps || [], expectedResult: tc.expectedResult || "", locators: tc.locators || {}, testData: tc.testData || {}, tags: tc.tags || [], approved: true }));
    sendResponse({ success: true, testCases });
  } catch (err) { sendResponse({ success: false, error: err.message }); }
}

async function fallbackGenerateScript(message, sendResponse) {
  const { testCases, pageData, framework, format, networkCalls, apiKey } = message;
  try {
    if (format === "bdd") {
      const prompt = buildBDDFallbackPrompt(testCases, pageData, framework);
      const result = await callAI(apiKey, "You are a senior QA automation engineer expert in BDD. Generate Gherkin feature files and step definitions. Respond ONLY with valid JSON.", prompt, 6144);
      if (!result.success) throw new Error(result.error);
      const clean = sanitizeAiJson(result.text);
      sendResponse({ success: true, scripts: JSON.parse(clean) });
      return;
    }

    // Step 1: Build page object + test data deterministically — no AI, no hallucinated locators
    const pageObject = generatePageObject(pageData, framework);
    const testData = generateTestData(testCases, pageData, framework);

    // Step 2: Ask AI only for the test methods, using the page object API we generated
    const pageObjectApi = _extractApiSummary(pageObject.content, framework);
    const prompt = buildTestsOnlyPrompt(testCases, pageData, framework, pageObject.filename, pageObjectApi, networkCalls);
    const result = await callAI(apiKey, "You are a senior QA automation engineer. Write test methods using the provided page object. Respond ONLY with valid JSON.", prompt, 4096);
    if (!result.success) throw new Error(result.error);
    const clean = sanitizeAiJson(result.text);
    const aiPart = JSON.parse(clean);

    sendResponse({ success: true, scripts: { pageObject, testData, tests: aiPart.tests } });
  } catch (err) { sendResponse({ success: false, error: err.message }); }
}

function buildBDDFallbackPrompt(testCases, pageData, framework) {
  const pageType = pageData?.meta?.pageType || "page";
  const pageUrl  = pageData?.meta?.url || "https://example.com";
  const ext = framework.includes("java") ? "java" : framework.includes("typescript") ? "ts" : "py";
  const slimCases = (testCases || []).map(tc => ({ id: tc.id, title: tc.title, steps: tc.steps, expectedResult: tc.expectedResult, locators: tc.locators || {} }));
  return `Generate a BDD test suite for a ${framework} project.
PAGE: ${pageType} at ${pageUrl}
TEST CASES: ${JSON.stringify(slimCases, null, 2)}
Output ONLY this JSON:
{ "feature": { "filename": "${pageType}.feature", "content": "..." }, "steps": { "filename": "${pageType}_steps.${ext}", "content": "..." }, "testData": { "filename": "test_data.${ext}", "content": "..." } }`;
}

async function fallbackGenerateJourneyTests(message, sendResponse) {
  const { journey, apiKey } = message;
  try {
    const prompt = buildJourneyTestPrompt(journey);
    const result = await callAI(
      apiKey,
      "You are a senior QA automation engineer. Generate journey-level and step-level web test cases. Respond ONLY with valid JSON.",
      prompt,
      6144
    );
    if (!result.success) throw new Error(result.error);
    const clean = sanitizeAiJson(result.text);
    const parsed = JSON.parse(clean);
    const testCases = normalizeJourneyTestCases(Array.isArray(parsed) ? parsed : parsed.testCases, journey);
    sendResponse({ success: true, testCases, summary: buildJourneyGenerationSummary(journey) });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

async function fallbackGenerateJourneyScript(message, sendResponse) {
  const { journey, testCases, framework, apiKey } = message;
  try {
    const summary = buildJourneyGenerationSummary(journey);
    const prompt = buildJourneyScriptPrompt(journey, testCases, framework, summary);
    const result = await callAI(
      apiKey,
      "You are a senior QA automation engineer. Generate a multi-page automation bundle. Respond ONLY with valid JSON.",
      prompt,
      8192
    );
    if (!result.success) throw new Error(result.error);
    const clean = sanitizeAiJson(result.text);
    const bundle = normalizeJourneyScriptBundle(JSON.parse(clean), framework, journey, testCases, summary);
    sendResponse({ success: true, bundle });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

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

async function callAI(apiKey, system, prompt, maxTokens) {
  if (!apiKey) return { success: false, error: "No API key provided" };
  if (apiKey.startsWith("sk-ant-") || apiKey.startsWith("sk-ant")) return callClaudeAPI(apiKey, system, prompt, maxTokens);
  if (apiKey.startsWith("AIza")) return callGeminiAPI(apiKey, system, prompt, maxTokens);
  if (apiKey.startsWith("xai-")) return callGrokAPI(apiKey, system, prompt, maxTokens);
  if (apiKey.startsWith("gsk_")) return callGroqAPI(apiKey, system, prompt, maxTokens);
  if (apiKey.startsWith("LA-")) return callMetaLlamaAPI(apiKey, system, prompt, maxTokens);
  if (apiKey.startsWith("sk-proj-") || apiKey.startsWith("sk-")) return callOpenAIAPI(apiKey, system, prompt, maxTokens);
  return callClaudeAPI(apiKey, system, prompt, maxTokens); // unknown — try Claude
}

async function callClaudeAPI(apiKey, system, prompt, maxTokens) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) { const e = await res.json(); return { success: false, error: e.error?.message || `API error ${res.status}` }; }
    const d = await res.json();
    return { success: true, text: d.content[0].text };
  } catch (err) { return { success: false, error: err.message }; }
}

async function callOpenAIAPI(apiKey, system, prompt, maxTokens) {
  try {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-5.4-mini", max_completion_tokens: maxTokens, messages }),
    });
    if (!res.ok) { const e = await res.json(); return { success: false, error: e.error?.message || `API error ${res.status}` }; }
    const d = await res.json();
    return { success: true, text: d.choices[0].message.content };
  } catch (err) { return { success: false, error: err.message }; }
}

async function callGrokAPI(apiKey, system, prompt, maxTokens) {
  try {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "grok-4.5", max_tokens: maxTokens, messages, temperature: 0.3 }),
    });
    if (!res.ok) { const e = await res.json(); return { success: false, error: e.error?.message || `API error ${res.status}` }; }
    const d = await res.json();
    return { success: true, text: d.choices[0].message.content };
  } catch (err) { return { success: false, error: err.message }; }
}

async function callGeminiAPI(apiKey, system, prompt, maxTokens) {
  try {
    const fullPrompt = system ? `${system}\n\n${prompt}` : prompt;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 } }),
    });
    if (!res.ok) { const e = await res.json(); return { success: false, error: e.error?.message || `API error ${res.status}` }; }
    const d = await res.json();
    return { success: true, text: d.candidates[0].content.parts[0].text };
  } catch (err) { return { success: false, error: err.message }; }
}

async function callGroqAPI(apiKey, system, prompt, maxTokens) {
  try {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "openai/gpt-oss-120b", max_tokens: maxTokens, messages, temperature: 0.3 }),
    });
    if (!res.ok) { const e = await res.json(); return { success: false, error: e.error?.message || `API error ${res.status}` }; }
    const d = await res.json();
    return { success: true, text: d.choices[0].message.content };
  } catch (err) { return { success: false, error: err.message }; }
}

async function callMetaLlamaAPI(apiKey, system, prompt, maxTokens) {
  try {
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const res = await fetch("https://api.llama.com/compat/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "Llama-4-Scout-17B-16E-Instruct", max_tokens: maxTokens, messages, temperature: 0.3 }),
    });
    if (!res.ok) { const e = await res.json(); return { success: false, error: e.error?.message || `API error ${res.status}` }; }
    const d = await res.json();
    return { success: true, text: d.choices[0].message.content };
  } catch (err) { return { success: false, error: err.message }; }
}

function buildTestPrompt(pageData, exploratoryMode = false) {
  const { meta, forms, buttons, links, tables, pageStructure } = pageData;
  const modeInstruction = exploratoryMode
    ? `Focus EXCLUSIVELY on: boundary values (min/max/empty/whitespace), negative cases (invalid formats, injection strings), race conditions (double-submit, rapid clicks), session edge cases (expired session, back-button), and unusual behaviour (Unicode, very long strings, tab-key navigation). Do NOT generate happy-path tests.`
    : `Cover: happy path, negative cases, form validation, navigation flows, and edge cases.`;
  return `Generate 10-14 test cases for this page. Use exact locators from data.
URL: ${meta?.url} | Type: ${meta?.pageType}
Forms: ${JSON.stringify((forms||[]).slice(0,3))}
Buttons: ${JSON.stringify((buttons||[]).slice(0,10).map(b=>({text:b.text,action:b.action,locator:b.locator})))}
Links: ${JSON.stringify((links||[]).filter(l=>!l.isExternal).slice(0,8).map(l=>({text:l.text,path:l.path})))}
Features: ${JSON.stringify(pageStructure)}
${modeInstruction}
Respond ONLY with JSON: {"testCases":[{"id","title","category","priority","preconditions","steps":[],"expectedResult","locators":{},"testData":{},"tags":[]}]}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETERMINISTIC SCRIPT GENERATOR
// Page objects and test data are built directly from the scan — zero AI needed.
// AI is only called for the test method bodies (action sequences + assertions).
// ═══════════════════════════════════════════════════════════════════════════════

// ── Name utilities ─────────────────────────────────────────────────────────────
function _toSnake(str) {
  return String(str || "element").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1") || "element";
}
function _toCamel(str) { return _toSnake(str).replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
function _toPascal(str) { const c = _toCamel(str); return c.charAt(0).toUpperCase() + c.slice(1); }
function _toScreaming(str) { return _toSnake(str).toUpperCase(); }
function _elLabel(el) { return el.label || el.ariaLabel || el.text || el.name || el.testId || el.tag || "element"; }

// ── Action type classifier ─────────────────────────────────────────────────────
function _actionType(el) {
  const tag = (el.tag || "").toLowerCase();
  const type = (el.type || "").toLowerCase();
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

// ── Locator expression builders ────────────────────────────────────────────────
function _seleniumByTuple(el) {
  const s = el.locatorStrategy || "css", loc = el.locator || "";
  const m = { "test-id": `By.CSS_SELECTOR, "${loc}"`, "id": `By.ID, "${loc.replace(/^#/, "")}"`, "name": `By.NAME, "${loc}"`, "xpath": `By.XPATH, "${loc}"`, "css": `By.CSS_SELECTOR, "${loc}"`, "aria-label": `By.CSS_SELECTOR, "${loc}"` };
  return `(${m[s] || `By.CSS_SELECTOR, "${loc}"`})`;
}
function _seleniumByJava(el) {
  const s = el.locatorStrategy || "css", loc = el.locator || "";
  const m = { "test-id": `By.cssSelector("${loc}")`, "id": `By.id("${loc.replace(/^#/, "")}")`, "name": `By.name("${loc}")`, "xpath": `By.xpath("${loc}")`, "css": `By.cssSelector("${loc}")`, "aria-label": `By.cssSelector("${loc}")` };
  return m[s] || `By.cssSelector("${loc}")`;
}
function _pwLocPy(el) {
  const s = el.locatorStrategy || "css", loc = el.locator || "";
  if (s === "test-id" && el.testId) return `page.get_by_test_id("${el.testId}")`;
  if (s === "aria-label" && el.ariaLabel) return `page.get_by_label("${el.ariaLabel.replace(/"/g, '\\"')}")`;
  if (s === "xpath") return `page.locator("xpath=${loc}")`;
  return `page.locator("${loc}")`;
}
function _pwLocTs(el) {
  const s = el.locatorStrategy || "css", loc = el.locator || "";
  if (s === "test-id" && el.testId) return `page.getByTestId('${el.testId}')`;
  if (s === "aria-label" && el.ariaLabel) return `page.getByLabel('${el.ariaLabel.replace(/'/g, "\\'")}')`;
  if (s === "xpath") return `page.locator('xpath=${loc}')`;
  return `page.locator('${loc}')`;
}

// ── Collect actionable elements from pageData ──────────────────────────────────
function _collectElements(pageData) {
  const seen = new Set();
  const all = [];
  const add = (el) => { if (!el?.locator || seen.has(el.locator)) return; seen.add(el.locator); all.push(el); };
  for (const form of (pageData?.forms || [])) for (const field of (form.fields || [])) add(field);
  for (const el of (pageData?.inputs || [])) add(el);
  for (const btn of (pageData?.buttons || [])) add(btn);
  return all;
}

// ── Per-framework page object generators ──────────────────────────────────────
function _genSelPy(elements, className, url) {
  const locs = elements.map(el => `    ${_toScreaming(_elLabel(el))} = ${_seleniumByTuple(el)}`).join("\n");
  const methods = elements.map(el => {
    const C = _toScreaming(_elLabel(el)), at = _actionType(el), n = _toSnake(_elLabel(el)), lbl = _elLabel(el);
    if (at === "fill") return `\n    def enter_${n}(self, value: str):\n        """Enter text in ${lbl}."""\n        el = self.wait.until(EC.element_to_be_clickable(self.${C}))\n        el.clear()\n        el.send_keys(value)`;
    if (at === "click") return `\n    def click_${n}(self):\n        """Click ${lbl}."""\n        self.wait.until(EC.element_to_be_clickable(self.${C})).click()`;
    if (at === "select") return `\n    def select_${n}(self, option: str):\n        """Select option in ${lbl}."""\n        from selenium.webdriver.support.ui import Select\n        Select(self.wait.until(EC.visibility_of_element_located(self.${C}))).select_by_visible_text(option)`;
    if (at === "checkbox") return `\n    def check_${n}(self):\n        """Check ${lbl}."""\n        el = self.wait.until(EC.element_to_be_clickable(self.${C}))\n        if not el.is_selected(): el.click()\n\n    def uncheck_${n}(self):\n        """Uncheck ${lbl}."""\n        el = self.wait.until(EC.element_to_be_clickable(self.${C}))\n        if el.is_selected(): el.click()`;
    return `\n    def click_${n}(self):\n        self.wait.until(EC.element_to_be_clickable(self.${C})).click()`;
  }).join("\n");
  return `from selenium.webdriver.common.by import By\nfrom selenium.webdriver.support import expected_conditions as EC\nfrom selenium.webdriver.support.ui import WebDriverWait\nfrom base_test import BaseTest, resolve_driver\n\n\nclass ${className}(BaseTest):\n    """Page Object for ${url}"""\n\n    # ── Locators ──────────────────────────────────────────────────────────────\n${locs}\n\n    # ── Actions ───────────────────────────────────────────────────────────────${methods}\n`;
}

function _genPwPy(elements, className, url) {
  const inits = elements.map(el => `        self.${_toSnake(_elLabel(el))} = ${_pwLocPy(el)}`).join("\n");
  const methods = elements.map(el => {
    const n = _toSnake(_elLabel(el)), at = _actionType(el), lbl = _elLabel(el);
    if (at === "fill") return `\n    def enter_${n}(self, value: str):\n        """Enter text in ${lbl}."""\n        self.${n}.fill(value)`;
    if (at === "click") return `\n    def click_${n}(self):\n        """Click ${lbl}."""\n        self.${n}.click()`;
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
    const n = _toCamel(_elLabel(el)), p = _toPascal(_elLabel(el)), at = _actionType(el);
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
    const C = _toScreaming(_elLabel(el)), p = _toPascal(_elLabel(el)), at = _actionType(el);
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
  const className = _toPascal(pageType) + "Page";
  const isJava = framework === "selenium-java", isTs = framework === "playwright-typescript";
  const filename = isTs ? `${_toSnake(pageType)}_page.ts` : isJava ? `${className}.java` : `${_toSnake(pageType)}_page.py`;
  let content = "";
  if (framework === "selenium-python")      content = _genSelPy(elements, className, url);
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

function buildTestsOnlyPrompt(testCases, pageData, framework, pageObjectFilename, pageObjectApi, networkCalls) {
  const pageType = pageData?.meta?.pageType || "page";
  const isTs = framework === "playwright-typescript", isJava = framework === "selenium-java";
  const ext = isJava ? "java" : isTs ? "ts" : "py";
  const baseUrl = pageData?.meta?.url || "https://example.com";
  const filename = `test_${_toSnake(pageType)}.${ext}`;
  const slim = (testCases || []).slice(0, 15).map(tc => ({ id: tc.id, title: tc.title, steps: tc.steps, expectedResult: tc.expectedResult, testData: tc.testData || {} }));
  const netSection = networkCalls?.length
    ? `\nNETWORK CALLS TO ASSERT:\n${networkCalls.map((n, i) => { try { return `${i+1}. ${n.method} ${new URL(n.url).pathname} → ${n.statusCode}`; } catch { return `${i+1}. ${n.method} ${n.url} → ${n.statusCode}`; } }).join("\n")}\n`
    : "";
  return `Generate ONLY the test class file for ${framework}.

PAGE OBJECT: ${pageObjectFilename} (already generated — import and use it)
BASE URL: ${baseUrl}

AVAILABLE PAGE OBJECT METHODS (use ONLY these — never call driver.find_element or page.locator directly):
${pageObjectApi}
${netSection}
TEST CASES (${slim.length}):
${JSON.stringify(slim, null, 2)}

Rules:
- One test method per test case named test_{id}_{snake_title}
- Use ONLY the page object methods listed above for all interactions
- Assertions: WebDriverWait + EC (Selenium) or expect() (Playwright) — no time.sleep
- Test data from TEST_DATA/testData imports — no hardcoded credentials
- Each test is fully independent (setup in setup_method / beforeEach)

Respond with ONLY this JSON (no markdown fences):
{"tests":{"filename":"${filename}","content":"<full test class with all imports>"}}`;
}

// ─────────────────────────────────────────────────────────────────────────────

function buildScriptPrompt(testCases, pageData, framework, networkCalls) {
  const pageType = pageData?.meta?.pageType || "page";
  const ext = framework.includes("java") ? "java" : framework.includes("typescript") ? "ts" : "py";
  const configFile = framework === "playwright-typescript" ? "playwright.config.ts" : framework.includes("java") ? "testng.xml" : "pytest.ini";
  const netSection = networkCalls?.length ? `\nNETWORK ASSERTIONS (assert these API calls in the relevant test methods):\n${networkCalls.map((n, i) => { const p = (() => { try { return new URL(n.url).pathname; } catch { return n.url; } })(); return `${i+1}. ${n.method} ${p} → status ${n.statusCode}`; }).join("\n")}\n` : "";
  return `Generate ${framework} POM automation scripts.
PAGE: ${pageData?.meta?.url} | TYPE: ${pageType}
TEST CASES: ${JSON.stringify(testCases.slice(0,8), null, 2)}${netSection}
Respond ONLY with JSON: {"base":{"filename":"base_test.${ext}","content":"..."},"pageObject":{"filename":"${pageType}_page.${ext}","content":"..."},"testData":{"filename":"test_data.${ext}","content":"..."},"tests":{"filename":"test_${pageType}.${ext}","content":"..."},"config":{"filename":"${configFile}","content":"..."}}`;
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
- Use scope="journey" for end-to-end cases and scope="step" for local step cases
- For step cases, include the correct stepId and stepOrder from the provided steps
- Each step's \`assertions\` array lists the expected outcomes after that step; cover every listed assertion in that step's cases and anchor expectedResult text on them
- Cover realistic enterprise-style flows and negative scenarios

Respond ONLY with valid JSON:
{
  "testCases": [
    {
      "id": "optional",
      "title": "string",
      "category": "functional|negative|smoke|e2e",
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
  return `Generate a multi-page automation bundle for this journey.

FRAMEWORK: ${framework}
JOURNEY NAME: ${journey.name || "Untitled Journey"}
FULL JOURNEY EXECUTABLE: ${summary.journeyExecutable ? "yes" : "no"}
MISSING TRANSITIONS: ${JSON.stringify(summary.missingTransitions)}
ORDERED STEPS:
${JSON.stringify(slimJourneySteps(journey), null, 2)}
APPROVED TEST CASES:
${JSON.stringify(approvedCases.map(slimJourneyCaseForPrompt), null, 2)}

Requirements:
- Return ONLY page objects, journey tests, and step tests in the files array
- Shared base/config/test-data files are injected separately, do not generate them
- ${summary.journeyExecutable ? "Add one end-to-end journey file" : "Do not generate a journey file because recorded transitions are missing"}
- Add separate step test files for the provided steps
- Implement every assertion in each step's \`assertions\` array after that step executes:
  - url-contains: assert the value is a substring of the current URL
  - title-contains: assert the value is a substring of the page title
  - element-visible: wait for visibility of the element using the value as the locator
  - custom: implement a best-effort assertion from the description in the value
- Preserve step order

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
  return (journey?.steps || []).map((step, index) => ({
    id: step.id,
    order: step.order || index + 1,
    title: step.title,
    url: step.url,
    path: step.path,
    pageType: step.pageType,
    source: step.source,
    transitionStatus: step.transitionStatus,
    notes: step.notes || "",
    assertions: (step.assertions || [])
      .filter((assertion) => assertion && assertion.enabled !== false && String(assertion.value || "").trim())
      .slice(0, 8)
      .map((assertion) => ({
        type: ["url-contains", "title-contains", "element-visible", "custom"].includes(assertion.type) ? assertion.type : "custom",
        value: String(assertion.value).trim(),
        label: assertion.label || String(assertion.value).trim(),
      })),
    keyForms: (step.pageData?.forms || []).slice(0, 2).map((form) => ({
      purpose: form.purpose,
      fields: (form.fields || []).slice(0, 5).map((field) => ({
        label: field.label,
        type: field.type,
        required: field.required,
        locator: field.locator,
      })),
    })),
    keyButtons: (step.pageData?.buttons || []).slice(0, 6).map((button) => ({
      text: button.text,
      action: button.action,
      locator: button.locator,
    })),
    recordedSteps: (step.recordedSteps || []).slice(0, 10),
  }));
}

function slimJourneyCaseForPrompt(testCase) {
  return {
    id: testCase.id,
    title: testCase.title,
    scope: testCase.scope,
    stepId: testCase.stepId || null,
    stepOrder: testCase.stepOrder || null,
    steps: testCase.steps || [],
    expectedResult: testCase.expectedResult || "",
    tags: testCase.tags || [],
  };
}

function normalizeJourneyTestCases(testCases, journey) {
  const stepMap = new Map((journey?.steps || []).map((step, index) => [
    step.id,
    { ...step, order: step.order || index + 1 },
  ]));
  const seen = new Set();
  let journeyCount = 0;
  let stepCount = 0;

  return (Array.isArray(testCases) ? testCases : []).reduce((acc, raw, index) => {
    const scope = raw?.scope === "step" ? "step" : "journey";
    const step =
      scope === "step"
        ? stepMap.get(raw.stepId) ||
          [...stepMap.values()].find((candidate) => candidate.order === Number(raw.stepOrder)) ||
          [...stepMap.values()][index % Math.max(stepMap.size, 1)]
        : null;

    if (scope === "journey") journeyCount += 1;
    if (scope === "step") stepCount += 1;

    const normalized = {
      id:
        raw?.id ||
        (scope === "journey"
          ? `JY${String(journeyCount).padStart(3, "0")}`
          : `ST${String(stepCount).padStart(3, "0")}`),
      title:
        raw?.title ||
        (scope === "journey"
          ? `Journey validation ${journeyCount}`
          : `Step ${step?.order || 1} validation ${stepCount}`),
      category: raw?.category || (scope === "journey" ? "e2e" : "functional"),
      priority: raw?.priority || "medium",
      preconditions: raw?.preconditions || "",
      steps: Array.isArray(raw?.steps) ? raw.steps : [],
      expectedResult: raw?.expectedResult || raw?.expected_result || "",
      locators: raw?.locators || {},
      testData: raw?.testData || raw?.test_data || {},
      tags: Array.isArray(raw?.tags) ? raw.tags : [],
      approved: raw?.approved !== false,
      scope,
      stepId: scope === "step" ? step?.id || raw?.stepId || null : null,
      stepOrder: scope === "step" ? step?.order || Number(raw?.stepOrder) || null : null,
      groupLabel:
        scope === "journey"
          ? "Journey Cases"
          : raw?.groupLabel || `Step ${step?.order || raw?.stepOrder || 1} — ${step?.title || "Recorded Step"}`,
    };

    const key = `${normalized.scope}|${normalized.stepId || "journey"}|${normalized.title.toLowerCase()}`;
    if (seen.has(key)) return acc;
    seen.add(key);
    acc.push(normalized);
    return acc;
  }, []);
}

function buildJourneyGenerationSummary(journey) {
  const missingTransitions = (journey?.steps || [])
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
    totalSteps: journey?.steps?.length || 0,
  };
}

function normalizeJourneyScriptBundle(bundle, framework, journey, approvedCases, summary) {
  const rawFiles = Array.isArray(bundle?.files) ? bundle.files : [];
  const files = rawFiles
    .filter((file) => file?.filename && file?.content)
    .map((file) => ({
      filename: String(file.filename).replace(/^\/+/, ""),
      content: String(file.content),
      group: ["page", "journey", "step", "shared"].includes(file.group) ? file.group : inferJourneyFileGroup(file.filename),
      stepId: file.stepId || null,
    }))
    .filter((file) => summary.journeyExecutable || file.group !== "journey");

  const deduped = [];
  const seen = new Set();
  for (const file of files) {
    if (seen.has(file.filename)) continue;
    seen.add(file.filename);
    deduped.push(file);
  }

  const stabilized = framework === "selenium-python"
    ? deduped.map((file) => stabilizeSeleniumPythonJourneyFile(file))
    : deduped;

  const withShared = ensureJourneySharedFiles(stabilized, framework, journey, approvedCases);
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
  const baseUrl = journey?.steps?.[0]?.url || "https://example.com";
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
    files.push({ filename: "pytest.ini", group: "shared", content: `[pytest]\naddopts = -v --tb=short --junit-xml=report.xml\ntestpaths = tests\n` });
    files.push({ filename: "test_data.py", group: "shared", content: buildJourneyTestDataContent(framework, journey, approvedCases) });
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
    files.push({ filename: "pytest.ini", group: "shared", content: `[pytest]\naddopts = -v --tb=short --junit-xml=report.xml\ntestpaths = tests\n` });
    files.push({ filename: "test_data.py", group: "shared", content: buildJourneyTestDataContent(framework, journey, approvedCases) });
  } else if (framework === "playwright-typescript") {
    files.push({
      filename: "journey_base.ts",
      group: "shared",
      content: `import { Page } from '@playwright/test';

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
    files.push({ filename: "test_data.ts", group: "shared", content: buildJourneyTestDataContent(framework, journey, approvedCases) });
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
    files.push({ filename: "testng.xml", group: "shared", content: `<!DOCTYPE suite SYSTEM "https://testng.org/testng-1.0.dtd" >\n<suite name="JourneySuite">\n  <test name="JourneyFlow">\n    <classes></classes>\n  </test>\n</suite>\n` });
    files.push({ filename: "test_data.json", group: "shared", content: buildJourneyTestDataContent(framework, journey, approvedCases) });
  }

  return files;
}

function buildJourneyTestDataContent(framework, journey, approvedCases) {
  const payload = {
    journeyName: journey?.name || "Untitled Journey",
    baseUrl: journey?.steps?.[0]?.url || "https://example.com",
    steps: (journey?.steps || []).map((step) => ({
      order: step.order,
      title: step.title,
      url: step.url,
      pageType: step.pageType,
      notes: step.notes || "",
    })),
    approvedCases: (approvedCases || []).map((testCase) => ({
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

function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

async function findOrCreateRescanTab(sourceUrl) {
  const existingTabs = await chrome.tabs.query({});
  const matchedTab = existingTabs.find((tab) => isMatchingRescanUrl(tab.url, sourceUrl));
  if (matchedTab) return matchedTab;
  return chrome.tabs.create({ url: sourceUrl, active: true });
}

function isMatchingRescanUrl(tabUrl, sourceUrl) {
  if (!tabUrl || !sourceUrl) return false;

  try {
    const current = new URL(tabUrl);
    const target = new URL(sourceUrl);
    const normalizePath = (value) => (value || "/").replace(/\/+$/, "") || "/";

    return current.origin === target.origin &&
      normalizePath(current.pathname) === normalizePath(target.pathname);
  } catch (_) {
    return tabUrl === sourceUrl || tabUrl.startsWith(sourceUrl);
  }
}

async function focusTabWindow(tabId) {
  await chrome.tabs.update(tabId, { active: true });
  const tab = await chrome.tabs.get(tabId);
  if (tab.windowId) {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  }
}

async function waitForTabToFinishLoading(tabId, timeoutMs = 20000) {
  const currentTab = await chrome.tabs.get(tabId);
  if (currentTab.status === "complete" && !currentTab.pendingUrl) return;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onRemoved.removeListener(handleRemoved);
      reject(new Error("Page load timeout"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onRemoved.removeListener(handleRemoved);
    }

    function handleUpdated(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status === "complete") {
        cleanup();
        resolve();
      }
    }

    function handleRemoved(removedTabId) {
      if (removedTabId !== tabId) return;
      cleanup();
      reject(new Error("The app tab was closed before the re-scan finished"));
    }

    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.tabs.onRemoved.addListener(handleRemoved);
  });
}

async function ensureTabContentScriptReady(tabId, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "Content script not responsive on target page";

  while (Date.now() < deadline) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["src/content/content_script.js"],
      });
    } catch (_) {}

    try {
      const ping = await sendToTab(tabId, { type: "PING" });
      if (ping?.status) return;
    } catch (err) {
      lastError = err.message || lastError;
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  throw new Error(`${lastError}. Refresh the app page and try re-scan again.`);
}

function fetchTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

function isNetworkError(err) {
  const message = String(err?.message || "");
  return err?.name === "AbortError" ||
    /Failed to fetch|fetch failed|NetworkError|ECONNREFUSED|ERR_CONNECTION/i.test(message);
}

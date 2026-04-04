/**
 * QA Deck — Side Panel Controller
 * Manages all UI state, messaging with background worker,
 * and user interactions.
 */

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  currentTab: "scan",
  currentPageData: null,
  testCases: [],
  scripts: null,
  activeArtifactMode: "page",
  selectedFramework: "selenium-python",
  selectedFormat: "pom",
  selectedScriptPack: "page",
  selectedFile: "base",
  expandedTC: null,
  editingTC: null,
  filterCategory: "all",
  apiKey: null,
  currentTabInfo: null,
  projectId: null,
  exploratoryMode: false,
  selInspecting: false,
  selAssertMode: false,
  selAssertElement: null,
  selAssertType: "text_equals",
  customAssertions: [],
  networkCapture: false,
  networkLog: [],
  visualTesting: false,
  perfAssertions: false,
  multiEnv: false,
  environments: [],
  coverageHeatmapActive: false,
  selActiveFw: "playwright",
  selLang: "python",
  selCart: [],
  selTheme: "auto",
  journey: createEmptyJourney(),
  savedJourneys: [],
  cloudProjects: [],
  localProjects: [],
  projectAppSelection: null,
  activeProject: null,
  activeProjectRecord: null,
  projectBarCollapsed: false,
  projectSourceFilter: "cloud",
  projectModalContext: null,
  projectModalUseCustomName: false,
  tcGroupExpanded: {},
  journeyStepExpanded: {},
};

const FILE_ORDER = ["base", "pageObject", "testData", "tests", "config", "accessibility", "perfTest", "visualTest"];
const BDD_FILE_ORDER = ["feature", "steps", "hooks", "testData"];
const PROJECT_STATUSES = ["draft", "active", "review", "done", "archived"];
const TESTCASE_PACK_ORDER = ["smoke", "regression", "e2e"];
const SCRIPT_PACK_LABELS = {
  page: "Test Cases",
  smoke: "Smoke Pack",
  regression: "Regression Pack",
  e2e: "E2E Pack",
};
const TESTCASE_KIND_LABELS = {
  page: "Test case",
  flow: "Flow case",
  step: "Step case",
};
const FeatureAccess = {
  PUBLIC: "public",
  CONNECTED: "connected",
  CONNECTED_WITH_PROJECT: "connected_with_project",
};
const PENDING_PROJECT_CONTEXT_STORAGE_KEY = "qaDeckPendingProjectContext";
const PROJECT_BAR_COLLAPSED_STORAGE_KEY = "qaDeckProjectBarCollapsed";
let journeyDraftTimer = null;
let projectModalResolver = null;
let pageMismatchResolver = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createEmptyJourney(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    name: overrides.name || "Untitled Journey",
    mode: "journey",
    version: 1,
    activeFramework: overrides.activeFramework || "selenium-python",
    steps: Array.isArray(overrides.steps) ? overrides.steps : [],
    generated: overrides.generated || { testCases: [], scripts: null, lastGeneratedAt: null },
    savedAt: overrides.savedAt || null,
    updatedAt: overrides.updatedAt || new Date().toISOString(),
    ...overrides,
  };
}

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

function normalizeCaseKind(testCase) {
  if (["page", "flow", "step"].includes(testCase?.caseKind)) return testCase.caseKind;
  if (testCase?.scope === "journey") return "flow";
  if (testCase?.scope === "step") return "step";
  if (String(testCase?.suite || "").toLowerCase() === "e2e") return "flow";
  return "page";
}

function normalizePacks(testCase, caseKind) {
  const direct = Array.isArray(testCase?.packs)
    ? testCase.packs.map((pack) => String(pack || "").toLowerCase().trim())
    : [];
  if (direct.length) return normalizePackMembership(caseKind, direct);

  const tags = Array.isArray(testCase?.tags) ? testCase.tags.map((tag) => String(tag || "").toLowerCase()) : [];
  const suite = String(testCase?.suite || "").toLowerCase().trim();
  const next = [];
  if (suite === "smoke" || tags.includes("smoke")) next.push("smoke");
  if (suite === "regression" || tags.includes("regression")) next.push("regression");
  if ((suite === "e2e" || tags.includes("e2e") || tags.includes("flow")) && caseKind === "flow") next.push("e2e");
  return normalizePackMembership(caseKind, next);
}

function normalizeTestCase(testCase, index = 0) {
  const caseKind = normalizeCaseKind(testCase);
  const packs = normalizePacks(testCase, caseKind);
  const scope = testCase?.scope || (caseKind === "flow" ? "journey" : caseKind === "step" ? "step" : "page");
  return {
    ...testCase,
    id: testCase?.id || `TC${String(index + 1).padStart(3, "0")}`,
    title: testCase?.title || "Untitled test case",
    category: testCase?.category || (caseKind === "flow" ? "e2e" : "functional"),
    priority: testCase?.priority || "medium",
    preconditions: testCase?.preconditions || "",
    steps: Array.isArray(testCase?.steps) ? testCase.steps : [],
    expectedResult: testCase?.expectedResult || testCase?.expected_result || "",
    locators: testCase?.locators && typeof testCase.locators === "object" ? testCase.locators : {},
    testData: testCase?.testData && typeof testCase.testData === "object" ? testCase.testData : {},
    tags: Array.isArray(testCase?.tags) ? testCase.tags : [],
    approved: testCase?.approved !== false,
    caseKind,
    packs,
    suite: deriveLegacySuite(caseKind, packs),
    scope,
    source: testCase?.source || (scope === "journey" || scope === "step" ? "recording" : "page"),
    _localId: testCase?._localId || Date.now() + index,
  };
}

function getApprovedCasesForSelectedPack() {
  const approved = state.testCases.filter((testCase) => testCase.approved);
  if (state.selectedScriptPack === "page") {
    return approved.filter((testCase) => testCase.caseKind !== "flow");
  }
  return approved.filter((testCase) => testCase.packs.includes(state.selectedScriptPack));
}

function syncScriptPackSelect() {
  const select = document.getElementById("script-pack-select");
  if (select) select.value = state.selectedScriptPack;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await refreshTabInfo();
  await ensureCurrentTabBridge();
  await checkBackendStatus();
  await waitForProjectAuthReady();
  await loadJourneyDraft();
  await loadProjectWorkspace();
  await refreshSavedJourneys();
  bindEvents();
  syncScriptPackSelect();
  await maybeProcessPendingProjectContext();
  applyGuestModeDefaults();
  renderTCList();
  renderJourneyTab();
  renderProjectWorkspace();
});

async function checkBackendStatus() {
  const res = await sendToBackground({ type: "CHECK_BACKEND" });
  const dot = document.getElementById("backend-dot");
  const label = document.getElementById("backend-label");
  if (!dot) return;
  if (res?.online) {
    dot.style.background = "#1D9E75";
    label.textContent = "Backend connected";
    label.style.color = "#0F6E56";
  } else {
    dot.style.background = "#E24B4A";
    label.textContent = "Direct API mode";
    label.style.color = "#A32D2D";
  }
}

// Listen for tab changes from background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TAB_CHANGED" || message.type === "TAB_UPDATED") {
    state.currentTabInfo = message.tab;
    updatePageBar(message.tab);
    ensureCurrentTabBridge().catch(() => {});
  }
  if (message.type === "QADECK_PENDING_PROJECT_CONTEXT_UPDATED") {
    maybeProcessPendingProjectContext(message.context).catch((err) => {
      console.warn("[QA Deck] Failed to process project context", err);
    });
  }
  if (message.type === "ELEMENT_SELECTED") {
    if (state.selAssertMode) {
      showAssertBuilder(message.data);
    } else {
      renderLocators(message.data);
      stopInspectMode();
    }
  }
  if (message.type === "NETWORK_REQUEST_CAPTURED") {
    state.networkLog.push(message.entry);
    renderNetworkPanel();
  }
  if (message.type === "QADECK_PING_CURRENT_PAGE") {
    // Return current page metadata from the extension's state
    if (state.currentPageData?.meta) {
      sendResponse({
        meta: {
          pageLabel: state.currentPageData.meta.pageLabel || "unknown",
          pageKey: state.currentPageData.meta.pageKey || "",
          url: state.currentPageData.meta.url || "",
        },
      });
    } else {
      sendResponse({
        meta: {
          pageLabel: "unknown",
          pageKey: "",
          url: "",
        },
      });
    }
  }
});

// ─── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  const result = await chrome.storage.local.get(["apiKey", "defaultFramework"]);
  state.apiKey = result.apiKey || "";
  setSelectedFramework(result.defaultFramework || "selenium-python");
  if (result.apiKey) {
    document.getElementById("api-key-input").value = result.apiKey;
  }
  if (result.defaultFramework) {
    document.getElementById("default-framework").value = result.defaultFramework;
  }
}

function detectProvider(apiKey) {
  if (!apiKey) return null;
  if (apiKey.startsWith("sk-ant-")) return "Claude (Anthropic)";
  if (apiKey.startsWith("AIza")) return "Gemini (Google)";
  if (apiKey.startsWith("xai-")) return "Grok (xAI)";
  if (apiKey.startsWith("gsk_")) return "Llama via Groq";
  if (apiKey.startsWith("LA-")) return "Llama via Meta API";
  if (apiKey.startsWith("sk-proj-") || apiKey.startsWith("sk-")) return "GPT (OpenAI)";
  return null;
}

async function saveSettings() {
  const apiKey = document.getElementById("api-key-input").value.trim();
  const framework = document.getElementById("default-framework").value;

  if (!apiKey) {
    showToast("Please enter an API key", "error");
    return;
  }

  const provider = detectProvider(apiKey);
  if (!provider) {
    showToast("Unrecognised key format. Expected sk-ant- (Claude), sk- (OpenAI), or AIza (Gemini)", "error");
    return;
  }

  await chrome.storage.local.set({ apiKey, defaultFramework: framework });
  state.apiKey = apiKey;
  setSelectedFramework(framework);
  renderJourneyTab();
  showToast(`Settings saved! Using ${provider}`, "success");
  toggleSettings(false);
}

function setSelectedFramework(framework) {
  state.selectedFramework = framework;
  state.journey.activeFramework = framework;
  document.querySelectorAll(".fw-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.fw === framework);
  });
}

// ─── Tab info ─────────────────────────────────────────────────────────────────

async function refreshTabInfo() {
  const res = await sendToBackground({ type: "GET_TAB_INFO" });
  if (res?.success) {
    state.currentTabInfo = res.tab;
    updatePageBar(res.tab);
  }
}

async function ensureCurrentTabBridge() {
  try {
    await sendToBackground({ type: "QADECK_ENSURE_ACTIVE_TAB_BRIDGE" });
  } catch (_) {}
}

function updatePageBar(tab) {
  const urlEl = document.getElementById("url-text");
  try {
    const url = new URL(tab.url);
    urlEl.textContent = url.hostname + url.pathname;
  } catch {
    urlEl.textContent = tab.url || "—";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setButtonLoading(id, loading, loadingText, defaultText) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? loadingText : defaultText;
}

async function waitForProjectAuthReady() {
  if (window.qadeckAuth?.ready) {
    try {
      await window.qadeckAuth.ready();
    } catch (_) {}
  }
}

function getCloudProjectApi() {
  return window.qadeckAuth || null;
}

function isCloudSignedIn() {
  return !!getCloudProjectApi()?.isSignedIn?.();
}

function hasActiveCloudProject() {
  return !!state.activeProject && state.activeProject.location === "cloud";
}

function getConnectUrl() {
  return getCloudProjectApi()?.getConnectUrl?.() || "https://qadeck.com/dashboard/connect-extension";
}

async function openConnectExperience() {
  closeLoginRequiredModal();
  const tabs = await chrome.tabs.query({});
  const preferred = tabs.find((tab) => isKnownWebsiteOrigin(tab.url));
  const targetUrl = preferred?.url ? buildWebsiteConnectUrl(preferred.url) : getConnectUrl();

  if (preferred?.id) {
    await chrome.tabs.update(preferred.id, { active: true, url: targetUrl });
    return;
  }

  chrome.tabs.create({ url: targetUrl });
}

function isKnownWebsiteOrigin(value) {
  try {
    const url = new URL(value);
    return (
      url.origin === "https://qadeck.com" ||
      url.origin === "https://www.qadeck.com" ||
      (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
    );
  } catch {
    return false;
  }
}

function buildWebsiteConnectUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}/dashboard/connect-extension`;
  } catch {
    return getConnectUrl();
  }
}

function applyGuestModeDefaults() {
  if (!isCloudSignedIn() && state.currentTab !== "selectors") {
    switchTab("selectors");
  }
}

async function loadProjectWorkspace() {
  const stored = await chrome.storage.local.get(["qaDeckActiveProject", PROJECT_BAR_COLLAPSED_STORAGE_KEY]);
  if (stored.qaDeckActiveProject) {
    state.activeProject = stored.qaDeckActiveProject;
  }
  state.projectBarCollapsed = !!stored[PROJECT_BAR_COLLAPSED_STORAGE_KEY];
  await refreshProjectWorkspaceLists();
  renderProjectWorkspace();
}

async function maybeProcessPendingProjectContext(incomingContext = null) {
  const stored = incomingContext
    ? { [PENDING_PROJECT_CONTEXT_STORAGE_KEY]: incomingContext }
    : await chrome.storage.local.get([PENDING_PROJECT_CONTEXT_STORAGE_KEY]);
  const context = stored[PENDING_PROJECT_CONTEXT_STORAGE_KEY];
  if (!context?.projectId) return false;

  if (context.targetTabId && state.currentTabInfo?.id && context.targetTabId !== state.currentTabInfo.id) {
    return false;
  }

  await waitForProjectAuthReady();
  if (!isCloudSignedIn()) return false;

  try {
    const record = await fetchProjectRecord({ location: "cloud", id: context.projectId });
    applyProjectRecordToEditor(record);
    if (context.requestedTab) {
      switchTab(context.requestedTab);
    }
    await chrome.storage.local.remove(PENDING_PROJECT_CONTEXT_STORAGE_KEY);
    const label = context.requestedTab === "record" ? "Capture" : "QA Deck";
    showToast(`${record.meta.name} opened in ${label}`, "success");
    return true;
  } catch (err) {
    await chrome.storage.local.remove(PENDING_PROJECT_CONTEXT_STORAGE_KEY);
    showToast(err.message || "Failed to open the requested project", "error");
    return false;
  }
}

function buildGateCopy(context = {}) {
  if (context.feature) {
    return `${context.feature} needs a connected QA Deck account so the extension can save projects, versions, and dashboard history in one place.`;
  }
  return "Connect QA Deck on qadeck.com to sync projects, versions, and generated assets before using this feature.";
}

function openLoginRequiredModal(context = {}) {
  document.getElementById("login-required-title").textContent = context.title || "Login required";
  document.getElementById("login-required-copy").textContent = buildGateCopy(context);
  document.getElementById("login-required-modal").classList.remove("hidden");
}

function closeLoginRequiredModal() {
  document.getElementById("login-required-modal")?.classList.add("hidden");
}

function setAdvancedPanelOpen(open) {
  const panel = document.getElementById("advanced-panel");
  const chevron = document.getElementById("advanced-toggle-chevron");
  if (!panel || !chevron) return;
  panel.classList.toggle("hidden", !open);
  chevron.textContent = open ? "▴" : "▾";
}

async function ensureFeatureAccess(level, context = {}) {
  if (level === FeatureAccess.PUBLIC) return true;

  if (!isCloudSignedIn()) {
    openLoginRequiredModal(context);
    return false;
  }

  if (level === FeatureAccess.CONNECTED_WITH_PROJECT && !hasActiveCloudProject()) {
    const ensured = await ensureProjectForPersistence(context.trigger || "manual_save", {
      notify: false,
      requireProject: true,
      cloudOnly: true,
    });
    return ensured && hasActiveCloudProject();
  }

  return true;
}

function getTabAccessLevel(tab) {
  return tab === "selectors" ? FeatureAccess.PUBLIC : FeatureAccess.CONNECTED;
}

function getTabFeatureLabel(tab) {
  return {
    scan: "Scanning pages",
    journey: "Advanced flow capture",
    testcases: "Saved test cases",
    script: "Script generation",
    cicd: "Advanced CI/CD generation",
    record: "Capture tool",
    selectors: "Locator tools",
  }[tab] || "This area";
}

async function requestTabSwitch(tab) {
  const allowed = await ensureFeatureAccess(getTabAccessLevel(tab), {
    title: "Connect QA Deck to keep working",
    feature: getTabFeatureLabel(tab),
  });
  if (!allowed) return;
  switchTab(tab);
}

async function refreshProjectWorkspaceLists() {
  const [cloudProjects, localProjects] = await Promise.all([
    loadCloudProjectSummaries(),
    loadLocalProjectSummaries(),
  ]);
  state.cloudProjects = cloudProjects;
  state.localProjects = localProjects;

  if (state.activeProject) {
    const list = state.activeProject.location === "cloud" ? cloudProjects : localProjects;
    const refreshed = list.find((project) => project.id === state.activeProject.id);
    if (refreshed) {
      state.activeProject = { ...state.activeProject, ...refreshed };
    } else {
      state.activeProject = null;
      state.activeProjectRecord = null;
      state.projectId = null;
      state.projectAppSelection = null;
      await persistActiveProjectRef();
    }
  }

  renderProjectWorkspace();
}

async function loadCloudProjectSummaries() {
  const api = getCloudProjectApi();
  if (!api?.isSignedIn?.()) return [];
  try {
    const projects = await api.listProjects();
    return (projects || []).map((project) => normalizeProjectSummary(project, "cloud"));
  } catch (err) {
    console.warn("[QA Deck] Failed to load cloud projects:", err);
    return [];
  }
}

async function loadLocalProjectSummaries() {
  const res = await sendToBackground({ type: "LOAD_PROJECTS" });
  const projects = Array.isArray(res?.projects) ? res.projects : [];
  return projects.map((project) => normalizeProjectSummary(project, "local"));
}

function normalizeProjectSummary(project, location) {
  const mode = project.mode || (project.steps ? "journey" : "page");
  const legacyPage = Array.isArray(project.pages) ? project.pages[0] || {} : {};
  const testCases = project.testCaseCount
    ?? project.artifactCounts?.testCases
    ?? legacyPage.testCases?.length
    ?? project.generated?.testCases?.length
    ?? 0;
  const scriptFiles = project.artifactCounts?.scriptFiles
    ?? flattenScriptsToFiles(project.generated?.scripts || legacyPage.scripts || project.scripts).length;

  return {
    id: project.id,
    name: project.name || project.title || project.url || "Untitled Project",
    mode,
    status: project.status || "draft",
    tags: Array.isArray(project.tags) ? project.tags : [],
    sourceUrl: project.sourceUrl || project.url || legacyPage.url || project.steps?.[0]?.url || "",
    activeFramework: project.activeFramework || project.generated?.activeFramework || state.selectedFramework,
    artifactCounts: project.artifactCounts || {
      scans: mode === "journey"
        ? (project.steps || []).filter((step) => !!step.pageData).length
        : (project.currentPageData ? 1 : 0),
      journeys: mode === "journey" ? 1 : 0,
      testCases,
      scriptFiles,
      cicdFiles: project.artifactCounts?.cicdFiles || Object.keys(project.cicdGeneratedConfigs || project.cicd || {}).length,
      notes: project.artifactCounts?.notes || 0,
    },
    latestVersionId: project.latestVersionId || "",
    createdAt: project.createdAt || project.savedAt || project.updatedAt || new Date().toISOString(),
    updatedAt: project.updatedAt || project.savedAt || new Date().toISOString(),
    lastOpenedAt: project.lastOpenedAt || null,
    syncState: project.syncState || (location === "cloud" ? "synced" : "local"),
    location,
    appId: project.appId || null,
    appName: project.appName || null,
    pageKey: project.pageKey || null,
    pageLabel: project.pageLabel || null,
  };
}

function renderProjectWorkspace() {
  const projectBar = document.querySelector(".project-bar");
  const collapseBtn = document.getElementById("project-collapse-btn");
  const appSelect = document.getElementById("project-picker-select");
  const pageSelect = document.getElementById("project-page-select");
  const activeName = document.getElementById("project-active-name");
  const activeMeta = document.getElementById("project-active-meta");
  const currentProjectText = document.getElementById("project-current-project");
  const currentPageText = document.getElementById("project-current-page");
  const pageHint = document.getElementById("project-page-hint");
  const pageHintCopy = document.getElementById("project-page-hint-copy");
  const syncPill = document.getElementById("project-sync-pill");
  const localBtn = document.getElementById("project-local-btn");
  const createBtn = document.getElementById("project-create-btn");
  const retryBtn = document.getElementById("project-retry-sync-btn");
  const migrateBtn = document.getElementById("project-migrate-btn");
  const dashboardBtn = document.getElementById("project-open-dashboard-btn");
  const modalStorage = document.getElementById("project-modal-storage");
  const connectedControls = document.getElementById("project-connected-controls");
  const guestControls = document.getElementById("project-guest-controls");

  const options = getVisibleProjectOptions();
  const visibleProjects = state.projectSourceFilter === "local" ? state.localProjects : state.cloudProjects;
  const visibleLocation = state.projectSourceFilter === "local" ? "local" : "cloud";
  const appGroups = buildProjectGroups(visibleProjects, visibleLocation);
  const currentValue = state.activeProject ? `${state.activeProject.location}:${state.activeProject.id}` : "";
  const filterLabel = state.projectSourceFilter === "local" ? "Cloud projects" : "Local projects";
  const connected = isCloudSignedIn();

  connectedControls?.classList.toggle("hidden", !connected);
  guestControls?.classList.toggle("hidden", connected);

  const fallbackGroupId = appGroups[0]?.id || "";
  const activeGroupId = state.activeProject
    ? getProjectGroupId(state.activeProject, state.activeProject.location)
    : "";
  const selectedGroupId = appGroups.some((group) => group.id === state.projectAppSelection)
    ? state.projectAppSelection
    : (activeGroupId && appGroups.some((group) => group.id === activeGroupId) ? activeGroupId : fallbackGroupId);
  state.projectAppSelection = selectedGroupId || null;
  const selectedGroup = appGroups.find((group) => group.id === selectedGroupId) || null;

  if (appSelect) {
    appSelect.innerHTML = buildProjectGroupOptionsMarkup(appGroups, selectedGroupId);
    if (selectedGroupId) appSelect.value = selectedGroupId;
  }
  if (pageSelect) {
    pageSelect.innerHTML = buildProjectPageOptionsMarkup(selectedGroup, currentValue);
    if (currentValue) pageSelect.value = currentValue;
    pageSelect.disabled = !selectedGroup;
  }
  if (activeName) {
    activeName.textContent = connected
      ? (state.activeProject?.appName || state.activeProject?.name || "No active project")
      : "Guest utility mode";
  }
  if (currentProjectText) {
    currentProjectText.textContent = connected
      ? (selectedGroup?.name || state.activeProject?.appName || "Select project")
      : "Guest utility mode";
  }
  if (currentPageText) {
    currentPageText.textContent = connected
      ? (state.activeProject?.pageLabel || state.activeProject?.name || "Select page")
      : "Locators only";
  }
  if (activeMeta) activeMeta.textContent = buildActiveProjectMetaText();
  const livePageHint = buildLivePageHint();
  if (pageHint) {
    pageHint.classList.toggle("hidden", !livePageHint);
  }
  if (pageHintCopy && livePageHint) {
    pageHintCopy.textContent = livePageHint;
  }
  if (syncPill) {
    syncPill.textContent = buildSyncPillLabel();
    syncPill.className = `project-sync-pill ${getActiveSyncClass()}`;
  }
  if (localBtn) localBtn.textContent = filterLabel;
  if (retryBtn) retryBtn.classList.toggle("hidden", !(state.activeProject?.syncState === "unsynced" && isCloudSignedIn()));
  if (migrateBtn) migrateBtn.classList.toggle("hidden", !(state.activeProject?.location === "local" && isCloudSignedIn() && state.activeProject?.syncState !== "synced"));
  if (dashboardBtn) dashboardBtn.classList.toggle("hidden", !isCloudSignedIn());
  if (createBtn) createBtn.textContent = (selectedGroup || state.activeProject) ? "Add page" : "Create project";
  if (modalStorage) modalStorage.value = isCloudSignedIn() ? "cloud" : "local";
  if (projectBar) projectBar.classList.toggle("collapsed", state.projectBarCollapsed);
  if (collapseBtn) {
    collapseBtn.textContent = state.projectBarCollapsed ? "Setup" : "Close setup";
    collapseBtn.setAttribute("aria-expanded", state.projectBarCollapsed ? "false" : "true");
  }
}

function buildLivePageHint() {
  if (!isCloudSignedIn() || !state.activeProject || getCurrentWorkspaceMode() !== "page") return "";

  const suggested = buildSuggestedProjectContext({ preferActiveProject: false });
  if (!suggested?.pageLabel) return "";
  if (isActiveProjectForSuggestedPage(state.activeProject, suggested)) return "";

  const activeProjectKey = slugifyProjectLabel(state.activeProject.appName || "");
  const suggestedProjectKey = slugifyProjectLabel(suggested.appName || "");
  if (activeProjectKey && suggestedProjectKey && activeProjectKey !== suggestedProjectKey) return "";

  const activePageLabel = state.activeProject.pageLabel || state.activeProject.name || "current page";
  const suggestedPageLabel = suggested.pageLabel;
  if (!suggestedPageLabel || suggestedPageLabel === activePageLabel) return "";

  return `This tab looks more like “${suggestedPageLabel}” than the selected page “${activePageLabel}”. Save it as the current page when you're ready.`;
}

function getLivePageMismatch() {
  // Note: intentionally no isCloudSignedIn() guard — mismatch protection applies to all users
  if (!state.activeProject || getCurrentWorkspaceMode() !== "page") return null;

  const suggested = buildSuggestedProjectContext({ preferActiveProject: false });
  const selectedPage = state.activeProject.pageLabel || state.activeProject.name || "current page";
  const detectedPage = suggested?.pageLabel || "current page";

  // Primary check: compare project sourceUrl vs current tab URL (most reliable)
  const projectUrl = state.activeProject.sourceUrl;
  const currentUrl = state.currentTabInfo?.url || getCurrentWorkspaceUrl();

  console.log("[QA Deck] Mismatch check — projectUrl:", projectUrl, "| currentUrl:", currentUrl, "| selectedPage:", selectedPage, "| detectedPage:", detectedPage);

  if (projectUrl && currentUrl) {
    try {
      const pUrl = new URL(projectUrl);
      const cUrl = new URL(currentUrl);
      const normPath = (p) => (p || "/").replace(/\/+$/, "") || "/";

      // Same origin, same path → no mismatch
      if (pUrl.origin === cUrl.origin && normPath(pUrl.pathname) === normPath(cUrl.pathname)) return null;

      // Same origin, different path → mismatch (same app, different page)
      if (pUrl.origin === cUrl.origin && normPath(pUrl.pathname) !== normPath(cUrl.pathname)) {
        const inferredDetected = detectedPage !== "current page"
          ? detectedPage
          : cUrl.pathname.split("/").filter(Boolean).pop() || cUrl.pathname;
        return { selectedPage, detectedPage: inferredDetected, suggested };
      }

      // Different origins → different apps entirely, skip mismatch check
      return null;
    } catch (_) {
      // URL parse failed — fall through to label-based check
    }
  }

  // Label-based fallback (when sourceUrl is unavailable)
  if (!suggested?.pageLabel) return null;
  if (isActiveProjectForSuggestedPage(state.activeProject, suggested)) return null;

  const activeProjectKey = slugifyProjectLabel(state.activeProject.appName || "");
  const suggestedProjectKey = slugifyProjectLabel(suggested.appName || "");
  if (activeProjectKey && suggestedProjectKey && activeProjectKey !== suggestedProjectKey) return null;

  if (!detectedPage || detectedPage === selectedPage) return null;

  return { selectedPage, detectedPage, suggested };
}

function openPageMismatchModal(mismatch) {
  const modal = document.getElementById("page-mismatch-modal");
  const copy = document.getElementById("page-mismatch-copy");
  const selected = document.getElementById("page-mismatch-selected");
  const detected = document.getElementById("page-mismatch-detected");
  if (!modal || !mismatch) return Promise.resolve("cancel");

  if (copy) {
    copy.textContent = `The selected saved page is “${mismatch.selectedPage}”, but this tab looks more like “${mismatch.detectedPage}”.`;
  }
  if (selected) selected.textContent = mismatch.selectedPage;
  if (detected) detected.textContent = mismatch.detectedPage;
  modal.classList.remove("hidden");

  return new Promise((resolve) => {
    pageMismatchResolver = resolve;
  });
}

function settlePageMismatchModal(result = "cancel") {
  document.getElementById("page-mismatch-modal")?.classList.add("hidden");
  if (pageMismatchResolver) {
    pageMismatchResolver(result);
    pageMismatchResolver = null;
  }
}

async function toggleProjectBarCollapsed() {
  state.projectBarCollapsed = !state.projectBarCollapsed;
  await chrome.storage.local.set({ [PROJECT_BAR_COLLAPSED_STORAGE_KEY]: state.projectBarCollapsed });
  renderProjectWorkspace();
}

function getProjectGroupId(project, location) {
  const base = project?.appId || slugifyProjectLabel(project?.appName || inferDomainLabel(project?.sourceUrl) || project?.name || "project");
  return `${location}:${base}`;
}

function getProjectGroupName(project) {
  return project?.appName || inferDomainLabel(project?.sourceUrl) || project?.name || "Untitled project";
}

function buildProjectGroups(projects, location) {
  const groups = new Map();
  projects.forEach((project) => {
    const id = getProjectGroupId(project, location);
    const current = groups.get(id);
    const pageLabel = project.pageLabel || project.name || "Current page";
    if (!current) {
      groups.set(id, {
        id,
        location,
        name: getProjectGroupName(project),
        updatedAt: project.updatedAt || "",
        pages: [{ ...project, _pageLabel: pageLabel }],
      });
      return;
    }
    current.pages.push({ ...project, _pageLabel: pageLabel });
    if (new Date(project.updatedAt || 0).getTime() > new Date(current.updatedAt || 0).getTime()) {
      current.updatedAt = project.updatedAt || current.updatedAt;
    }
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      pages: group.pages.sort((left, right) => String(left._pageLabel).localeCompare(String(right._pageLabel))),
    }))
    .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime());
}

function buildProjectGroupOptionsMarkup(groups, currentGroupId) {
  const pieces = [`<option value="">Select project</option>`];
  groups.forEach((group) => {
    pieces.push(`<option value="${group.id}" ${currentGroupId === group.id ? "selected" : ""}>${escapeHtml(group.name)} (${group.pages.length})</option>`);
  });
  return pieces.join("");
}

function buildProjectPageOptionsMarkup(group, currentValue) {
  const pieces = [`<option value="">Select page</option>`];
  if (!group) return pieces.join("");
  group.pages.forEach((project) => {
    const value = `${group.location}:${project.id}`;
    pieces.push(`<option value="${value}" ${currentValue === value ? "selected" : ""}>${escapeHtml(project._pageLabel || project.pageLabel || project.name)}</option>`);
  });
  return pieces.join("");
}

function getVisibleProjectOptions() {
  if (state.projectSourceFilter === "local") {
    return { cloud: [], local: state.localProjects };
  }
  return { cloud: state.cloudProjects, local: [] };
}

function buildProjectOptionsMarkup(options, currentValue) {
  const pieces = [`<option value="">Select project</option>`];
  if (options.cloud.length) {
    pieces.push(`<optgroup label="Cloud projects">`);
    options.cloud.forEach((project) => {
      pieces.push(`<option value="cloud:${project.id}" ${currentValue === `cloud:${project.id}` ? "selected" : ""}>${buildProjectOptionLabel(project)}</option>`);
    });
    pieces.push(`</optgroup>`);
  }
  if (options.local.length) {
    pieces.push(`<optgroup label="Local projects">`);
    options.local.forEach((project) => {
      const suffix = project.syncState === "unsynced" ? " (unsynced)" : "";
      pieces.push(`<option value="local:${project.id}" ${currentValue === `local:${project.id}` ? "selected" : ""}>${buildProjectOptionLabel(project)}${suffix}</option>`);
    });
    pieces.push(`</optgroup>`);
  }
  return pieces.join("");
}

function buildProjectOptionLabel(project) {
  if (project.appName && project.pageLabel) {
    return `${project.appName} / ${project.pageLabel}`;
  }
  return project.pageLabel || project.name;
}

function buildActiveProjectMetaText() {
  if (!isCloudSignedIn()) {
    return "Connect QA Deck to save work and sync history.";
  }

  if (!state.activeProject) {
    return "Select a project and page to start tracked work.";
  }

  const bits = [
    state.activeProject.mode === "journey" ? "Captured flow" : "Page",
    state.activeProject.location === "cloud" ? "Cloud synced" : "Local only",
    `Status: ${state.activeProject.status}`,
  ];
  if (state.activeProject.updatedAt) bits.push(`Updated ${formatRelativeTime(state.activeProject.updatedAt)}`);
  return bits.filter(Boolean).join(" • ");
}

function buildSyncPillLabel() {
  if (!isCloudSignedIn()) return "guest mode";
  if (!state.activeProject) return isCloudSignedIn() ? "cloud ready" : "guest mode";
  if (state.activeProject.syncState === "unsynced") return "unsynced";
  if (state.activeProject.location === "cloud") return "synced";
  return "local only";
}

function getActiveSyncClass() {
  if (!isCloudSignedIn()) return "guest";
  if (!state.activeProject) return isCloudSignedIn() ? "synced" : "guest";
  if (state.activeProject.syncState === "unsynced") return "unsynced";
  if (state.activeProject.location === "cloud") return "synced";
  return "local";
}

function formatRelativeTime(value) {
  if (!value) return "just now";
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return "just now";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

async function persistActiveProjectRef() {
  await chrome.storage.local.set({
    qaDeckActiveProject: state.activeProject
      ? {
        id: state.activeProject.id,
        name: state.activeProject.name,
        mode: state.activeProject.mode,
        status: state.activeProject.status,
        location: state.activeProject.location,
        syncState: state.activeProject.syncState,
        sourceUrl: state.activeProject.sourceUrl,
        activeFramework: state.activeProject.activeFramework,
        updatedAt: state.activeProject.updatedAt,
        appId: state.activeProject.appId || null,
        appName: state.activeProject.appName || null,
        pageKey: state.activeProject.pageKey || null,
        pageLabel: state.activeProject.pageLabel || null,
      }
      : null,
  });
}

async function setActiveProject(project, options = {}) {
  state.activeProject = project ? { ...project } : null;
  state.projectId = project?.id || null;
  state.projectAppSelection = project ? getProjectGroupId(project, project.location) : null;
  if (project?.location === "local") {
    state.projectSourceFilter = "local";
  } else {
    state.projectSourceFilter = "cloud";
  }
  if (options.record) state.activeProjectRecord = options.record;
  if (options.persist !== false) await persistActiveProjectRef();
  renderProjectWorkspace();
}

async function handleProjectAuthChange() {
  if (!isCloudSignedIn()) {
    if (state.activeProject?.location === "cloud") {
      await setActiveProject(null);
      state.activeProjectRecord = null;
    }
    applyGuestModeDefaults();
  }
  await refreshProjectWorkspaceLists();
  renderProjectWorkspace();
}

function toggleLocalProjectFilter() {
  if (!isCloudSignedIn()) return;
  state.projectSourceFilter = state.projectSourceFilter === "local" ? "cloud" : "local";
  renderProjectWorkspace();
}

function openProjectsDashboard() {
  const url = getCloudProjectApi()?.getProjectsUrl?.() || "https://qadeck.com/dashboard/projects";
  chrome.tabs.create({ url });
}

async function handleProjectPickerChange(event) {
  const ref = parseProjectRefValue(event.target.value);
  if (!ref) return;

  try {
    const record = await fetchProjectRecord(ref);
    if (record.latestVersion) {
      applyProjectRecordToEditor(record);
      showToast(`Loaded ${record.meta.name}`, "success");
    } else {
      await setActiveProject(record.meta, { record });
      showToast(`Active project set to ${record.meta.name}`, "success");
    }
  } catch (err) {
    showToast(err.message || "Failed to load project", "error");
  }
}

function handleProjectAppChange(event) {
  state.projectAppSelection = event.target.value || null;
  renderProjectWorkspace();
}

function parseProjectRefValue(value) {
  if (!value || !value.includes(":")) return null;
  const [location, id] = value.split(":");
  if (!location || !id) return null;
  return { location, id };
}

function hasProjectContext() {
  return !!(getSelectedProjectGroup() || state.activeProject);
}

function getSelectedProjectGroup() {
  const location = state.projectSourceFilter === "local" ? "local" : "cloud";
  const visibleProjects = state.projectSourceFilter === "local" ? state.localProjects : state.cloudProjects;
  const groups = buildProjectGroups(visibleProjects, location);
  if (!groups.length) return null;
  return groups.find((group) => group.id === state.projectAppSelection) || groups[0] || null;
}

function buildDerivedProjectRecordName(projectName, pageLabel, fallbackName = "Untitled Project") {
  const trimmedProjectName = String(projectName || "").trim();
  const trimmedPageLabel = String(pageLabel || "").trim();
  if (trimmedProjectName && trimmedPageLabel) return `${trimmedProjectName} · ${trimmedPageLabel}`;
  if (trimmedPageLabel) return trimmedPageLabel;
  if (trimmedProjectName) return trimmedProjectName;
  return fallbackName;
}

function syncProjectModalCopy() {
  const title = document.getElementById("project-modal-title");
  const nameLabel = document.getElementById("project-modal-name-label");
  const createBtn = document.getElementById("project-modal-create-btn");
  const customizeNameBtn = document.getElementById("project-modal-customize-name-btn");
  const nameSection = document.getElementById("project-modal-name-section");
  const nameInput = document.getElementById("project-modal-name");
  const projectField = document.getElementById("project-modal-project-field");
  const projectNote = document.getElementById("project-modal-project-note");
  const appNameInput = document.getElementById("project-modal-app-name");
  const pageLabelInput = document.getElementById("project-modal-page-label");

  const selectedGroup = getSelectedProjectGroup();
  const typedAppName = appNameInput?.value.trim() || "";
  const typedPageLabel = pageLabelInput?.value.trim() || "";
  const forceNewProject = !!state.projectModalContext?.forceNewProject;
  const activeProjectName = typedAppName || (!forceNewProject ? selectedGroup?.name : "") || state.projectModalContext?.suggestedAppName || "";
  const mode = state.projectModalContext?.purpose || "save";
  const cloudOnly = !!state.projectModalContext?.cloudOnly;
  const addingToExistingProject = !forceNewProject && (!!selectedGroup?.name || (!!state.projectModalContext?.suggestedAppName && mode === "create"));
  const projectLabel = activeProjectName || "this project";
  const derivedName = buildDerivedProjectRecordName(
    typedAppName || state.projectModalContext?.suggestedAppName || "",
    typedPageLabel || state.projectModalContext?.suggestedPageLabel || "",
    state.projectModalContext?.suggestedName || "Untitled Project"
  );

  if (title) {
    if (cloudOnly && mode === "create" && addingToExistingProject) {
      title.textContent = `Add page to ${projectLabel}`;
    } else if (cloudOnly && mode === "create") {
      title.textContent = "Create project and first page";
    } else if (mode === "create" && addingToExistingProject) {
      title.textContent = `Add page to ${projectLabel}`;
    } else if (mode === "create") {
      title.textContent = "Create project and first page";
    } else if (addingToExistingProject) {
      title.textContent = `Add page to ${projectLabel}`;
    } else {
      title.textContent = cloudOnly ? "Create project and first page" : "Save current page";
    }
  }

  if (projectField) {
    projectField.classList.toggle("hidden", addingToExistingProject);
  }

  if (projectNote) {
    projectNote.classList.toggle("hidden", !addingToExistingProject);
    if (addingToExistingProject) {
      projectNote.textContent = `Saving under project: ${projectLabel}`;
    }
  }

  if (nameLabel) {
    nameLabel.textContent = "Saved title";
  }

  if (createBtn) {
    createBtn.textContent = addingToExistingProject ? "Create page" : "Create project";
  }

  if (customizeNameBtn) {
    customizeNameBtn.textContent = state.projectModalUseCustomName ? "Use automatic title" : "Customize saved title";
  }

  if (nameSection) {
    nameSection.classList.toggle("hidden", !state.projectModalUseCustomName);
  }

  if (nameInput) {
    if (!state.projectModalUseCustomName) {
      nameInput.value = derivedName;
    } else if (!nameInput.value.trim()) {
      nameInput.value = derivedName;
    }
  }
}

async function openProjectModal(context = {}) {
  const modal = document.getElementById("project-modal");
  const title = document.getElementById("project-modal-title");
  const nameInput = document.getElementById("project-modal-name");
  const appNameInput = document.getElementById("project-modal-app-name");
  const pageLabelInput = document.getElementById("project-modal-page-label");
  const tagsInput = document.getElementById("project-modal-tags");
  const statusSelect = document.getElementById("project-modal-status");
  const storageSelect = document.getElementById("project-modal-storage");
  const suggested = buildSuggestedProjectContext({ preferActiveProject: false });
  const selectedGroup = getSelectedProjectGroup();
  const selectedAppName = selectedGroup?.name || "";
  const forceNewProject = !!context.forceNewProject;

  state.projectModalContext = {
    purpose: context.purpose || "save",
    suggestedName: context.suggestedName || ((!forceNewProject && selectedAppName) && suggested.pageLabel ? `${selectedAppName} · ${suggested.pageLabel}` : suggested.projectName),
    suggestedAppName: context.suggestedAppName !== undefined ? context.suggestedAppName : (selectedAppName || suggested.appName || ""),
    suggestedPageLabel: context.suggestedPageLabel || suggested.pageLabel || "",
    cloudOnly: context.cloudOnly || false,
    forceNewProject,
  };

  state.projectModalUseCustomName = false;
  if (nameInput) nameInput.value = state.projectModalContext.suggestedName;
  if (appNameInput) appNameInput.value = state.projectModalContext.suggestedAppName;
  if (pageLabelInput) pageLabelInput.value = state.projectModalContext.suggestedPageLabel;
  if (tagsInput) tagsInput.value = "";
  if (statusSelect) statusSelect.value = "draft";
  if (storageSelect) storageSelect.value = state.projectModalContext.cloudOnly ? "cloud" : (isCloudSignedIn() ? "cloud" : "local");
  if (storageSelect) storageSelect.disabled = state.projectModalContext.cloudOnly || !isCloudSignedIn();

  syncProjectModalCopy();
  modal.classList.remove("hidden");
  return new Promise((resolve) => {
    projectModalResolver = resolve;
  });
}

function settleProjectModal(result) {
  document.getElementById("project-modal").classList.add("hidden");
  const resolver = projectModalResolver;
  projectModalResolver = null;
  state.projectModalContext = null;
  state.projectModalUseCustomName = false;
  resolver?.(result || null);
}

async function createProjectFromModal() {
  const appName = document.getElementById("project-modal-app-name")?.value.trim() || "";
  const pageLabel = document.getElementById("project-modal-page-label")?.value.trim() || "";
  const customName = document.getElementById("project-modal-name").value.trim();
  const name = state.projectModalUseCustomName
    ? (customName || buildDerivedProjectRecordName(appName, pageLabel, state.projectModalContext?.suggestedName || "Untitled Project"))
    : buildDerivedProjectRecordName(appName, pageLabel, state.projectModalContext?.suggestedName || "Untitled Project");

  if (!appName && !pageLabel && !name) {
    showToast("Enter a project name or page label", "error");
    return;
  }

  const storage = state.projectModalContext?.cloudOnly ? "cloud" : document.getElementById("project-modal-storage").value;
  const status = document.getElementById("project-modal-status").value;
  const tags = parseTagInput(document.getElementById("project-modal-tags").value);

  try {
    const record = await createProjectSkeleton({
      name,
      storage,
      status,
      tags,
      mode: getCurrentWorkspaceMode(),
      sourceUrl: getCurrentWorkspaceUrl(),
      appName,
      pageLabel,
    });
    const seededRecord = {
      ...record,
      artifacts: buildInitialArtifactsForNewPage(record.meta.mode),
    };
    seededRecord.meta = {
      ...seededRecord.meta,
      artifactCounts: buildArtifactCountsFromArtifacts(seededRecord.meta.mode, seededRecord.artifacts),
    };
    applyProjectRecordToEditor(seededRecord);
    settleProjectModal({ action: "created", storage, record: seededRecord });
    const createdLabel = appName && pageLabel ? "page ready" : "project + page ready";
    const startedFresh = seededRecord.meta.mode === "page" && !doesLoadedScanMatchActiveTab();
    showToast(
      startedFresh
        ? `${storage === "cloud" ? "Cloud" : "Local"} ${createdLabel}. Start a fresh scan for this page.`
        : `${storage === "cloud" ? "Cloud" : "Local"} ${createdLabel}`,
      "success"
    );
  } catch (err) {
    showToast(err.message || "Failed to save page", "error");
  }
}

function parseTagInput(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSuggestedProjectName() {
  return buildSuggestedProjectContext({ preferActiveProject: false }).projectName;
}

function slugifyProjectLabel(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || null;
}

function titleizeProjectLabel(value) {
  return String(value || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferDomainLabel(urlValue) {
  try {
    const url = new URL(urlValue);
    const hostname = url.hostname.replace(/^www\./, "");
    const root = hostname.split(".")[0] || hostname;
    return titleizeProjectLabel(root);
  } catch {
    return "";
  }
}

function inferPageLabelFromUrl(urlValue) {
  try {
    const url = new URL(urlValue);
    const segments = url.pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1] || "";
    if (!lastSegment) return "";
    return titleizeProjectLabel(lastSegment);
  } catch {
    return "";
  }
}

function detectKeywordPageLabel(textValue) {
  const text = String(textValue || "").toLowerCase();
  if (!text) return "";
  const mapping = [
    ["login", "Login"],
    ["sign in", "Login"],
    ["inventory", "Inventory"],
    ["products", "Products"],
    ["product list", "Products"],
    ["home", "Home"],
    ["cart", "Cart"],
    ["checkout", "Checkout"],
    ["overview", "Overview"],
    ["list", "List"],
    ["dashboard", "Dashboard"],
  ];
  const match = mapping.find(([needle]) => text.includes(needle));
  return match ? match[1] : "";
}

function buildSuggestedProjectContext(options = {}) {
  if (state.currentTab === "journey" || state.activeArtifactMode === "journey") {
    return {
      appName: state.activeProject?.appName || inferDomainLabel(getCurrentWorkspaceUrl()),
      pageLabel: state.activeProject?.pageLabel || "",
      projectName: state.journey.name || "Untitled Journey",
    };
  }

  const preferActive = options.preferActiveProject !== false;
  if (preferActive && state.activeProject?.mode === "page" && state.activeProject?.pageLabel) {
    return {
      appName: state.activeProject.appName || inferDomainLabel(state.activeProject.sourceUrl),
      pageLabel: state.activeProject.pageLabel,
      projectName: state.activeProject.name || `${state.activeProject.appName || "Project"} · ${state.activeProject.pageLabel}`,
    };
  }

  const title = state.currentPageData?.meta?.title || "";
  const url = getCurrentWorkspaceUrl();
  const pageType = state.currentPageData?.meta?.pageType || "";
  const appName = inferDomainLabel(url);
  const pageLabel =
    detectKeywordPageLabel(title)
    || detectKeywordPageLabel(url)
    || detectKeywordPageLabel(pageType)
    || inferPageLabelFromUrl(url)
    || title
    || "Current Page";

  return {
    appName,
    pageLabel,
    projectName: appName && pageLabel ? `${appName} · ${pageLabel}` : pageLabel || appName || "Untitled Project",
  };
}

function isActiveProjectForSuggestedPage(project, suggested) {
  if (!project || !suggested) return false;

  const suggestedPageKey = slugifyProjectLabel(suggested.pageLabel || "");
  const projectPageKey = project.pageKey || slugifyProjectLabel(project.pageLabel || "");
  const suggestedAppKey = slugifyProjectLabel(suggested.appName || "");
  const projectAppKey = project.appId || slugifyProjectLabel(project.appName || "");

  const appMatches = !suggestedAppKey || !projectAppKey || suggestedAppKey === projectAppKey;
  const pageMatches = !!suggestedPageKey && !!projectPageKey && suggestedPageKey === projectPageKey;

  if (appMatches && pageMatches) return true;

  try {
    const suggestedUrl = new URL(getCurrentWorkspaceUrl() || "");
    const activeUrl = new URL(project.sourceUrl || "");
    return appMatches && suggestedUrl.pathname === activeUrl.pathname;
  } catch {
    return false;
  }
}

function getCurrentWorkspaceMode() {
  return state.currentTab === "journey" || state.activeArtifactMode === "journey" ? "journey" : "page";
}

function getCurrentWorkspaceUrl() {
  if (getCurrentWorkspaceMode() === "journey") return state.journey.steps?.[0]?.url || state.currentTabInfo?.url || "";
  return state.currentPageData?.meta?.url || state.currentTabInfo?.url || "";
}

function normalizeUrlPath(value) {
  return (value || "/").replace(/\/+$/, "") || "/";
}

function doesLoadedScanMatchActiveTab() {
  const loadedUrl = state.currentPageData?.meta?.url || "";
  const activeUrl = state.currentTabInfo?.url || "";
  if (!loadedUrl || !activeUrl) return false;

  try {
    const loaded = new URL(loadedUrl);
    const active = new URL(activeUrl);
    return loaded.origin === active.origin && normalizeUrlPath(loaded.pathname) === normalizeUrlPath(active.pathname);
  } catch {
    return loadedUrl === activeUrl;
  }
}

function buildInitialArtifactsForNewPage(mode) {
  if (mode === "journey") return emptyArtifactSet();
  if (!doesLoadedScanMatchActiveTab()) return emptyArtifactSet();

  return {
    scan: state.currentPageData || null,
    journey: null,
    testcases: Array.isArray(state.testCases) ? [...state.testCases] : [],
    cicd: cicdGeneratedConfigs || null,
    notes: null,
    scriptFiles: flattenScriptsToFiles(state.scripts),
  };
}

async function createProjectSkeleton(options) {
  const now = new Date().toISOString();
  const appName = options.appName?.trim() || null;
  const pageLabel = options.pageLabel?.trim() || (options.mode === "page" ? buildSuggestedProjectContext({ preferActiveProject: false }).pageLabel : null);
  const meta = {
    id: crypto.randomUUID(),
    name: options.name,
    mode: options.mode || "page",
    status: PROJECT_STATUSES.includes(options.status) ? options.status : "draft",
    tags: Array.isArray(options.tags) ? options.tags : [],
    sourceUrl: options.sourceUrl || "",
    activeFramework: state.selectedFramework,
    artifactCounts: emptyArtifactCounts(),
    latestVersionId: "",
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    syncState: options.storage === "cloud" ? "synced" : "local",
    location: options.storage,
    appId: appName ? slugifyProjectLabel(appName) : null,
    appName,
    pageKey: pageLabel ? slugifyProjectLabel(pageLabel) : null,
    pageLabel,
  };

  const record = {
    meta,
    latestVersion: null,
    versions: [],
    activities: [{
      id: crypto.randomUUID(),
      timestamp: now,
      type: "project_created",
      message: "Project created in the extension",
      versionId: "",
      actor: "extension",
    }],
    artifacts: emptyArtifactSet(),
    artifactsByVersion: {},
  };

  if (options.storage === "cloud") {
    if (!isCloudSignedIn()) throw new Error("Sign in to create cloud projects");
    const savedMeta = await getCloudProjectApi().createProject(meta);
    record.meta = normalizeProjectSummary(savedMeta, "cloud");
  } else {
    await sendToBackground({ type: "SAVE_PROJECT", project: serializeLocalProjectRecord(record) });
  }

  await refreshProjectWorkspaceLists();
  return record;
}

async function handleSaveCurrentPage() {
  const mode = getCurrentWorkspaceMode();
  if (mode !== "page") {
    await persistCurrentProjectVersion("manual_save", { notify: true, requireProject: true });
    return;
  }

  const suggested = buildSuggestedProjectContext({ preferActiveProject: false });
  const currentProject = state.activeProject;
  const mismatch = getLivePageMismatch();

  if (currentProject && !mismatch && isActiveProjectForSuggestedPage(currentProject, suggested)) {
    await persistCurrentProjectVersion("manual_save", { notify: true, requireProject: true });
    return;
  }

  if (currentProject && mismatch) {
    const decision = await openPageMismatchModal(mismatch);
    if (decision === "save") {
      await persistCurrentProjectVersion("manual_save", { notify: true, requireProject: true });
      return;
    }
    if (decision !== "create") return;
  }

  const preferredProjectName = (currentProject?.appName || suggested.appName) && suggested.pageLabel
    ? `${currentProject?.appName || suggested.appName} · ${suggested.pageLabel}`
    : suggested.projectName;

  const modalResult = await openProjectModal({
    purpose: "create",
    suggestedName: preferredProjectName,
    suggestedAppName: currentProject?.appName || suggested.appName || "",
    suggestedPageLabel: suggested.pageLabel || "",
    cloudOnly: isCloudSignedIn(),
  });

  if (!modalResult) return;

  await persistCurrentProjectVersion("manual_save", { notify: true, requireProject: true });
}

async function ensureProjectForPersistence(trigger, options = {}) {
  if (state.activeProject && (!options.cloudOnly || state.activeProject.location === "cloud")) {
    return true;
  }

  const modalResult = await openProjectModal({
    purpose: options.requireProject ? "save" : "save",
    suggestedName: buildSuggestedProjectName(),
    cloudOnly: options.cloudOnly || isCloudSignedIn(),
  });

  if (!modalResult) {
    if (options.notify !== false) showToast("Project selection skipped. Work stays in the extension until you save it.", "info");
    return false;
  }

  return true;
}

async function fetchProjectRecord(ref) {
  if (ref.location === "cloud") {
    const bundle = await getCloudProjectApi().getProjectBundle(ref.id);
    return {
      ...bundle,
      meta: normalizeProjectSummary(bundle.meta, "cloud"),
      artifactsByVersion: {},
    };
  }

  const res = await sendToBackground({ type: "LOAD_PROJECT_DETAIL", id: ref.id });
  if (!res?.success || !res.project) throw new Error(res?.error || "Failed to load local project");
  return normalizeLocalProjectRecord(res.project);
}

function normalizeLocalProjectRecord(raw) {
  const meta = normalizeProjectSummary(raw, "local");
  const versions = Array.isArray(raw.versions)
    ? [...raw.versions].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    : [];
  const latestVersionId = raw.latestVersionId || versions[0]?.id || "";
  const latestVersion = versions.find((version) => version.id === latestVersionId) || versions[0] || null;

  let artifacts = emptyArtifactSet();
  if (raw.artifactsByVersion && latestVersionId && raw.artifactsByVersion[latestVersionId]) {
    artifacts = normalizeArtifactSet(raw.artifactsByVersion[latestVersionId]);
  } else if (meta.mode === "journey" && raw.steps) {
    artifacts = {
      scan: null,
      journey: raw,
      testcases: raw.generated?.testCases || [],
      cicd: raw.cicdGeneratedConfigs || raw.cicd || null,
      notes: collectJourneyNotes(raw),
      scriptFiles: flattenScriptsToFiles(raw.generated?.scripts || null),
    };
  } else {
    const page = Array.isArray(raw.pages) ? raw.pages[0] || {} : {};
    artifacts = {
      scan: raw.currentPageData || null,
      journey: null,
      testcases: page.testCases || raw.testCases || [],
      cicd: raw.cicdGeneratedConfigs || raw.cicd || null,
      notes: raw.notes || null,
      scriptFiles: flattenScriptsToFiles(page.scripts || raw.scripts || null),
    };
  }

  return {
    meta,
    latestVersion,
    versions,
    activities: Array.isArray(raw.activities) ? raw.activities : [],
    artifacts,
    artifactsByVersion: raw.artifactsByVersion || {},
  };
}

function normalizeArtifactSet(artifacts) {
  return {
    scan: artifacts.scan || null,
    journey: artifacts.journey || null,
    testcases: artifacts.testcases || [],
    cicd: artifacts.cicd || null,
    notes: artifacts.notes || null,
    scriptFiles: Array.isArray(artifacts.scriptFiles) ? artifacts.scriptFiles : [],
  };
}

async function retryProjectSync() {
  if (!state.activeProject || state.activeProject.syncState !== "unsynced") return;
  await persistCurrentProjectVersion("manual_save", { notify: true, requireProject: true, forceCloud: true });
}

async function migrateLocalProjectToCloud() {
  if (!state.activeProject || state.activeProject.location !== "local" || !isCloudSignedIn()) return;
  const current = state.activeProjectRecord || await fetchProjectRecord({ location: "local", id: state.activeProject.id });
  const meta = {
    ...current.meta,
    location: "cloud",
    syncState: "synced",
  };
  const cloudRecord = await createProjectSkeleton({
    name: meta.name,
    storage: "cloud",
    status: meta.status,
    tags: meta.tags,
    mode: meta.mode,
    sourceUrl: meta.sourceUrl,
  });
  await setActiveProject(cloudRecord.meta, { record: cloudRecord });
  await persistCurrentProjectVersion("migrate_local", { notify: true, requireProject: true, forceCloud: true });
}

async function persistCurrentProjectVersion(trigger, options = {}) {
  const hasWork = state.currentPageData || state.testCases.length || state.scripts || state.journey.steps.length || cicdGeneratedConfigs;
  if (!hasWork) {
    if (options.notify) showToast("There is no project work to save yet", "info");
    return { success: false };
  }

  const ensured = await ensureProjectForPersistence(trigger, options);
  if (!ensured) return { success: false, skipped: true };

  const bundle = buildProjectVersionBundle(trigger);
  if (!bundle) return { success: false };

  const wantsCloud = options.forceCloud || state.activeProject?.location === "cloud";
  if (wantsCloud && isCloudSignedIn()) {
    try {
      await getCloudProjectApi().saveProjectVersion(bundle);
      state.activeProjectRecord = appendBundleToRecord(state.activeProjectRecord, bundle, "cloud");
      await setActiveProject(state.activeProjectRecord.meta, { record: state.activeProjectRecord });
      await refreshProjectWorkspaceLists();
      if (options.notify) showToast(`Saved ${bundle.meta.name} to cloud`, "success");
      return { success: true, location: "cloud" };
    } catch (err) {
      console.warn("[QA Deck] Cloud sync failed, saving locally", err);
      const fallbackRecord = appendBundleToRecord(state.activeProjectRecord, {
        ...bundle,
        meta: { ...bundle.meta, location: "local", syncState: "unsynced" },
      }, "local", "unsynced");
      await saveLocalProjectRecord(fallbackRecord);
      await setActiveProject(fallbackRecord.meta, { record: fallbackRecord });
      await refreshProjectWorkspaceLists();
      if (options.notify !== false) showToast("Cloud sync failed. Saved locally as unsynced work.", "info");
      return { success: true, location: "local", syncState: "unsynced" };
    }
  }

  const syncState = options.forceCloud ? "unsynced" : (state.activeProject?.syncState === "unsynced" ? "unsynced" : "local");
  const localRecord = appendBundleToRecord(state.activeProjectRecord, bundle, "local", syncState);
  await saveLocalProjectRecord(localRecord);
  await setActiveProject(localRecord.meta, { record: localRecord });
  await refreshProjectWorkspaceLists();
  if (options.notify) {
    showToast(syncState === "unsynced" ? "Saved locally. Sign in to retry sync." : "Saved to local project history", "success");
  }
  return { success: true, location: "local", syncState };
}

function buildProjectVersionBundle(trigger) {
  const mode = getCurrentWorkspaceMode();
  const now = new Date().toISOString();
  const versionId = crypto.randomUUID();
  const suggested = buildSuggestedProjectContext();
  const baseMeta = state.activeProjectRecord?.meta || state.activeProject || {
    id: crypto.randomUUID(),
    name: suggested.projectName,
    mode,
    status: "draft",
    tags: [],
    sourceUrl: getCurrentWorkspaceUrl(),
    activeFramework: state.selectedFramework,
    artifactCounts: emptyArtifactCounts(),
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    syncState: isCloudSignedIn() ? "synced" : "local",
    location: isCloudSignedIn() ? "cloud" : "local",
    appId: suggested.appName ? slugifyProjectLabel(suggested.appName) : null,
    appName: suggested.appName || null,
    pageKey: suggested.pageLabel ? slugifyProjectLabel(suggested.pageLabel) : null,
    pageLabel: mode === "page" ? suggested.pageLabel || null : null,
  };

  const artifacts = buildCurrentArtifactSet(mode);
  const artifactCounts = buildArtifactCountsFromArtifacts(mode, artifacts);
  const meta = {
    ...baseMeta,
    mode,
    sourceUrl: getCurrentWorkspaceUrl() || baseMeta.sourceUrl || "",
    activeFramework: state.selectedFramework,
    artifactCounts,
    latestVersionId: versionId,
    updatedAt: now,
    lastOpenedAt: now,
    appId: baseMeta.appId || (suggested.appName ? slugifyProjectLabel(suggested.appName) : null),
    appName: baseMeta.appName || suggested.appName || null,
    pageKey: mode === "page"
      ? (baseMeta.pageKey || (suggested.pageLabel ? slugifyProjectLabel(suggested.pageLabel) : null))
      : null,
    pageLabel: mode === "page" ? (baseMeta.pageLabel || suggested.pageLabel || null) : null,
  };

  const version = {
    id: versionId,
    projectId: meta.id,
    createdAt: now,
    trigger,
    summary: buildVersionSummary(trigger, artifactCounts, mode),
    hasScan: !!artifacts.scan || artifactCounts.scans > 0,
    hasJourney: !!artifacts.journey,
    hasTestCases: artifactCounts.testCases > 0,
    hasScripts: artifactCounts.scriptFiles > 0,
    hasCicd: artifactCounts.cicdFiles > 0,
    testCaseCount: artifactCounts.testCases,
    scriptFileCount: artifactCounts.scriptFiles,
    cicdFileCount: artifactCounts.cicdFiles,
  };

  const activities = [{
    id: crypto.randomUUID(),
    timestamp: now,
    type: trigger,
    message: buildActivityMessage(trigger, meta.name),
    versionId,
    actor: "extension",
  }];

  return { meta, version, activities, artifacts };
}

function buildCurrentArtifactSet(mode) {
  const isJourneyMode = mode === "journey";
  return {
    scan: !isJourneyMode ? state.currentPageData || null : null,
    journey: isJourneyMode ? buildJourneyProjectPayload() : null,
    testcases: state.testCases || [],
    cicd: cicdGeneratedConfigs || null,
    notes: isJourneyMode ? collectJourneyNotes(state.journey) : null,
    scriptFiles: flattenScriptsToFiles(state.scripts),
  };
}

function buildArtifactCountsFromArtifacts(mode, artifacts) {
  return {
    scans: mode === "journey"
      ? ((artifacts.journey?.steps || []).filter((step) => !!step.pageData).length)
      : (artifacts.scan ? 1 : 0),
    journeys: mode === "journey" && artifacts.journey ? 1 : 0,
    testCases: Array.isArray(artifacts.testcases) ? artifacts.testcases.length : 0,
    scriptFiles: Array.isArray(artifacts.scriptFiles) ? artifacts.scriptFiles.length : 0,
    cicdFiles: artifacts.cicd ? Object.keys(artifacts.cicd).length : 0,
    notes: artifacts.notes?.stepNotes?.length || 0,
  };
}

function buildVersionSummary(trigger, counts, mode) {
  const label = {
    manual_save: "manual save",
    generate_tests: "test generation",
    generate_scripts: "script generation",
    generate_cicd: "ci/cd generation",
    migrate_local: "local migration",
  }[trigger] || trigger;
  return `${label} • ${mode} • ${counts.testCases} cases • ${counts.scriptFiles} files`;
}

function buildActivityMessage(trigger, name) {
  const label = {
    manual_save: "Saved a new project version",
    generate_tests: "Generated test cases and saved them to the project",
    generate_scripts: "Generated scripts and saved them to the project",
    generate_cicd: "Generated CI/CD files and saved them to the project",
    migrate_local: "Migrated a local project into cloud history",
  }[trigger] || "Updated the project";
  return `${label} (${name})`;
}

function appendBundleToRecord(existingRecord, bundle, location, syncState = "synced") {
  const previous = existingRecord || {
    meta: bundle.meta,
    latestVersion: null,
    versions: [],
    activities: [],
    artifacts: emptyArtifactSet(),
    artifactsByVersion: {},
  };

  const nextMeta = {
    ...previous.meta,
    ...bundle.meta,
    location,
    syncState,
  };
  const nextVersions = [bundle.version, ...(previous.versions || []).filter((version) => version.id !== bundle.version.id)];
  const nextActivities = [...(bundle.activities || []), ...(previous.activities || []).filter((activity) => !bundle.activities?.some((item) => item.id === activity.id))];
  const nextArtifactsByVersion = {
    ...(previous.artifactsByVersion || {}),
    [bundle.version.id]: normalizeArtifactSet(bundle.artifacts),
  };

  return {
    meta: nextMeta,
    latestVersion: bundle.version,
    versions: nextVersions,
    activities: nextActivities,
    artifacts: normalizeArtifactSet(bundle.artifacts),
    artifactsByVersion: nextArtifactsByVersion,
  };
}

function serializeLocalProjectRecord(record) {
  return {
    ...record.meta,
    versions: record.versions,
    activities: record.activities,
    artifactsByVersion: record.artifactsByVersion,
  };
}

async function saveLocalProjectRecord(record) {
  const project = serializeLocalProjectRecord(record);
  project.savedAt = new Date().toISOString();
  await sendToBackground({ type: "SAVE_PROJECT", project });
}

function emptyArtifactCounts() {
  return { scans: 0, journeys: 0, testCases: 0, scriptFiles: 0, cicdFiles: 0, notes: 0 };
}

function emptyArtifactSet() {
  return { scan: null, journey: null, testcases: [], cicd: null, notes: null, scriptFiles: [] };
}

function collectJourneyNotes(journey) {
  const stepNotes = (journey?.steps || [])
    .filter((step) => step.notes)
    .map((step) => ({ stepId: step.id, stepOrder: step.order, note: step.notes }));
  return stepNotes.length ? { stepNotes } : null;
}

function flattenScriptsToFiles(scripts) {
  if (!scripts) return [];
  if (Array.isArray(scripts.files)) {
    return scripts.files.map((file, index) => ({
      id: file.id || sanitizeProjectFileId(file.filename || `file-${index + 1}`),
      key: file.key || file.filename,
      filename: file.filename,
      content: file.content,
      group: file.group || "page",
      stepId: file.stepId || null,
    }));
  }

  const pageGroup = scripts.__group || "page";

  return FILE_ORDER
    .map((key) => {
      const file = scripts[key];
      if (!file?.filename || !file?.content) return null;
      return {
        id: sanitizeProjectFileId(file.filename),
        key,
        filename: file.filename,
        content: file.content,
        group: pageGroup,
        stepId: null,
      };
    })
    .filter(Boolean);
}

function sanitizeProjectFileId(value) {
  return String(value || "file")
    .replace(/[/.?#\[\]\s]+/g, "_")
    .slice(0, 100);
}

function reconstructScriptsFromFiles(files, mode) {
  if (!Array.isArray(files) || !files.length) return null;
  if (mode === "journey") {
    return {
      framework: state.activeProject?.activeFramework || state.selectedFramework,
      files: files.map((file) => ({
        filename: file.filename,
        content: file.content,
        key: file.key || file.filename,
        group: file.group || "page",
        stepId: file.stepId || null,
      })),
      summary: {
        journeyExecutable: files.some((file) => file.group === "journey"),
      },
    };
  }

  const group = files[0]?.group || "page";
  return files.reduce((acc, file) => {
    const key = file.key || inferPageScriptKey(file.filename);
    acc[key] = { filename: file.filename, content: file.content };
    return acc;
  }, { __group: group });
}

function inferPageScriptKey(filename = "") {
  const lower = filename.toLowerCase();
  if (lower.includes("base")) return "base";
  if (lower.includes("page")) return "pageObject";
  if (lower.includes("data")) return "testData";
  if (lower.includes("config") || lower.endsWith(".xml") || lower.endsWith(".ini")) return "config";
  if (lower.includes("access")) return "accessibility";
  return "tests";
}

function applyProjectRecordToEditor(record) {
  state.activeProjectRecord = record;
  setActiveProject(record.meta, { record });
  setSelectedFramework(record.meta.activeFramework || state.selectedFramework);
  cicdGeneratedConfigs = record.artifacts.cicd || null;

  if (record.meta.mode === "journey" && record.artifacts.journey) {
    const loadedJourney = hydrateJourney(record.artifacts.journey);
    state.journey = loadedJourney;
    state.activeArtifactMode = "journey";
    state.testCases = decorateLoadedTestCases(record.artifacts.testcases || loadedJourney.generated?.testCases || []);
    state.scripts = reconstructScriptsFromFiles(record.artifacts.scriptFiles, "journey");
    state.selectedScriptPack = state.scripts?.selectedPack || "e2e";
    state.selectedFile = Array.isArray(state.scripts?.files) ? state.scripts.files[0]?.filename || null : null;
    seedJourneyTCGroups();
    renderJourneyTab();
    switchTab(record.artifacts.testcases?.length ? "testcases" : "journey");
  } else {
    const pageData = record.artifacts.scan || createFallbackPageData(record.meta.sourceUrl, record.meta.name);
    state.currentPageData = pageData;
    state.activeArtifactMode = "page";
    state.testCases = decorateLoadedTestCases(record.artifacts.testcases || []);
    state.scripts = reconstructScriptsFromFiles(record.artifacts.scriptFiles, "page");
    state.selectedScriptPack = state.scripts?.__group || "page";
    state.selectedFile = "base";
    hide("idle-state");
    hide("scanning-state");
    show("results-state");
    renderScanSummary(pageData);
    updateElementBadge(pageData);
    switchTab(record.artifacts.testcases?.length ? "testcases" : "scan");
  }

  if (state.scripts) {
    document.getElementById("script-badge").classList.remove("hidden");
    renderFileList();
    renderCurrentFile();
  }
  syncScriptPackSelect();
  if (cicdGeneratedConfigs) renderCICDResults(cicdGeneratedConfigs);
  updateTCBadge();
  renderTCList();
}

function decorateLoadedTestCases(testCases) {
  return (testCases || []).map((testCase, index) => normalizeTestCase(testCase, index));
}

function createFallbackPageData(url, title) {
  return {
    meta: {
      url: url || state.currentTabInfo?.url || "about:blank",
      title: title || "Saved page",
      pageType: "page",
    },
    forms: [],
    buttons: [],
    links: [],
    tables: [],
    inputs: [],
    modals: [],
    accessibility: null,
    pageStructure: {
      hasSearch: false,
      hasTabs: false,
      hasCarousel: false,
      hasDatePicker: false,
      hasFileUpload: false,
      hasRichText: false,
      hasCaptcha: false,
    },
  };
}

// ─── Event bindings ───────────────────────────────────────────────────────────

function bindEvents() {
  // Tab switching
  document.querySelectorAll(".tab[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => requestTabSwitch(btn.dataset.tab));
  });

  // Help overlay
  document.getElementById("help-btn").addEventListener("click", () => {
    document.getElementById("help-overlay").classList.remove("hidden");
  });
  document.getElementById("help-close").addEventListener("click", () => {
    document.getElementById("help-overlay").classList.add("hidden");
  });
  document.getElementById("help-got-it").addEventListener("click", () => {
    document.getElementById("help-overlay").classList.add("hidden");
  });
  document.getElementById("help-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden");
  });
  document.getElementById("advanced-toggle-btn")?.addEventListener("click", () => {
    const panel = document.getElementById("advanced-panel");
    setAdvancedPanelOpen(panel?.classList.contains("hidden"));
  });
  document.querySelectorAll("[data-advanced-tab]").forEach((btn) => {
    btn.addEventListener("click", () => requestTabSwitch(btn.dataset.advancedTab));
  });

  // Bug report
  document.getElementById("bug-btn").addEventListener("click", openBugModal);
  document.getElementById("bug-modal-close").addEventListener("click", () => document.getElementById("bug-modal").classList.add("hidden"));
  document.getElementById("bug-modal").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden"); });
  document.getElementById("bug-copy-md").addEventListener("click", () => copyBugReport("markdown"));
  document.getElementById("bug-copy-jira").addEventListener("click", () => copyBugReport("jira"));
  document.getElementById("bug-download-md").addEventListener("click", downloadBugReport);

  // Settings toggle
  document.getElementById("settings-btn").addEventListener("click", () => {
    const panel = document.getElementById("settings-panel");
    toggleSettings(panel.classList.contains("hidden"));
  });

  document.getElementById("save-settings-btn").addEventListener("click", saveSettings);

  document.getElementById("reload-ext-btn").addEventListener("click", () => {
    chrome.runtime.reload();
  });

  document.getElementById("project-picker-select").addEventListener("change", handleProjectAppChange);
  document.getElementById("project-page-select").addEventListener("change", handleProjectPickerChange);
  document.getElementById("project-create-btn").addEventListener("click", () => {
    openProjectModal({
      purpose: "create",
      cloudOnly: true,
      forceNewProject: !hasProjectContext(),
    });
  });
  document.getElementById("project-new-btn").addEventListener("click", () => openProjectModal({ purpose: "create", cloudOnly: true, forceNewProject: true }));
  document.getElementById("project-local-btn").addEventListener("click", toggleLocalProjectFilter);
  document.getElementById("project-save-btn").addEventListener("click", handleSaveCurrentPage);
  document.getElementById("project-retry-sync-btn").addEventListener("click", retryProjectSync);
  document.getElementById("project-migrate-btn").addEventListener("click", migrateLocalProjectToCloud);
  document.getElementById("project-open-dashboard-btn").addEventListener("click", openProjectsDashboard);
  document.getElementById("project-page-hint-btn")?.addEventListener("click", handleSaveCurrentPage);
  document.getElementById("project-connect-btn").addEventListener("click", openConnectExperience);
  document.getElementById("project-use-selectors-btn").addEventListener("click", () => switchTab("selectors"));
  document.getElementById("project-collapse-btn")?.addEventListener("click", toggleProjectBarCollapsed);

  document.getElementById("project-modal-close").addEventListener("click", () => settleProjectModal(null));
  document.getElementById("project-modal-cancel").addEventListener("click", () => settleProjectModal(null));
  document.getElementById("project-modal-create-btn").addEventListener("click", createProjectFromModal);
  document.getElementById("project-modal-customize-name-btn").addEventListener("click", () => {
    state.projectModalUseCustomName = !state.projectModalUseCustomName;
    syncProjectModalCopy();
  });
  document.getElementById("project-modal-app-name").addEventListener("input", syncProjectModalCopy);
  document.getElementById("project-modal-page-label").addEventListener("input", syncProjectModalCopy);
  document.getElementById("project-modal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) settleProjectModal(null);
  });
  document.getElementById("page-mismatch-close")?.addEventListener("click", () => settlePageMismatchModal("cancel"));
  document.getElementById("page-mismatch-cancel")?.addEventListener("click", () => settlePageMismatchModal("cancel"));
  document.getElementById("page-mismatch-save-anyway")?.addEventListener("click", () => settlePageMismatchModal("save"));
  document.getElementById("page-mismatch-create-page")?.addEventListener("click", () => settlePageMismatchModal("create"));
  document.getElementById("page-mismatch-modal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) settlePageMismatchModal("cancel");
  });

  window.addEventListener("qadeck-auth-changed", handleProjectAuthChange);
  document.getElementById("auth-projects-btn")?.addEventListener("click", openProjectsDashboard);
  document.getElementById("auth-selector-btn")?.addEventListener("click", () => switchTab("selectors"));

  document.getElementById("login-required-close")?.addEventListener("click", closeLoginRequiredModal);
  document.getElementById("login-required-modal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeLoginRequiredModal();
  });
  document.getElementById("login-required-selectors-btn")?.addEventListener("click", () => {
    closeLoginRequiredModal();
    switchTab("selectors");
  });
  document.getElementById("login-required-open-btn")?.addEventListener("click", openConnectExperience);
  document.getElementById("login-required-connect-btn")?.addEventListener("click", openConnectExperience);

  // Settings — close on outside click
  document.addEventListener("mousedown", (e) => {
    const panel = document.getElementById("settings-panel");
    const btn = document.getElementById("settings-btn");
    if (!panel.classList.contains("hidden") &&
        !panel.contains(e.target) && !btn.contains(e.target)) {
      toggleSettings(false);
    }
  });

  document.getElementById("api-key-input").addEventListener("input", (e) => {
    const hint = document.getElementById("provider-hint");
    if (!hint) return;
    const provider = detectProvider(e.target.value.trim());
    hint.textContent = provider ? `Detected: ${provider}` : "";
    hint.style.color = provider ? "#22c55e" : "";
  });

  // Scan tab
  document.getElementById("start-scan-btn").addEventListener("click", startScan);
  document.getElementById("rescan-btn").addEventListener("click", startScan);
  document.getElementById("generate-tc-btn").addEventListener("click", generateTestCases);

  // Journey tab
  document.getElementById("journey-add-btn").addEventListener("click", addCurrentPageToJourney);
  document.getElementById("journey-import-btn").addEventListener("click", importJourneyRecording);
  document.getElementById("journey-save-btn").addEventListener("click", saveJourneyManually);
  document.getElementById("journey-fragments-btn")?.addEventListener("click", toggleFragmentLibrary);
  document.getElementById("fragment-library-close")?.addEventListener("click", () => document.getElementById("fragment-library")?.classList.add("hidden"));
  document.getElementById("journey-generate-btn").addEventListener("click", generateJourneyTestCases);
  document.getElementById("journey-load-btn").addEventListener("click", loadSelectedJourney);
  document.getElementById("journey-new-btn").addEventListener("click", resetJourneyDraft);
  document.getElementById("journey-refresh-sessions-btn").addEventListener("click", preloadJourneySessionId);
  document.getElementById("journey-name-input").addEventListener("input", (e) => {
    state.journey.name = e.target.value.trim() || "Untitled Journey";
    queueJourneyDraftSave();
  });

  // Test cases tab
  document.getElementById("tc-filter").addEventListener("change", (e) => {
    state.filterCategory = e.target.value;
    renderTCList();
  });

  document.getElementById("add-tc-btn").addEventListener("click", addManualTC);
  document.getElementById("tc-empty-scan-btn").addEventListener("click", () => requestTabSwitch("scan"));
  document.getElementById("go-generate-script-btn").addEventListener("click", async () => {
    const allowed = await ensureFeatureAccess(FeatureAccess.CONNECTED_WITH_PROJECT, {
      title: "Connect QA Deck before generating scripts",
      feature: "Script generation",
      trigger: "generate_scripts",
    });
    if (!allowed) return;
    switchTab("script");
    generateScript();
  });

  // Mode toggle (Happy path / Exploratory)
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.exploratoryMode = btn.dataset.mode === "exploratory";
    });
  });

  // Export dropdown
  document.getElementById("export-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("export-menu").classList.toggle("hidden");
  });
  document.addEventListener("click", () => {
    document.getElementById("export-menu")?.classList.add("hidden");
  });
  document.getElementById("export-csv-btn").addEventListener("click", () => {
    document.getElementById("export-menu").classList.add("hidden");
    exportTestCasesCSV();
  });
  document.getElementById("export-md-btn").addEventListener("click", () => {
    document.getElementById("export-menu").classList.add("hidden");
    exportTestCasesMarkdown();
  });
  document.getElementById("export-testrail-btn").addEventListener("click", () => {
    document.getElementById("export-menu").classList.add("hidden");
    exportToTestRail();
  });
  document.getElementById("export-xray-btn").addEventListener("click", () => {
    document.getElementById("export-menu").classList.add("hidden");
    exportToJiraXray();
  });

  // Coverage panel toggle
  document.getElementById("coverage-header").addEventListener("click", toggleCoveragePanel);
  document.getElementById("coverage-heatmap-btn")?.addEventListener("click", (e) => { e.stopPropagation(); toggleCoverageHeatmap(); });

  // Script tab
  document.getElementById("go-tc-btn").addEventListener("click", () => requestTabSwitch("testcases"));
  document.getElementById("copy-btn").addEventListener("click", copyCurrentFile);
  document.getElementById("regen-script-btn").addEventListener("click", generateScript);
  document.getElementById("download-btn").addEventListener("click", downloadZip);
  document.getElementById("script-pack-select")?.addEventListener("change", (e) => {
    state.selectedScriptPack = e.target.value;
    updateGenerateScriptBtn();
  });
  document.getElementById("visual-testing-toggle")?.addEventListener("change", (e) => { state.visualTesting = e.target.checked; });
  document.getElementById("perf-assertions-toggle")?.addEventListener("change", (e) => { state.perfAssertions = e.target.checked; });
  document.getElementById("multi-env-toggle")?.addEventListener("change", (e) => { state.multiEnv = e.target.checked; if (e.target.checked) openEnvModal(); });
  document.getElementById("dataset-modal-close")?.addEventListener("click", () => document.getElementById("dataset-modal").classList.add("hidden"));
  document.getElementById("dataset-cancel-btn")?.addEventListener("click", () => document.getElementById("dataset-modal").classList.add("hidden"));
  document.getElementById("dataset-save-btn")?.addEventListener("click", saveDatasets);
  document.getElementById("dataset-add-row-btn")?.addEventListener("click", addDatasetRow);
  document.getElementById("dataset-add-col-btn")?.addEventListener("click", addDatasetColumn);
  document.getElementById("dataset-modal")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden"); });
  document.getElementById("env-modal-close")?.addEventListener("click", closeEnvModal);
  document.getElementById("env-cancel-btn")?.addEventListener("click", () => { state.multiEnv = false; document.getElementById("multi-env-toggle").checked = false; closeEnvModal(); });
  document.getElementById("env-save-btn")?.addEventListener("click", saveEnvironments);
  document.getElementById("env-add-btn")?.addEventListener("click", addEnvRow);
  document.getElementById("env-modal")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeEnvModal(); });

  // Format toggle (POM vs BDD)
  document.querySelectorAll(".format-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedFormat = btn.dataset.format;
      document.querySelectorAll(".format-btn").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      if (state.scripts) {
        state.selectedFile = state.selectedFormat === "bdd" ? "feature" : "base";
        renderFileList();
        renderCurrentFile();
      }
    });
  });

  // Framework buttons
  document.querySelectorAll(".fw-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setSelectedFramework(btn.dataset.fw);
      renderJourneyTab();
      if (state.scripts) renderFileList();
    });
  });

  // Selectors tab — inspect + test
  document.getElementById("sel-inspect-btn").addEventListener("click", toggleInspectMode);
  document.getElementById("sel-assert-mode-btn").addEventListener("click", toggleAssertMode);
  document.getElementById("sel-assert-add-btn").addEventListener("click", addCustomAssertion);

  // Assert type pills
  document.querySelectorAll(".sel-assert-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selAssertType = btn.dataset.type;
      document.querySelectorAll(".sel-assert-type-btn").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      // Show/hide value inputs based on type
      const noValueTypes = ["is_visible", "not_exists"];
      const attrType = btn.dataset.type === "attr_equals";
      const valueInput = document.getElementById("sel-assert-value");
      const attrInput = document.getElementById("sel-assert-attr");
      if (noValueTypes.includes(btn.dataset.type)) {
        valueInput.classList.add("hidden");
        attrInput.classList.add("hidden");
      } else if (attrType) {
        valueInput.classList.remove("hidden");
        attrInput.classList.remove("hidden");
        attrInput.placeholder = "Attribute name (e.g. href, class, value)...";
      } else {
        valueInput.classList.remove("hidden");
        attrInput.classList.add("hidden");
        valueInput.placeholder = btn.dataset.type === "url_contains" ? "URL fragment..." : btn.dataset.type === "count_equals" ? "Expected count (number)..." : "Expected value...";
      }
    });
  });
  document.getElementById("sel-run-btn").addEventListener("click", runTestLocator);
  document.getElementById("sel-clear-btn").addEventListener("click", clearTestLocator);
  document.getElementById("sel-test-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runTestLocator();
  });

  // Framework tabs (single-select)
  document.querySelectorAll(".sel-fw-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      state.selActiveFw = tab.dataset.fw;
      document.querySelectorAll(".sel-fw-tab").forEach(t => t.classList.toggle("active", t === tab));
      // Show language bar only for Selenium (python/java choice)
      const langBar = document.getElementById("sel-lang-bar");
      langBar.classList.toggle("hidden", state.selActiveFw !== "selenium-py");
      // Re-render locators if we have data
      if (state._lastLocatorData) renderLocators(state._lastLocatorData);
    });
  });

  // Language toggle (Python / Java)
  document.querySelectorAll(".sel-lang-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      state.selLang = pill.dataset.lang;
      document.querySelectorAll(".sel-lang-pill").forEach(p => p.classList.toggle("active", p === pill));
      if (state._lastLocatorData) renderLocators(state._lastLocatorData);
    });
  });

  // Theme toggle
  document.getElementById("theme-btn").addEventListener("click", () => {
    const body = document.body;
    if (state.selTheme === "auto" || state.selTheme === "light") {
      state.selTheme = "dark";
      body.classList.remove("theme-light");
      body.classList.add("theme-dark");
    } else {
      state.selTheme = "light";
      body.classList.remove("theme-dark");
      body.classList.add("theme-light");
    }
  });

  // Cart button
  document.getElementById("sel-cart-btn").addEventListener("click", openCartModal);
  document.getElementById("sel-pom-close").addEventListener("click", () => hide("sel-pom-overlay"));
  document.getElementById("sel-pom-generate").addEventListener("click", generatePOM);
  document.getElementById("sel-pom-copy").addEventListener("click", copyPOM);
  document.getElementById("sel-pom-clear").addEventListener("click", clearCart);
  document.getElementById("sel-pom-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) hide("sel-pom-overlay");
  });
}

// ─── Tab switching ────────────────────────────────────────────────────────────

function switchTab(tab) {
  // Stop inspect/assert mode when leaving the Selectors tab — this unregisters
  // the content script's click/mouseover interceptors so the page stays interactive
  if (tab !== "selectors" && (state.selInspecting || state.selAssertMode)) {
    if (state.selInspecting) stopInspectMode();
    if (state.selAssertMode) {
      state.selAssertMode = false;
      const assertBtn = document.getElementById("sel-assert-mode-btn");
      if (assertBtn) {
        assertBtn.classList.remove("active");
        assertBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3 3 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Assert Mode`;
      }
      hide("sel-assert-builder");
    }
    sendToBackground({ type: "STOP_INSPECTING" });
  }
  state.currentTab = tab;
  if (tab !== "journey" && tab !== "cicd") setAdvancedPanelOpen(false);
  document.querySelectorAll(".tab[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-content").forEach((el) => el.classList.add("hidden"));
  document.getElementById(`tab-${tab}`).classList.remove("hidden");
  if (tab === "journey") renderJourneyTab();
  if (tab === "record") initRecordTab();
}

function toggleSettings(show) {
  document.getElementById("settings-panel").classList.toggle("hidden", !show);
}

// ─── SCAN ─────────────────────────────────────────────────────────────────────

async function startScan() {
  if (!await ensureFeatureAccess(FeatureAccess.CONNECTED_WITH_PROJECT, {
    title: "Connect QA Deck before scanning",
    feature: "Scanning pages",
    trigger: "manual_save",
  })) {
    return;
  }

  if (!state.apiKey) {
    showToast("Add your Anthropic API key in Settings first", "error");
    toggleSettings(true);
    return;
  }

  setButtonLoading("start-scan-btn", true, "Scanning...", "Start Scan");

  // Show scanning state
  show("scanning-state");
  hide("idle-state");
  hide("results-state");

  const steps = [
    { label: "Injecting scanner...", detail: "Connecting to page", pct: 10 },
    { label: "Reading DOM structure", detail: "Parsing element tree", pct: 25 },
    { label: "Extracting forms & inputs", detail: "Finding interactive elements", pct: 45 },
    { label: "Analysing navigation & tables", detail: "Mapping page components", pct: 65 },
    { label: "Building element map", detail: "Generating locators", pct: 85 },
    { label: "Scan complete!", detail: "Ready to generate test cases", pct: 100 },
  ];

  let stepIdx = 0;
  const stepEl = document.getElementById("scan-step");
  const detailEl = document.getElementById("scan-detail");
  const fillEl = document.getElementById("progress-fill");

  const stepInterval = setInterval(() => {
    if (stepIdx < steps.length - 1) {
      stepIdx++;
      const s = steps[stepIdx];
      stepEl.textContent = s.label;
      detailEl.textContent = s.detail;
      fillEl.style.width = s.pct + "%";
    }
  }, 400);

  // Animate first step
  stepEl.textContent = steps[0].label;
  detailEl.textContent = steps[0].detail;
  fillEl.style.width = "10%";

  const result = await sendToBackground({ type: "SCAN_PAGE" });
  clearInterval(stepInterval);
  setButtonLoading("start-scan-btn", false, "", "Start Scan");

  if (!result?.success) {
    hide("scanning-state");
    show("idle-state");
    showToast(result?.error || "Scan failed. Try refreshing the page.", "error");
    return;
  }

  state.currentPageData = result.data;
  fillEl.style.width = "100%";
  stepEl.textContent = "Scan complete!";
  if (window.qadeckAuth) window.qadeckAuth.logScan();

  setTimeout(() => {
    hide("scanning-state");
    show("results-state");
    renderScanSummary(result.data);
    updateElementBadge(result.data);
  }, 600);
}

function renderScanSummary(data) {
  const { meta, forms, buttons, links, tables, inputs, modals, pageStructure, iframes, shadowElements, performance: perf } = data;

  // Compute flakiness across all elements
  const allElements = [
    ...(buttons || []),
    ...(inputs || []),
    ...(forms || []).flatMap(f => f.fields || []),
  ];
  const flakyCount = allElements.filter(el => el.flaky).length;

  const totalElements =
    forms.reduce((n, f) => n + f.fields.length, 0) +
    buttons.length +
    links.length +
    inputs.length;

  const features = [];
  if (pageStructure.hasSearch) features.push("Search");
  if (pageStructure.hasTabs) features.push("Tabs");
  if (pageStructure.hasCarousel) features.push("Carousel");
  if (pageStructure.hasDatePicker) features.push("Date picker");
  if (pageStructure.hasFileUpload) features.push("File upload");
  if (pageStructure.hasRichText) features.push("Rich text editor");
  if (pageStructure.hasCaptcha) features.push("CAPTCHA");
  if (modals?.length > 0) features.push("Modals");

  document.getElementById("scan-summary").innerHTML = `
    <div class="summary-card">
      <div class="label">Total elements</div>
      <div class="value">${totalElements}</div>
      <div class="sub">Interactive elements found</div>
    </div>
    <div class="summary-card">
      <div class="label">Forms</div>
      <div class="value">${forms.length}</div>
      <div class="sub">${forms.map((f) => f.purpose).join(", ") || "None"}</div>
    </div>
    <div class="summary-card">
      <div class="label">Buttons</div>
      <div class="value">${buttons.length}</div>
      <div class="sub">Actionable elements</div>
    </div>
    <div class="summary-card">
      <div class="label">Page type</div>
      <div class="value" style="font-size:14px;text-transform:capitalize">${meta.pageType}</div>
      <div class="sub">${meta.framework?.join(", ") || "Unknown"}</div>
    </div>
    ${
      features.length > 0
        ? `<div class="summary-card full">
        <div class="label">Detected features</div>
        <div class="tag-row">${features.map((f) => `<span class="tag">${f}</span>`).join("")}</div>
      </div>`
        : ""
    }
    ${
      tables.length > 0
        ? `<div class="summary-card full">
        <div class="label">Data tables (${tables.length})</div>
        <div class="sub">${tables.map((t) => t.purpose).join(" · ")}</div>
      </div>`
        : ""
    }
    ${
      flakyCount > 0
        ? `<div class="summary-card full">
        <div class="label" style="color:#F59E0B">⚠ Flakiness Warning</div>
        <div class="value" style="color:#F59E0B;font-size:18px">${flakyCount}</div>
        <div class="sub">element${flakyCount > 1 ? "s" : ""} with unstable locators (auto-generated IDs, hashed classes, or dynamic content). Warnings added to generated code.</div>
      </div>`
        : ""
    }
    ${
      (iframes?.length > 0 || shadowElements?.length > 0)
        ? `<div class="summary-card full">
        <div class="label">Embedded contexts</div>
        <div class="tag-row">
          ${iframes?.length > 0 ? `<span class="tag" style="background:rgba(251,191,36,.15);color:#F59E0B;border-color:rgba(251,191,36,.3)">${iframes.length} iFrame${iframes.length > 1 ? "s" : ""}</span>` : ""}
          ${shadowElements?.length > 0 ? `<span class="tag" style="background:rgba(139,92,246,.15);color:#8B5CF6;border-color:rgba(139,92,246,.3)">${shadowElements.length} Shadow DOM</span>` : ""}
        </div>
        <div class="sub" style="margin-top:4px">Frame-switching locators generated automatically</div>
      </div>`
        : ""
    }
    ${
      perf && perf.loadTime !== null
        ? `<div class="summary-card full">
        <div class="label">Performance Metrics</div>
        <div class="tag-row" style="flex-wrap:wrap;gap:5px">
          ${perf.loadTime   !== null ? `<span class="tag" style="${perf.loadTime   > 3000 ? "color:#E24B4A;border-color:rgba(226,75,74,.3)" : "color:#1D9E75;border-color:rgba(29,158,117,.3)"}">Load: ${perf.loadTime}ms</span>` : ""}
          ${perf.fcp        !== null ? `<span class="tag" style="${perf.fcp        > 2500 ? "color:#F59E0B;border-color:rgba(245,158,11,.3)" : "color:#1D9E75;border-color:rgba(29,158,117,.3)"}">FCP: ${perf.fcp}ms</span>` : ""}
          ${perf.ttfb       !== null ? `<span class="tag" style="${perf.ttfb       > 800  ? "color:#F59E0B;border-color:rgba(245,158,11,.3)" : "color:#1D9E75;border-color:rgba(29,158,117,.3)"}">TTFB: ${perf.ttfb}ms</span>` : ""}
          ${perf.domContentLoaded !== null ? `<span class="tag">DCL: ${perf.domContentLoaded}ms</span>` : ""}
          ${perf.resourceCount ? `<span class="tag">${perf.resourceCount} resources</span>` : ""}
        </div>
        <div class="sub" style="margin-top:4px">Enable "Performance Assertions" in Script tab to generate SLA tests</div>
      </div>`
        : ""
    }
  `;
}

function updateElementBadge(data) {
  const total =
    data.forms.reduce((n, f) => n + f.fields.length, 0) +
    data.buttons.length +
    data.links.length +
    data.inputs.length;
  const badge = document.getElementById("element-badge");
  badge.textContent = `${total} elements`;
  badge.classList.add("has-data");
}

// ─── JOURNEY BUILDER ─────────────────────────────────────────────────────────

async function loadJourneyDraft() {
  const res = await sendToBackground({ type: "LOAD_JOURNEY_DRAFT" });
  if (res?.success && res.journey) {
    state.journey = hydrateJourney(res.journey);
    setSelectedFramework(state.journey.activeFramework || state.selectedFramework);
    if (state.journey.generated?.testCases?.length) {
      state.activeArtifactMode = "journey";
      state.testCases = decorateLoadedTestCases(state.journey.generated.testCases);
      state.scripts = state.journey.generated.scripts || null;
      state.selectedScriptPack = state.scripts?.selectedPack || "e2e";
      state.selectedFile = Array.isArray(state.scripts?.files) ? state.scripts.files[0]?.filename || null : state.selectedFile;
      seedJourneyTCGroups();
      updateTCBadge();
    } else {
      state.activeArtifactMode = "page";
      state.testCases = [];
      state.scripts = null;
      state.selectedScriptPack = "page";
      state.selectedFile = null;
      state.tcGroupExpanded = {};
      updateTCBadge();
    }
  } else {
    state.journey = createEmptyJourney({ activeFramework: state.selectedFramework });
  }
  syncScriptPackSelect();
}

async function refreshSavedJourneys() {
  const res = await sendToBackground({ type: "LOAD_PROJECTS" });
  const projects = Array.isArray(res?.projects) ? res.projects : [];
  state.savedJourneys = projects.filter((project) => (project.mode || project.project?.mode) === "journey");
  renderJourneySavedOptions();
}

function hydrateJourney(journey) {
  const normalized = createEmptyJourney({
    ...journey,
    activeFramework: journey.activeFramework || state.selectedFramework,
  });

  normalized.steps = (journey.steps || []).map((step, index) => normalizeJourneyStep(step, index));
  normalized.generated = {
    testCases: Array.isArray(journey.generated?.testCases) ? journey.generated.testCases : [],
    scripts: journey.generated?.scripts || null,
    lastGeneratedAt: journey.generated?.lastGeneratedAt || null,
  };
  return normalized;
}

function normalizeJourneyStep(step, index) {
  const order = index + 1;
  const path = step.path || safeUrlPath(step.url);
  return {
    id: step.id || crypto.randomUUID(),
    order,
    title: step.title || buildJourneyStepTitle(step.url, order),
    url: step.url || "about:blank",
    path,
    pageType: step.pageType || inferJourneyPageType(step.url, step.pageData),
    source: step.source || (step.pageData && (step.recordedActions || step.actions)?.length ? "scan + recording" : step.pageData ? "scan" : "recording"),
    pageData: step.pageData || null,
    recordedActions: step.recordedActions || step.actions || [],
    recordedSteps: step.recordedSteps || [],
    recordedEntryUrl: step.recordedEntryUrl || null,
    notes: step.notes || "",
    transitionStatus: order === 1 ? "start" : (step.transitionStatus || "missing"),
  };
}

function buildJourneyStepTitle(url, order) {
  try {
    const parsed = new URL(url || "https://example.com");
    const part = parsed.pathname.split("/").filter(Boolean).pop();
    if (part) {
      return part.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    }
    return parsed.hostname;
  } catch {
    return `Step ${order}`;
  }
}

function safeUrlPath(url) {
  try {
    return new URL(url || "https://example.com").pathname || "/";
  } catch {
    return "/";
  }
}

function inferJourneyPageType(url, pageData) {
  if (pageData?.meta?.pageType) return pageData.meta.pageType;
  const path = safeUrlPath(url).toLowerCase();
  if (/login|signin|sign-in/.test(path)) return "login";
  if (/register|signup|sign-up/.test(path)) return "registration";
  if (/checkout|payment|billing/.test(path)) return "checkout";
  if (/search|results/.test(path)) return "search";
  if (/dashboard|overview|home/.test(path)) return "dashboard";
  if (/refund|return/.test(path)) return "refund";
  if (/admin|manage/.test(path)) return "admin";
  return "page";
}

function renderJourneySavedOptions() {
  const select = document.getElementById("journey-saved-select");
  if (!select) return;

  const current = select.value || state.journey.id;
  select.innerHTML = `<option value="">Select saved journey</option>`;
  state.savedJourneys.forEach((journey) => {
    const option = document.createElement("option");
    option.value = journey.id;
    option.textContent = journey.name || journey.url || journey.id;
    select.appendChild(option);
  });

  if (current) select.value = current;
}

function renderJourneyTab() {
  const journey = state.journey;
  const summary = getJourneySummary();
  const nameInput = document.getElementById("journey-name-input");
  if (nameInput && nameInput.value !== journey.name) nameInput.value = journey.name;

  const frameworkPill = document.getElementById("journey-framework-pill");
  if (frameworkPill) frameworkPill.textContent = state.selectedFramework;
  document.getElementById("journey-step-count").textContent = String(journey.steps.length);
  document.getElementById("journey-missing-count").textContent = String(summary.missingTransitions.length);
  document.getElementById("journey-source-count").textContent = String(journey.steps.filter((step) => String(step.source).includes("recording")).length);

  const note = document.getElementById("journey-status-note");
  if (note) {
    note.classList.remove("warning", "ready");
    if (!journey.steps.length) {
      note.textContent = "Build a multi-page flow by scanning pages and importing recordings.";
    } else if (summary.missingTransitions.length) {
      note.textContent = `Full journey script is blocked until ${summary.missingTransitions.length} transition${summary.missingTransitions.length > 1 ? "s are" : " is"} recorded. Step-level scripts can still be generated.`;
      note.classList.add("warning");
    } else {
      note.textContent = "All transitions are recorded. Journey test cases and a full end-to-end suite can be generated.";
      note.classList.add("ready");
    }
  }

  const empty = document.getElementById("journey-empty-state");
  const list = document.getElementById("journey-step-list");
  empty.classList.toggle("hidden", journey.steps.length > 0);
  list.classList.toggle("hidden", journey.steps.length === 0);

  if (!journey.steps.length) {
    list.innerHTML = "";
    return;
  }

  list.innerHTML = journey.steps.map((step, index) => buildJourneyStepCard(step, index)).join("");
  list.querySelectorAll("[data-journey-action]").forEach((btn) => {
    btn.addEventListener("click", handleJourneyAction);
  });
  list.querySelectorAll(".journey-step-notes").forEach((textarea) => {
    textarea.addEventListener("input", (event) => {
      const idx = Number(event.target.dataset.index);
      state.journey.steps[idx].notes = event.target.value;
      queueJourneyDraftSave();
    });
  });
}

function buildJourneyStepCard(step, index) {
  const expanded = state.journeyStepExpanded[step.id];
  const transitionStatus = getJourneyTransitionStatus(step, index);
  const classes = ["journey-step-card"];
  if (transitionStatus === "recorded" || transitionStatus === "start") classes.push("recorded");
  if (transitionStatus === "missing") classes.push("missing");

  return `
    <div class="${classes.join(" ")}">
      <div class="journey-step-head">
        <div class="journey-step-order">${step.order}</div>
        <div class="journey-step-body">
          <div class="journey-step-title">${step.title || `Step ${step.order}`}</div>
          <div class="journey-step-url">${step.url || "—"}</div>
          <div class="journey-step-chips">
            <span class="journey-chip source-${String(step.source).replace(/\s+\+\s+/g, "-").replace(/\s+/g, "-")}">${step.source}</span>
            <span class="journey-chip">${step.pageType || "page"}</span>
            <span class="journey-chip transition-${transitionStatus === "missing" ? "missing" : "recorded"}">
              ${transitionStatus === "missing" ? "transition missing" : transitionStatus === "start" ? "start step" : "transition recorded"}
            </span>
          </div>
        </div>
        <div class="journey-step-actions">
          <button class="journey-step-btn" data-journey-action="move-up" data-index="${index}" title="Move up">↑</button>
          <button class="journey-step-btn" data-journey-action="move-down" data-index="${index}" title="Move down">↓</button>
          <button class="journey-step-btn" data-journey-action="toggle" data-id="${step.id}" title="Expand">${expanded ? "▴" : "▾"}</button>
          <button class="journey-step-btn" data-journey-action="save-fragment" data-index="${index}" title="Save as Fragment">💾</button>
          <button class="journey-step-btn" data-journey-action="delete" data-index="${index}" title="Delete">✕</button>
        </div>
      </div>
      ${expanded ? `
        <div class="journey-step-details">
          <div class="journey-step-label">Notes</div>
          <textarea class="journey-step-notes" data-index="${index}" rows="2" placeholder="Add intent, expected business rules, or edge cases for this step">${step.notes || ""}</textarea>
          <div class="journey-step-label">Recorded flow</div>
          ${step.recordedSteps?.length
            ? `<div class="journey-recorded-list">${step.recordedSteps.map((item) => `<div class="journey-recorded-item">• ${item}</div>`).join("")}</div>`
            : `<div class="journey-empty-inline">No recorded actions attached. This step can still generate local page tests, but the full journey suite needs a recorded transition.</div>`}
        </div>
      ` : ""}
    </div>
  `;
}

function handleJourneyAction(event) {
  const action = event.currentTarget.dataset.journeyAction;
  const index = Number(event.currentTarget.dataset.index);
  const id = event.currentTarget.dataset.id;

  if (action === "move-up") moveJourneyStep(index, -1);
  if (action === "move-down") moveJourneyStep(index, 1);
  if (action === "delete") deleteJourneyStep(index);
  if (action === "save-fragment") saveStepFragment(index);
  if (action === "toggle" && id) {
    state.journeyStepExpanded[id] = !state.journeyStepExpanded[id];
    renderJourneyTab();
  }
}

function getJourneySummary() {
  const missingTransitions = state.journey.steps.filter((step, index) => index > 0 && getJourneyTransitionStatus(step, index) !== "recorded");
  return {
    missingTransitions,
    hasRecordedSteps: state.journey.steps.some((step) => String(step.source).includes("recording")),
    journeyExecutable: missingTransitions.length === 0 && state.journey.steps.length > 1,
  };
}

function getJourneyTransitionStatus(step, index, steps = state.journey.steps) {
  if (index === 0) return "start";
  const previous = steps[index - 1];
  if (step.recordedEntryUrl && previous?.url === step.recordedEntryUrl) return "recorded";
  if (!step.recordedEntryUrl && step.transitionStatus === "recorded" && step.recordedActions?.length) return "recorded";
  return "missing";
}

function queueJourneyDraftSave() {
  clearTimeout(journeyDraftTimer);
  journeyDraftTimer = setTimeout(() => {
    persistJourneyDraft();
  }, 250);
}

async function persistJourneyDraft() {
  state.journey = buildJourneyProjectPayload();
  await sendToBackground({ type: "SAVE_JOURNEY_DRAFT", journey: state.journey });
}

function buildJourneyProjectPayload() {
  const normalizedSteps = state.journey.steps.map((step, index) => {
    const normalized = normalizeJourneyStep({ ...step, order: index + 1 }, index);
    normalized.transitionStatus = getJourneyTransitionStatus(normalized, index, state.journey.steps);
    return normalized;
  });
  return createEmptyJourney({
    ...state.journey,
    url: normalizedSteps[0]?.url || null,
    activeFramework: state.selectedFramework,
    steps: normalizedSteps,
    generated: {
      testCases: state.activeArtifactMode === "journey" ? state.testCases : state.journey.generated?.testCases || [],
      scripts: state.activeArtifactMode === "journey" ? state.scripts : state.journey.generated?.scripts || null,
      lastGeneratedAt: state.journey.generated?.lastGeneratedAt || null,
    },
    updatedAt: new Date().toISOString(),
  });
}

function createJourneyStepFromScan(pageData) {
  const order = state.journey.steps.length + 1;
  const meta = pageData?.meta || {};
  return normalizeJourneyStep({
    id: crypto.randomUUID(),
    order,
    title: meta.title || buildJourneyStepTitle(meta.url, order),
    url: meta.url,
    path: meta.path,
    pageType: meta.pageType,
    source: "scan",
    pageData,
    recordedActions: [],
    recordedSteps: [],
    notes: "",
    transitionStatus: order === 1 ? "start" : "missing",
  }, order - 1);
}

function createJourneyStepFromSegment(segment, order) {
  return normalizeJourneyStep({
    id: crypto.randomUUID(),
    order,
    title: segment.title || buildJourneyStepTitle(segment.url, order),
    url: segment.url,
    path: segment.path,
    pageType: segment.pageType,
    source: "recording",
    pageData: null,
    recordedActions: segment.actions || segment.recordedActions || [],
    recordedSteps: segment.recordedSteps || [],
    recordedEntryUrl: segment.recordedEntryUrl || null,
    notes: "",
    transitionStatus: order === 1 ? "start" : (segment.transitionStatus || "recorded"),
  }, order - 1);
}

async function addCurrentPageToJourney() {
  if (!await ensureFeatureAccess(FeatureAccess.CONNECTED_WITH_PROJECT, {
    title: "Connect QA Deck before building journeys",
    feature: "Journey building",
    trigger: "manual_save",
  })) {
    return;
  }

  if (!state.currentPageData) {
    showToast("Scan the current page first, then add it to the journey.", "error");
    switchTab("scan");
    return;
  }

  state.journey.steps.push(createJourneyStepFromScan(state.currentPageData));
  state.journey = buildJourneyProjectPayload();
  renderJourneyTab();
  queueJourneyDraftSave();
  showToast("Current page added to journey", "success");
}

async function preloadJourneySessionId() {
  const input = document.getElementById("journey-session-id");
  const sessionId = await resolveJourneySessionId();
  if (input && sessionId) input.value = sessionId;
  if (!sessionId) showToast("No active capture sessions found", "info");
}

async function resolveJourneySessionId() {
  const input = document.getElementById("journey-session-id");
  const typed = input?.value?.trim();
  if (typed) return typed;

  try {
    const res = await fetchTimeout(`${BACKEND}/api/record/sessions`, 3000);
    const data = await res.json();
    if (data.sessions?.length === 1) return data.sessions[0].sessionId;
    if (data.sessions?.length > 1) return data.sessions[0].sessionId;
  } catch (_) {}

  return "";
}

async function importJourneyRecording() {
  if (!await ensureFeatureAccess(FeatureAccess.CONNECTED_WITH_PROJECT, {
    title: "Connect QA Deck before importing captured flows",
    feature: "Capture imports",
    trigger: "manual_save",
  })) {
    return;
  }

  const sessionId = await resolveJourneySessionId();
  if (!sessionId) {
    showToast("Enter or select a capture session ID first", "error");
    return;
  }

  try {
    const stopRes = await fetch(`${BACKEND}/api/record/${sessionId}/stop`, { method: "POST" });
    const stopData = await stopRes.json();
    if (!stopData.success) throw new Error(stopData.error);

    const segments = Array.isArray(stopData.journeySegments) ? stopData.journeySegments : [];
    if (!segments.length) throw new Error("No journey steps were found in this capture session");

    mergeJourneySegments(segments);
    const input = document.getElementById("journey-session-id");
    if (input) input.value = "";
    renderJourneyTab();
    queueJourneyDraftSave();
    showToast(`Imported ${segments.length} captured step${segments.length > 1 ? "s" : ""} into the journey`, "success");
    await refreshSessions();
  } catch (err) {
    showToast(`Journey import failed: ${err.message}`, "error");
  }
}

function mergeJourneySegments(segments) {
  segments.forEach((segment, index) => {
    const order = state.journey.steps.length + 1;
    const incoming = createJourneyStepFromSegment({
      ...segment,
      recordedEntryUrl: index === 0 ? null : segments[index - 1].url,
    }, order);
    const last = state.journey.steps[state.journey.steps.length - 1];

    if (last && areStepsSamePage(last, incoming)) {
      last.source = combineJourneySources(last.source, incoming.source);
      last.recordedActions = incoming.recordedActions;
      last.recordedSteps = incoming.recordedSteps;
      last.recordedEntryUrl = incoming.recordedEntryUrl || last.recordedEntryUrl;
      if (!last.pageType || last.pageType === "page") last.pageType = incoming.pageType;
      if (last.transitionStatus === "missing") last.transitionStatus = incoming.transitionStatus;
      return;
    }

    state.journey.steps.push(incoming);
  });

  state.journey = buildJourneyProjectPayload();
}

function areStepsSamePage(a, b) {
  return !!a && !!b && a.url === b.url && safeUrlPath(a.url) === safeUrlPath(b.url);
}

function combineJourneySources(current, incoming) {
  const items = new Set([current, incoming].filter(Boolean));
  if (items.has("scan") && items.has("recording")) return "scan + recording";
  if (items.has("scan + recording")) return "scan + recording";
  return incoming || current || "scan";
}

function moveJourneyStep(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.journey.steps.length) return;
  const [step] = state.journey.steps.splice(index, 1);
  state.journey.steps.splice(target, 0, step);
  state.journey = buildJourneyProjectPayload();
  renderJourneyTab();
  queueJourneyDraftSave();
}

function deleteJourneyStep(index) {
  state.journey.steps.splice(index, 1);
  state.journey = buildJourneyProjectPayload();
  renderJourneyTab();
  queueJourneyDraftSave();
}

async function saveJourneyManually() {
  if (!await ensureFeatureAccess(FeatureAccess.CONNECTED_WITH_PROJECT, {
    title: "Connect QA Deck before saving journeys",
    feature: "Journey saves",
    trigger: "manual_save",
  })) {
    return;
  }

  if (!state.journey.steps.length) {
    showToast("Add at least one step before saving", "error");
    return;
  }

  state.journey.savedAt = new Date().toISOString();
  state.journey = buildJourneyProjectPayload();
  await persistCurrentProjectVersion("manual_save", { notify: true, requireProject: true });
  await refreshSavedJourneys();
  queueJourneyDraftSave();
}

async function loadSelectedJourney() {
  if (!await ensureFeatureAccess(FeatureAccess.CONNECTED, {
    title: "Connect QA Deck before opening journeys",
    feature: "Saved journeys",
  })) {
    return;
  }

  const id = document.getElementById("journey-saved-select")?.value;
  if (!id) {
    showToast("Select a saved journey first", "error");
    return;
  }

  try {
    const record = await fetchProjectRecord({ location: "local", id });
    applyProjectRecordToEditor(record);
    showToast("Journey loaded", "success");
  } catch (err) {
    showToast(err.message || "Failed to load journey", "error");
  }
}

async function resetJourneyDraft() {
  if (state.journey.steps.length && !confirm("Discard the current journey draft and start a new one?")) return;
  state.journey = createEmptyJourney({ activeFramework: state.selectedFramework });
  state.journeyStepExpanded = {};
  if (state.activeArtifactMode === "journey") {
    state.activeArtifactMode = "page";
    state.testCases = [];
    state.scripts = null;
    updateTCBadge();
    renderTCList();
  }
  renderJourneyTab();
  await persistJourneyDraft();
}

async function generateJourneyTestCases() {
  if (!await ensureFeatureAccess(FeatureAccess.CONNECTED_WITH_PROJECT, {
    title: "Connect QA Deck before generating journey coverage",
    feature: "Journey test generation",
    trigger: "generate_tests",
  })) {
    return;
  }

  if (!state.journey.steps.length) {
    showToast("Add at least one journey step first", "error");
    return;
  }
  if (!state.apiKey) {
    showToast("API key required", "error");
    toggleSettings(true);
    return;
  }

  setButtonLoading("journey-generate-btn", true, "Generating...", "Generate");
  const payload = buildJourneyProjectPayload();
  const result = await sendToBackground({
    type: "GENERATE_JOURNEY_TESTS",
    journey: payload,
    apiKey: state.apiKey,
  });
  setButtonLoading("journey-generate-btn", false, "", "Generate");

  if (!result?.success) {
    showToast(result?.error || "Failed to generate journey test cases", "error");
    return;
  }

  state.activeArtifactMode = "journey";
  state.testCases = decorateLoadedTestCases(result.testCases || []);
  state.scripts = null;
  state.selectedScriptPack = state.testCases.some((tc) => tc.caseKind === "flow") ? "e2e" : "page";
  state.journey.generated = {
    ...state.journey.generated,
    testCases: state.testCases,
    scripts: null,
    lastGeneratedAt: new Date().toISOString(),
  };

  seedJourneyTCGroups();
  renderTCList();
  updateTCBadge();
  syncScriptPackSelect();
  queueJourneyDraftSave();
  await persistCurrentProjectVersion("generate_tests", { notify: false });
  switchTab("testcases");
  showToast(`${state.testCases.length} journey test cases generated`, "success");
}

function seedJourneyTCGroups() {
  state.tcGroupExpanded = { "Journey Cases": true };
  state.testCases
    .filter((tc) => tc.scope === "step")
    .forEach((tc) => {
      if (tc.groupLabel) state.tcGroupExpanded[tc.groupLabel] = true;
    });
}

// ─── GENERATE TEST CASES ──────────────────────────────────────────────────────

async function generateTestCases() {
  if (!await ensureFeatureAccess(FeatureAccess.CONNECTED_WITH_PROJECT, {
    title: "Connect QA Deck before generating test cases",
    feature: "AI test generation",
    trigger: "generate_tests",
  })) {
    return;
  }

  if (!state.currentPageData) return;
  if (!state.apiKey) {
    showToast("API key required", "error");
    return;
  }

  setButtonLoading("generate-tc-btn", true, "Generating...", "Generate test cases →");
  switchTab("testcases");
  show("tc-generating");
  hide("tc-empty");
  hide("tc-content");

  const result = await sendToBackground({
    type: "GENERATE_TESTS",
    pageData: state.currentPageData,
    apiKey: state.apiKey,
    exploratoryMode: state.exploratoryMode,
  });

  hide("tc-generating");
  setButtonLoading("generate-tc-btn", false, "", "Generate test cases →");

  if (!result?.success) {
    show("tc-empty");
    showToast(result?.error || "Failed to generate test cases", "error");
    return;
  }

  state.testCases = decorateLoadedTestCases(result.testCases || []);
  state.activeArtifactMode = "page";
  state.scripts = null;
  state.selectedScriptPack = "page";
  state.tcGroupExpanded = {};

  show("tc-content");
  renderTCList();
  updateTCBadge();
  syncScriptPackSelect();
  await persistCurrentProjectVersion("generate_tests", { notify: false });
  showToast(`${state.testCases.length} test cases generated`, "success");
}

// ─── TEST CASE RENDERING ──────────────────────────────────────────────────────

function renderTCList() {
  const list = document.getElementById("tc-list");
  const filtered = filterTCs();
  const approvedCount = state.testCases.filter((t) => t.approved).length;

  document.getElementById("tc-count-label").textContent = hasJourneyScopedCases()
    ? `${filtered.length} cases · ${approvedCount} approved`
    : `${filtered.length} test cases · ${approvedCount} approved`;

  renderCoverage();
  updateGenerateScriptBtn();

  if (filtered.length === 0) {
    list.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-size:12px;padding:24px">No test cases match filter</p>`;
    return;
  }

  if (hasJourneyScopedCases()) {
    renderJourneyTCGroups(list, filtered);
    return;
  }

  list.innerHTML = "";
  filtered.forEach((tc, idx) => {
    const realIdx = state.testCases.indexOf(tc);
    list.appendChild(buildTCCard(tc, realIdx));
  });
}

function filterTCs() {
  if (state.filterCategory === "all") return state.testCases;
  if (state.filterCategory === "page") {
    return state.testCases.filter((testCase) => testCase.caseKind !== "flow");
  }
  if (state.filterCategory === "flow") {
    return state.testCases.filter((testCase) => testCase.caseKind === "flow");
  }
  if (TESTCASE_PACK_ORDER.includes(state.filterCategory)) {
    return state.testCases.filter((testCase) => testCase.packs.includes(state.filterCategory));
  }
  if (state.filterCategory === "high") {
    return state.testCases.filter((testCase) => ["high", "critical"].includes(String(testCase.priority || "").toLowerCase()));
  }
  return state.testCases.filter((testCase) => testCase.category === state.filterCategory);
}

function hasJourneyScopedCases() {
  return state.activeArtifactMode === "journey" || state.testCases.some((tc) => tc.scope === "journey" || tc.scope === "step");
}

function renderJourneyTCGroups(list, filtered) {
  const groups = new Map();
  const orderedGroups = ["Journey Cases"];

  filtered.forEach((tc) => {
    const group = tc.scope === "step" ? tc.groupLabel || `Step ${tc.stepOrder || "?"}` : "Journey Cases";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(tc);
    if (!orderedGroups.includes(group)) orderedGroups.push(group);
    if (!(group in state.tcGroupExpanded)) state.tcGroupExpanded[group] = true;
  });

  list.innerHTML = "";

  orderedGroups
    .filter((group) => groups.has(group))
    .forEach((group) => {
      const section = document.createElement("div");
      section.className = "tc-group";
      const expanded = state.tcGroupExpanded[group] !== false;
      const cases = groups.get(group);
      const approved = cases.filter((tc) => tc.approved).length;

      section.innerHTML = `
        <button class="tc-group-header" data-group="${group}">
          <span>${group}</span>
          <span class="tc-group-meta">${cases.length} cases · ${approved} approved ${expanded ? "▴" : "▾"}</span>
        </button>
        <div class="tc-group-body ${expanded ? "" : "hidden"}"></div>
      `;

      const body = section.querySelector(".tc-group-body");
      cases.forEach((tc) => {
        body.appendChild(buildTCCard(tc, state.testCases.indexOf(tc)));
      });

      section.querySelector(".tc-group-header").addEventListener("click", () => {
        state.tcGroupExpanded[group] = !expanded;
        renderTCList();
      });

      list.appendChild(section);
    });
}

function buildTCCard(tc, idx) {
  const card = document.createElement("div");
  card.className = "tc-card" + (tc.approved ? " approved" : "");
  card.dataset.idx = idx;

  const isExpanded = state.expandedTC === idx;
  const isEditing = state.editingTC === idx;

  const priClass = { high: "pri-high", medium: "pri-medium", low: "pri-low" }[tc.priority] || "pri-low";

  // Main locator (first one found)
  const locatorEntry = tc.locators ? Object.entries(tc.locators)[0] : null;
  const locatorStr = locatorEntry ? locatorEntry[1] : null;
  const kindLabel = TESTCASE_KIND_LABELS[tc.caseKind] || TESTCASE_KIND_LABELS.page;
  const packPills = (tc.packs || [])
    .map((pack) => `<span class="pack-pill ${pack}">${SCRIPT_PACK_LABELS[pack] || pack}</span>`)
    .join("");

  card.innerHTML = `
    <div class="tc-card-header">
      <div class="tc-checkbox ${tc.approved ? "checked" : ""}" data-action="toggle" data-idx="${idx}">
        ${tc.approved ? `<svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5l2.5 2.5 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}
      </div>
      <div class="tc-body" data-action="expand" data-idx="${idx}">
        <div class="tc-id-row">
          <span class="tc-id">${tc.id}</span>
          <span class="kind-pill">${kindLabel}</span>
          <span class="pri-pill ${priClass}">${tc.priority}</span>
          <span class="cat-pill">${tc.category || "functional"}</span>
          ${packPills}
        </div>
        <div class="tc-title">${tc.title}</div>
      </div>
      <div class="tc-mini-actions">
        <button class="mini-btn" data-action="edit" data-idx="${idx}">Edit</button>
        <button class="mini-btn del" data-action="delete" data-idx="${idx}">✕</button>
      </div>
    </div>

    ${
      isEditing
        ? `<div class="tc-expanded">
        <textarea class="tc-edit-area" id="tc-edit-${idx}" rows="3">${tc.title}</textarea>
        <div class="edit-btns">
          <button class="btn-secondary" data-action="cancel-edit" style="padding:5px 12px;font-size:11px">Cancel</button>
          <button class="btn-primary" data-action="save-edit" data-idx="${idx}" style="padding:5px 12px;font-size:11px">Save</button>
        </div>
      </div>`
        : isExpanded
        ? `<div class="tc-expanded">
        ${tc.preconditions ? `<div class="expanded-label">Preconditions</div><p style="font-size:11px;color:var(--text-secondary);margin-bottom:10px">${tc.preconditions}</p>` : ""}
        <div class="expanded-label">Steps</div>
        <div class="steps-list">
          ${(tc.steps || []).map((s, n) => `<div class="step-row"><div class="step-num">${n + 1}</div><div class="step-text">${s}</div></div>`).join("")}
        </div>
        <div class="expected-box"><strong>Expected:</strong> ${tc.expectedResult || tc.expected_result || "—"}</div>
        ${
          locatorStr
            ? `<div class="locator-row" data-action="highlight" data-selector="${locatorStr}">
            <span class="locator-text">${locatorStr}</span>
            <span class="locator-tip">hover to highlight</span>
          </div>`
            : ""
        }
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <button class="btn-secondary" data-action="open-datasets" data-idx="${idx}" style="font-size:9px;padding:2px 8px;border-radius:4px">
            ⊞ Datasets${tc.datasets?.length > 0 ? ` (${tc.datasets.length})` : ""}
          </button>
        </div>
      </div>`
        : ""
    }
  `;

  // Event delegation
  card.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    const idxStr = e.target.closest("[data-idx]")?.dataset.idx;
    const i = idxStr !== undefined ? parseInt(idxStr) : idx;

    if (action === "toggle") { toggleApproved(i); }
    else if (action === "expand") { toggleExpand(i); }
    else if (action === "edit") { startEdit(i); }
    else if (action === "delete") { deleteTC(i); }
    else if (action === "cancel-edit") { state.editingTC = null; renderTCList(); }
    else if (action === "save-edit") { saveEdit(i); }
    else if (action === "open-datasets") { openDatasetModal(i); }
    else if (action === "highlight") {
      const sel = e.target.closest("[data-selector]")?.dataset.selector;
      if (sel) highlightElement(sel);
    }
  });

  return card;
}

function toggleApproved(idx) {
  state.testCases[idx].approved = !state.testCases[idx].approved;
  syncJourneyGeneratedState();
  renderTCList();
  updateTCBadge();
}

function toggleExpand(idx) {
  state.expandedTC = state.expandedTC === idx ? null : idx;
  state.editingTC = null;
  renderTCList();
}

function startEdit(idx) {
  state.editingTC = idx;
  state.expandedTC = null;
  renderTCList();
  setTimeout(() => document.getElementById(`tc-edit-${idx}`)?.focus(), 50);
}

function saveEdit(idx) {
  const textarea = document.getElementById(`tc-edit-${idx}`);
  if (textarea) state.testCases[idx].title = textarea.value.trim();
  state.editingTC = null;
  syncJourneyGeneratedState();
  renderTCList();
}

function deleteTC(idx) {
  state.testCases.splice(idx, 1);
  if (state.expandedTC === idx) state.expandedTC = null;
  if (state.editingTC === idx) state.editingTC = null;
  syncJourneyGeneratedState();
  renderTCList();
  updateTCBadge();
}

function addManualTC() {
  const caseKind = hasJourneyScopedCases() ? "flow" : "page";
  const packs = [];
  const tc = {
    id: `TC${String(state.testCases.length + 1).padStart(3, "0")}`,
    title: "New test case — click Edit to describe it",
    category: caseKind === "flow" ? "e2e" : "functional",
    priority: "medium",
    preconditions: "",
    steps: ["Step 1"],
    expectedResult: "Expected result",
    locators: {},
    testData: {},
    tags: [],
    approved: false,
    _localId: Date.now(),
    caseKind,
    packs,
    suite: deriveLegacySuite(caseKind, packs),
    scope: caseKind === "flow" ? "journey" : "page",
    source: caseKind === "flow" ? "recording" : "manual",
    stepId: null,
    stepOrder: null,
    groupLabel: hasJourneyScopedCases() ? "Journey Cases" : undefined,
  };
  state.testCases.push(normalizeTestCase(tc, state.testCases.length));
  state.editingTC = state.testCases.length - 1;
  syncJourneyGeneratedState();
  renderTCList();
  updateTCBadge();
}

function updateTCBadge() {
  const badge = document.getElementById("tc-badge");
  badge.textContent = state.testCases.length;
  badge.classList.toggle("hidden", state.testCases.length === 0);
}

function updateGenerateScriptBtn() {
  const btn = document.getElementById("go-generate-script-btn");
  if (!btn) return;
  const approvedForPack = getApprovedCasesForSelectedPack();
  const n = approvedForPack.length;
  const packLabel = SCRIPT_PACK_LABELS[state.selectedScriptPack] || "Selected Pack";
  const summary = getJourneySummary();
  if (hasJourneyScopedCases()) {
    btn.textContent = n > 0
      ? summary.missingTransitions.length
        ? `Generate ${packLabel} step scripts (${n}) →`
        : `Generate ${packLabel} scripts (${n}) →`
      : `Approve ${packLabel} cases first`;
    btn.disabled = n === 0;
    return;
  }
  btn.textContent = n > 0 ? `Generate ${packLabel} script (${n}) →` : `Approve ${packLabel} cases first`;
  btn.disabled = n === 0;
}

function syncJourneyGeneratedState() {
  if (state.activeArtifactMode !== "journey") return;
  state.journey.generated = {
    ...state.journey.generated,
    testCases: state.testCases,
    scripts: state.scripts,
    lastGeneratedAt: state.journey.generated?.lastGeneratedAt || new Date().toISOString(),
  };
  queueJourneyDraftSave();
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────

function exportTestCasesCSV() {
  if (!state.testCases.length) { showToast("No test cases to export", "error"); return; }
  const headers = ["ID", "Scope", "Group", "Title", "Category", "Priority", "Preconditions", "Steps", "Expected Result", "Status"];
  const rows = state.testCases.map(tc => [
    tc.id,
    tc.scope || "page",
    tc.groupLabel || "",
    tc.title,
    tc.category,
    tc.priority,
    tc.preconditions || "",
    (tc.steps || []).join(" | "),
    tc.expectedResult || "",
    tc.approved ? "Approved" : "Pending",
  ].map(cell => `"${String(cell).replace(/"/g, '""')}"`));
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  triggerDownload(csv, "test-cases.csv", "text/csv;charset=utf-8;");
  showToast("Exported as CSV", "success");
}

function exportTestCasesMarkdown() {
  if (!state.testCases.length) { showToast("No test cases to export", "error"); return; }
  const header = "| ID | Scope | Group | Title | Category | Priority | Preconditions | Steps | Expected Result | Status |";
  const sep    = "|---|---|---|---|---|---|---|---|---|---|";
  const rows = state.testCases.map(tc =>
    `| ${tc.id} | ${tc.scope || "page"} | ${tc.groupLabel || "—"} | ${tc.title} | ${tc.category} | ${tc.priority} | ` +
    `${tc.preconditions || "—"} | ${(tc.steps || []).join("; ")} | ` +
    `${tc.expectedResult || "—"} | ${tc.approved ? "✅ Approved" : "⏳ Pending"} |`
  );
  const md = [header, sep, ...rows].join("\n");
  triggerDownload(md, "test-cases.md", "text/markdown;charset=utf-8;");
  showToast("Exported as Markdown", "success");
}

function exportToTestRail() {
  if (!state.testCases.length) { showToast("No test cases to export", "error"); return; }
  // TestRail import CSV format: Title, Section, Type, Priority, Estimate, References, Steps, Expected
  const headers = ["Title", "Section", "Type", "Priority", "Estimate", "References", "Steps (Step)", "Steps (Expected)"];
  const rows = state.testCases.map(tc => {
    const priorityMap = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
    const typeMap = { smoke: "Smoke & Sanity", regression: "Regression", negative: "Negative", functional: "Functional", boundary: "Other", ui: "UI", navigation: "Acceptance", a11y: "Accessibility" };
    const stepsText = (tc.steps || []).join("\n");
    return [
      tc.title,
      tc.category || "Functional",
      typeMap[tc.category] || "Functional",
      priorityMap[tc.priority] || "Medium",
      "",
      tc.id,
      stepsText,
      tc.expectedResult || "",
    ].map(cell => `"${String(cell).replace(/"/g, '""')}"`);
  });
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  triggerDownload(csv, "test-cases-testrail.csv", "text/csv;charset=utf-8;");
  showToast("TestRail CSV exported!", "success");
}

function exportToJiraXray() {
  if (!state.testCases.length) { showToast("No test cases to export", "error"); return; }
  const priorityMap = { critical: "Highest", high: "High", medium: "Medium", low: "Low" };
  const xray = state.testCases.map(tc => ({
    summary: tc.title,
    issueType: "Test",
    priority: priorityMap[tc.priority] || "Medium",
    labels: [tc.category || "functional", "qa-deck"],
    precondition: tc.preconditions || "",
    description: tc.expectedResult || "",
    steps: (tc.steps || []).map((step, i) => ({
      index: i + 1,
      action: step,
      data: Object.values(tc.testData || {})[i] || "",
      result: i === (tc.steps.length - 1) ? tc.expectedResult || "" : "",
    })),
  }));
  const json = JSON.stringify({ tests: xray }, null, 2);
  triggerDownload(json, "test-cases-xray.json", "application/json;charset=utf-8;");
  showToast("Jira Xray JSON exported!", "success");
}

function triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── COVERAGE ANALYSIS ────────────────────────────────────────────────────────

function computeCoverage() {
  const pd = state.currentPageData;
  const tcs = state.testCases;
  if (!pd || !tcs.length) return null;

  const elements = [];

  // Form fields
  (pd.forms || []).forEach(form => {
    (form.fields || []).forEach(field => {
      elements.push({
        type: "field",
        label: field.label || field.placeholder || field.type || "input",
        locator: field.locator || "",
      });
    });
  });

  // Buttons
  (pd.buttons || []).forEach(btn => {
    elements.push({
      type: "button",
      label: btn.text || btn.action || "button",
      locator: btn.locator || "",
    });
  });

  // Navigation
  if ((pd.navigation || []).length > 0) {
    elements.push({ type: "navigation", label: "navigation", locator: "" });
  }

  // Accessibility issues
  if (pd.accessibility?.issues?.length > 0) {
    elements.push({ type: "accessibility", label: "accessibility", locator: "" });
  }

  if (elements.length === 0) return null;

  // Build a searchable text blob from all test case content
  const allTCText = tcs.flatMap(tc => [
    tc.title.toLowerCase(),
    ...(tc.steps || []).map(s => s.toLowerCase()),
    (tc.expectedResult || "").toLowerCase(),
    ...Object.values(tc.locators || {}).map(l => l.toLowerCase()),
  ]).join(" ");

  const covered = [];
  const uncovered = [];

  elements.forEach(el => {
    const labelLower = el.label.toLowerCase();
    const locatorLower = el.locator.toLowerCase();
    const hit = (labelLower.length > 1 && allTCText.includes(labelLower))
             || (locatorLower.length > 3 && allTCText.includes(locatorLower))
             || (el.type === "navigation" && allTCText.includes("navigat"))
             || (el.type === "accessibility" && tcs.some(tc => tc.category === "accessibility"));
    (hit ? covered : uncovered).push(el);
  });

  const score = Math.round((covered.length / elements.length) * 100);
  return { score, covered, uncovered, total: elements.length };
}

function renderCoverage() {
  const panel = document.getElementById("coverage-panel");
  const badge = document.getElementById("coverage-score-badge");
  const body  = document.getElementById("coverage-body");
  if (!panel) return;

  if (hasJourneyScopedCases()) {
    panel.classList.add("hidden");
    return;
  }

  const result = computeCoverage();
  if (!result) { panel.classList.add("hidden"); return; }

  panel.classList.remove("hidden");

  // Show heatmap button once coverage data exists
  const heatmapBtn = document.getElementById("coverage-heatmap-btn");
  if (heatmapBtn) heatmapBtn.style.display = "";

  const { score, covered, uncovered } = result;
  const [bgColor, textColor] =
    score >= 80 ? ["#E1F5EE", "#0F6E56"] :
    score >= 50 ? ["#FAEEDA", "#854F0B"] :
                  ["#FCEBEB", "#A32D2D"];
  badge.textContent = `${score}%`;
  badge.style.background = bgColor;
  badge.style.color = textColor;

  // Update count label with inline coverage score
  const countLabel = document.getElementById("tc-count-label");
  if (countLabel) {
    const approved = state.testCases.filter(tc => tc.approved).length;
    const filtered = filterTCs();
    countLabel.textContent = `${filtered.length} test cases · ${score}% coverage`;
  }

  const makeList = (items, icon) =>
    items.map(el =>
      `<div style="display:flex;align-items:center;gap:5px;padding:2px 0;font-size:11px;color:var(--text-secondary)">
        <span style="color:${icon === "✓" ? "#1D9E75" : "var(--text-muted)"}">${icon}</span>
        <span>${el.label}</span>
        <span style="font-size:9px;color:var(--text-muted);font-family:var(--mono)">${el.type}</span>
      </div>`
    ).join("");

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px">
      <div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);margin-bottom:5px">Covered (${covered.length})</div>
        ${covered.length ? makeList(covered, "✓") : `<p style="font-size:11px;color:var(--text-muted)">None yet</p>`}
      </div>
      <div>
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);margin-bottom:5px">Not Covered (${uncovered.length})</div>
        ${uncovered.length ? makeList(uncovered, "○") : `<p style="font-size:11px;color:#1D9E75">All covered!</p>`}
      </div>
    </div>
  `;
}

function toggleCoveragePanel() {
  const body    = document.getElementById("coverage-body");
  const chevron = document.getElementById("coverage-chevron");
  if (!body) return;
  const isHidden = body.classList.toggle("hidden");
  chevron.style.transform = isHidden ? "" : "rotate(180deg)";
}

async function toggleCoverageHeatmap() {
  const btn = document.getElementById("coverage-heatmap-btn");
  const result = computeCoverage();
  if (!result) return;

  if (state.coverageHeatmapActive) {
    state.coverageHeatmapActive = false;
    if (btn) { btn.textContent = "Show on Page"; btn.style.color = ""; }
    const [tab] = await new Promise(res => chrome.tabs.query({ active: true, currentWindow: true }, res));
    if (tab?.id) await sendToTab(tab.id, { type: "CLEAR_COVERAGE_HEATMAP" });
  } else {
    state.coverageHeatmapActive = true;
    if (btn) { btn.textContent = "Clear Overlay"; btn.style.color = "#1D9E75"; }
    const coveredLocators  = result.covered.map(el => el.locator).filter(Boolean);
    const uncoveredLocators = result.uncovered.map(el => el.locator).filter(Boolean);
    const [tab] = await new Promise(res => chrome.tabs.query({ active: true, currentWindow: true }, res));
    if (tab?.id) {
      await sendToBackground({ type: "SHOW_COVERAGE_HEATMAP", tabId: tab.id, covered: coveredLocators, uncovered: uncoveredLocators });
    }
    showToast(`Coverage overlay: ${coveredLocators.length} covered, ${uncoveredLocators.length} uncovered`, "info");
  }
}

async function highlightElement(selector) {
  await sendToBackground({ type: "HIGHLIGHT_ELEMENT", selector });
  setTimeout(() => sendToBackground({ type: "CLEAR_HIGHLIGHTS" }), 3000);
}

// ─── SELECTORS TAB ────────────────────────────────────────────────────────────

function toggleInspectMode() {
  if (state.selInspecting) {
    stopInspectMode();
    sendToBackground({ type: "STOP_INSPECTING" });
  } else {
    startInspectMode();
  }
}

function startInspectMode() {
  state.selInspecting = true;
  const btn = document.getElementById("sel-inspect-btn");
  btn.classList.add("active");
  btn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="2" y="2" width="9" height="9" rx="1.5" fill="currentColor" opacity=".9"/>
    </svg>
    Stop Inspecting`;
  sendToBackground({ type: "START_INSPECTING" });
}

function stopInspectMode() {
  state.selInspecting = false;
  const btn = document.getElementById("sel-inspect-btn");
  if (!btn) return;
  btn.classList.remove("active");
  btn.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3"/>
      <circle cx="6" cy="6" r="1.5" fill="currentColor"/>
      <path d="M6 1V0M6 12v-1M1 6H0M12 6h-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
    </svg>
    Start Inspecting`;
}

function toggleAssertMode() {
  if (state.selAssertMode) {
    state.selAssertMode = false;
    sendToBackground({ type: "STOP_INSPECTING" });
    const btn = document.getElementById("sel-assert-mode-btn");
    btn.classList.remove("active");
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 7l3 3 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Assert Mode`;
    hide("sel-assert-builder");
  } else {
    // Stop inspect mode if active
    if (state.selInspecting) { stopInspectMode(); sendToBackground({ type: "STOP_INSPECTING" }); }
    state.selAssertMode = true;
    state.selAssertType = "text_equals";
    const btn = document.getElementById("sel-assert-mode-btn");
    btn.classList.add("active");
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="2" width="9" height="9" rx="1.5" fill="currentColor" opacity=".9"/></svg> Stop Assert`;
    sendToBackground({ type: "START_INSPECTING" });
    document.getElementById("sel-inspect-hint").textContent = "Assert Mode active — hover over any element · click to add assertion · press ESC to stop";
  }
}

function showAssertBuilder(data) {
  state.selAssertElement = data;
  const bestLocator = (data.playwright?.[0]?.locator) || (data.seleniumPy?.[0]?.locator) || data.cssSelector || "";

  document.getElementById("sel-assert-element-ref").textContent = bestLocator || `<${data.tag}>`;

  // Pre-fill text value with live text from element
  const textInput = document.getElementById("sel-assert-value");
  textInput.value = data.text?.trim() || data.value?.trim() || data.href || "";
  textInput.classList.remove("hidden");
  document.getElementById("sel-assert-attr").classList.add("hidden");

  // Reset type selection to text_equals
  state.selAssertType = "text_equals";
  document.querySelectorAll(".sel-assert-type-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.type === "text_equals")
  );

  // Populate test case selector
  const tcSelect = document.getElementById("sel-assert-tc-select");
  tcSelect.innerHTML = '<option value="">— All test cases (AI decides placement) —</option>';
  (state.testCases || []).forEach((tc) => {
    const opt = document.createElement("option");
    opt.value = tc.id;
    opt.textContent = `${tc.id} — ${tc.title.slice(0, 40)}`;
    tcSelect.appendChild(opt);
  });

  show("sel-assert-builder");
}

function addCustomAssertion() {
  const el = state.selAssertElement;
  if (!el) return;

  const type = state.selAssertType;
  const value = document.getElementById("sel-assert-value").value.trim();
  const attr  = document.getElementById("sel-assert-attr").value.trim();
  const noValueTypes = ["is_visible", "not_exists"];

  if (!noValueTypes.includes(type) && !value) {
    showToast("Enter an expected value first", "error");
    return;
  }

  const bestLocator = (el.playwright?.[0]?.locator) || (el.seleniumPy?.[0]?.locator) || el.cssSelector || "";

  const tcId = document.getElementById("sel-assert-tc-select").value || null;

  const assertion = {
    id: Date.now(),
    type,
    locator: bestLocator,
    value: noValueTypes.includes(type) ? null : value,
    attrName: type === "attr_equals" ? attr : null,
    elementTag: el.tag,
    elementText: el.text?.slice(0, 30),
    tcId,
  };

  state.customAssertions.push(assertion);
  renderAssertionsList();
  hide("sel-assert-builder");
  showToast("Assertion added ✓", "success");
}

function renderAssertionsList() {
  const count = state.customAssertions.length;
  document.getElementById("sel-assertions-count").textContent = count;

  if (count === 0) {
    hide("sel-assertions-section");
    return;
  }

  show("sel-assertions-section");
  const container = document.getElementById("sel-assertions-list");
  container.innerHTML = "";

  const typeLabels = {
    text_equals: "text =", is_visible: "visible", not_exists: "not exists",
    attr_equals: "attr =", url_contains: "url ∋", count_equals: "count =",
  };

  state.customAssertions.forEach((a) => {
    const item = document.createElement("div");
    item.className = "sel-assertion-item";
    item.innerHTML = `
      ${a.tcId ? `<span class="sel-assertion-tc" title="Pinned to ${a.tcId}">${a.tcId}</span>` : ""}
      <span class="sel-assertion-type">${typeLabels[a.type] || a.type}</span>
      <span class="sel-assertion-locator" title="${a.locator}">${a.locator.slice(0, 22) || a.elementTag}</span>
      ${a.value ? `<span class="sel-assertion-value" title="${a.value}">"${a.value.slice(0, 15)}"</span>` : ""}
      <button class="sel-assertion-remove" data-id="${a.id}" title="Remove">✕</button>
    `;
    item.querySelector(".sel-assertion-remove").addEventListener("click", () => {
      state.customAssertions = state.customAssertions.filter((x) => x.id !== a.id);
      renderAssertionsList();
    });
    container.appendChild(item);
  });
}

function renderLocators(data) {
  if (!data) return;
  state._lastLocatorData = data;

  // Show element card
  show("sel-element-card");
  // Show tag with truncated class string
  const classList = data.className ? `.${data.className}` : "";
  const idStr = data.id ? `#${data.id}` : "";
  document.getElementById("sel-element-tag").textContent = `<${data.tag}${idStr}${classList}>`;
  const meta = data.text ? `text: ${data.text.slice(0, 50)}` : (data.ariaLabel ? `aria-label: ${data.ariaLabel}` : "(no text or label)");
  document.getElementById("sel-element-meta").textContent = meta;

  // Pick locator list based on selected framework + language
  let items = [];
  if (state.selActiveFw === "playwright") {
    items = data.playwright || [];
  } else if (state.selActiveFw === "selenium-py") {
    items = state.selLang === "java" ? (data.seleniumJava || []) : (data.seleniumPy || []);
  } else if (state.selActiveFw === "cypress") {
    items = data.cypress || [];
  } else if (state.selActiveFw === "webdriverio") {
    items = data.webdriverio || [];
  }

  // Render cards
  const container = document.getElementById("sel-locator-groups");
  container.innerHTML = "";

  const dotsMap  = { best: 3, good: 3, ok: 2, fragile: 1 };
  const labelMap = { best: "BEST", good: "GOOD", ok: "OK", fragile: "FRAGILE" };
  // Sort: best → good → ok → fragile
  const order = { best: 0, good: 1, ok: 2, fragile: 3 };
  items = [...items].sort((a, b) => (order[a.quality] ?? 2) - (order[b.quality] ?? 2));

  // Show iframe/shadow warnings
  const existingWarns = container.querySelectorAll(".sel-iframe-warn,.sel-shadow-warn");
  existingWarns.forEach(w => w.remove());

  if (data.iframeInfo?.isIframe) {
    const warn = document.createElement("div");
    warn.className = "sel-iframe-warn";
    warn.innerHTML = `<span>&#9888;</span> <span>This is an <strong>iframe</strong> element. To inspect elements <em>inside</em> it, you may need cross-origin access.</span>`;
    container.appendChild(warn);
  }

  if (data.shadowInfo?.inShadowDom) {
    const warn = document.createElement("div");
    warn.className = "sel-shadow-warn";
    warn.innerHTML = `&#128302; <strong>Shadow DOM detected</strong> — host: <code>${data.shadowInfo.hostSelector}</code>. Some locators may need shadow piercing syntax.`;
    container.appendChild(warn);
  }

  items.forEach(({ label, code, quality = "ok", reason }) => {
    const filledDots = dotsMap[quality] ?? 2;
    const dots = [0,1,2].map(i => `<span class="sel-dot${i < filledDots ? " on" : ""}"></span>`).join("");
    const card = document.createElement("div");
    card.className = "sel-lc";
    card.dataset.quality = quality;
    card.innerHTML = `
      <div class="sel-lc-top">
        <span class="sel-lc-quality">${labelMap[quality]}</span>
        <span class="sel-lc-type">${label}</span>
        <span class="sel-lc-dots">${dots}</span>
      </div>
      <div class="sel-lc-code">${escHtml(code)}</div>
      ${reason ? `<div class="sel-lc-reason">${reason}</div>` : ""}
      <div class="sel-lc-actions">
        <button class="sel-lc-copy">⎘ Copy</button>
        <button class="sel-lc-test">⬡ Highlight</button>
        <button class="sel-lc-add" title="Add to POM cart">＋</button>
      </div>
    `;
    // Copy button
    card.querySelector(".sel-lc-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        const btn = card.querySelector(".sel-lc-copy");
        btn.textContent = "✓ Copied";
        setTimeout(() => { btn.textContent = "⎘ Copy"; }, 1500);
      } catch (_) { showToast("Copy failed", "error"); }
    });
    // Highlight/test button — extract raw selector from code and run
    card.querySelector(".sel-lc-test").addEventListener("click", () => {
      const raw = extractRawSelector(code);
      if (raw) {
        document.getElementById("sel-test-input").value = raw;
        runTestLocator();
      }
    });
    // Add to cart button
    card.querySelector(".sel-lc-add").addEventListener("click", () => {
      addToCart({ tag: data.tag, label, code, quality, reason });
    });
    container.appendChild(card);
  });

  if (!items.length) {
    container.innerHTML = `<p style="font-size:11px;color:var(--text-muted);text-align:center;padding:16px 0">No locators for this framework</p>`;
  }

  show("sel-locators-section");
}

// Extract the raw selector value from generated code (for test-locator)
function extractRawSelector(code) {
  // Playwright: page.locator('...') or page.locator('xpath=...')
  const pwLocator = code.match(/page\.locator\(['"]xpath=(.+?)['"]\)/);
  if (pwLocator) return pwLocator[1];
  const pwCss = code.match(/page\.locator\(['"](.+?)['"]\)/);
  if (pwCss) return pwCss[1];
  // Selenium By.XPATH / By.xpath
  const xp = code.match(/By\.[Xx][Pp]ath[,(]["'](.+?)["']\)/);
  if (xp) return xp[1];
  // Selenium By.CSS_SELECTOR / By.cssSelector
  const css = code.match(/By\.(?:CSS_SELECTOR|cssSelector)[,(]["'](.+?)["']\)/);
  if (css) return css[1];
  // Selenium By.ID / By.id
  const id = code.match(/By\.(?:ID|id)[,(]["'](.+?)["']\)/);
  if (id) return `#${id[1]}`;
  return null;
}

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── CART ─────────────────────────────────────────────────────────────────────

function addToCart(item) {
  if (state.selCart.find(c => c.code === item.code)) {
    showToast("Already in cart", "info");
    return;
  }
  const count = state.selCart.filter(c => c.tag === item.tag).length;
  item.name = item.tag + (count > 0 ? count + 1 : "");
  state.selCart.push(item);
  updateCartBadge();
  showToast(`Added to cart (${state.selCart.length})`, "success");
}

function updateCartBadge() {
  const count = state.selCart.length;
  document.getElementById("sel-cart-count").textContent = count;
  document.getElementById("sel-cart-bar").classList.toggle("hidden", count === 0);
}

function openCartModal() {
  const container = document.getElementById("sel-pom-elements");
  container.innerHTML = "";
  if (state.selCart.length === 0) {
    container.innerHTML = `<p style="font-size:11px;color:var(--text-muted);text-align:center;padding:16px 0">Cart is empty — click ＋ on a locator to add it</p>`;
  } else {
    state.selCart.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "sel-pom-element-item";
      row.innerHTML = `
        <span class="sel-pom-el-tag">&lt;${item.tag}&gt;</span>
        <input class="sel-pom-el-name" value="${item.name}" placeholder="elementName" data-idx="${i}" />
        <button class="sel-pom-el-remove" data-idx="${i}">✕</button>
      `;
      row.querySelector(".sel-pom-el-name").addEventListener("input", (e) => {
        state.selCart[i].name = e.target.value;
      });
      row.querySelector(".sel-pom-el-remove").addEventListener("click", () => {
        state.selCart.splice(i, 1);
        updateCartBadge();
        openCartModal();
      });
      container.appendChild(row);
    });
  }
  hide("sel-pom-output-wrap");
  hide("sel-pom-copy");
  show("sel-pom-overlay");
}

function clearCart() {
  state.selCart = [];
  updateCartBadge();
  hide("sel-pom-overlay");
}

function generatePOM() {
  if (state.selCart.length === 0) return;
  const className = document.getElementById("sel-pom-name").value.trim() || "MyPage";
  const fw = state.selActiveFw;
  const lang = state.selLang;
  let code = "";

  if (fw === "playwright") {
    code = generatePlaywrightPOM(className);
  } else if (fw === "cypress") {
    code = generateCypressPOM(className);
  } else if (fw === "webdriverio") {
    code = generateWDIOPOM(className);
  } else if (lang === "java") {
    code = generateSeleniumJavaPOM(className);
  } else {
    code = generateSeleniumPythonPOM(className);
  }

  document.getElementById("sel-pom-output").textContent = code;
  show("sel-pom-output-wrap");
  show("sel-pom-copy");
}

function generateSeleniumPythonPOM(className) {
  const imports = "from selenium.webdriver.common.by import By\n\n";
  const props = state.selCart.map(item => {
    return `    @property\n    def ${toSnakeCase(item.name)}(self):\n        return self.driver.find_element(${extractByArgs(item.code)})`;
  }).join("\n\n");
  return `${imports}class ${className}:\n    def __init__(self, driver):\n        self.driver = driver\n\n${props}\n`;
}

function generateSeleniumJavaPOM(className) {
  const imports = "import org.openqa.selenium.By;\nimport org.openqa.selenium.WebDriver;\nimport org.openqa.selenium.WebElement;\n\n";
  const props = state.selCart.map(item => {
    return `    public WebElement get${toPascalCase(item.name)}() {\n        return driver.findElement(${extractByArgsJava(item.code)});\n    }`;
  }).join("\n\n");
  return `${imports}public class ${className} {\n    private WebDriver driver;\n\n    public ${className}(WebDriver driver) {\n        this.driver = driver;\n    }\n\n${props}\n}`;
}

function generatePlaywrightPOM(className) {
  const props = state.selCart.map(item => {
    return `    get ${toCamelCase(item.name)}() {\n        return ${item.code};\n    }`;
  }).join("\n\n");
  return `import { Page } from '@playwright/test';\n\nexport class ${className} {\n    constructor(private page: Page) {}\n\n${props}\n}`;
}

function generateCypressPOM(className) {
  const props = state.selCart.map(item => {
    return `    get ${toCamelCase(item.name)}() {\n        return ${item.code};\n    }`;
  }).join("\n\n");
  return `export class ${className} {\n${props}\n}`;
}

function generateWDIOPOM(className) {
  const props = state.selCart.map(item => {
    return `    get ${toCamelCase(item.name)}() {\n        return ${item.code};\n    }`;
  }).join("\n\n");
  return `export class ${className} {\n${props}\n}`;
}

async function copyPOM() {
  const code = document.getElementById("sel-pom-output").textContent;
  try {
    await navigator.clipboard.writeText(code);
    const btn = document.getElementById("sel-pom-copy");
    btn.textContent = "✓ Copied!";
    setTimeout(() => { btn.textContent = "⎘ Copy"; }, 1500);
  } catch (_) { showToast("Copy failed", "error"); }
}

// ─── POM helpers ──────────────────────────────────────────────────────────────

function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_/, '');
}
function toCamelCase(str) {
  return str.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/^[A-Z]/, c => c.toLowerCase());
}
function toPascalCase(str) {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}
function extractByArgs(code) {
  const m = code.match(/find_element\((.+?)\)$/);
  return m ? m[1] : `By.CSS_SELECTOR, "${code}"`;
}
function extractByArgsJava(code) {
  const m = code.match(/findElement\((.+?)\)$/);
  return m ? m[1] : `By.cssSelector("${code}")`;
}

async function runTestLocator() {
  const input = document.getElementById("sel-test-input");
  const resultEl = document.getElementById("sel-test-result");
  const selector = input.value.trim();
  if (!selector) return;

  const selectorType = (selector.startsWith("//") || selector.startsWith("(//")) ? "xpath" : "css";
  const res = await sendToBackground({ type: "TEST_LOCATOR", selector, selectorType });

  resultEl.className = "sel-test-result";
  resultEl.classList.remove("hidden");
  if (!res || !res.success) {
    resultEl.classList.add("error");
    resultEl.textContent = `Error: ${res?.error || "Unknown error"}`;
  } else if (res.count === 0) {
    resultEl.classList.add("no-match");
    resultEl.textContent = "No elements matched";
  } else {
    resultEl.classList.add("match");
    resultEl.textContent = `${res.count} element${res.count > 1 ? "s" : ""} matched`;
  }
}

function clearTestLocator() {
  document.getElementById("sel-test-input").value = "";
  hide("sel-test-result");
  sendToBackground({ type: "CLEAR_HIGHLIGHTS" });
}

// ─── GENERATE SCRIPT ─────────────────────────────────────────────────────────

async function generateScript() {
  if (!await ensureFeatureAccess(FeatureAccess.CONNECTED_WITH_PROJECT, {
    title: "Connect QA Deck before generating scripts",
    feature: "Script generation",
    trigger: "generate_scripts",
  })) {
    return;
  }

  if (hasJourneyScopedCases()) {
    return generateJourneyScript();
  }

  const approved = getApprovedCasesForSelectedPack();
  if (approved.length === 0) {
    showToast(`Approve at least one ${SCRIPT_PACK_LABELS[state.selectedScriptPack] || "selected"} case first`, "error");
    switchTab("testcases");
    return;
  }

  if (!state.apiKey) {
    showToast("API key required", "error");
    return;
  }

  show("script-generating");
  hide("script-empty");
  hide("script-content");

  const result = await sendToBackground({
    type: "GENERATE_SCRIPT",
    testCases: approved,
    pageData: state.currentPageData,
    framework: state.selectedFramework,
    format: state.selectedFormat,
    customAssertions: state.customAssertions,
    networkCalls: state.networkLog.filter((n) => n.selected),
    visualTesting: state.visualTesting,
    perfAssertions: state.perfAssertions,
    environments: state.multiEnv ? state.environments : [],
    datasetsMap: Object.fromEntries(
      state.testCases
        .filter(tc => tc.datasets?.length > 0)
        .map(tc => [tc.id, tc.datasets])
    ),
    apiKey: state.apiKey,
  });

  hide("script-generating");

  if (!result?.success) {
    show("script-empty");
    showToast(result?.error || "Script generation failed", "error");
    return;
  }

  state.scripts = { ...result.scripts, __group: state.selectedScriptPack };
  state.selectedFile = state.selectedFormat === "bdd" ? "feature" : "base";
  state.activeArtifactMode = "page";
  syncScriptPackSelect();

  show("script-content");
  renderFileList();
  renderCurrentFile();
  document.getElementById("script-badge").classList.remove("hidden");
  await persistCurrentProjectVersion("generate_scripts", { notify: false });
  showToast(`${SCRIPT_PACK_LABELS[state.selectedScriptPack] || "Script"} generated!`, "success");
  if (window.qadeckAuth) window.qadeckAuth.logTests(state.testCases.length || 1);
}

async function generateJourneyScript() {
  if (!await ensureFeatureAccess(FeatureAccess.CONNECTED_WITH_PROJECT, {
    title: "Connect QA Deck before generating scripts",
    feature: "Journey script generation",
    trigger: "generate_scripts",
  })) {
    return;
  }

  const approved = getApprovedCasesForSelectedPack();
  if (approved.length === 0) {
    showToast(`Approve at least one ${SCRIPT_PACK_LABELS[state.selectedScriptPack] || "selected"} case first`, "error");
    switchTab("testcases");
    return;
  }

  if (!state.apiKey) {
    showToast("API key required", "error");
    return;
  }

  show("script-generating");
  hide("script-empty");
  hide("script-content");

  const payload = buildJourneyProjectPayload();
  const result = await sendToBackground({
    type: "GENERATE_JOURNEY_SCRIPT",
    journey: payload,
    testCases: approved,
    framework: state.selectedFramework,
    apiKey: state.apiKey,
  });

  hide("script-generating");

  if (!result?.success) {
    show("script-empty");
    showToast(result?.error || "Journey script generation failed", "error");
    return;
  }

  state.activeArtifactMode = "journey";
  state.scripts = { ...result.bundle, selectedPack: state.selectedScriptPack };
  state.selectedFile = result.bundle?.files?.[0]?.filename || null;
  state.journey.generated = {
    ...state.journey.generated,
    testCases: state.testCases,
    scripts: state.scripts,
    lastGeneratedAt: new Date().toISOString(),
  };

  show("script-content");
  renderFileList();
  renderCurrentFile();
  document.getElementById("script-badge").classList.remove("hidden");
  syncScriptPackSelect();
  queueJourneyDraftSave();
  await persistCurrentProjectVersion("generate_scripts", { notify: false });

  const missing = result.bundle?.summary?.missingTransitions?.length || 0;
  showToast(
    missing
      ? `Generated ${SCRIPT_PACK_LABELS[state.selectedScriptPack] || "journey"} step scripts. ${missing} transition${missing > 1 ? "s are" : " is"} still missing for the full journey suite.`
      : `${SCRIPT_PACK_LABELS[state.selectedScriptPack] || "Journey"} scripts generated!`,
    missing ? "info" : "success"
  );
}

function isJourneyBundle() {
  return state.activeArtifactMode === "journey" && Array.isArray(state.scripts?.files);
}

function isBDDBundle() {
  return state.selectedFormat === "bdd" && !!state.scripts?.feature;
}

function getActiveScriptFiles() {
  if (isJourneyBundle()) {
    return (state.scripts.files || []).map((file) => ({
      key: file.filename,
      filename: file.filename,
      content: file.content,
      group: file.group,
      stepId: file.stepId || null,
    }));
  }

  if (isBDDBundle()) {
    return BDD_FILE_ORDER
      .map((key) => {
        const file = state.scripts?.[key];
        if (!file) return null;
        return { key, filename: file.filename, content: file.content, group: "bdd" };
      })
      .filter(Boolean);
  }

  return FILE_ORDER
    .map((key) => {
      const file = state.scripts?.[key];
      if (!file) return null;
      return { key, filename: file.filename, content: file.content, group: "page" };
    })
    .filter(Boolean);
}

function renderFileList() {
  const container = document.getElementById("file-tabs");
  container.innerHTML = "";

  getActiveScriptFiles().forEach((file) => {
    const btn = document.createElement("button");
    btn.className = "file-tab" + (state.selectedFile === file.key ? " active" : "");
    const label = isJourneyBundle() ? file.filename.split("/").pop() : isBDDBundle() ? file.filename : file.filename;
    btn.textContent = label;
    btn.title = isBDDBundle() ? `BDD: ${file.filename}` : isJourneyBundle() ? `${file.group}: ${file.filename}` : file.filename;
    btn.addEventListener("click", () => {
      state.selectedFile = file.key;
      renderFileList();
      renderCurrentFile();
    });
    container.appendChild(btn);
  });
}

function renderCurrentFile() {
  const file = getActiveScriptFiles().find((entry) => entry.key === state.selectedFile) || getActiveScriptFiles()[0];
  if (!file) return;
  state.selectedFile = file.key;
  document.getElementById("code-filename").textContent = file.filename;
  document.getElementById("code-pre").textContent = file.content;
}

async function copyCurrentFile() {
  const file = getActiveScriptFiles().find((entry) => entry.key === state.selectedFile);
  if (!file) return;
  try {
    await navigator.clipboard.writeText(file.content);
    const btn = document.getElementById("copy-btn");
    btn.textContent = "Copied!";
    setTimeout(() => (btn.textContent = "Copy"), 1500);
  } catch {
    showToast("Copy failed — try selecting text manually", "error");
  }
}

async function downloadZip() {
  if (!state.scripts) return;

  const isJourney = isJourneyBundle();
  const pageType = isJourney ? "journey" : (state.currentPageData?.meta?.pageType || "page");
  const projectName = `qa_deck_${pageType}_${Date.now()}`;

  try {
    if (!window.JSZip) throw new Error("JSZip not available");
    const zip = new window.JSZip();

    // Build proper project folder structure
    const framework = state.selectedFramework;
    const isJava    = framework.includes("java");
    const isPwTs    = framework === "playwright-typescript";
    const isPwPy    = framework === "playwright-python";

    if (isJourney) {
      state.scripts.files.forEach((file) => {
        zip.file(file.filename, file.content);
      });
    } else if (isBDDBundle()) {
      // BDD/Gherkin folder structure
      const fw = state.selectedFramework;
      const feature = state.scripts.feature;
      const steps = state.scripts.steps;
      const hooks = state.scripts.hooks;
      const testData = state.scripts.testData;

      if (fw === "selenium-python") {
        // Behave layout
        if (feature) zip.file(`features/${feature.filename}`, feature.content);
        if (steps)   zip.file(`features/steps/${steps.filename}`, steps.content);
        if (hooks)   zip.file(`features/environment.py`, hooks.content);
        if (testData) zip.file(testData.filename, testData.content);
      } else if (fw === "selenium-java") {
        // Cucumber-JVM layout
        if (feature) zip.file(`src/test/resources/features/${feature.filename}`, feature.content);
        if (steps)   zip.file(`src/test/java/steps/${steps.filename}`, steps.content);
        if (hooks)   zip.file(`src/test/java/hooks/Hooks.java`, hooks.content);
        if (testData) zip.file(`src/test/java/data/${testData.filename}`, testData.content);
      } else if (fw === "playwright-python") {
        // pytest-bdd layout
        if (feature) zip.file(`features/${feature.filename}`, feature.content);
        if (steps)   zip.file(`tests/${steps.filename}`, steps.content);
        if (hooks)   zip.file(`conftest.py`, hooks.content);
        if (testData) zip.file(testData.filename, testData.content);
      } else if (fw === "playwright-typescript") {
        // @cucumber/cucumber layout
        if (feature) zip.file(`features/${feature.filename}`, feature.content);
        if (steps)   zip.file(`step-definitions/${steps.filename}`, steps.content);
        if (hooks)   zip.file(`hooks.ts`, hooks.content);
        if (testData) zip.file(testData.filename, testData.content);
      }
    } else {
      // Root config file
      const config = state.scripts.config;
      if (config) zip.file(config.filename, config.content);

      // Base class
      const base = state.scripts.base;
      if (base) zip.file(base.filename, base.content);

      // Test data
      const testData = state.scripts.testData;
      if (testData) zip.file(testData.filename, testData.content);

      // Pages folder
      const pom = state.scripts.pageObject;
      if (pom) zip.file(`pages/${pom.filename}`, pom.content);

      // Tests folder
      const tests = state.scripts.tests;
      if (tests) zip.file(`tests/${tests.filename}`, tests.content);

      // Accessibility tests (6th file, if present)
      const accessibility = state.scripts.accessibility;
      if (accessibility) zip.file(`tests/${accessibility.filename}`, accessibility.content);

      // Performance assertion tests (opt-in)
      const perfTest = state.scripts.perfTest;
      if (perfTest) zip.file(`tests/${perfTest.filename}`, perfTest.content);

      // Visual regression tests (opt-in)
      const visualTest = state.scripts.visualTest;
      if (visualTest) zip.file(`tests/${visualTest.filename}`, visualTest.content);

      // Multi-environment config files (opt-in)
      const envConfigs = state.scripts.envConfigs;
      if (envConfigs?.configs?.length > 0) {
        envConfigs.configs.forEach(cfg => zip.file(`config/${cfg.filename}`, cfg.content));
        if (envConfigs.readme) zip.file("ENV_SETUP.md", envConfigs.readme);
      }
    }

    // Add README
    const readme = buildProjectReadme(framework, pageType, state.testCases.filter(t => t.approved).length);
    zip.file("README.md", readme);

    if (isBDDBundle()) {
      // BDD-specific dependency files
      if (framework === "selenium-python") {
        zip.file("requirements.txt", "behave\nselenium\nwebdriver-manager\n");
      } else if (framework === "playwright-python") {
        zip.file("requirements.txt", "pytest-bdd\nplaywright\npytest-playwright\npytest\n");
      } else if (framework === "playwright-typescript") {
        zip.file("package.json", JSON.stringify({ name: pageType + "-bdd-tests", version: "1.0.0", scripts: { test: "cucumber-js" }, dependencies: { "@cucumber/cucumber": "^10.0.0", playwright: "^1.40.0", typescript: "^5.0.0" } }, null, 2));
        zip.file("cucumber.config.ts", `export default { paths: ["features/**/*.feature"], require: ["step-definitions/**/*.ts", "hooks.ts"], format: ["progress-bar", "html:reports/report.html"] };\n`);
      }
    } else {
      // Add requirements file if Python (POM mode)
      if (!isJava) {
        if (isPwTs) {
          zip.file("package.json", buildPackageJson(framework, pageType));
        } else {
          zip.file("requirements.txt", buildRequirements(framework, !!state.scripts.accessibility, !!state.scripts.visualTest));
        }
      }

      // conftest.py — root level (sys.path + driver fixture for accessibility tests)
      // Also add tests/conftest.py so pytest finds the driver fixture from tests/ directory
      if (!isJava && !isPwTs && !isJourney) {
        const conftest = buildConftest();
        zip.file("conftest.py", conftest);
        zip.file("tests/conftest.py", conftest);  // duplicate so pytest finds it from tests/ too
      }
    }

    // Bundle CI/CD configs if already generated
    if (cicdGeneratedConfigs) {
      Object.values(cicdGeneratedConfigs).forEach(({ filename, content }) => {
        zip.file(filename, content);
      });
    }

    // Generate and download
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Downloaded ${projectName}.zip`, "success");
    if (window.qadeckAuth) window.qadeckAuth.logDownload();

  } catch (err) {
    console.error("ZIP error:", err);
    // Fallback: plain text download
    fallbackTextDownload();
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function buildProjectReadme(framework, pageType, tcCount) {
  const isJava   = framework.includes("java");
  const isPwTs   = framework === "playwright-typescript";
  const isPwPy   = framework === "playwright-python";
  const isSelPy  = framework === "selenium-python";

  const prereqs = isJava ? `- Java 11+
- Maven 3.8+
- Chrome browser installed` : isPwTs ? `- Node.js 18+
- npm 9+
- Chrome / Firefox / Safari (Playwright installs its own browsers)` : `- Python 3.9+
- pip
- Chrome browser installed
- ChromeDriver (auto-managed via webdriver-manager)`;

  const structure = isJava ? `\`\`\`
├── src/
│   ├── main/java/pages/
│   │   └── ${pageType.charAt(0).toUpperCase()+pageType.slice(1)}Page.java   # Page Object Model
│   └── test/java/tests/
│       ├── BaseTest.java                                 # Browser setup & teardown
│       └── Test${pageType.charAt(0).toUpperCase()+pageType.slice(1)}.java   # Test methods
├── test_data.json                                        # Test input data
├── testng.xml                                            # TestNG suite config
└── pom.xml                                               # Maven dependencies
\`\`\`` : isPwTs ? `\`\`\`
├── pages/
│   └── ${pageType}Page.ts     # Page Object Model — locators & actions
├── tests/
│   └── test_${pageType}.spec.ts   # Playwright test file
├── test_data.ts               # Test input data
├── playwright.config.ts       # Playwright configuration
├── package.json               # Node dependencies
└── README.md                  # This file
\`\`\`` : `\`\`\`
├── pages/
│   └── ${pageType}_page.py    # Page Object Model — locators & actions
├── tests/
│   ├── test_${pageType}.py    # Main test file
│   └── test_accessibility_${pageType}.py   # Accessibility tests (axe-core)
├── base_test.py               # Base class — browser setup & teardown
├── test_data.py               # Test input data / parameters
├── conftest.py                # pytest path config (auto-generated)
├── pytest.ini                 # pytest configuration
├── requirements.txt           # Python dependencies
└── README.md                  # This file
\`\`\``;

  const setup = isJava ? `### 1. Install dependencies
\`\`\`bash
mvn clean install -DskipTests
\`\`\`

### 2. Run all tests
\`\`\`bash
mvn test
\`\`\`

### 3. Run a specific test class
\`\`\`bash
mvn test -Dtest=Test${pageType.charAt(0).toUpperCase()+pageType.slice(1)}
\`\`\`

### 4. Run via TestNG XML
\`\`\`bash
mvn test -DsuiteXmlFile=testng.xml
\`\`\`

### 5. Run in your IDE
Open the project in IntelliJ IDEA or Eclipse, right-click \`testng.xml\` → Run.` :

  isPwTs ? `### 1. Install dependencies
\`\`\`bash
npm install
\`\`\`

### 2. Install browsers
\`\`\`bash
npx playwright install
\`\`\`

### 3. Run all tests
\`\`\`bash
npx playwright test
\`\`\`

### 4. Run with UI mode (recommended for debugging)
\`\`\`bash
npx playwright test --ui
\`\`\`

### 5. Run a specific test file
\`\`\`bash
npx playwright test tests/test_${pageType}.spec.ts
\`\`\`

### 6. Run in headed mode (see the browser)
\`\`\`bash
npx playwright test --headed
\`\`\`

### 7. Show HTML report
\`\`\`bash
npx playwright show-report
\`\`\`` :

  isPwPy ? `### 1. Create virtual environment (recommended)
\`\`\`bash
python3 -m venv venv
source venv/bin/activate        # macOS / Linux
venv\\Scripts\\activate           # Windows
\`\`\`

### 2. Install dependencies
\`\`\`bash
pip install -r requirements.txt
\`\`\`

### 3. Install Playwright browsers
\`\`\`bash
playwright install
\`\`\`

### 4. Run all tests
\`\`\`bash
pytest tests/ -v
\`\`\`

### 5. Run a specific test file
\`\`\`bash
pytest tests/test_${pageType}.py -v
\`\`\`

### 6. Run in headed mode (see the browser)
\`\`\`bash
pytest tests/ -v --headed
\`\`\`

### 7. Run with HTML report
\`\`\`bash
pytest tests/ -v --html=report.html --self-contained-html
\`\`\`` :

  /* selenium-python */ `### 1. Create virtual environment (recommended)
\`\`\`bash
python3 -m venv venv
source venv/bin/activate        # macOS / Linux
venv\\Scripts\\activate           # Windows
\`\`\`

### 2. Install dependencies
\`\`\`bash
pip install -r requirements.txt
\`\`\`

### 3. Run all tests
\`\`\`bash
pytest tests/ -v
\`\`\`

### 4. Run a specific test file
\`\`\`bash
pytest tests/test_${pageType}.py -v
\`\`\`

### 5. Run a specific test by name
\`\`\`bash
pytest tests/test_${pageType}.py -v -k "test_login"
\`\`\`

### 6. Run in parallel (faster)
\`\`\`bash
pip install pytest-xdist
pytest tests/ -v -n auto
\`\`\`

### 7. Run with HTML report
\`\`\`bash
pytest tests/ -v --html=report.html --self-contained-html
\`\`\`

### 8. Run accessibility tests only
\`\`\`bash
pytest tests/test_accessibility_${pageType}.py -v
\`\`\``;

  const troubleshoot = isJava ? `## Troubleshooting

| Problem | Fix |
|---------|-----|
| \`ChromeDriver version mismatch\` | Update Chrome or pin driver version in \`pom.xml\` |
| \`Tests not found\` | Check \`testng.xml\` class paths match your package |
| \`BUILD FAILURE\` | Run \`mvn clean\` then retry |` :

  isPwTs ? `## Troubleshooting

| Problem | Fix |
|---------|-----|
| \`Cannot find module\` | Run \`npm install\` first |
| \`Browser not found\` | Run \`npx playwright install\` |
| \`Timeout errors\` | Increase \`timeout\` in \`playwright.config.ts\` |
| \`Test is flaky\` | Add \`await page.waitForLoadState('networkidle')\` |` :

  `## Troubleshooting

| Problem | Fix |
|---------|-----|
| \`ModuleNotFoundError: form_page\` | Ensure \`conftest.py\` exists in project root (auto-included) |
| \`ModuleNotFoundError: axe_selenium_python\` | Run \`pip install axe-selenium-python\` |
| \`ChromeDriver version mismatch\` | webdriver-manager handles this automatically |
| \`SessionNotCreatedException\` | Update Chrome to latest version |
| \`No module named selenium\` | Activate venv and run \`pip install -r requirements.txt\` |
| Tests not collected | Make sure test functions start with \`test_\` |`;

  return `# QA Deck — Generated Test Suite

> Auto-generated by **QA Deck** Chrome Extension
> 📅 ${new Date().toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}
> 🧪 **${tcCount} test cases** | 📦 **${framework}** | 📄 Page: **${pageType}**

---

## Prerequisites

${prereqs}

---

## Project Structure

${structure}

---

## Setup & Run

${setup}

---

${troubleshoot}

---

## Configuration

${isJava ? `Edit \`testng.xml\` to control which tests run.
Update the base URL inside \`BaseTest.java\`.` :
  isPwTs ? `Edit \`playwright.config.ts\` to change:
- \`baseURL\` — your app URL
- \`timeout\` — test timeout (default 30s)
- \`retries\` — auto-retry flaky tests
- \`workers\` — parallel test workers` :
  `Edit \`pytest.ini\` to configure pytest options.
Edit \`test_data.py\` to update test input values.
Edit \`base_test.py\` to change the base URL or browser options.`}

---

*Generated by [QA Deck](https://qadeck.com) • Powered by Claude AI*
`;
}

function buildRequirements(framework, includeAccessibility = false, includeVisual = false) {
  const a11y = includeAccessibility ? `axe-selenium-python>=2.1.6\n` : "";
  const visual = includeVisual ? `pytest-image-snapshot\npillow\n` : "";
  if (framework === "playwright-python") {
    const pw_a11y = includeAccessibility ? "axe-playwright-python>=0.1.1\n" : "";
    const pw_vis = includeVisual ? "syrupy\n" : "";
    return `pytest>=7.4.3\npytest-playwright>=0.4.3\nplaywright>=1.40.0\n${pw_a11y}${pw_vis}`;
  }
  // selenium>=4.18 includes Selenium Manager (built-in chromedriver download).
  // No webdriver-manager needed — avoids the THIRD_PARTY_NOTICES.chromedriver bug.
  return `selenium>=4.18.0\npytest>=7.4.3\n${a11y}${visual}`;
}

function buildConftest() {
  return `import sys
import os
import pytest

# Make the pages/ directory importable so pytest can find page object classes
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "pages"))


# ── Shared driver fixture for accessibility tests ─────────────────────────────
# Standalone test functions (e.g. test_accessibility_*.py) use this fixture.
# Class-based tests (TestXxx) manage their own driver via setup_method / teardown_method.

@pytest.fixture(scope="function")
def driver():
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    options = Options()
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    # Selenium 4.6+ includes Selenium Manager — no chromedriver download needed.
    drv = webdriver.Chrome(options=options)
    drv.maximize_window()
    yield drv
    drv.quit()
`;
}

function buildPackageJson(framework, pageType) {
  return JSON.stringify({
    name: `qa-deck-${pageType}`,
    version: "1.0.0",
    scripts: { test: "playwright test", "test:headed": "playwright test --headed" },
    devDependencies: { "@playwright/test": "^1.40.0" },
  }, null, 2);
}

function fallbackTextDownload() {
  const allContent = getActiveScriptFiles()
    .map((file) => `${"=".repeat(60)}\n// FILE: ${file.filename}\n${"=".repeat(60)}\n\n${file.content}`)
    .join("\n\n\n");

  const blob = new Blob([allContent], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "qa_deck_scripts.txt";
  a.click();
  URL.revokeObjectURL(url);
  showToast("Downloaded as text file (JSZip unavailable)", "info");
}

async function saveCurrentProject() {
  await persistCurrentProjectVersion("manual_save", { notify: true, requireProject: true });
}

// ─── Messaging ────────────────────────────────────────────────────────────────

// ─── DATA-DRIVEN INPUT MANAGER ────────────────────────────────────────────────

let datasetTCIdx = null;
let datasetColumns = [];

function openDatasetModal(idx) {
  datasetTCIdx = idx;
  const tc = state.testCases[idx];
  if (!tc) return;

  // Init columns from testData keys or defaults
  const existingKeys = tc.datasets?.length > 0
    ? Object.keys(tc.datasets[0])
    : Object.keys(tc.testData || {}).slice(0, 3);
  datasetColumns = existingKeys.length > 0 ? [...existingKeys] : ["value"];

  const titleEl = document.getElementById("dataset-tc-title");
  if (titleEl) titleEl.textContent = tc.id + ": " + (tc.title || "").slice(0, 40);

  renderDatasetTable(tc.datasets || []);
  document.getElementById("dataset-modal").classList.remove("hidden");
}

function renderDatasetTable(rows) {
  const table = document.getElementById("dataset-table");
  if (!table) return;

  const headerRow = `<tr style="background:rgba(0,0,0,.04)">${datasetColumns.map((col, ci) =>
    `<th style="padding:5px 8px;text-align:left;font-size:9px;font-family:var(--mono);color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--border);border-right:1px solid var(--border-light);white-space:nowrap">
      <input class="ds-col-header" data-ci="${ci}" value="${col}" style="background:none;border:none;outline:none;font:inherit;color:inherit;cursor:text;width:80px"/>
      <button onclick="removeDatasetColumn(${ci})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:10px;padding:0 2px;opacity:.5">×</button>
    </th>`
  ).join("")}<th style="width:30px;border-bottom:1px solid var(--border)"></th></tr>`;

  const dataRows = rows.map((row, ri) =>
    `<tr>${datasetColumns.map(col =>
      `<td style="padding:4px;border-bottom:1px solid var(--border-light);border-right:1px solid var(--border-light)">
        <input class="bug-input ds-cell" data-row="${ri}" data-col="${col}" value="${(row[col] || "").replace(/"/g, "&quot;")}" style="padding:4px 6px;font-size:11px"/>
      </td>`
    ).join("")}
    <td style="padding:4px;border-bottom:1px solid var(--border-light)">
      <button onclick="removeDatasetRow(${ri})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:13px;padding:0 4px">×</button>
    </td></tr>`
  ).join("");

  table.innerHTML = `<thead>${headerRow}</thead><tbody>${dataRows}</tbody>`;
}

function addDatasetRow() {
  const rows = readDatasetRows();
  const empty = {};
  datasetColumns.forEach(c => { empty[c] = ""; });
  rows.push(empty);
  renderDatasetTable(rows);
}

function addDatasetColumn() {
  const name = prompt("New column name (key):", "value" + (datasetColumns.length + 1));
  if (!name) return;
  datasetColumns.push(name);
  const rows = readDatasetRows();
  rows.forEach(r => { r[name] = ""; });
  renderDatasetTable(rows);
}

function removeDatasetColumn(ci) {
  const col = datasetColumns[ci];
  datasetColumns.splice(ci, 1);
  const rows = readDatasetRows().map(r => { delete r[col]; return r; });
  renderDatasetTable(rows);
}

function removeDatasetRow(ri) {
  const rows = readDatasetRows();
  rows.splice(ri, 1);
  renderDatasetTable(rows);
}

function readDatasetRows() {
  // Sync column headers first
  document.querySelectorAll(".ds-col-header").forEach(input => {
    const ci = parseInt(input.dataset.ci);
    if (ci >= 0 && ci < datasetColumns.length) datasetColumns[ci] = input.value.trim() || datasetColumns[ci];
  });
  const rows = [];
  const cells = document.querySelectorAll(".ds-cell");
  const rowMap = {};
  cells.forEach(cell => {
    const ri = parseInt(cell.dataset.row);
    if (!rowMap[ri]) rowMap[ri] = {};
    rowMap[ri][cell.dataset.col] = cell.value;
  });
  Object.keys(rowMap).sort((a, b) => a - b).forEach(ri => rows.push(rowMap[ri]));
  return rows;
}

function saveDatasets() {
  if (datasetTCIdx === null) return;
  const rows = readDatasetRows();
  // Re-key with current column names
  const rekeyed = rows.map(row => {
    const out = {};
    datasetColumns.forEach((col, ci) => { out[col] = row[datasetColumns[ci]] || row[Object.keys(row)[ci]] || ""; });
    return out;
  });
  state.testCases[datasetTCIdx].datasets = rekeyed.filter(r => Object.values(r).some(v => v.trim()));
  document.getElementById("dataset-modal").classList.add("hidden");
  renderTCList();
  const count = state.testCases[datasetTCIdx]?.datasets?.length || 0;
  showToast(`${count} dataset row${count !== 1 ? "s" : ""} saved`, "success");
}

// ─── REUSABLE STEP FRAGMENTS ──────────────────────────────────────────────────

async function saveStepFragment(index) {
  const step = state.journey.steps[index];
  if (!step) return;
  const name = prompt(`Fragment name:`, step.title || `Step ${step.order}`);
  if (!name) return;
  const stored = await chrome.storage.local.get(["stepFragments"]);
  const fragments = stored.stepFragments || [];
  const fragment = { id: crypto.randomUUID(), name, step: { ...step }, savedAt: new Date().toISOString() };
  fragments.push(fragment);
  await chrome.storage.local.set({ stepFragments: fragments });
  showToast(`Fragment "${name}" saved!`, "success");
}

async function loadFragments() {
  const stored = await chrome.storage.local.get(["stepFragments"]);
  return stored.stepFragments || [];
}

async function deleteFragment(id) {
  const stored = await chrome.storage.local.get(["stepFragments"]);
  const fragments = (stored.stepFragments || []).filter(f => f.id !== id);
  await chrome.storage.local.set({ stepFragments: fragments });
  renderFragmentLibrary();
}

async function insertFragment(id) {
  const fragments = await loadFragments();
  const fragment = fragments.find(f => f.id === id);
  if (!fragment) return;
  const step = {
    ...fragment.step,
    id: crypto.randomUUID(),
    order: state.journey.steps.length + 1,
    source: "fragment",
  };
  state.journey.steps.push(step);
  renumberJourneySteps();
  renderJourneyTab();
  showToast(`Fragment "${fragment.name}" inserted`, "success");
}

async function toggleFragmentLibrary() {
  const panel = document.getElementById("fragment-library");
  if (!panel) return;
  const isHidden = panel.classList.toggle("hidden");
  if (!isHidden) await renderFragmentLibrary();
}

async function renderFragmentLibrary() {
  const list = document.getElementById("fragment-list");
  if (!list) return;
  const fragments = await loadFragments();
  if (fragments.length === 0) {
    list.innerHTML = `<div style="font-size:10px;color:var(--text-muted);text-align:center;padding:8px 0">No fragments saved yet.<br>Click 💾 on any journey step to save it.</div>`;
    return;
  }
  list.innerHTML = fragments.map(f => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:4px">
      <div>
        <div style="font-size:11px;color:var(--text-primary);font-weight:500">${f.name}</div>
        <div style="font-size:9px;color:var(--text-muted);font-family:var(--mono)">${f.step.url || f.step.pageType || "step"}</div>
      </div>
      <div style="display:flex;gap:5px">
        <button onclick="insertFragment('${f.id}')" style="font-size:9px;padding:2px 7px;border-radius:3px;border:1px solid rgba(29,158,117,.4);background:rgba(29,158,117,.1);color:#1D9E75;cursor:pointer">Insert</button>
        <button onclick="deleteFragment('${f.id}')" style="font-size:9px;padding:2px 6px;border-radius:3px;border:1px solid rgba(226,75,74,.3);background:rgba(226,75,74,.08);color:#E24B4A;cursor:pointer">✕</button>
      </div>
    </div>`
  ).join("");
}

// ─── MULTI-ENVIRONMENT CONFIG ─────────────────────────────────────────────────

function openEnvModal() {
  const modal = document.getElementById("env-modal");
  if (!modal) return;
  renderEnvList();
  if (state.environments.length === 0) addEnvRow();
  modal.classList.remove("hidden");
}

function closeEnvModal() {
  document.getElementById("env-modal")?.classList.add("hidden");
}

function addEnvRow(env = { name: "", baseUrl: "" }) {
  const list = document.getElementById("env-list");
  if (!list) return;
  const idx = list.children.length;
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px;align-items:center";
  row.innerHTML = `
    <input class="bug-input env-name" placeholder="Name (e.g. staging)" value="${env.name}" style="flex:0 0 100px"/>
    <input class="bug-input env-url" placeholder="Base URL" value="${env.baseUrl}" style="flex:1"/>
    <button onclick="this.closest('[style]').remove()" style="font-size:16px;background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0 4px;line-height:1">×</button>
  `;
  list.appendChild(row);
}

function renderEnvList() {
  const list = document.getElementById("env-list");
  if (!list) return;
  list.innerHTML = "";
  state.environments.forEach(env => addEnvRow(env));
}

function saveEnvironments() {
  const rows = document.querySelectorAll("#env-list > div");
  const envs = [];
  rows.forEach(row => {
    const name = row.querySelector(".env-name")?.value.trim();
    const baseUrl = row.querySelector(".env-url")?.value.trim();
    if (name) envs.push({ name, baseUrl });
  });
  state.environments = envs;
  closeEnvModal();
  if (envs.length > 0) {
    showToast(`${envs.length} environment${envs.length > 1 ? "s" : ""} saved`, "success");
  }
}

// ─── BUG REPORT ──────────────────────────────────────────────────────────────

async function openBugModal() {
  const modal = document.getElementById("bug-modal");
  modal.classList.remove("hidden");

  // Pre-fill URL
  const urlEl = document.getElementById("bug-url");
  if (urlEl && state.currentTabInfo?.url) urlEl.value = state.currentTabInfo.url;

  // Pre-fill title suggestion
  const titleEl = document.getElementById("bug-title");
  if (titleEl && !titleEl.value) {
    const page = state.currentPageData?.meta?.pageType || "page";
    titleEl.value = `[${page}] — `;
  }

  // Capture screenshot
  try {
    const [tab] = await new Promise((res) =>
      chrome.tabs.query({ active: true, currentWindow: true }, res)
    );
    if (tab?.id) {
      const dataUrl = await new Promise((res) =>
        chrome.tabs.captureVisibleTab(null, { format: "png" }, res)
      );
      if (dataUrl) {
        const preview = document.getElementById("bug-screenshot-preview");
        const row = document.getElementById("bug-screenshot-row");
        preview.src = dataUrl;
        preview.dataset.dataUrl = dataUrl;
        row.classList.remove("hidden");
      }
    }
  } catch (_) {}

  // Fill metadata
  const metaEl = document.getElementById("bug-meta");
  if (metaEl) {
    const ua = navigator.userAgent;
    const browser = ua.includes("Chrome/") ? "Chrome " + (ua.match(/Chrome\/([\d.]+)/)?.[1] || "") : "Unknown";
    metaEl.textContent = [
      `Browser: ${browser}`,
      `OS: ${navigator.platform}`,
      `Viewport: ${window.screen.width}×${window.screen.height}`,
      `Timestamp: ${new Date().toISOString()}`,
    ].join("  ·  ");
  }
}

function buildBugReportMarkdown() {
  const title = document.getElementById("bug-title")?.value?.trim() || "Untitled Bug";
  const severity = document.getElementById("bug-severity")?.value || "Medium";
  const url = document.getElementById("bug-url")?.value?.trim() || "";
  const steps = document.getElementById("bug-steps")?.value?.trim() || "";
  const expected = document.getElementById("bug-expected")?.value?.trim() || "";
  const actual = document.getElementById("bug-actual")?.value?.trim() || "";
  const meta = document.getElementById("bug-meta")?.textContent?.trim() || "";

  return `# Bug Report: ${title}

**Severity:** ${severity}
**URL:** ${url}
**Reported:** ${new Date().toISOString()}

## Environment
${meta}

## Steps to Reproduce
${steps || "_Not provided_"}

## Expected Result
${expected || "_Not provided_"}

## Actual Result
${actual || "_Not provided_"}

---
*Generated by QA Deck*`;
}

function buildBugReportJira() {
  const title = document.getElementById("bug-title")?.value?.trim() || "Untitled Bug";
  const severity = document.getElementById("bug-severity")?.value || "Medium";
  const url = document.getElementById("bug-url")?.value?.trim() || "";
  const steps = document.getElementById("bug-steps")?.value?.trim() || "";
  const expected = document.getElementById("bug-expected")?.value?.trim() || "";
  const actual = document.getElementById("bug-actual")?.value?.trim() || "";

  const priorityMap = { Critical: "Highest", High: "High", Medium: "Medium", Low: "Low" };
  return JSON.stringify({
    summary: title,
    issuetype: { name: "Bug" },
    priority: { name: priorityMap[severity] || "Medium" },
    description: `*URL:* ${url}\n\n*Steps to Reproduce:*\n${steps}\n\n*Expected:*\n${expected}\n\n*Actual:*\n${actual}`,
    labels: ["qa-deck", "automated-report"],
  }, null, 2);
}

async function copyBugReport(format) {
  try {
    const text = format === "jira" ? buildBugReportJira() : buildBugReportMarkdown();
    await navigator.clipboard.writeText(text);
    showToast(format === "jira" ? "Jira JSON copied!" : "Markdown copied!", "success");
  } catch (_) {
    showToast("Copy failed — try downloading instead", "error");
  }
}

function downloadBugReport() {
  const md = buildBugReportMarkdown();
  const title = (document.getElementById("bug-title")?.value || "bug-report").trim().replace(/\s+/g, "-").toLowerCase();
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Bug report downloaded!", "success");
}

function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message, type = "info") {
  const existing = document.getElementById("__toast__");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "__toast__";
  const colors = {
    success: { bg: "#E1F5EE", color: "#0F6E56", border: "#1D9E75" },
    error: { bg: "#FCEBEB", color: "#A32D2D", border: "#E24B4A" },
    info: { bg: "#E6F1FB", color: "#185FA5", border: "#378ADD" },
  };
  const c = colors[type] || colors.info;

  Object.assign(toast.style, {
    position: "fixed",
    bottom: "14px",
    left: "12px",
    right: "12px",
    padding: "9px 12px",
    borderRadius: "7px",
    fontSize: "12px",
    fontFamily: "inherit",
    background: c.bg,
    color: c.color,
    border: `0.5px solid ${c.border}`,
    zIndex: "9999",
    animation: "fadeIn 0.2s ease",
  });

  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function show(id) { document.getElementById(id)?.classList.remove("hidden"); }
function hide(id) { document.getElementById(id)?.classList.add("hidden"); }

// ─── RECORD TAB ───────────────────────────────────────────────────────────────

// PRODUCTION: replace with your Render URL before submitting to Chrome Web Store
// e.g. "https://qa-deck-backend.onrender.com"
const BACKEND = "http://localhost:3747";
let recordTabReady = false;

async function initRecordTab() {
  // Wire up buttons once
  if (!recordTabReady) {
    recordTabReady = true;
    document.getElementById("record-check-btn").addEventListener("click", checkRecordBackend);
    document.getElementById("net-capture-toggle")?.addEventListener("click", toggleNetworkCapture);
    document.getElementById("record-this-btn")?.addEventListener("click", recordThisPage);
    document.getElementById("record-open-dashboard")?.addEventListener("click", () => {
      chrome.tabs.create({ url: `${BACKEND}/recorder.html` });
    });
    document.getElementById("import-btn")?.addEventListener("click", importRecording);
  }

  // Update current page URL display
  const url = state.currentTabInfo?.url || "—";
  const el = document.getElementById("record-page-url");
  if (el) el.textContent = url;

  await checkRecordBackend();
}

async function checkRecordBackend() {
  try {
    const res = await fetchTimeout(`${BACKEND}/api/health`, 3000);
    if (!res.ok) throw new Error("not ok");

    show("record-ready");
    hide("record-offline");

    // Update current page URL
    if (state.currentTabInfo?.url) {
      const el = document.getElementById("record-page-url");
      if (el) el.textContent = state.currentTabInfo.url;
    }

    await refreshSessions();
  } catch {
    hide("record-ready");
    show("record-offline");
  }
}

async function refreshSessions() {
  try {
    const res = await fetchTimeout(`${BACKEND}/api/record/sessions`, 3000);
    const data = await res.json();
    renderSessionsList(data.sessions || []);
  } catch {
    renderSessionsList([]);
  }
}

function renderSessionsList(sessions) {
  const list = document.getElementById("record-sessions-list");
  if (!list) return;

  if (!sessions.length) {
    list.innerHTML = `<div style="font-size:11px;color:var(--text-muted);padding:6px 0">No active sessions</div>`;
    return;
  }

  list.innerHTML = sessions.map(s => {
    const dur = Math.floor(s.duration / 1000);
    const m = Math.floor(dur / 60).toString().padStart(2, "0");
    const sec = (dur % 60).toString().padStart(2, "0");
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:rgba(226,75,74,.07);border:1px solid rgba(226,75,74,.2);border-radius:5px">
      <div>
        <div style="font-family:var(--mono);font-size:10px;color:#f87171">${s.sessionId}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${s.actionCount} actions · ${m}:${sec}</div>
      </div>
      <button onclick="stopAndImport('${s.sessionId}')" style="font-size:10px;padding:4px 8px;border-radius:4px;border:1px solid rgba(29,158,117,.3);background:rgba(29,158,117,.1);color:#1D9E75;cursor:pointer">
        Stop & Import
      </button>
    </div>`;
  }).join("");
}

async function toggleNetworkCapture() {
  const btn = document.getElementById("net-capture-toggle");
  const panel = document.getElementById("net-panel");
  if (!btn || !panel) return;

  state.networkCapture = !state.networkCapture;

  if (state.networkCapture) {
    state.networkLog = [];
    const tabId = state.currentTabInfo?.id ?? null;
    await sendToBackground({ type: "START_NETWORK_CAPTURE", tabId });
    btn.textContent = "On";
    btn.style.background = "rgba(29,158,117,.2)";
    btn.style.color = "#1D9E75";
    btn.style.borderColor = "rgba(29,158,117,.4)";
    panel.classList.remove("hidden");
    renderNetworkPanel();
    showToast("Network capture on — interact with the page", "success");
  } else {
    const res = await sendToBackground({ type: "STOP_NETWORK_CAPTURE" });
    if (res?.networkLog) state.networkLog = res.networkLog;
    btn.textContent = "Off";
    btn.style.background = "rgba(255,255,255,.05)";
    btn.style.color = "";
    btn.style.borderColor = "rgba(255,255,255,.15)";
    renderNetworkPanel();
    showToast(`Capture stopped — ${state.networkLog.length} calls captured`, "info");
  }
}

function renderNetworkPanel() {
  const list = document.getElementById("net-calls-list");
  const count = document.getElementById("net-call-count");
  if (!list) return;
  if (count) count.textContent = state.networkLog.length;

  if (state.networkLog.length === 0) {
    list.innerHTML = `<div style="font-size:10px;color:var(--text-muted);padding:4px 0;text-align:center;opacity:.6">No API calls yet — interact with the page</div>`;
    return;
  }

  list.innerHTML = state.networkLog.map((entry, idx) => {
    const urlObj = (() => { try { return new URL(entry.url); } catch { return null; } })();
    const path = urlObj ? urlObj.pathname : entry.url.slice(0, 60);
    const statusColor = entry.statusCode >= 400 ? "#E24B4A" : entry.statusCode >= 300 ? "#F59E0B" : "#1D9E75";
    return `
      <label style="display:flex;align-items:center;gap:7px;padding:5px 6px;border-radius:4px;cursor:pointer;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)">
        <input type="checkbox" ${entry.selected ? "checked" : ""} data-net-idx="${idx}"
          style="cursor:pointer;accent-color:#1D9E75;flex-shrink:0"
          onchange="netCallToggle(${idx}, this.checked)"/>
        <span style="font-family:var(--mono);font-size:9px;color:rgba(255,255,255,.5);background:rgba(255,255,255,.07);padding:1px 5px;border-radius:3px;flex-shrink:0">${entry.method}</span>
        <span style="font-family:var(--mono);font-size:9px;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${entry.url}">${path}</span>
        <span style="font-size:9px;color:${statusColor};flex-shrink:0;font-family:var(--mono)">${entry.statusCode}</span>
      </label>`;
  }).join("");
}

function netCallToggle(idx, checked) {
  if (state.networkLog[idx]) {
    state.networkLog[idx].selected = checked;
  }
}

async function recordThisPage() {
  if (!await ensureFeatureAccess(FeatureAccess.CONNECTED, {
    title: "Connect QA Deck before capturing flows",
    feature: "Capture sessions",
  })) {
    return;
  }

  const url = state.currentTabInfo?.url;
  if (!url || url.startsWith("chrome://")) {
    showToast("Can't record chrome:// pages", "error");
    return;
  }

  try {
    const res = await fetch(`${BACKEND}/api/record/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startUrl: url }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast("Capture tool opened — start interacting!", "success");
    await refreshSessions();

    // Auto-fill import ID
    const importInput = document.getElementById("import-session-id");
    if (importInput) importInput.value = data.sessionId;

    // Open capture tool in a new tab for monitoring
    chrome.tabs.create({ url: `${BACKEND}/recorder.html` });
  } catch (err) {
    showToast("Failed to start: " + err.message, "error");
  }
}

async function stopAndImport(sessionId) {
  try {
    showToast("Stopping session…", "info");

    const stopRes = await fetch(`${BACKEND}/api/record/${sessionId}/stop`, { method: "POST" });
    const stopData = await stopRes.json();
    if (!stopData.success) throw new Error(stopData.error);

    // Convert with current framework
    const framework = state.selectedFramework || "playwright-python";
    const convertRes = await fetch(`${BACKEND}/api/record/${sessionId}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        framework,
        className: guessClassName(state.currentTabInfo?.url),
        actions: stopData.actions,
        apiKey: state.apiKey || undefined,
      }),
    });
    const convertData = await convertRes.json();
    if (!convertData.success) throw new Error(convertData.error);

    // Import test case into the test cases tab
    if (convertData.testCase) {
      const tc = normalizeTestCase({
        ...convertData.testCase,
        id: convertData.testCase.id || `TC${String(state.testCases.length + 1).padStart(3, "0")}`,
        approved: true,
        _recordedCode: convertData.code,
        _recordedFramework: framework,
      }, state.testCases.length);
      state.testCases.push(tc);
      renderTCList();
      updateTCBadge();
      showToast(`Imported: "${tc.title}"`, "success");
      switchTab("testcases");
    } else {
      // No API key — just import steps as a basic test case
      const steps = (convertData.steps || []).map(s => s.text);
      const tc = normalizeTestCase({
        id: `TC${String(state.testCases.length + 1).padStart(3, "0")}`,
        title: `Recorded flow — ${guessClassName(state.currentTabInfo?.url)}`,
        category: "e2e",
        priority: "medium",
        preconditions: "",
        steps,
        expectedResult: "Flow completes without errors",
        locators: {},
        testData: {},
        tags: ["recorded"],
        approved: true,
        caseKind: "flow",
        packs: ["e2e"],
        scope: "journey",
        source: "recording",
        _recordedCode: convertData.code,
        _recordedFramework: framework,
      }, state.testCases.length);
      state.testCases.push(tc);
      renderTCList();
      updateTCBadge();
      showToast(`Imported ${steps.length} steps as test case`, "success");
      switchTab("testcases");
    }

    await refreshSessions();
  } catch (err) {
    showToast("Import failed: " + err.message, "error");
  }
}

async function importRecording() {
  if (!await ensureFeatureAccess(FeatureAccess.CONNECTED_WITH_PROJECT, {
    title: "Connect QA Deck before importing captured flows",
    feature: "Capture imports",
    trigger: "manual_save",
  })) {
    return;
  }

  const sessionId = document.getElementById("import-session-id")?.value?.trim();
  if (!sessionId) { showToast("Enter a capture session ID", "error"); return; }
  await stopAndImport(sessionId);
}

function guessClassName(url) {
  try {
    const parts = new URL(url || "http://x/page").pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "page";
    return last.charAt(0).toUpperCase() + last.slice(1).replace(/[-_](.)/g, (_, c) => c.toUpperCase()) + "Page";
  } catch { return "RecordedPage"; }
}

function fetchTimeout(url, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(id));
}

// ─── CI/CD TAB ────────────────────────────────────────────────────────────────

let cicdTabReady = false;
let cicdGeneratedConfigs = null;
let cicdCurrentFile = "githubActions";

const CICD_FILE_LABELS = {
  githubActions:  "GitHub Actions",
  jenkins:        "Jenkinsfile",
  dockerCompose:  "docker-compose.ci.yml",
  makefileTargets:"Makefile",
};

// Hook into switchTab
const _origSwitchTab = switchTab;
// Already hooked for record — handle cicd here by detecting in initRecordTab
// Instead we attach via DOMContentLoaded binding below

document.addEventListener("DOMContentLoaded", () => {
  // Patch switchTab once more to handle cicd
  document.querySelectorAll(".tab[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "cicd") initCICDTab();
    });
  });
});

async function initCICDTab() {
  if (!cicdTabReady) {
    cicdTabReady = true;

    // Populate browser checkboxes based on framework
    renderCICDBrowsers();

    // Wire generate button
    document.getElementById("cicd-generate-btn").addEventListener("click", generateCICD);
    document.getElementById("cicd-download-btn")?.addEventListener("click", downloadCICDZip);
    document.getElementById("cicd-copy-btn")?.addEventListener("click", copyCICDCode);
  }

  // Sync framework display
  const fwEl = document.getElementById("cicd-fw-display");
  if (fwEl) fwEl.textContent = state.selectedFramework || "selenium-python";
  renderCICDBrowsers();
}

function renderCICDBrowsers() {
  const fw = state.selectedFramework || "selenium-python";
  const isPlaywright = fw.startsWith("playwright");
  const browsers = isPlaywright
    ? [["chromium", "Chromium"], ["firefox", "Firefox"], ["webkit", "WebKit"]]
    : [["chrome", "Chrome"], ["firefox", "Firefox"]];

  const container = document.getElementById("cicd-browsers");
  if (!container) return;
  container.innerHTML = browsers.map(([val, lbl], i) => `
    <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;color:var(--text-secondary);padding:4px 8px;border:1px solid rgba(255,255,255,.1);border-radius:4px;background:rgba(255,255,255,.04)">
      <input type="checkbox" value="${val}" ${i === 0 ? "checked" : ""} style="accent-color:#1D9E75"/>
      ${lbl}
    </label>`).join("");
}

async function generateCICD() {
  if (!await ensureFeatureAccess(FeatureAccess.CONNECTED_WITH_PROJECT, {
    title: "Connect QA Deck before generating CI/CD",
    feature: "CI/CD generation",
    trigger: "generate_cicd",
  })) {
    return;
  }

  const btn = document.getElementById("cicd-generate-btn");
  btn.disabled = true;
  btn.textContent = "Generating…";

  const fw = state.selectedFramework || "selenium-python";
  const isPlaywright = fw.startsWith("playwright");

  // Collect browser selections
  const browsers = Array.from(
    document.querySelectorAll("#cicd-browsers input:checked")
  ).map((el) => el.value);

  const options = {
    framework:    fw,
    projectName:  state.currentPageData?.meta?.title || state.currentPageData?.meta?.url || "qa-tests",
    pageType:     state.currentPageData?.meta?.pageType || "page",
    baseUrl:      state.currentPageData?.meta?.url || "https://staging.example.com",
    browsers:     browsers.length ? browsers : [isPlaywright ? "chromium" : "chrome"],
    parallel:     document.getElementById("cicd-parallel")?.checked ?? false,
    prTrigger:    document.getElementById("cicd-pr")?.checked ?? true,
    slackWebhook: document.getElementById("cicd-slack")?.checked ?? false,
    emailNotify:  false,
    useAllure:    document.getElementById("cicd-allure")?.checked ?? false,
    reporters:    ["html", ...(document.getElementById("cicd-junit")?.checked ? ["junit"] : [])],
    branches:     (document.getElementById("cicd-branches")?.value || "main, develop")
                    .split(",").map((s) => s.trim()).filter(Boolean),
    testCaseCount: state.testCases.length,
  };

  try {
    // Try backend first
    const res = await fetchTimeout(`${BACKEND}/api/generate-cicd`, 8000);
    const isBackendUp = res.ok;

    let configs;
    if (isBackendUp) {
      const backendRes = await fetch(`${BACKEND}/api/generate-cicd`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      const data = await backendRes.json();
      if (!data.success) throw new Error(data.error);
      configs = data.configs;
    } else {
      // Generate locally (same logic, no server needed)
      configs = generateCICDLocally(options);
    }

    cicdGeneratedConfigs = configs;
    cicdCurrentFile = "githubActions";
    renderCICDResults(configs);
    await persistCurrentProjectVersion("generate_cicd", { notify: false });
    showToast("CI/CD configs generated!", "success");
  } catch (err) {
    showToast("CI/CD error: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate CI/CD Configs";
  }
}

function renderCICDResults(configs) {
  const resultsEl = document.getElementById("cicd-ext-results");
  const tabsEl = document.getElementById("cicd-file-tabs-ext");
  if (!resultsEl || !tabsEl) return;

  resultsEl.classList.remove("hidden");
  tabsEl.innerHTML = "";

  Object.keys(configs).forEach((k) => {
    const btn = document.createElement("button");
    btn.textContent = CICD_FILE_LABELS[k] || k;
    btn.dataset.key = k;
    btn.style.cssText = `font-family:var(--mono);font-size:9px;padding:3px 8px;border-radius:3px;
      cursor:pointer;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);
      color:var(--text-muted);transition:all .15s`;
    btn.addEventListener("click", () => selectCICDFileExt(k));
    tabsEl.appendChild(btn);
  });

  highlightCICDTab(cicdCurrentFile);
  showCICDFile(cicdCurrentFile);
}

function highlightCICDTab(activeKey) {
  document.querySelectorAll("#cicd-file-tabs-ext button").forEach((btn) => {
    const isActive = btn.dataset.key === activeKey;
    btn.style.borderColor  = isActive ? "rgba(29,158,117,.4)"  : "rgba(255,255,255,.1)";
    btn.style.background   = isActive ? "rgba(29,158,117,.1)"  : "rgba(255,255,255,.04)";
    btn.style.color        = isActive ? "#1D9E75" : "var(--text-muted)";
  });
}

function selectCICDFileExt(key) {
  cicdCurrentFile = key;
  highlightCICDTab(key);
  showCICDFile(key);
}

function showCICDFile(key) {
  const cfg = cicdGeneratedConfigs?.[key];
  if (!cfg) return;
  const fn = document.getElementById("cicd-ext-filename");
  const pre = document.getElementById("cicd-ext-code");
  if (fn) fn.textContent = cfg.filename;
  if (pre) pre.textContent = cfg.content;
}

async function copyCICDCode() {
  const pre = document.getElementById("cicd-ext-code");
  if (!pre) return;
  try {
    await navigator.clipboard.writeText(pre.textContent);
    const btn = document.getElementById("cicd-copy-btn");
    if (btn) { btn.textContent = "Copied!"; btn.style.color = "#1D9E75"; setTimeout(() => { btn.textContent = "Copy"; btn.style.color = ""; }, 1500); }
  } catch { showToast("Copy failed", "error"); }
}

async function downloadCICDZip() {
  if (!cicdGeneratedConfigs) return;
  try {
    if (!window.JSZip) throw new Error("JSZip not available");
    const zip = new window.JSZip();
    Object.values(cicdGeneratedConfigs).forEach(({ filename, content }) => {
      zip.file(filename, content);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qa_cicd_${state.selectedFramework}_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CI/CD ZIP downloaded!", "success");
  } catch (err) {
    showToast("Download error: " + err.message, "error");
  }
}

// ── Local generation fallback (no backend needed) ─────────────────────────────
function generateCICDLocally(opts) {
  const { framework, projectName, baseUrl, browsers, parallel, reporters,
          slackWebhook, branches, prTrigger, useAllure } = opts;
  const isPw = framework.startsWith("playwright");
  const isJava = framework.includes("java");
  const isTS = framework.includes("typescript");
  const br = (browsers || ["chromium"]).join(", ");
  const branchList = (branches || ["main"]).map(b => `      - ${b}`).join("\n");
  const setup = isJava
    ? `      - uses: actions/setup-java@v4\n        with:\n          java-version: '17'\n          distribution: 'temurin'`
    : isTS
    ? `      - uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n      - run: npm ci\n      - run: npx playwright install --with-deps`
    : `      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.11'\n      - run: pip install -r requirements.txt${isPw ? "\n      - run: playwright install --with-deps" : ""}`;
  const testRun = isJava ? "mvn test" : isTS ? "npx playwright test" : "pytest tests/ -v" + (reporters?.includes("junit") ? " --junit-xml=reports/junit.xml" : "");
  const slackStep = slackWebhook
    ? `      - uses: 8398a7/action-slack@v3\n        if: failure()\n        with:\n          status: \${{ job.status }}\n        env:\n          SLACK_WEBHOOK_URL: \${{ secrets.SLACK_WEBHOOK_URL }}`
    : "";

  const gha = `# QA Deck — GitHub Actions\n# Framework: ${framework}\nname: QA Tests\n\non:\n  push:\n    branches:\n${branchList}\n${prTrigger ? `  pull_request:\n    branches:\n${branchList}\n` : ""}\nenv:\n  BASE_URL: \${{ secrets.BASE_URL_STAGING || '${baseUrl}' }}\n  CI: true\n\njobs:\n  qa-tests:\n    runs-on: ubuntu-latest\n    timeout-minutes: 30\n    steps:\n      - uses: actions/checkout@v4\n${setup}\n      - name: Run tests\n        run: ${testRun}\n${slackStep}\n`;

  const jf = `// QA Deck — Jenkinsfile\n// Framework: ${framework}\npipeline {\n    agent any\n    options {\n        timeout(time: 30, unit: 'MINUTES')\n        buildDiscarder(logRotator(numToKeepStr: '20'))\n    }\n    environment {\n        BASE_URL = '${baseUrl}'\n        CI = 'true'\n    }\n    stages {\n        stage('Checkout') { steps { checkout scm } }\n        stage('Install') { steps { sh '${isJava ? "mvn dependency:resolve" : isTS ? "npm ci && npx playwright install" : `pip install -r requirements.txt${isPw ? " && playwright install" : ""}`}' } }\n        stage('Test') {\n            steps { sh '${testRun}' }\n            post { always { ${isJava ? 'junit "target/surefire-reports/*.xml"' : reporters?.includes("junit") ? 'junit "reports/junit.xml"' : 'echo "Tests complete"'} } }\n        }\n    }\n    post {\n        always { cleanWs() }\n        failure { echo 'Tests failed' }\n    }\n}\n`;

  const dc = `# QA Deck — Docker Compose CI\nversion: '3.8'\nservices:\n  qa-tests:\n    image: ${isJava ? "maven:3.9-eclipse-temurin-17" : isTS ? "mcr.microsoft.com/playwright:v1.40.0-jammy" : isPw ? "mcr.microsoft.com/playwright/python:v1.40.0-jammy" : "python:3.11-slim"}\n    working_dir: /app\n    volumes:\n      - .:/app\n    environment:\n      - BASE_URL=${baseUrl}\n      - CI=true\n    command: sh -c "${isJava ? "mvn test" : isTS ? "npm ci && npx playwright install && npx playwright test" : `pip install -r requirements.txt${isPw ? " && playwright install" : ""} && ${testRun}`}"\n`;

  const mk = `.PHONY: install test clean\ninstall:\n\t${isJava ? "mvn dependency:resolve" : isTS ? "npm ci && npx playwright install --with-deps" : `pip install -r requirements.txt${isPw ? " && playwright install" : ""}`}\ntest:\n\t${testRun}\ntest-smoke:\n\t${isJava ? "mvn test -Dgroups=smoke" : isTS ? "npx playwright test --grep @smoke" : "pytest tests/ -v -m smoke"}\nclean:\n\t${isJava ? "mvn clean" : isTS ? "rm -rf test-results/ playwright-report/" : "rm -rf reports/ .pytest_cache/"}\nci: install test\n`;

  return {
    githubActions:  { filename: ".github/workflows/qa-tests.yml", content: gha },
    jenkins:        { filename: "Jenkinsfile",                    content: jf  },
    dockerCompose:  { filename: "docker-compose.ci.yml",          content: dc  },
    makefileTargets:{ filename: "Makefile",                       content: mk  },
  };
}

// ─── Sidepanel unload cleanup ────────────────────────────────────────────────
// When the side panel is closed, release any active inspect/assert mode so
// the page's click and mouseover interceptors are removed and the page
// remains fully interactive.
window.addEventListener("pagehide", () => {
  if (state.selInspecting || state.selAssertMode) {
    sendToBackground({ type: "STOP_INSPECTING" });
  }
});

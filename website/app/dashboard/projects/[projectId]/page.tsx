"use client";

// Local backend URL — reads from env so production deployments can override.
// Default: http://localhost:3747 (users run the backend locally for Recorder).
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3747";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import DashboardHeader from "@/components/DashboardHeader";
import { useDashboardSession } from "@/lib/use-dashboard-session";
import {
  getProjectBundle,
  getProjectAppDisplayName,
  getProjectAppGroupKey,
  normalizeWebsiteTestCaseWithContext,
  formatTestCaseAsMarkdown,
  saveNewProjectVersion,
  subscribeProjects,
  TESTCASE_PACK_LABELS,
  TESTCASE_PACK_ORDER,
  TESTCASE_KIND_LABELS,
  updateProjectMetaFields,
  updateScriptFileContent,
  deleteProject,
  deleteProjectGroup,
  type ProjectBundle,
  type ProjectMeta,
  type WebsiteTestCase,
  type WebsiteTestCaseKind,
  type WebsiteTestCasePack,
  type WebsiteTestCaseScope,
  type WebsiteTestCaseSource,
  type WebsiteTestCaseSuite,
} from "@/lib/project-store";
import {
  deriveProjectQuality,
  type ModuleStatus,
  type ReleaseDecision,
  type RiskLevel,
} from "@/lib/quality-os";
import {
  useExtensionConnection,
  getExtensionApiKey,
  openProjectInExtension,
  rescanProjectViaExtension,
  getCurrentPageFromExtension,
} from "@/lib/extension-bridge";

function formatDateTime(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function downloadBase64File(filename: string, contentBase64: string) {
  if (!filename || !contentBase64 || typeof window === "undefined") return;
  const binary = window.atob(contentBase64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

function statusTone(status: ProjectMeta["status"]) {
  return {
    draft: "bg-white/5 text-white/60 border-white/10",
    active: "bg-green/10 text-green border-green/20",
    review: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    done: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    archived: "bg-white/5 text-white/40 border-white/10",
  }[status];
}

type TestCaseLibraryFilter = "page" | "flow" | "all";
type ProjectTab = "pages" | "pagecases" | "packs" | "scripts" | "runs" | "capture" | "locators" | "insights";
type TestCaseEditorState = {
  title: string;
  caseKind: WebsiteTestCaseKind;
  packs: WebsiteTestCasePack[];
  category: string;
  priority: string;
  preconditions: string;
  steps: string[];
  expectedResult: string;
  tags: string;
  scope: WebsiteTestCaseScope;
  groupingLabel: string;
  source: WebsiteTestCaseSource;
};

const TESTCASE_LIBRARY_FILTERS: { id: TestCaseLibraryFilter; label: string }[] = [
  { id: "page", label: "Page" },
  { id: "flow", label: "Flow" },
  { id: "all", label: "All" },
];

function decisionTone(decision: ReleaseDecision) {
  return {
    go: "bg-green/10 text-green border-green/20",
    caution: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    "no-go": "bg-red-500/10 text-red-300 border-red-500/20",
  }[decision];
}

function moduleTone(status: ModuleStatus) {
  return {
    ready: "bg-green/10 text-green border-green/20",
    partial: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    missing: "bg-red-500/10 text-red-300 border-red-500/20",
  }[status];
}

function riskTone(level: RiskLevel) {
  return {
    low: "bg-white/5 text-white/60 border-white/10",
    medium: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    high: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    critical: "bg-red-500/10 text-red-300 border-red-500/20",
  }[level];
}

function priorityWeight(priority: string) {
  return {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  }[priority] || 0;
}

function slugifyLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildProjectGroupingDefaults(meta: ProjectMeta) {
  const fallbackLabel = meta.pageLabel || meta.name || "Current page";
  const fallbackKey = meta.pageKey || slugifyLabel(fallbackLabel || "page") || "page";
  return {
    pageLabel: fallbackLabel,
    pageKey: fallbackKey,
    flowLabel: meta.name || "Primary flow",
    flowKey: slugifyLabel(meta.name || "flow") || "flow",
  };
}

function deriveLegacySuite(
  caseKind: WebsiteTestCaseKind,
  packs: WebsiteTestCasePack[]
): WebsiteTestCaseSuite {
  if (packs.includes("smoke")) return "smoke";
  if (packs.includes("regression")) return "regression";
  if (packs.includes("e2e") || caseKind === "flow") return "e2e";
  return "page";
}

function sanitizePackMembership(
  caseKind: WebsiteTestCaseKind,
  packs: WebsiteTestCasePack[]
): WebsiteTestCasePack[] {
  const nextPacks = Array.from(new Set(packs.filter((pack) => caseKind === "flow" || pack !== "e2e")));
  return TESTCASE_PACK_ORDER.filter((pack) => nextPacks.includes(pack));
}

function getDefaultCaseFilterForProject(meta: ProjectMeta, cases: WebsiteTestCase[]) {
  if (meta.mode === "page") return "page" as TestCaseLibraryFilter;
  return cases.some((tc) => tc.caseKind !== "flow") ? "page" : "flow";
}

function getCasesForPack(cases: WebsiteTestCase[], pack: "page" | WebsiteTestCasePack) {
  return cases.filter((tc) => {
    if (!tc.approved) return false;
    if (pack === "page") return tc.caseKind !== "flow";
    return tc.packs.includes(pack);
  });
}

type BundleReadinessState = {
  status: "ready" | "needs_regeneration" | "validation_failed" | "blocked";
  label: string;
  description: string;
  errors: string[];
};

function getBundlePageFingerprint(projectBundle: ProjectBundle) {
  const scan = projectBundle.artifacts.scan as Record<string, unknown> | null;
  const meta = scan?.meta as Record<string, unknown> | undefined;
  return meta?.pageFingerprint ? String(meta.pageFingerprint) : "";
}

function getApprovedCasesForBundlePack(projectBundle: ProjectBundle, pack: "page" | WebsiteTestCasePack) {
  const rawCases = Array.isArray(projectBundle.artifacts.testcases)
    ? (projectBundle.artifacts.testcases as Record<string, unknown>[])
    : [];
  const cases = rawCases.map((raw, index) => normalizeWebsiteTestCaseWithContext(raw, index, projectBundle.meta));
  return getCasesForPack(cases, pack);
}

function deriveBundleReadiness(
  latestVersion: ProjectBundle["latestVersion"],
  pageBundles: ProjectBundle[],
  selectedPack: "page" | WebsiteTestCasePack,
  locallyMarkedStale: boolean
): BundleReadinessState {
  const approvedPages = pageBundles
    .map((pageBundle) => ({
      pageId: pageBundle.meta.id,
      cases: getApprovedCasesForBundlePack(pageBundle, selectedPack),
      fingerprint: getBundlePageFingerprint(pageBundle),
    }))
    .filter((entry) => entry.cases.length > 0);

  if (!approvedPages.length) {
    return {
      status: "blocked",
      label: "Blocked by missing approved cases",
      description: "Approve at least one test case on a saved page before generating a combined Selenium bundle.",
      errors: [],
    };
  }

  if (!latestVersion || !latestVersion.hasScripts) {
    return {
      status: "needs_regeneration",
      label: "Needs regeneration",
      description: "Generate a run-ready Selenium Python bundle for the approved project cases.",
      errors: [],
    };
  }

  if (latestVersion.validation?.status && latestVersion.validation.status !== "passed") {
    return {
      status: "validation_failed",
      label: "Validation failed",
      description: "The last generated bundle did not pass bundle validation and should not be used as ready-to-run output.",
      errors: latestVersion.validation.errors || [],
    };
  }

  if (latestVersion.generationMode !== "project-bundle" || latestVersion.selectedPack !== selectedPack) {
    return {
      status: "needs_regeneration",
      label: "Needs regeneration",
      description: "The current saved scripts were generated for a different scope or pack than the one selected now.",
      errors: [],
    };
  }

  const includedPageIds = new Set(latestVersion.includedPageIds || []);
  const includedCaseIds = new Set(latestVersion.includedCaseIds || []);
  const fingerprintSnapshot = latestVersion.pageFingerprints || {};

  const hasPageMismatch = approvedPages.some((entry) => !includedPageIds.has(entry.pageId));
  const hasFingerprintMismatch = approvedPages.some((entry) => {
    const saved = fingerprintSnapshot[entry.pageId];
    return Boolean(saved && entry.fingerprint && saved !== entry.fingerprint);
  });
  const hasCaseMismatch = approvedPages.some((entry) => entry.cases.some((tc) => !includedCaseIds.has(tc.id)));

  if (locallyMarkedStale || hasPageMismatch || hasFingerprintMismatch || hasCaseMismatch) {
    return {
      status: "needs_regeneration",
      label: "Needs regeneration",
      description: "One or more saved pages or approved test cases changed after the last bundle generation.",
      errors: [],
    };
  }

  return {
    status: "ready",
    label: "Ready",
    description: "The latest saved Selenium Python bundle matches the current approved cases across saved pages.",
    errors: [],
  };
}

function readinessTone(status: BundleReadinessState["status"]) {
  return {
    ready: "bg-green/10 text-green border-green/20",
    needs_regeneration: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    validation_failed: "bg-red-500/10 text-red-300 border-red-500/20",
    blocked: "bg-white/5 text-white/55 border-white/10",
  }[status];
}

function suggestPacksForTestCase(tc: WebsiteTestCase) {
  if (!tc.approved) return tc.packs;

  const haystack = [
    tc.title,
    tc.category,
    tc.pageLabel,
    tc.flowLabel,
    ...(tc.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const next = new Set<WebsiteTestCasePack>(tc.packs);
  const criticalPath = tc.priority === "critical" || tc.priority === "high" || /(login|sign in|checkout|payment|cart|search|save|submit|add to cart|purchase)/.test(haystack);
  if (criticalPath) next.add("smoke");
  if (!["performance", "security"].includes(tc.category)) next.add("regression");
  if (tc.caseKind === "flow") next.add("e2e");
  return sanitizePackMembership(tc.caseKind, Array.from(next));
}

function getGroupingValue(tc: WebsiteTestCase, meta: ProjectMeta) {
  const defaults = buildProjectGroupingDefaults(meta);
  return tc.caseKind === "flow" ? tc.flowLabel || defaults.flowLabel : tc.pageLabel || defaults.pageLabel;
}

function createEmptyTestCaseEditor(meta: ProjectMeta): TestCaseEditorState {
  const defaults = buildProjectGroupingDefaults(meta);
  const isJourney = meta.mode === "journey";
  return {
    title: "",
    caseKind: isJourney ? "flow" : "page",
    packs: [],
    category: "functional",
    priority: "medium",
    preconditions: "",
    steps: [""],
    expectedResult: "",
    tags: "",
    scope: isJourney ? "journey" : "page",
    groupingLabel: isJourney ? defaults.flowLabel : defaults.pageLabel,
    source: "page",
  };
}

function getGroupingFieldLabel(form: Pick<TestCaseEditorState, "caseKind" | "scope">) {
  if (form.caseKind === "flow" || form.scope === "journey") return "Flow label";
  if (form.caseKind === "step" || form.scope === "step") return "Step label";
  return "Page label";
}

function buildWebsiteTestCaseFromEditor(
  form: TestCaseEditorState,
  meta: ProjectMeta,
  base: Partial<WebsiteTestCase> = {}
): WebsiteTestCase {
  const defaults = buildProjectGroupingDefaults(meta);
  const groupingLabel = form.groupingLabel.trim();
  const caseKind = meta.mode === "page" ? "page" : form.caseKind;
  const packs = sanitizePackMembership(caseKind, form.packs);
  const suite = deriveLegacySuite(caseKind, packs);
  const scope = meta.mode === "page" ? "page" : caseKind === "flow" ? "journey" : caseKind === "step" ? "step" : "page";
  const pageLabel = caseKind === "flow"
    ? null
    : groupingLabel || defaults.pageLabel;
  const flowLabel = caseKind === "flow"
    ? groupingLabel || defaults.flowLabel
    : base.flowLabel || null;

  return {
    id: base.id || "",
    title: form.title.trim(),
    suite,
    caseKind,
    packs,
    category: form.category,
    priority: form.priority,
    preconditions: form.preconditions.trim(),
    steps: form.steps.map((step) => step.trim()).filter(Boolean),
    expectedResult: form.expectedResult.trim(),
    tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    approved: base.approved ?? true,
    source: form.source,
    scope,
    pageKey: pageLabel ? slugifyLabel(pageLabel) || defaults.pageKey : null,
    pageLabel,
    flowKey: flowLabel ? slugifyLabel(flowLabel) || defaults.flowKey : null,
    flowLabel,
    sortOrder: base.sortOrder ?? 0,
    stepId: base.stepId ?? null,
    stepOrder: base.stepOrder ?? null,
    groupLabel: pageLabel || flowLabel || null,
    locators: base.locators || {},
    testData: base.testData || {},
  };
}

function normalizeGroupKind(testCase: WebsiteTestCase) {
  return testCase.caseKind === "flow" || testCase.scope === "journey" ? "flow" : "page";
}

function buildGroupMeta(testCase: WebsiteTestCase, meta: ProjectMeta) {
  const defaults = buildProjectGroupingDefaults(meta);
  if (normalizeGroupKind(testCase) === "flow") {
    return {
      key: `flow:${testCase.flowKey || slugifyLabel(testCase.flowLabel || defaults.flowLabel) || defaults.flowKey}`,
      label: testCase.flowLabel || defaults.flowLabel,
      kind: "flow" as const,
    };
  }

  return {
    key: `page:${testCase.pageKey || slugifyLabel(testCase.pageLabel || defaults.pageLabel) || defaults.pageKey}`,
    label: testCase.pageLabel || defaults.pageLabel,
    kind: "page" as const,
  };
}

function upsertRunResult(
  current: { name: string; status: string; duration?: string | null }[],
  next: { name: string; status: string; duration?: string | null }
) {
  const index = current.findIndex((entry) => entry.name === next.name);
  if (index === -1) return [...current, next];

  const updated = [...current];
  updated[index] = { ...updated[index], ...next };
  return updated;
}

function slugifyDownloadLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatFrameworkLabel(framework: string) {
  switch (framework) {
    case "selenium-python":
      return "Selenium Python";
    case "playwright-python":
      return "Playwright Python";
    case "playwright-typescript":
      return "Playwright TypeScript";
    case "selenium-java":
      return "Selenium Java";
    case "webdriverio":
      return "WebdriverIO";
    default:
      return framework || "QA Deck";
  }
}

function getFrameworkInstallNotes(framework: string) {
  switch (framework) {
    case "selenium-python":
      return ["pip install -r requirements.txt", "pytest -q"];
    case "playwright-python":
      return ["pip install -r requirements.txt", "playwright install chromium", "pytest -q"];
    case "playwright-typescript":
      return ["npm install", "npx playwright install chromium", "npx playwright test"];
    case "selenium-java":
      return ["mvn test"];
    case "webdriverio":
      return ["npm install", "npx wdio run wdio.conf.js"];
    default:
      return ["Follow the framework-specific setup included in this bundle."];
  }
}

function buildBundleReadme(options: {
  projectName: string;
  sourceUrl: string;
  framework: string;
  packLabel: string;
  fileCount: number;
}) {
  return [
    `# ${options.projectName || "QA Deck"} run-ready bundle`,
    "",
    `Framework: ${formatFrameworkLabel(options.framework)}`,
    `Pack: ${options.packLabel}`,
    `Source URL: ${options.sourceUrl || "—"}`,
    `Files included: ${options.fileCount}`,
    "",
    "## Quick start",
    ...getFrameworkInstallNotes(options.framework).map((step) => `- ${step}`),
    "",
    "## What is included",
    "- Generated script files from the currently approved test cases",
    "- Support files needed to run the bundle locally",
    "- This README",
    "",
    "## Notes",
    "- If you regenerate scripts, download a fresh bundle so the ZIP stays in sync.",
    "- If a framework-specific support file is already present, QA Deck keeps it and does not overwrite it.",
  ].join("\n");
}

function buildFrameworkSupportFiles(framework: string) {
  if (framework === "selenium-python") {
    return [
      {
        filename: "requirements.txt",
        content: "selenium\npytest\n",
      },
    ];
  }

  if (framework === "playwright-python") {
    return [
      {
        filename: "requirements.txt",
        content: "playwright\npytest\npytest-playwright\n",
      },
    ];
  }

  return [];
}

function buildDownloadFilename(projectName: string, packLabel: string) {
  const base = slugifyDownloadLabel(projectName) || "qa-deck";
  const pack = slugifyDownloadLabel(packLabel) || "bundle";
  return `${base}-${pack}-ready-to-run.zip`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const { user, ready, signingOut, handleSignOut } = useDashboardSession();
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [projectPageBundles, setProjectPageBundles] = useState<ProjectBundle[]>([]);
  const [allProjects, setAllProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedFileId, setSelectedFileId] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<ProjectMeta["status"]>("draft");
  const [tags, setTags] = useState("");
  const [appName, setAppName] = useState("");
  const [pageLabel, setPageLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState<null | "page" | "project">(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [activeTab, setActiveTab] = useState<ProjectTab>("pages");
  const [locatorSearch, setLocatorSearch] = useState("");
  const [locatorQualityFilter, setLocatorQualityFilter] = useState<"all" | "best" | "good" | "ok" | "fragile">("all");
  const [copiedLocator, setCopiedLocator] = useState<string | null>(null);
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [runHeadless, setRunHeadless] = useState(true);
  const [runState, setRunState] = useState<"idle" | "running" | "done" | "error" | "stopped">("idle");
  const [runOutput, setRunOutput] = useState<{ type: string; text: string }[]>([]);
  const [runResults, setRunResults] = useState<{ name: string; status: string; duration?: string | null }[]>([]);
  const [runError, setRunError] = useState("");
  const runAbortRef = useRef<AbortController | null>(null);
  // Code editor state
  const [editMode, setEditMode] = useState(false);
  const [editedContents, setEditedContents] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editSaveError, setEditSaveError] = useState("");
  const [runPanelRef, runOutputRef, runResultsRef] = [
    useRef<HTMLDivElement | null>(null),
    useRef<HTMLPreElement | null>(null),
    useRef<HTMLDivElement | null>(null),
  ];

  // ── Test case filter state ────────────────────────────────────────────────
  const [tcLibraryFilter, setTcLibraryFilter] = useState<TestCaseLibraryFilter>("page");
  const [tcCategoryFilter, setTcCategoryFilter] = useState("all");
  const [tcPriorityFilter, setTcPriorityFilter] = useState("all");

  // ── Test case management state ────────────────────────────────────────────
  const [localTestcases, setLocalTestcases] = useState<WebsiteTestCase[]>([]);
  const [expandedTcId, setExpandedTcId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<TestCaseEditorState | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [copiedTcId, setCopiedTcId] = useState<string | null>(null);
  const [scriptsStale, setScriptsStale] = useState(false);
  const [removeScriptSaving, setRemoveScriptSaving] = useState(false);
  const [tcSaveError, setTcSaveError] = useState("");
  // Edit test case state
  const [editingTcId, setEditingTcId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TestCaseEditorState | null>(null);
  const [editSavingTc, setEditSavingTc] = useState(false);
  const [editErrorTc, setEditErrorTc] = useState("");
  // Drag-to-reorder state
  const [draggingTcId, setDraggingTcId] = useState<string | null>(null);
  const [dragOverTcId, setDragOverTcId] = useState<string | null>(null);
  const [showPackModal, setShowPackModal] = useState(false);
  const [packSelections, setPackSelections] = useState<Record<string, WebsiteTestCasePack[]>>({});
  const [packSaving, setPackSaving] = useState(false);
  const [packError, setPackError] = useState("");

  // ── Script regeneration state ─────────────────────────────────────────────
  const [showRegenModal, setShowRegenModal] = useState(false);
  const [regenFramework, setRegenFramework] = useState("selenium-python");
  const [regenSaving, setRegenSaving] = useState(false);
  const [regenError, setRegenError] = useState("");
  const [selectedScriptPack, setSelectedScriptPack] = useState<"page" | WebsiteTestCasePack>("page");
  const [bundleDownloadSaving, setBundleDownloadSaving] = useState(false);
  const [bundleDownloadError, setBundleDownloadError] = useState("");

  // ── Page mismatch protection ──────────────────────────────────────────────
  const [showPageMismatchSaveModal, setShowPageMismatchSaveModal] = useState(false);
  const [pendingSaveAction, setPendingSaveAction] = useState<{ type: "testcases" | "meta"; payload: any } | null>(null);
  const [detectedCurrentPage, setDetectedCurrentPage] = useState<{ pageLabel: string; pageKey: string } | null>(null);

  // ── Re-scan state ─────────────────────────────────────────────────────────
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState("");
  const [openingCapture, setOpeningCapture] = useState(false);
  const [captureError, setCaptureError] = useState("");

  // ── Save run result state ─────────────────────────────────────────────────
  const [runSaving, setRunSaving] = useState(false);
  const [runSaved, setRunSaved] = useState(false);
  const [selectedRunPack, setSelectedRunPack] = useState<"page" | WebsiteTestCasePack>("page");

  // ── Extension connection (for regenerate + rescan) ────────────────────────
  const { state: extState } = useExtensionConnection({ enabled: true, pollMs: 0 });

  const projectId = typeof params?.projectId === "string" ? params.projectId : "";
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);

  async function loadBundle(targetProjectId = selectedProjectId) {
    if (!user || !targetProjectId) return;
    setLoading(true);
    try {
      const nextBundle = await getProjectBundle(user.uid, targetProjectId);
      setBundle(nextBundle);
      setName(nextBundle.meta.name);
      setStatus(nextBundle.meta.status);
      setTags(nextBundle.meta.tags.join(", "));
      setAppName(nextBundle.meta.appName || "");
      setPageLabel(nextBundle.meta.pageLabel || "");
      setSelectedFileId(nextBundle.artifacts.scriptFiles[0]?.id || "");
      // Normalize testcases into canonical WebsiteTestCase shape
      const rawTcs = Array.isArray(nextBundle.artifacts.testcases) ? nextBundle.artifacts.testcases as Record<string, unknown>[] : [];
      const normalizedCases = rawTcs.map((raw, i) => normalizeWebsiteTestCaseWithContext(raw, i, nextBundle.meta));
      setLocalTestcases(normalizedCases);
      setTcLibraryFilter(getDefaultCaseFilterForProject(nextBundle.meta, normalizedCases));
      setAddForm(createEmptyTestCaseEditor(nextBundle.meta));
      setRegenFramework(nextBundle.meta.activeFramework || "selenium-python");
      const generatedPack = ((nextBundle.latestVersion?.selectedPack as "page" | WebsiteTestCasePack | undefined)
        || (nextBundle.artifacts.scriptFiles[0]?.group as "page" | WebsiteTestCasePack | undefined)
        || "page");
      setSelectedScriptPack(generatedPack);
      setSelectedRunPack(generatedPack);
      setScriptsStale(false);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (!user || !selectedProjectId) return;
    loadBundle();
    fetch(`${BACKEND_URL}/api/health`).then(r => { if (r.ok) setBackendOnline(true); }).catch(() => {});
  }, [user, selectedProjectId]);

  useEffect(() => {
    if (!user) return;
    return subscribeProjects(
      user.uid,
      (nextProjects) => setAllProjects(nextProjects),
      () => {}
    );
  }, [user]);

  useEffect(() => {
    return () => {
      runAbortRef.current?.abort();
      runAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "scripts" || runState !== "running") return;

    const timer = window.setTimeout(() => {
      runPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeTab, runState]);

  useEffect(() => {
    if (activeTab !== "scripts" || runResults.length === 0) return;

    const timer = window.setTimeout(() => {
      runResultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [activeTab, runResults.length]);

  useEffect(() => {
    if (activeTab !== "scripts" || runOutput.length === 0) return;

    const frame = window.requestAnimationFrame(() => {
      const node = runOutputRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, runOutput.length]);

  function syncTestcasesState(nextCases: WebsiteTestCase[]) {
    setLocalTestcases(nextCases);
    setBundle((prev) =>
      prev
        ? {
            ...prev,
            artifacts: {
              ...prev.artifacts,
              testcases: nextCases,
            },
          }
        : prev
    );
  }

  async function persistTestcases(
    nextCases: WebsiteTestCase[],
    trigger: string,
    summary: string,
    options: { reloadOnError?: boolean; skipMismatchCheck?: boolean } = {}
  ) {
    if (!user || !bundle) return;

    // Check page mismatch first (unless explicitly skipped)
    if (!options.skipMismatchCheck) {
      const canProceed = await checkPageMismatchBeforeSave("testcases", {
        nextCases,
        trigger,
        summary,
      });
      if (!canProceed) return;
    }

    setScriptsStale(true);
    await saveNewProjectVersion(user.uid, bundle.meta.id, {
      artifactOverrides: { testcases: nextCases },
      invalidate: ["scriptFiles", "cicd", "run"],
      trigger,
      summary,
    });

    if (options.reloadOnError) {
      await loadBundle();
    }
  }

  function buildEditedTestCase(
    original: WebsiteTestCase,
    form: TestCaseEditorState,
    meta: ProjectMeta
  ) {
    return buildWebsiteTestCaseFromEditor(form, meta, {
      ...original,
      id: original.id,
      approved: original.approved,
      sortOrder: original.sortOrder,
      stepId: original.stepId,
      stepOrder: original.stepOrder,
      flowKey: original.flowKey,
      flowLabel: original.flowLabel,
      pageKey: original.pageKey,
      pageLabel: original.pageLabel,
    });
  }

  async function handleToggleApproval(tcId: string) {
    if (!user || !bundle) return;
    setTcSaveError("");
    const updated = localTestcases.map((tc) =>
      tc.id === tcId ? { ...tc, approved: !tc.approved } : tc
    );
    syncTestcasesState(updated);
    try {
      await persistTestcases(updated, "testcase_approval_updated", `Test case approval updated: ${tcId}`);
    } catch (err) {
      setTcSaveError(err instanceof Error ? err.message : "Failed to update approval");
      await loadBundle();
    }
  }

  async function handleQuickCaseKindChange(tcId: string, nextCaseKind: WebsiteTestCaseKind) {
    if (!user || !bundle) return;
    setTcSaveError("");
    const updated = localTestcases.map((tc) => {
      if (tc.id !== tcId) return tc;

      const defaults = buildProjectGroupingDefaults(bundle.meta);
      const packs = sanitizePackMembership(nextCaseKind, tc.packs);
      const nextScope: WebsiteTestCaseScope = nextCaseKind === "flow" ? "journey" : nextCaseKind === "step" ? "step" : "page";
      const nextSuite = deriveLegacySuite(nextCaseKind, packs);

      return {
        ...tc,
        suite: nextSuite,
        caseKind: nextCaseKind,
        packs,
        scope: nextScope,
        pageLabel: nextCaseKind === "flow" ? null : tc.pageLabel || defaults.pageLabel,
        pageKey: nextCaseKind === "flow" ? null : tc.pageKey || defaults.pageKey,
        flowLabel: nextCaseKind === "flow" ? tc.flowLabel || tc.groupLabel || defaults.flowLabel : tc.flowLabel,
        flowKey: nextCaseKind === "flow" ? tc.flowKey || slugifyLabel(tc.flowLabel || tc.groupLabel || defaults.flowLabel) || defaults.flowKey : tc.flowKey,
        groupLabel:
          nextCaseKind === "flow"
            ? tc.flowLabel || tc.groupLabel || defaults.flowLabel
            : tc.pageLabel || tc.groupLabel || defaults.pageLabel,
      };
    });
    syncTestcasesState(updated);
    try {
      await persistTestcases(updated, "testcase_edited", `Test case moved to ${TESTCASE_KIND_LABELS[nextCaseKind]}`);
    } catch (err) {
      setTcSaveError(err instanceof Error ? err.message : "Failed to change case type");
      await loadBundle();
    }
  }

  async function handleQuickPackToggle(tcId: string, pack: WebsiteTestCasePack) {
    if (!user || !bundle) return;
    setTcSaveError("");
    const updated = localTestcases.map((tc) => {
      if (tc.id !== tcId) return tc;
      const hasPack = tc.packs.includes(pack);
      const nextPacks = sanitizePackMembership(
        tc.caseKind,
        hasPack ? tc.packs.filter((entry) => entry !== pack) : [...tc.packs, pack]
      );
      return {
        ...tc,
        packs: nextPacks,
        suite: deriveLegacySuite(tc.caseKind, nextPacks),
      };
    });
    syncTestcasesState(updated);
    try {
      await persistTestcases(updated, "packs_updated", `Pack membership updated: ${pack}`);
    } catch (err) {
      setTcSaveError(err instanceof Error ? err.message : "Failed to update pack");
      await loadBundle();
    }
  }

  async function handleReorderWithinGroup(caseIds: string[], tcId: string, direction: "up" | "down") {
    if (!user || !bundle) return;
    const currentIndex = caseIds.indexOf(tcId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex === -1 || targetIndex < 0 || targetIndex >= caseIds.length) return;

    const reorderedIds = [...caseIds];
    [reorderedIds[currentIndex], reorderedIds[targetIndex]] = [reorderedIds[targetIndex], reorderedIds[currentIndex]];
    const originalOrders = caseIds
      .map((id) => localTestcases.find((tc) => tc.id === id)?.sortOrder ?? 0)
      .sort((left, right) => left - right);
    const rank = new Map(reorderedIds.map((id, index) => [id, originalOrders[index] ?? index]));
    const updated = localTestcases.map((tc) =>
      rank.has(tc.id) ? { ...tc, sortOrder: rank.get(tc.id) ?? tc.sortOrder } : tc
    );
    syncTestcasesState(updated);
    try {
      await persistTestcases(updated, "testcase_reordered", "Test cases reordered");
    } catch (err) {
      setTcSaveError(err instanceof Error ? err.message : "Failed to reorder");
      await loadBundle();
    }
  }

  async function handleDragReorderWithinGroup(caseIds: string[], fromId: string, toId: string) {
    if (!user || !bundle || fromId === toId) return;
    const fromIndex = caseIds.indexOf(fromId);
    const toIndex = caseIds.indexOf(toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reorderedIds = [...caseIds];
    const [moved] = reorderedIds.splice(fromIndex, 1);
    reorderedIds.splice(toIndex, 0, moved);
    const originalOrders = caseIds
      .map((id) => localTestcases.find((tc) => tc.id === id)?.sortOrder ?? 0)
      .sort((left, right) => left - right);
    const rank = new Map(reorderedIds.map((id, index) => [id, originalOrders[index] ?? index]));
    const updated = localTestcases.map((tc) =>
      rank.has(tc.id) ? { ...tc, sortOrder: rank.get(tc.id) ?? tc.sortOrder } : tc
    );
    syncTestcasesState(updated);
    setDraggingTcId(null);
    setDragOverTcId(null);
    try {
      await persistTestcases(updated, "testcase_reordered", "Test cases reordered");
    } catch (err) {
      setTcSaveError(err instanceof Error ? err.message : "Failed to reorder");
      await loadBundle();
    }
  }

  async function handleRunTests() {
    if (!bundle || runState === "running") return;
    const controller = new AbortController();
    runAbortRef.current = controller;
    setRunState("running");
    setRunOutput([]);
    setRunResults([]);
    setRunError("");
    setRunSaved(false);
    try {
      // Use edited (unsaved) content if available, otherwise use stored content
      const scripts = bundle.artifacts.scriptFiles.map(f => ({
        filename: f.filename,
        content: editedContents[f.id] ?? f.content,
        key: f.key ?? null,
        group: f.group ?? null,
        stepId: f.stepId ?? null,
        sortOrder: f.sortOrder ?? null,
      }));
      const framework = bundle.meta.activeFramework || "selenium-python";
      const resp = await fetch(`${BACKEND_URL}/api/run-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scripts, framework, headless: runHeadless }),
        signal: controller.signal,
      });
      if (!resp.body) throw new Error("No response body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          const dataLine = block.split("\n").find(l => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const evt = JSON.parse(dataLine.slice(6));
            if (evt.type === "stdout" || evt.type === "stderr") {
              setRunOutput(prev => [...prev, evt]);
            } else if (evt.type === "test-result" && evt.result) {
              setRunResults(prev => upsertRunResult(prev, evt.result));
            } else if (evt.type === "missing-deps" || evt.type === "error") {
              setRunError((evt.message || "") + (evt.installCmd ? `\n\nInstall with:\n  ${evt.installCmd}` : ""));
              setRunState("error");
              return;
            } else if (evt.type === "done") {
              setRunResults(evt.results || []);
              setRunState(evt.exitCode === 0 ? "done" : "error");
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setRunError("Run stopped by user.");
        setRunState("stopped");
      } else {
        setRunError(err instanceof Error ? err.message : "Run failed");
        setRunState("error");
      }
    } finally {
      runAbortRef.current = null;
    }
  }

  function handleStopRun() {
    if (runState !== "running") return;
    runAbortRef.current?.abort();
  }

  async function handleSaveMeta() {
    if (!user || !bundle) return;

    // Check page mismatch first
    const canProceed = await checkPageMismatchBeforeSave("meta", {});
    if (!canProceed) return;

    setSaving(true);
    try {
      await updateProjectMetaFields(user.uid, bundle.meta.id, {
        name: name.trim() || bundle.meta.name,
        status,
        tags: tags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        appName,
        pageLabel,
      });
      await loadBundle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project");
    } finally {
      setSaving(false);
    }
  }

  async function checkPageMismatchBeforeSave(
    action: "testcases" | "meta",
    payload: any
  ): Promise<boolean> {
    if (!bundle) return false;

    try {
      // Get current page from extension
      const result = await getCurrentPageFromExtension();
      if (!result) {
        // Extension timeout or error - allow save but show warning
        return true;
      }

      // Compare selected page with detected page
      const selectedPageKey = bundle.meta.pageKey || "";
      const detectedPageKey = result.pageKey || "";
      const selectedPageLabel = bundle.meta.pageLabel || "unknown";
      const detectedPageLabel = result.pageLabel || "unknown";

      // If pages match (by key), allow save
      if (selectedPageKey && detectedPageKey && selectedPageKey === detectedPageKey) {
        return true;
      }

      // Mismatch detected - show modal
      setDetectedCurrentPage({
        pageLabel: detectedPageLabel,
        pageKey: detectedPageKey,
      });
      setPendingSaveAction({ type: action, payload });
      setShowPageMismatchSaveModal(true);
      return false;
    } catch (err) {
      // On error, allow save to proceed (fail open)
      return true;
    }
  }

  async function handleDeletePage() {
    if (!user || !bundle) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteProject(user.uid, bundle.meta.id);
      const remainingPages = siblingPages.filter((page) => page.id !== bundle.meta.id);
      setDeleting(false);
      if (remainingPages.length) {
        setShowDeleteModal(null);
        setDeleteConfirmText("");
        setSelectedProjectId(remainingPages[0].id);
      } else {
        router.push("/dashboard/projects");
      }
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete page");
      setDeleting(false);
    }
  }

  async function handleDeleteProjectGroup() {
    if (!user || !bundle) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteProjectGroup(user.uid, siblingPages.map((page) => page.id));
      setDeleting(false);
      router.push("/dashboard/projects");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete project");
      setDeleting(false);
    }
  }

  async function handleSaveEdit(fileId: string) {
    if (!user || !bundle || !bundle.latestVersion) return;
    const content = editedContents[fileId];
    if (content === undefined) return;
    setEditSaving(true);
    setEditSaveError("");
    try {
      await updateScriptFileContent(user.uid, bundle.meta.id, bundle.latestVersion.id, fileId, content);
      setBundle(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          artifacts: {
            ...prev.artifacts,
            scriptFiles: prev.artifacts.scriptFiles.map(f =>
              f.id === fileId ? { ...f, content } : f
            ),
          },
        };
      });
      setEditedContents(prev => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    } catch (err) {
      setEditSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  // ── Test case actions ───────────────────────────────────────────────────────

  async function handleAddTestCase() {
    if (!user || !bundle || !addForm) return;
    if (!addForm.title.trim()) { setAddError("Title is required."); return; }
    setAddSaving(true);
    setAddError("");
    try {
      const newTc = buildWebsiteTestCaseFromEditor(addForm, bundle.meta, {
        id: `TC-${String(localTestcases.length + 1).padStart(3, "0")}`,
        approved: true,
        sortOrder: localTestcases.length,
      });
      const updated = [...localTestcases, newTc];
      syncTestcasesState(updated);
      setShowAddModal(false);
      setAddForm(createEmptyTestCaseEditor(bundle.meta));
      await persistTestcases(updated, "testcase_added", `Test case added: ${newTc.title}`);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to save test case");
    } finally {
      setAddSaving(false);
    }
  }

  async function handleDeleteTestCase(tcId: string) {
    if (!user || !bundle) return;
    setDeleteSaving(true);
    setTcSaveError("");
    try {
      const updated = localTestcases.filter(tc => tc.id !== tcId);
      syncTestcasesState(updated);
      setDeletingId(null);
      await persistTestcases(updated, "testcase_deleted", `Test case deleted: ${tcId}`);
    } catch (err) {
      setTcSaveError(err instanceof Error ? err.message : "Failed to delete test case");
      await loadBundle(); // Revert on error
    } finally {
      setDeleteSaving(false);
    }
  }

  async function handleCopyTestCase(tc: WebsiteTestCase) {
    try {
      await navigator.clipboard.writeText(formatTestCaseAsMarkdown(tc));
      setCopiedTcId(tc.id);
      setTimeout(() => setCopiedTcId(null), 1800);
    } catch {
      // clipboard unavailable — silent fail
    }
  }

  async function handleRemoveOldScript() {
    if (!user || !bundle) return;
    setRemoveScriptSaving(true);
    try {
      await saveNewProjectVersion(user.uid, bundle.meta.id, {
        artifactOverrides: { scriptFiles: [] },
        invalidate: ["run"],
        trigger: "scripts_removed",
        summary: "Old scripts removed — test cases updated",
      });
      setBundle(prev => prev ? { ...prev, artifacts: { ...prev.artifacts, scriptFiles: [] } } : prev);
      setScriptsStale(false);
    } catch (err) {
      setTcSaveError(err instanceof Error ? err.message : "Failed to remove scripts");
    } finally {
      setRemoveScriptSaving(false);
    }
  }

  async function handleEditTestCase() {
    if (!user || !bundle || !editingTcId || !editForm) return;
    if (!editForm.title.trim()) { setEditErrorTc("Title is required"); return; }
    setEditSavingTc(true);
    setEditErrorTc("");
    try {
      const updated = localTestcases.map(tc =>
        tc.id === editingTcId ? buildEditedTestCase(tc, editForm, bundle.meta) : tc
      );
      syncTestcasesState(updated);
      setEditingTcId(null);
      setEditForm(null);
      await persistTestcases(updated, "testcase_edited", `Test case edited: ${editingTcId}`);
    } catch (err) {
      setEditErrorTc(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEditSavingTc(false);
    }
  }

  function handleOpenPackBuilder() {
    const nextSelections = Object.fromEntries(
      localTestcases.map((tc) => [tc.id, tc.packs.length ? tc.packs : suggestPacksForTestCase(tc)])
    );
    setPackSelections(nextSelections);
    setPackError("");
    setShowPackModal(true);
  }

  function toggleDraftPack(tcId: string, pack: WebsiteTestCasePack) {
    setPackSelections((current) => {
      const currentPacks = current[tcId] || [];
      const nextPacks = currentPacks.includes(pack)
        ? currentPacks.filter((entry) => entry !== pack)
        : [...currentPacks, pack];
      const testCase = localTestcases.find((entry) => entry.id === tcId);
      return {
        ...current,
        [tcId]: sanitizePackMembership(testCase?.caseKind || "page", nextPacks),
      };
    });
  }

  async function handleSavePackSelections() {
    if (!bundle) return;
    setPackSaving(true);
    setPackError("");
    try {
      const updated = localTestcases.map((tc) => {
        const nextPacks = sanitizePackMembership(tc.caseKind, packSelections[tc.id] || []);
        return {
          ...tc,
          packs: nextPacks,
          suite: deriveLegacySuite(tc.caseKind, nextPacks),
        };
      });
      syncTestcasesState(updated);
      setShowPackModal(false);
      await persistTestcases(updated, "packs_updated", "Pack memberships updated from Test Cases");
    } catch (err) {
      setPackError(err instanceof Error ? err.message : "Failed to save packs");
    } finally {
      setPackSaving(false);
    }
  }

  // ── Page mismatch modal actions ─────────────────────────────────────────────

  async function handleSaveAnywayFromMismatch() {
    if (!bundle || !pendingSaveAction) return;
    setShowPageMismatchSaveModal(false);

    // Proceed with original save intent
    if (pendingSaveAction.type === "testcases") {
      const { nextCases, trigger, summary } = pendingSaveAction.payload;
      await persistTestcases(nextCases, trigger, summary);
    } else if (pendingSaveAction.type === "meta") {
      await handleSaveMeta();
    }

    setPendingSaveAction(null);
    setDetectedCurrentPage(null);
  }

  async function handleCreateNewPageFromMismatch() {
    // TODO: Implement create new page logic
    // This would involve:
    // 1. Creating a new project with the detected page data
    // 2. Saving the pending action's testcases to the new project
    // 3. Closing the modal
    setShowPageMismatchSaveModal(false);
    setPendingSaveAction(null);
    setDetectedCurrentPage(null);
  }

  async function handleSwitchPageFromMismatch() {
    // TODO: Implement switch page logic
    // This would involve:
    // 1. Showing a dropdown of other pages in the project
    // 2. Switching to the selected page
    // 3. Then re-attempting the save
    setShowPageMismatchSaveModal(false);
    setPendingSaveAction(null);
    setDetectedCurrentPage(null);
  }

  // ── Script regeneration ─────────────────────────────────────────────────────

  async function handleRegenerateScript() {
    if (!user || !bundle) return;
    setRegenSaving(true);
    setRegenError("");
    try {
      if (regenFramework !== "selenium-python") {
        throw new Error("The combined project bundle flow is currently stabilized for Selenium Python only.");
      }

      // Step 1: get api key from extension
      const keyResult = await getExtensionApiKey();
      if (!keyResult.success || !keyResult.apiKey) {
        setRegenError("No AI key found in the extension. Open QA Deck extension and set your API key first.");
        setRegenSaving(false);
        return;
      }
      const apiKey = keyResult.apiKey;
      const bundlePages = projectPageBundles.length ? projectPageBundles : [bundle];
      const totalApprovedCases = bundlePages.flatMap((pageBundle) =>
        getApprovedCasesForBundlePack(pageBundle, selectedScriptPack)
      );
      if (!totalApprovedCases.length) {
        throw new Error(`No approved ${selectedScriptPack === "page" ? "test cases" : `${TESTCASE_PACK_LABELS[selectedScriptPack]} pack cases`} available to generate.`);
      }
      if (!backendOnline) {
        throw new Error("The local backend is offline. Start it with 'npm run dev' in the backend folder, then try again.");
      }

      const pagesPayload = bundlePages.map((pageBundle) => {
        const rawCases = Array.isArray(pageBundle.artifacts.testcases)
          ? (pageBundle.artifacts.testcases as Record<string, unknown>[])
          : [];
        const normalizedCases = rawCases.map((raw, index) => normalizeWebsiteTestCaseWithContext(raw, index, pageBundle.meta));
        return {
          pageId: pageBundle.meta.id,
          pageLabel: pageBundle.meta.pageLabel || pageBundle.meta.name,
          meta: {
            pageLabel: pageBundle.meta.pageLabel || pageBundle.meta.name,
            sourceUrl: pageBundle.meta.sourceUrl,
          },
          scan: pageBundle.artifacts.scan || pageBundle.artifacts.journey || {},
          testCases: normalizedCases,
          pageFingerprint:
            getBundlePageFingerprint(pageBundle) ||
            pageBundle.latestVersion?.pageFingerprints?.[pageBundle.meta.id] ||
            null,
        };
      });

      const framework = regenFramework;
      const res = await fetch(`${BACKEND_URL}/api/generate-project-bundle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          framework,
          pack: selectedScriptPack,
          projectName: getProjectAppDisplayName(bundle.meta),
          baseUrl: bundle.meta.sourceUrl,
          pages: pagesPayload,
          apiKey,
        }),
      });
      const data = await res.json();

      if (!data?.validation?.status) {
        throw new Error(data?.error || "Bundle generation failed.");
      }
      if (data.validation.status !== "passed") {
        const detail = data.validation.errors?.length
          ? `\n\n${data.validation.errors.join("\n")}`
          : "";
        throw new Error(`${data.error || "Generated bundle failed validation."}${detail}`);
      }

      const scriptFiles = (Array.isArray(data.files) ? data.files : []).map((file: Record<string, unknown>, index: number) => ({
        id: crypto.randomUUID(),
        filename: String(file.filename || `file-${index + 1}`),
        content: String(file.content || ""),
        key: file.key ? String(file.key) : null,
        group: file.group ? String(file.group) : selectedScriptPack,
        stepId: file.stepId ? String(file.stepId) : null,
        sortOrder: typeof file.sortOrder === "number" ? file.sortOrder : index,
      }));

      const generationMeta = {
        selectedPack: selectedScriptPack,
        includedPageIds: Array.isArray(data.includedPageIds) ? data.includedPageIds.map((entry: unknown) => String(entry)) : [],
        includedCaseIds: Array.isArray(data.includedCaseIds) ? data.includedCaseIds.map((entry: unknown) => String(entry)) : [],
        pageFingerprints: data.pageFingerprints && typeof data.pageFingerprints === "object"
          ? Object.fromEntries(Object.entries(data.pageFingerprints).map(([key, value]) => [key, String(value)]))
          : {},
        validation: data.validation,
        repairAttempts: Number(data.validation?.repairAttempts || 0),
        generationMode: data.generationMode || "project-bundle",
      };

      const targetProjectIds = siblingPages.length ? siblingPages.map((page) => page.id) : [bundle.meta.id];
      await Promise.all(
        targetProjectIds.map((targetProjectId) =>
          saveNewProjectVersion(user.uid, targetProjectId, {
            artifactOverrides: { scriptFiles, activeFramework: framework },
            invalidate: ["cicd", "run"],
            trigger: "script_regenerated",
            summary: `Run-ready bundle regenerated (${framework}, ${selectedScriptPack === "page" ? "Test Cases" : TESTCASE_PACK_LABELS[selectedScriptPack]})`,
            generationMeta,
          })
        )
      );

      if (data.download?.filename && data.download?.contentBase64) {
        downloadBase64File(String(data.download.filename), String(data.download.contentBase64));
      }

      setShowRegenModal(false);
      setScriptsStale(false);
      setSelectedRunPack(selectedScriptPack);
      await loadBundle();
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setRegenSaving(false);
    }
  }

  async function handleDownloadReadyBundle() {
    if (!bundle) return;
    if (!bundle.artifacts.scriptFiles.length) {
      setBundleDownloadError("Generate scripts first before downloading a bundle.");
      return;
    }

    setBundleDownloadSaving(true);
    setBundleDownloadError("");
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const framework = bundle.meta.activeFramework || regenFramework || "selenium-python";
      const packLabel = currentGeneratedPack === "page"
        ? "Test Cases"
        : TESTCASE_PACK_LABELS[currentGeneratedPack];
      const seen = new Set<string>();

      bundle.artifacts.scriptFiles.forEach((file) => {
        const filename = file.filename.replace(/^\/+/, "").trim();
        if (!filename || seen.has(filename)) return;
        seen.add(filename);
        const content = editedContents[file.id] ?? file.content;
        zip.file(filename, content);
      });

      buildFrameworkSupportFiles(framework).forEach((supportFile) => {
        const filename = supportFile.filename.replace(/^\/+/, "").trim();
        if (!filename || seen.has(filename)) return;
        seen.add(filename);
        zip.file(filename, supportFile.content);
      });

      zip.file(
        "README.md",
        buildBundleReadme({
          projectName: bundle.meta.name || "QA Deck",
          sourceUrl: bundle.meta.sourceUrl || "",
          framework,
          packLabel,
          fileCount: bundle.artifacts.scriptFiles.length,
        })
      );

      zip.file(
        "bundle-summary.json",
        JSON.stringify({
          projectId: bundle.meta.id,
          projectName: bundle.meta.name,
          sourceUrl: bundle.meta.sourceUrl,
          framework,
          selectedPack: packLabel,
          generatedPack: currentGeneratedPack === "page" ? "Test Cases" : TESTCASE_PACK_LABELS[currentGeneratedPack],
          updatedAt: new Date().toISOString(),
          fileCount: bundle.artifacts.scriptFiles.length,
          files: bundle.artifacts.scriptFiles.map((file) => ({
            filename: file.filename,
            group: file.group || "page",
            stepId: file.stepId || null,
          })),
        }, null, 2)
      );

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, buildDownloadFilename(bundle.meta.name || "QA Deck", packLabel));
    } catch (err) {
      setBundleDownloadError(err instanceof Error ? err.message : "Failed to build download bundle");
    } finally {
      setBundleDownloadSaving(false);
    }
  }

  // ── Re-scan ─────────────────────────────────────────────────────────────────

  async function handleRescan() {
    if (!user || !bundle) return;
    const sourceUrl = bundle.meta.sourceUrl;
    if (!sourceUrl) { setRescanError("No source URL saved for this project."); return; }
    setRescanning(true);
    setRescanError("");
    try {
      const result = await rescanProjectViaExtension({ projectId: bundle.meta.id, sourceUrl });
      if (!result.success || !result.scanData) {
        throw new Error(result.error || "Re-scan failed");
      }
      await saveNewProjectVersion(user.uid, bundle.meta.id, {
        artifactOverrides: { scan: result.scanData },
        invalidate: ["testcases", "scriptFiles", "cicd", "run"],
        trigger: "project_rescanned",
        summary: "App re-scanned from website",
      });
      await loadBundle();
    } catch (err) {
      setRescanError(err instanceof Error ? err.message : "Re-scan failed");
    } finally {
      setRescanning(false);
    }
  }

  async function handleCaptureFromApp() {
    if (!bundle) return;
    const sourceUrl = bundle.meta.sourceUrl;
    if (!sourceUrl) {
      setCaptureError("No source URL saved for this project.");
      return;
    }

    if (!extState.connected) {
      router.push("/dashboard/connect-extension");
      return;
    }

    setOpeningCapture(true);
    setCaptureError("");

    try {
      const result = await openProjectInExtension({
        projectId: bundle.meta.id,
        projectName: bundle.meta.name,
        sourceUrl,
        requestedTab: "record",
      });

      if (!result.success) {
        throw new Error(result.error || "QA Deck could not open Capture for this project.");
      }
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : "Failed to open Capture from the website");
    } finally {
      setOpeningCapture(false);
    }
  }

  // ── Save run result ──────────────────────────────────────────────────────────

  async function handleSaveRunResult() {
    if (!user || !bundle || (runState !== "done" && runState !== "error")) return;
    setRunSaving(true);
    setRunSaved(false);
    try {
      const passed = runResults.filter(r => r.status === "passed").length;
      const failed = runResults.filter(r => r.status !== "passed").length;
      const savedRun = {
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
        framework: bundle.meta.activeFramework || "unknown",
        headless: runHeadless,
        status: (runState === "done" ? "passed" : "failed") as "passed" | "failed",
        summary: `${passed} passed, ${failed} failed`,
        terminalOutput: runOutput.map(l => l.text).join("\n"),
        results: runResults,
      };
      await saveNewProjectVersion(user.uid, bundle.meta.id, {
        artifactOverrides: { run: savedRun },
        invalidate: [],
        trigger: "run_saved",
        summary: `Test run saved: ${savedRun.summary}`,
      });
      setRunSaved(true);
      setTimeout(() => setRunSaved(false), 3000);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to save run");
    } finally {
      setRunSaving(false);
    }
  }

  const quality = useMemo(() => (bundle ? deriveProjectQuality(bundle) : null), [bundle]);
  const activeFile = bundle?.artifacts.scriptFiles.find((file) => file.id === selectedFileId) || bundle?.artifacts.scriptFiles[0] || null;
  const currentGeneratedPack = ((bundle?.latestVersion?.selectedPack as "page" | WebsiteTestCasePack | undefined)
    || (bundle?.artifacts.scriptFiles[0]?.group as "page" | WebsiteTestCasePack | undefined)
    || "page");
  const activeRunCases = useMemo(() => getCasesForPack(localTestcases, currentGeneratedPack), [currentGeneratedPack, localTestcases]);
  const bundleReadiness = useMemo(
    () => deriveBundleReadiness(bundle?.latestVersion || null, projectPageBundles, selectedScriptPack, scriptsStale),
    [bundle?.latestVersion, projectPageBundles, scriptsStale, selectedScriptPack]
  );
  const effectiveScriptsStale = bundleReadiness.status === "needs_regeneration";
  const cicdEntries = bundle?.artifacts.cicd ? Object.entries(bundle.artifacts.cicd) : [];
  const notes = bundle?.artifacts.notes;
  const filteredTestcases = localTestcases.filter((tc) => {
    const libraryMatch =
      tcLibraryFilter === "all" ||
      (tcLibraryFilter === "flow" ? tc.caseKind === "flow" : tc.caseKind !== "flow");
    const catMatch = tcCategoryFilter === "all" || tc.category === tcCategoryFilter;
    const priMatch = tcPriorityFilter === "all" || tc.priority === tcPriorityFilter;
    return libraryMatch && catMatch && priMatch;
  });
  const packSummaries = useMemo(() => {
    const basePageCases = getCasesForPack(localTestcases, "page");
    const buildPackSummary = (pack: "page" | WebsiteTestCasePack) => {
      const cases = getCasesForPack(localTestcases, pack);
      const labels = Array.from(
        new Set(
          cases
            .map((tc) => getGroupingValue(tc, bundle?.meta || ({
              name: "Current project",
              pageKey: null,
              pageLabel: null,
              sourceUrl: "",
            } as ProjectMeta)))
            .filter(Boolean)
        )
      );
      return {
        pack,
        cases,
        labels,
        stale: effectiveScriptsStale && currentGeneratedPack === pack,
      };
    };

    return {
      page: buildPackSummary("page"),
      smoke: buildPackSummary("smoke"),
      regression: buildPackSummary("regression"),
      e2e: buildPackSummary("e2e"),
      missingPageCoverage: bundle
        ? bundle.meta.mode === "page" && basePageCases.length === 0
          ? [bundle.meta.pageLabel || bundle.meta.name]
          : []
        : [],
    };
  }, [bundle, currentGeneratedPack, effectiveScriptsStale, localTestcases]);
  const groupedTestcases = useMemo(() => {
    if (!bundle) return [];

    const groups = new Map<string, { key: string; label: string; kind: "page" | "flow"; cases: WebsiteTestCase[] }>();
    filteredTestcases
      .slice()
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
        return priorityWeight(right.priority) - priorityWeight(left.priority);
      })
      .forEach((tc) => {
        const group = buildGroupMeta(tc, bundle.meta);
        if (!groups.has(group.key)) {
          groups.set(group.key, { ...group, cases: [] });
        }
        groups.get(group.key)?.cases.push(tc);
      });

    return Array.from(groups.values()).sort((left, right) => {
      const leftOrder = Math.min(...left.cases.map((tc) => tc.sortOrder));
      const rightOrder = Math.min(...right.cases.map((tc) => tc.sortOrder));
      return leftOrder - rightOrder;
    });
  }, [bundle, filteredTestcases]);

  const siblingPages = useMemo(() => {
    if (!bundle) return [];
    const appKey = getProjectAppGroupKey(bundle.meta);
    return allProjects
      .filter((project) => getProjectAppGroupKey(project) === appKey)
      .sort((left, right) => {
        const leftLabel = left.pageLabel || left.name;
        const rightLabel = right.pageLabel || right.name;
        return leftLabel.localeCompare(rightLabel);
      });
  }, [allProjects, bundle]);

  const siblingPageIds = useMemo(() => siblingPages.map((page) => page.id).join("|"), [siblingPages]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjectPages() {
      if (!user || !siblingPages.length) {
        setProjectPageBundles(bundle ? [bundle] : []);
        return;
      }

      try {
        const nextBundles = await Promise.all(
          siblingPages.map((page) => getProjectBundle(user.uid, page.id).catch(() => null))
        );
        if (!cancelled) {
          setProjectPageBundles(nextBundles.filter(Boolean) as ProjectBundle[]);
        }
      } catch {
        if (!cancelled) {
          setProjectPageBundles(bundle ? [bundle] : []);
        }
      }
    }

    loadProjectPages();
    return () => {
      cancelled = true;
    };
  }, [bundle, siblingPageIds, siblingPages, user]);

  function openSiblingPage(pageId: string, nextTab?: ProjectTab) {
    if (nextTab) setActiveTab(nextTab);
    setSelectedProjectId(pageId);
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-bg text-white">
      <DashboardHeader user={user} signingOut={signingOut} onSignOut={handleSignOut} />

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 text-sm text-white/40 mb-6">
          <Link href="/dashboard/projects" className="hover:text-white transition-colors">Projects</Link>
          <span>/</span>
          <span className="text-white/65">{bundle?.meta.name || "Project"}</span>
        </div>

        {loading ? (
          <div className="min-h-[320px] flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="border border-red-500/20 bg-red-500/10 rounded-2xl p-4 text-sm text-red-200">
            {error}
          </div>
        ) : bundle && quality ? (
          <div>
            {/* ── Persistent header ────────────────────────────────────────── */}
            <div className="mb-8">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <h1 className="text-3xl font-bold mb-1">{bundle.meta.name}</h1>
                  <p className="text-white/45 text-sm">{bundle.meta.sourceUrl || "No source URL stored."}</p>
                  {bundle.meta.appName ? (
                    <div className="mt-3">
                      <Link href="/dashboard/suites" className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors">
                        App suite: {bundle.meta.appName}
                      </Link>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {bundle.meta.sourceUrl && (
                    <button
                      onClick={handleCaptureFromApp}
                      disabled={openingCapture || !extState.connected}
                      title={!extState.connected ? "Connect QA Deck extension to capture from this project" : "Open the live app in QA Deck Capture mode"}
                      className="text-xs px-3 py-1.5 rounded-full border border-green/20 bg-green/10 text-green hover:bg-green/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {openingCapture ? (
                        <><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> Opening capture…</>
                      ) : "Capture from app"}
                    </button>
                  )}
                  {bundle.meta.sourceUrl && (
                    <a
                      href={bundle.meta.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/65 hover:text-white hover:border-white/20 transition-colors"
                    >
                      Open live page ↗
                    </a>
                  )}
                  {/* Re-scan button */}
                  {bundle.meta.sourceUrl && (
                    bundle.meta.mode === "page" ? (
                      <button
                        onClick={handleRescan}
                        disabled={rescanning || !extState.connected}
                        title={!extState.connected ? "Connect QA Deck extension to re-scan" : "Re-scan the app to update scan data"}
                        className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/65 hover:text-white hover:border-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        {rescanning ? (
                          <><span className="w-3 h-3 border border-white/40 border-t-transparent rounded-full animate-spin" /> Scanning…</>
                        ) : "Re-scan page"}
                      </button>
                    ) : (
                      <button
                        disabled
                        title="Re-scan is for page projects only. Use the extension Capture tab for journeys."
                        className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/30 cursor-not-allowed"
                      >
                        Re-scan page
                      </button>
                    )
                  )}
                  <span className={`text-xs px-3 py-1.5 rounded-full border ${statusTone(bundle.meta.status)}`}>{bundle.meta.status}</span>
                </div>
              </div>
              {rescanError && (
                <div className="mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {rescanError}
                </div>
              )}
              {captureError && (
                <div className="mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {captureError}
                </div>
              )}

              <div className="mt-5 rounded-3xl border border-green/15 bg-[linear-gradient(135deg,rgba(29,158,117,0.10),rgba(255,255,255,0.02))] p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] lg:items-center">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-green/70 font-mono mb-3">AI workflow</p>
                    <h2 className="text-xl font-semibold mb-2">AI drafts the work here. You review, validate, and download the run-ready bundle.</h2>
                    <p className="text-sm text-white/50 max-w-2xl leading-6">
                      This project page combines approved test cases from saved pages into one Selenium Python bundle. QA Deck grounds the page scans, validates the generated files before they are marked ready, and helps you see when a bundle needs regeneration.
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-3 lg:grid-cols-1 gap-3">
                    {[
                      ["Test Cases", "Review and approve the AI-generated checks on each saved page before bundling."],
                      ["Scripts", "Generate one validated Selenium Python bundle from the approved project cases."],
                      ["Runs", "Execute the saved bundle and keep the run result when the output is worth preserving."],
                    ].map(([title, body]) => (
                      <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
                        <div className="text-sm font-medium text-white mb-1">{title}</div>
                        <p className="text-xs text-white/45 leading-5">{body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {siblingPages.length > 0 && (
                <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.22em] text-white/35">Pages in {getProjectAppDisplayName(bundle.meta)}</div>
                      <div className="text-sm text-white/50 mt-1">Treat this project as one website or web app with multiple saved pages.</div>
                    </div>
                    <div className="text-xs px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-white/55">
                      {siblingPages.length} pages
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {siblingPages.map((page) => {
                      const active = page.id === bundle.meta.id;
                      return (
                        <button
                          type="button"
                          key={page.id}
                          onClick={() => openSiblingPage(page.id)}
                          className={`px-3 py-2 rounded-xl border text-sm transition-colors ${
                            active
                              ? "border-green/25 bg-green/10 text-green"
                              : "border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20"
                          }`}
                        >
                          <div className="font-medium">{page.pageLabel || page.name}</div>
                          <div className="text-[11px] opacity-70 mt-0.5">
                            {page.artifactCounts.testCases} cases · {page.artifactCounts.scriptFiles} scripts
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 mt-4">
                <div className="rounded-xl bg-white/4 border border-white/8 px-4 py-2.5 flex gap-3 items-center">
                  <span className="text-xs text-white/40">Current page</span>
                  <span className="font-semibold">{bundle.meta.pageLabel || bundle.meta.name}</span>
                </div>
                <div className="rounded-xl bg-white/4 border border-white/8 px-4 py-2.5 flex gap-3 items-center">
                  <span className="text-xs text-white/40">Framework</span>
                  <span className="font-semibold capitalize">{bundle.meta.activeFramework}</span>
                </div>
                <div className="rounded-xl bg-white/4 border border-white/8 px-4 py-2.5 flex gap-3 items-center">
                  <span className="text-xs text-white/40">Updated</span>
                  <span className="font-semibold">{formatDateTime(bundle.meta.updatedAt)}</span>
                </div>
                <div className="rounded-xl bg-white/4 border border-white/8 px-4 py-2.5 flex gap-3 items-center">
                  <span className="text-xs text-white/40">AI status</span>
                  <span className="font-semibold">
                    {localTestcases.length > 0 || bundle.artifacts.scriptFiles.length > 0
                      ? "Generated content available"
                      : "Ready to generate"}
                  </span>
                </div>
                <div className={`rounded-xl border px-4 py-2.5 flex gap-3 items-center ${readinessTone(bundleReadiness.status)}`}>
                  <span className="text-xs opacity-70">Bundle status</span>
                  <span className="font-semibold">{bundleReadiness.label}</span>
                </div>
              </div>

              <details className="mt-4 group">
                <summary className="text-xs text-white/40 hover:text-white/70 cursor-pointer select-none list-none flex items-center gap-1.5 w-fit">
                  <span className="group-open:rotate-90 transition-transform inline-block text-[10px]">▶</span>
                  Edit project settings
                </summary>
                <div className="mt-3 bg-bg-card border border-border rounded-2xl p-6 grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Saved page title</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green" />
                  </div>
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Status</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value as ProjectMeta["status"])} className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green">
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="review">Review</option>
                      <option value="done">Done</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Tags</label>
                    <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="smoke, checkout" className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green" />
                  </div>
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Parent project</label>
                    <input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="e.g. Storefront QA" className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green" />
                  </div>
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Page label</label>
                    <input value={pageLabel} onChange={(e) => setPageLabel(e.target.value)} placeholder="e.g. Login page" className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green" />
                  </div>
                  <div className="flex items-end gap-2">
                    <button onClick={handleSaveMeta} disabled={saving} className="flex-1 bg-green text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-green-dark transition-colors disabled:opacity-60 text-sm">
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => { setDeleteConfirmText(""); setDeleteError(""); setShowDeleteModal("page"); }}
                      className="px-4 py-2.5 rounded-xl border border-red-500/25 bg-red-500/8 text-red-400 hover:bg-red-500/15 transition-colors text-sm font-medium shrink-0"
                    >
                      Delete page
                    </button>
                    <button
                      onClick={() => { setDeleteConfirmText(""); setDeleteError(""); setShowDeleteModal("project"); }}
                      className="px-4 py-2.5 rounded-xl border border-red-500/25 bg-red-500/8 text-red-300 hover:bg-red-500/15 transition-colors text-sm font-medium shrink-0"
                    >
                      Delete project
                    </button>
                  </div>
                </div>
              </details>
            </div>

            {/* ── Tab bar ──────────────────────────────────────────────────── */}
            <div className="flex gap-1 border-b border-border mb-8 overflow-x-auto">
              {(
                [
                  { id: "pages", label: "Pages", badge: siblingPages.length || 1, danger: false },
                  { id: "pagecases", label: "Test Cases", badge: getCasesForPack(localTestcases, "page").length || null, danger: false },
                  { id: "packs", label: "Packs", badge: TESTCASE_PACK_ORDER.reduce((sum, pack) => sum + getCasesForPack(localTestcases, pack).length, 0) || null, danger: false },
                  { id: "scripts", label: "Scripts", badge: bundle.artifacts.scriptFiles.length || null, danger: false },
                  { id: "runs", label: "Runs", badge: runResults.length || (bundle.artifacts.run ? 1 : null), danger: false },
                  { id: "capture", label: "Capture", badge: bundle.meta.mode === "journey" ? 1 : null, danger: false },
                  { id: "locators", label: "Locators", badge: (() => { const s = bundle.artifacts.scan as Record<string,unknown>|null; if (!s) return null; const forms = Array.isArray(s.forms) ? (s.forms as {fields?:unknown[]|null}[]).reduce((a,f) => a + (f.fields?.length || 0), 0) : 0; return (Array.isArray(s.buttons) ? (s.buttons as unknown[]).length : 0) + (Array.isArray(s.inputs) ? (s.inputs as unknown[]).length : 0) + (Array.isArray(s.links) ? (s.links as unknown[]).length : 0) + forms || null; })(), danger: false },
                ] as { id: typeof activeTab; label: string; badge: number | null; danger: boolean }[]
              ).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                    activeTab === tab.id ? "border-green text-white" : "border-transparent text-white/45 hover:text-white/80"
                  }`}
                >
                  {tab.label}
                  {tab.badge != null && tab.badge > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                      tab.danger ? "bg-red-500/10 text-red-300 border-red-500/20" : "bg-white/5 text-white/50 border-white/10"
                    }`}>{tab.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Tab: Pages ───────────────────────────────────────────────── */}
            {activeTab === "pages" && (
              <div className="grid gap-6">
                <div className="bg-bg-card border border-border rounded-3xl p-6">
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div>
                      <h2 className="text-xl font-semibold">Pages</h2>
                      <p className="text-sm text-white/40 mt-1">
                        This project currently groups multiple saved pages. Open a page to work on its cases, scripts, locators, or capture flow.
                      </p>
                    </div>
                    <div className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/50">
                      {siblingPages.length || 1} saved pages
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {siblingPages.map((page) => {
                      const active = page.id === bundle.meta.id;
                      return (
                        <div
                          key={page.id}
                          className={`rounded-3xl border p-5 transition-colors ${
                            active
                              ? "border-green/25 bg-green/5"
                              : "border-white/8 bg-white/3"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusTone(page.status)}`}>
                                  {page.status}
                                </span>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">
                                  {page.mode}
                                </span>
                                {active && (
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-green/10 border border-green/20 text-green">
                                    current
                                  </span>
                                )}
                              </div>
                              <h3 className="text-lg font-semibold">{page.pageLabel || page.name}</h3>
                              <p className="text-xs text-white/40 mt-1 truncate">{page.sourceUrl || "No source URL"}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xs text-white/35">Updated</div>
                              <div className="text-sm text-white/70 mt-1">{formatDateTime(page.updatedAt)}</div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mb-4">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5">
                              <span className="text-[11px] uppercase tracking-[0.18em] text-white/35">Cases</span>
                              <span className="text-sm font-semibold text-white">{page.artifactCounts.testCases}</span>
                            </div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5">
                              <span className="text-[11px] uppercase tracking-[0.18em] text-white/35">Scripts</span>
                              <span className="text-sm font-semibold text-white">{page.artifactCounts.scriptFiles}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openSiblingPage(page.id)}
                              className={`text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors ${
                                active
                                  ? "border-green/30 bg-green/15 text-green"
                                  : "border-green/25 bg-green/10 text-green hover:bg-green/15"
                              }`}
                            >
                              {active ? "Current page" : "View page"}
                            </button>
                            {active && (
                              <>
                                <button
                                  onClick={() => setActiveTab("pagecases")}
                                  className="text-xs px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20 transition-colors"
                                >
                                  Test Cases
                                </button>
                                <button
                                  onClick={() => setActiveTab("scripts")}
                                  className="text-xs px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20 transition-colors"
                                >
                                  Scripts
                                </button>
                              </>
                            )}
                            {!active && (
                              <>
                                <button
                                  onClick={() => openSiblingPage(page.id, "pagecases")}
                                  className="text-xs px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20 transition-colors"
                                >
                                  Test Cases
                                </button>
                                <button
                                  onClick={() => openSiblingPage(page.id, "scripts")}
                                  className="text-xs px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/20 transition-colors"
                                >
                                  Scripts
                                </button>
                              </>
                            )}
                            {active && (
                              <button
                                onClick={() => {
                                  setDeleteConfirmText("");
                                  setDeleteError("");
                                  setShowDeleteModal("page");
                                }}
                                className="ml-auto text-xs px-3 py-1.5 rounded-xl border border-red-500/15 bg-transparent text-red-400/60 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                              >
                                Delete page
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: Test Cases ──────────────────────────────────────────── */}
            {activeTab === "pagecases" && (
              <div className="grid gap-6">
                <div className="bg-bg-card border border-border rounded-3xl p-6">
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div>
                      <h2 className="text-xl font-semibold">Test Cases</h2>
                      <p className="text-sm text-white/40 mt-1">Build the canonical case library first, then create Smoke, Regression, and E2E packs from it.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/50">
                        {tcLibraryFilter === "all" && tcCategoryFilter === "all" && tcPriorityFilter === "all"
                          ? `${localTestcases.length} cases`
                          : `${filteredTestcases.length} of ${localTestcases.length}`}
                      </span>
                      <button
                        onClick={handleOpenPackBuilder}
                        className="text-xs px-3 py-1.5 rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition-colors"
                      >
                        Create packs
                      </button>
                      <button
                        onClick={() => {
                          if (!bundle) return;
                          setShowAddModal(true);
                          setAddError("");
                          setAddForm(createEmptyTestCaseEditor(bundle.meta));
                        }}
                        className="text-xs px-3 py-1.5 rounded-full border border-green/25 bg-green/10 text-green hover:bg-green/15 transition-colors flex items-center gap-1"
                      >
                        + Add test case
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 mb-5">
                    <div className="flex gap-1.5 flex-wrap">
                      {TESTCASE_LIBRARY_FILTERS.map((suite) => (
                        <button
                          key={suite.id}
                          onClick={() => setTcLibraryFilter(suite.id)}
                          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                            tcLibraryFilter === suite.id
                              ? "bg-green/15 text-green border-green/25"
                              : "border-white/8 text-white/35 hover:text-white/60"
                          }`}
                        >
                          {suite.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {["all","functional","negative","boundary","navigation","ui","accessibility","e2e","performance","security"].map(cat => (
                        <button key={cat} onClick={() => setTcCategoryFilter(cat)}
                          className={`text-[11px] px-2.5 py-1 rounded-full border capitalize transition-colors ${
                            tcCategoryFilter === cat ? "bg-white/10 text-white border-white/25" : "border-white/8 text-white/35 hover:text-white/60"
                          }`}
                        >{cat === "all" ? "All categories" : cat}</button>
                      ))}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {["all","critical","high","medium","low"].map(pri => (
                        <button key={pri} onClick={() => setTcPriorityFilter(pri)}
                          className={`text-[11px] px-2.5 py-1 rounded-full border capitalize transition-colors ${
                            tcPriorityFilter === pri
                              ? pri === "critical" ? "bg-red-500/20 text-red-300 border-red-500/30"
                              : pri === "high" ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                              : "bg-white/10 text-white border-white/25"
                              : "border-white/8 text-white/35 hover:text-white/60"
                          }`}
                        >{pri === "all" ? "All priorities" : pri}</button>
                      ))}
                    </div>
                  </div>

                  {effectiveScriptsStale && (
                    <div className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-4">
                      <div className="flex items-start gap-2.5 mb-3">
                        <span className="text-amber-400 mt-0.5 shrink-0">⚠</span>
                        <div>
                          <div className="text-sm font-semibold text-amber-300">Test cases changed</div>
                          <div className="text-xs text-amber-200/60 mt-0.5">
                            {bundle.artifacts.scriptFiles.length > 0
                              ? "Your saved bundle no longer matches the current approved test cases across this project. Generate a new bundle when you are ready."
                              : "Test cases updated. Generate a new bundle when ready."}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center flex-wrap gap-2">
                        <button
                          onClick={() => { setScriptsStale(false); setActiveTab("scripts"); setShowRegenModal(true); }}
                          className="text-xs px-3 py-1.5 rounded-xl bg-green text-white font-semibold hover:bg-green/80 transition-colors"
                        >
                          ↻ Generate bundle
                        </button>
                        {bundle.artifacts.scriptFiles.length > 0 && (
                          <button
                            onClick={handleRemoveOldScript}
                            disabled={removeScriptSaving}
                            className="text-xs px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-60"
                          >
                            {removeScriptSaving ? "Removing…" : "✕ Remove old bundle"}
                          </button>
                        )}
                        <button
                          onClick={() => setScriptsStale(false)}
                          className="text-xs px-3 py-1.5 rounded-xl border border-white/10 text-white/40 hover:text-white/70 transition-colors"
                        >
                          Keep old version
                        </button>
                      </div>
                    </div>
                  )}

                  {tcSaveError && (
                    <div className="mb-4 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{tcSaveError}</div>
                  )}

                  {!localTestcases.length ? (
                    <div className="text-sm text-white/35">No saved test cases in the latest version. Add one above.</div>
                  ) : !groupedTestcases.length ? (
                    <div className="text-sm text-white/35">No cases match the current library view and filters.</div>
                  ) : (
                    <div className="space-y-4">
                      {groupedTestcases.map((group) => {
                        const groupCaseIds = group.cases.map((tc) => tc.id);
                        return (
                          <div key={group.key} className="rounded-3xl border border-white/8 bg-white/3 p-4">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="text-base font-semibold">{group.label}</h3>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50 uppercase tracking-[0.18em]">
                                    {group.kind}
                                  </span>
                                </div>
                                <p className="text-xs text-white/35 mt-1">
                                  {tcLibraryFilter === "all" ? "Full library view" : tcLibraryFilter === "flow" ? "Flow case view" : "Test case view"} · {group.cases.length} cases
                                </p>
                              </div>
                            </div>

                            <div className="space-y-2">
                              {group.cases.map((tc, index) => {
                                const isExpanded = expandedTcId === tc.id;
                                const isFirst = index === 0;
                                const isLast = index === group.cases.length - 1;
                                return (
                                  <div
                                    key={tc.id}
                                    draggable
                                    onDragStart={(event) => {
                                      event.dataTransfer.effectAllowed = "move";
                                      event.dataTransfer.setData("text/plain", tc.id);
                                      setDraggingTcId(tc.id);
                                    }}
                                    onDragOver={(event) => {
                                      event.preventDefault();
                                      event.dataTransfer.dropEffect = "move";
                                      if (dragOverTcId !== tc.id) setDragOverTcId(tc.id);
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      const fromId = event.dataTransfer.getData("text/plain");
                                      if (fromId && fromId !== tc.id) {
                                        handleDragReorderWithinGroup(groupCaseIds, fromId, tc.id);
                                      } else {
                                        setDraggingTcId(null);
                                        setDragOverTcId(null);
                                      }
                                    }}
                                    onDragEnd={() => {
                                      setDraggingTcId(null);
                                      setDragOverTcId(null);
                                    }}
                                    onDragLeave={(event) => {
                                      if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverTcId(null);
                                    }}
                                    className={`rounded-2xl border overflow-hidden transition-all ${
                                      draggingTcId === tc.id
                                        ? "opacity-40 scale-[0.99] border-white/8 bg-white/3"
                                        : dragOverTcId === tc.id && draggingTcId !== tc.id
                                        ? "border-green/40 bg-green/5 shadow-lg shadow-green/10"
                                        : "border-white/8 bg-white/3"
                                    }`}
                                  >
                                    <div className="flex items-center gap-3 px-4 py-3">
                                      <div className="flex items-center gap-1 shrink-0">
                                        <div
                                          className="cursor-grab active:cursor-grabbing text-white/20 hover:text-white/50 transition-colors px-1 select-none text-base leading-none"
                                          title="Drag to reorder within this group"
                                          onMouseDown={(event) => event.stopPropagation()}
                                        >
                                          ⠿
                                        </div>
                                        <div className="flex flex-col gap-0">
                                          <button
                                            onClick={() => handleReorderWithinGroup(groupCaseIds, tc.id, "up")}
                                            disabled={isFirst}
                                            className="text-[10px] leading-none px-0.5 py-0.5 text-white/20 hover:text-white/60 disabled:opacity-0 transition-colors"
                                            title="Move up"
                                          >
                                            ▲
                                          </button>
                                          <button
                                            onClick={() => handleReorderWithinGroup(groupCaseIds, tc.id, "down")}
                                            disabled={isLast}
                                            className="text-[10px] leading-none px-0.5 py-0.5 text-white/20 hover:text-white/60 disabled:opacity-0 transition-colors"
                                            title="Move down"
                                          >
                                            ▼
                                          </button>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => handleToggleApproval(tc.id)}
                                        className={`shrink-0 text-[10px] px-2 py-1 rounded-full border transition-colors ${
                                          tc.approved
                                            ? "bg-green/10 text-green border-green/20"
                                            : "bg-white/5 text-white/45 border-white/10"
                                        }`}
                                        title={tc.approved ? "Approved for generation" : "Excluded from generation"}
                                      >
                                        {tc.approved ? "Approved" : "Pending"}
                                      </button>

                                      <div
                                        className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer"
                                        onClick={() => setExpandedTcId(isExpanded ? null : tc.id)}
                                      >
                                        <span className={`text-white/25 text-[9px] transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                                        <div className="min-w-0">
                                          <div className="text-[11px] text-white/35 font-mono">{tc.id}</div>
                                          <div className="font-medium text-white text-sm leading-snug">{tc.title}</div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">{TESTCASE_KIND_LABELS[tc.caseKind]}</span>
                                        {tc.packs.map((pack) => (
                                          <span key={pack} className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                            pack === "smoke"
                                              ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
                                              : pack === "regression"
                                              ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                              : "bg-purple-500/10 text-purple-300 border-purple-500/20"
                                          }`}>
                                            {TESTCASE_PACK_LABELS[pack]}
                                          </span>
                                        ))}
                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50 hidden sm:inline">{tc.category}</span>
                                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${tc.priority === "critical" ? "bg-red-500/10 text-red-300 border-red-500/20" : tc.priority === "high" ? "bg-amber-500/10 text-amber-300 border-amber-500/20" : "bg-green/10 text-green border-green/15"}`}>{tc.priority}</span>
                                        <button
                                          onClick={() => {
                                            setEditingTcId(tc.id);
                                            setEditErrorTc("");
                                            setEditForm({
                                              title: tc.title,
                                              caseKind: tc.caseKind,
                                              packs: [...tc.packs],
                                              category: tc.category,
                                              priority: tc.priority,
                                              preconditions: tc.preconditions || "",
                                              steps: tc.steps.length ? [...tc.steps] : [""],
                                              expectedResult: tc.expectedResult || "",
                                              tags: (tc.tags || []).join(", "),
                                              scope: tc.scope,
                                              groupingLabel: tc.caseKind === "flow"
                                                ? tc.flowLabel || tc.groupLabel || ""
                                                : tc.pageLabel || tc.groupLabel || "",
                                              source: tc.source,
                                            });
                                          }}
                                          className="text-[11px] px-2 py-0.5 rounded-lg border border-white/10 text-white/45 hover:text-white hover:border-white/25 transition-colors"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          onClick={() => handleCopyTestCase(tc)}
                                          className="text-[11px] px-2 py-0.5 rounded-lg border border-white/10 text-white/45 hover:text-white transition-colors"
                                          title="Copy as markdown"
                                        >
                                          {copiedTcId === tc.id ? "✓" : "Copy"}
                                        </button>
                                        {deletingId === tc.id ? (
                                          <div className="flex items-center gap-1">
                                            <span className="text-[11px] text-white/50">Sure?</span>
                                            <button onClick={() => handleDeleteTestCase(tc.id)} disabled={deleteSaving} className="text-[11px] px-2 py-0.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50">{deleteSaving ? "…" : "Yes"}</button>
                                            <button onClick={() => setDeletingId(null)} disabled={deleteSaving} className="text-[11px] px-2 py-0.5 rounded-lg border border-white/10 text-white/40 hover:text-white transition-colors">✕</button>
                                          </div>
                                        ) : (
                                          <button onClick={() => setDeletingId(tc.id)} className="text-[11px] px-2 py-0.5 rounded-lg border border-white/10 text-white/35 hover:text-red-300 hover:border-red-500/20 transition-colors">Delete</button>
                                        )}
                                      </div>
                                    </div>

                                    {isExpanded && (
                                      <div className="px-4 pb-4 border-t border-white/6 pt-3 space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">
                                            {TESTCASE_KIND_LABELS[tc.caseKind]}
                                          </span>
                                          {(tc.pageLabel || tc.flowLabel) && (
                                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">
                                              {tc.caseKind === "flow" ? tc.flowLabel : tc.pageLabel}
                                            </span>
                                          )}
                                          <select
                                            value={tc.caseKind}
                                            onChange={(event) => handleQuickCaseKindChange(tc.id, event.target.value as WebsiteTestCaseKind)}
                                            className="text-[11px] bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white/70 outline-none focus:border-green"
                                          >
                                            {(["page", "step", "flow"] as WebsiteTestCaseKind[]).map((caseKind) => (
                                              <option key={caseKind} value={caseKind}>
                                                {TESTCASE_KIND_LABELS[caseKind]}
                                              </option>
                                            ))}
                                          </select>
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            {TESTCASE_PACK_ORDER.map((pack) => {
                                              const disabled = pack === "e2e" && tc.caseKind !== "flow";
                                              const active = tc.packs.includes(pack);
                                              return (
                                                <button
                                                  key={pack}
                                                  type="button"
                                                  disabled={disabled}
                                                  onClick={() => handleQuickPackToggle(tc.id, pack)}
                                                  className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                                                    active
                                                      ? pack === "smoke"
                                                        ? "bg-blue-500/15 text-blue-300 border-blue-500/25"
                                                        : pack === "regression"
                                                        ? "bg-amber-500/15 text-amber-300 border-amber-500/25"
                                                        : "bg-purple-500/15 text-purple-300 border-purple-500/25"
                                                      : "bg-white/5 text-white/40 border-white/10 hover:text-white/70"
                                                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                                                  title={disabled ? "E2E pack is reserved for flow cases" : undefined}
                                                >
                                                  {active ? "Included in " : "Add to "}{TESTCASE_PACK_LABELS[pack]}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>

                                        {tc.preconditions && (
                                          <div>
                                            <div className="text-[11px] text-white/35 mb-1 uppercase tracking-wide">Preconditions</div>
                                            <div className="text-sm text-white/60">{tc.preconditions}</div>
                                          </div>
                                        )}
                                        {tc.steps.length > 0 && (
                                          <div>
                                            <div className="text-[11px] text-white/35 mb-1.5 uppercase tracking-wide">Steps</div>
                                            <div className="space-y-1.5">
                                              {tc.steps.map((step, i) => (
                                                <div key={i} className="flex gap-2.5 text-sm text-white/65">
                                                  <span className="text-white/25 shrink-0 font-mono text-[11px] w-4 text-right mt-0.5">{i + 1}.</span>
                                                  <span>{step}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {tc.expectedResult && (
                                          <div>
                                            <div className="text-[11px] text-white/35 mb-1 uppercase tracking-wide">Expected result</div>
                                            <div className="text-sm text-white/70">{tc.expectedResult}</div>
                                          </div>
                                        )}
                                        {tc.tags?.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5 pt-1">
                                            {tc.tags.map((tag) => (
                                              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/8 text-white/35">{tag}</span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ── Tab: Packs ──────────────────────────────────────────────── */}
            {activeTab === "packs" && (
              <div className="grid gap-6">
                <div className="bg-bg-card border border-border rounded-3xl p-6">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-xl font-semibold">Packs</h2>
                      <p className="text-sm text-white/40 mt-1">Turn approved page and flow cases into reusable Smoke, Regression, and E2E packs.</p>
                    </div>
                    <button
                      onClick={handleOpenPackBuilder}
                      className="text-xs px-3 py-1.5 rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition-colors"
                    >
                      Review pack memberships
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    {TESTCASE_PACK_ORDER.map((pack) => {
                      const summary = packSummaries[pack];
                      return (
                        <div key={pack} className="rounded-2xl border border-white/8 bg-white/3 p-5">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <span className={`text-[11px] px-2 py-1 rounded-full border ${
                              pack === "smoke"
                                ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
                                : pack === "regression"
                                ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                : "bg-purple-500/10 text-purple-300 border-purple-500/20"
                            }`}>
                              {TESTCASE_PACK_LABELS[pack]}
                            </span>
                            <span className="text-2xl font-semibold">{summary.cases.length}</span>
                          </div>
                          <div className="text-xs text-white/45 mb-3">
                            {summary.labels.length ? `${summary.labels.length} pages / flows covered` : "No included cases yet"}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-4">
                            {summary.labels.slice(0, 4).map((label) => (
                              <span key={label} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/45">
                                {label}
                              </span>
                            ))}
                            {summary.labels.length > 4 && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/35">
                                +{summary.labels.length - 4} more
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedScriptPack(pack);
                                setActiveTab("scripts");
                              }}
                              className="text-xs px-3 py-1.5 rounded-xl bg-green text-white font-semibold hover:bg-green/80 transition-colors"
                            >
                              Generate script
                            </button>
                            <button
                              onClick={() => {
                                setSelectedRunPack(pack);
                                setActiveTab("runs");
                              }}
                              className="text-xs px-3 py-1.5 rounded-xl border border-white/10 text-white/55 hover:text-white transition-colors"
                            >
                              Run
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-bg-card border border-border rounded-3xl p-6">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">Page coverage</h3>
                      <p className="text-sm text-white/40 mt-1">Approved test cases are your source of truth. Packs are just filtered subsets.</p>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/50">
                      {packSummaries.page.cases.length} approved test cases
                    </span>
                  </div>

                  {packSummaries.missingPageCoverage.length > 0 ? (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-4 text-sm text-amber-200/80">
                      Missing page coverage for: {packSummaries.missingPageCoverage.join(", ")}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {packSummaries.page.labels.map((label) => (
                        <span key={label} className="text-[11px] px-2.5 py-1 rounded-full bg-green/10 border border-green/15 text-green">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab: Scripts ─────────────────────────────────────────────── */}
            {activeTab === "scripts" && (
              <div className="grid gap-6">
                {effectiveScriptsStale && bundle.artifacts.scriptFiles.length > 0 && (
                  <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-amber-500/20 bg-amber-500/8 text-xs">
                    <div className="flex items-center gap-2 text-amber-300">
                      <span>⚠</span>
                      <span>Approved cases changed — this saved bundle is from the previous generation.</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => setShowRegenModal(true)} className="px-2.5 py-1 rounded-lg bg-green text-white font-semibold hover:bg-green/80 transition-colors">↻ Regenerate</button>
                      <button onClick={handleRemoveOldScript} disabled={removeScriptSaving} className="px-2.5 py-1 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/15 transition-colors disabled:opacity-60">{removeScriptSaving ? "…" : "✕ Remove"}</button>
                      <button onClick={() => setScriptsStale(false)} className="px-2.5 py-1 rounded-lg border border-white/10 text-white/40 hover:text-white/70 transition-colors">Keep</button>
                    </div>
                  </div>
                )}
                <div className="bg-bg-card border border-border rounded-3xl p-6">
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div>
                      <h2 className="text-xl font-semibold">Run-ready bundle</h2>
                      <p className="text-sm text-white/40 mt-1">Generate and review the validated Selenium Python bundle for the selected project pack.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                        {(["page", ...TESTCASE_PACK_ORDER] as ("page" | WebsiteTestCasePack)[]).map((pack) => (
                          <button
                            key={pack}
                            onClick={() => setSelectedScriptPack(pack)}
                            className={`px-3 py-1.5 text-xs font-semibold transition-colors border-r last:border-r-0 border-white/10 ${
                              selectedScriptPack === pack ? "bg-white/10 text-white" : "text-white/45 hover:text-white hover:bg-white/5"
                            }`}
                          >
                            {pack === "page" ? "Page" : TESTCASE_PACK_LABELS[pack]}
                          </button>
                        ))}
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/50">{bundle.artifacts.scriptFiles.length} files</span>
                      {bundle.artifacts.scriptFiles.length > 0 && (
                        <button
                          onClick={handleDownloadReadyBundle}
                          disabled={bundleDownloadSaving}
                          className="text-xs px-3 py-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors flex items-center gap-1 disabled:opacity-60"
                        >
                          {bundleDownloadSaving ? "Preparing ZIP…" : "Download bundle"}
                        </button>
                      )}
                      <button
                        onClick={() => setShowRegenModal(true)}
                        className="text-xs px-3 py-1.5 rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1"
                      >
                        Generate bundle
                      </button>
                      {backendOnline && bundle.artifacts.scriptFiles.length > 0 && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedRunPack(currentGeneratedPack);
                              setActiveTab("runs");
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green text-white text-xs font-semibold hover:bg-green/80 transition-colors"
                          >
                            Open Runs
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {bundleDownloadError && (
                    <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3 text-xs text-red-200">
                      {bundleDownloadError}
                    </div>
                  )}
                  <div className="mb-4 text-xs text-white/40">
                    Selected pack: <span className="text-white/75">{selectedScriptPack === "page" ? "Test Cases" : TESTCASE_PACK_LABELS[selectedScriptPack]}</span>
                    {bundle.artifacts.scriptFiles.length > 0 && (
                      <span className="ml-3">Current generated bundle: <span className="text-white/75">{currentGeneratedPack === "page" ? "Test Cases" : TESTCASE_PACK_LABELS[currentGeneratedPack]}</span></span>
                    )}
                  </div>
                  <div className={`mb-4 rounded-2xl border px-4 py-3 ${readinessTone(bundleReadiness.status)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{bundleReadiness.label}</div>
                        <p className="text-xs opacity-80 mt-1 max-w-2xl">{bundleReadiness.description}</p>
                        {bundleReadiness.errors.length > 0 && (
                          <ul className="mt-2 space-y-1 text-[11px] opacity-90">
                            {bundleReadiness.errors.slice(0, 4).map((error) => (
                              <li key={error}>• {error}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="text-[11px] opacity-70 shrink-0">
                        {bundle?.latestVersion?.generationMode === "project-bundle"
                          ? `Last bundle pack: ${bundle.latestVersion.selectedPack === "page" ? "Test Cases" : TESTCASE_PACK_LABELS[(bundle.latestVersion.selectedPack as WebsiteTestCasePack) || "smoke"] || bundle.latestVersion.selectedPack}`
                          : "No validated project bundle saved yet"}
                      </div>
                    </div>
                  </div>

                  {!bundle.artifacts.scriptFiles.length ? (
                    <div className="text-sm text-white/35">No saved bundle files yet.</div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div className="flex flex-wrap gap-2">
                          {bundle.artifacts.scriptFiles.map((file) => {
                            const isDirty = editedContents[file.id] !== undefined;
                            return (
                              <button key={file.id} onClick={() => setSelectedFileId(file.id)}
                                className={`px-3 py-1.5 rounded-xl border text-xs font-mono transition-colors ${activeFile?.id === file.id ? "border-green/25 bg-green/10 text-green" : "border-white/10 bg-white/5 text-white/55 hover:text-white"}`}
                              >
                                {file.filename.split("/").pop()}
                                {isDirty && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-400 inline-block align-middle" title="Unsaved changes" />}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {activeFile && (
                            <button
                              onClick={() => {
                                const content = editedContents[activeFile.id] ?? activeFile.content;
                                navigator.clipboard?.writeText(content).catch(() => {});
                                setCopiedFileId(activeFile.id);
                                setTimeout(() => setCopiedFileId(null), 1200);
                              }}
                              className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 text-white/50 hover:text-white text-xs transition-colors"
                            >
                              {copiedFileId === activeFile.id ? "✓ Copied" : "Copy file"}
                            </button>
                          )}
                          <button
                            onClick={() => { setEditMode(m => !m); setEditSaveError(""); }}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${editMode ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-white/15 bg-white/5 text-white/50 hover:text-white"}`}
                          >
                            {editMode ? "✕ Done editing" : "✎ Edit"}
                          </button>
                        </div>
                      </div>

                      {activeFile && (
                        <div className="rounded-2xl border border-white/8 bg-[#0B0F17] overflow-hidden">
                          <div className="px-4 py-2.5 border-b border-white/8 flex items-center justify-between gap-3">
                            <span className="text-xs font-mono text-white/45">{activeFile.filename}</span>
                            {editMode && editedContents[activeFile.id] !== undefined && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-amber-400/80">unsaved</span>
                                <button onClick={() => handleSaveEdit(activeFile.id)} disabled={editSaving} className="px-2.5 py-1 rounded-lg bg-green text-white text-[11px] font-semibold hover:bg-green/80 transition-colors disabled:opacity-60">
                                  {editSaving ? "Saving…" : "Save"}
                                </button>
                                <button onClick={() => setEditedContents(prev => { const n = {...prev}; delete n[activeFile.id]; return n; })} className="px-2.5 py-1 rounded-lg border border-white/15 text-white/50 text-[11px] hover:text-white transition-colors">
                                  Discard
                                </button>
                              </div>
                            )}
                          </div>
                          {editMode ? (
                            <textarea
                              className="w-full bg-transparent p-4 text-[12px] leading-6 font-mono text-green-100/90 outline-none resize-none min-h-[400px]"
                              value={editedContents[activeFile.id] ?? activeFile.content}
                              onChange={e => setEditedContents(prev => ({ ...prev, [activeFile.id]: e.target.value }))}
                              spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
                            />
                          ) : (
                            <pre className="overflow-x-auto p-4 text-[12px] leading-6 font-mono text-green-100/90 max-h-[600px] overflow-y-auto">
                              <code>{editedContents[activeFile.id] ?? activeFile.content}</code>
                            </pre>
                          )}
                        </div>
                      )}
                      {editSaveError && <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{editSaveError}</div>}
                    </>
                  )}
                </div>

                {runState !== "idle" && (
                  <div ref={runPanelRef} className="bg-bg-card border border-border rounded-3xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-semibold">Test Run Output</h2>
                      <div className="flex items-center gap-2">
                        {runState === "running" && (
                          <button
                            onClick={handleStopRun}
                            className="text-xs px-3 py-1.5 rounded-full border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                          >
                            Stop run
                          </button>
                        )}
                        {(runState === "done" || runState === "error") && (
                          <button
                            onClick={handleSaveRunResult}
                            disabled={runSaving || runSaved}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
                              runSaved
                                ? "bg-green/10 border-green/20 text-green"
                                : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                            }`}
                          >
                            {runSaved ? "✓ Saved" : runSaving ? "Saving…" : "Save run result"}
                          </button>
                        )}
                        <button
                          onClick={() => { setRunState("idle"); setRunOutput([]); setRunResults([]); setRunError(""); }}
                          disabled={runState === "running"}
                          className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/40 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    {runOutput.length > 0 && (
                      <pre ref={runOutputRef} className="rounded-2xl border border-white/8 bg-[#0B0F17] p-4 text-[11px] leading-5 font-mono overflow-x-auto max-h-72 overflow-y-auto mb-4 whitespace-pre-wrap">
                        {runOutput.map((line, i) => (
                          <span key={i} className={line.type === "stderr" ? "text-amber-300/80" : "text-white/70"}>{line.text}</span>
                        ))}
                      </pre>
                    )}
                    {runError && (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 mb-4">
                        <p className="text-xs font-semibold text-amber-300 mb-2">
                          {runState === "stopped" ? "Run stopped" : runError.includes("Install with:") ? "Missing dependency" : "Run failed"}
                        </p>
                        <pre className="text-xs text-amber-200/80 font-mono whitespace-pre-wrap">{runError}</pre>
                      </div>
                    )}
                    {runResults.length > 0 && (
                      <div ref={runResultsRef}>
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-sm font-medium">{runState === "running" ? "Live Results" : "Results"}</span>
                          {runState === "running" && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              updating
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green/10 text-green border border-green/20">{runResults.filter(r => r.status === "passed").length} passed</span>
                          {runResults.filter(r => r.status !== "passed").length > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 border border-red-500/20">{runResults.filter(r => r.status !== "passed").length} failed</span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {runResults.map((r, i) => {
                            const idxMatch = r.name.match(/\[test_case(\d+)\]/);
                            const tcIdx = idxMatch ? parseInt(idxMatch[1]) : -1;
                            const tc = tcIdx >= 0 ? activeRunCases[tcIdx] : null;
                            return (
                              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/8 bg-white/2 text-xs">
                                <span className={`font-mono ${r.status === "passed" ? "text-green" : "text-red-400"}`}>{r.status === "passed" ? "✓" : "✗"}</span>
                                {tc?.id && <span className="px-1.5 py-0.5 rounded-md bg-white/8 text-white/40 font-mono text-[10px] shrink-0">{tc.id}</span>}
                                <span className="flex-1 text-white/75 truncate">{tc?.title || r.name}</span>
                                {r.duration && <span className="text-white/30 font-mono shrink-0">{r.duration}</span>}
                                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 ${r.status === "passed" ? "bg-green/10 text-green border-green/20" : "bg-red-500/10 text-red-300 border-red-500/20"}`}>
                                  {r.status.toUpperCase()}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* ── Tab: Runs ───────────────────────────────────────────────── */}
            {activeTab === "runs" && (
              <div className="grid gap-6">
                <div className="bg-bg-card border border-border rounded-3xl p-6">
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div>
                      <h2 className="text-xl font-semibold">Runs</h2>
                      <p className="text-sm text-white/40 mt-1">Run the latest generated script bundle and watch live results as each case finishes.</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <div className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                        <span className="px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/35 border-r border-white/10">
                          Headless
                        </span>
                        <button
                          onClick={() => setRunHeadless(true)}
                          disabled={runState === "running"}
                          title="Run with headless=true"
                          className={`px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
                            runHeadless ? "bg-green text-white" : "text-white/45 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          True
                        </button>
                        <button
                          onClick={() => setRunHeadless(false)}
                          disabled={runState === "running"}
                          title="Run with headless=false"
                          className={`px-3 py-1.5 text-xs font-semibold border-l border-white/10 transition-colors disabled:opacity-60 ${
                            !runHeadless ? "bg-amber-500/15 text-amber-200" : "text-white/45 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          False
                        </button>
                      </div>
                      <button
                        onClick={handleRunTests}
                        disabled={runState === "running" || bundle.artifacts.scriptFiles.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green text-white text-xs font-semibold hover:bg-green/80 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {runState === "running" ? (<><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Running…</>) : "▶ Run Tests"}
                      </button>
                      {runState === "running" && (
                        <button
                          onClick={handleStopRun}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                        >
                          ■ Stop
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/50">
                      Generated bundle: {currentGeneratedPack === "page" ? "Test Cases" : TESTCASE_PACK_LABELS[currentGeneratedPack]}
                    </span>
                    {selectedRunPack !== currentGeneratedPack && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
                        Selected run pack differs from the latest generated bundle
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setSelectedScriptPack(selectedRunPack);
                        setActiveTab("scripts");
                      }}
                      className="text-xs px-3 py-1.5 rounded-xl border border-white/10 text-white/55 hover:text-white transition-colors"
                    >
                      Open Scripts
                    </button>
                  </div>

                  {bundle.artifacts.scriptFiles.length === 0 ? (
                    <div className="text-sm text-white/35">No scripts generated yet. Open the Scripts tab and generate a bundle first.</div>
                  ) : (
                    <div className="text-sm text-white/45">
                      Running {activeRunCases.length} approved cases from the {currentGeneratedPack === "page" ? "Test Cases" : TESTCASE_PACK_LABELS[currentGeneratedPack]} bundle.
                    </div>
                  )}
                </div>

                {runState !== "idle" && (
                  <div ref={runPanelRef} className="bg-bg-card border border-border rounded-3xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-semibold">Test Run Output</h2>
                      <div className="flex items-center gap-2">
                        {runState === "running" && (
                          <button
                            onClick={handleStopRun}
                            className="text-xs px-3 py-1.5 rounded-full border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                          >
                            Stop run
                          </button>
                        )}
                        {(runState === "done" || runState === "error") && (
                          <button
                            onClick={handleSaveRunResult}
                            disabled={runSaving || runSaved}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
                              runSaved
                                ? "bg-green/10 border-green/20 text-green"
                                : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10"
                            }`}
                          >
                            {runSaved ? "✓ Saved" : runSaving ? "Saving…" : "Save run result"}
                          </button>
                        )}
                        <button
                          onClick={() => { setRunState("idle"); setRunOutput([]); setRunResults([]); setRunError(""); }}
                          disabled={runState === "running"}
                          className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-white/40 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    {runOutput.length > 0 && (
                      <pre ref={runOutputRef} className="rounded-2xl border border-white/8 bg-[#0B0F17] p-4 text-[11px] leading-5 font-mono overflow-x-auto max-h-72 overflow-y-auto mb-4 whitespace-pre-wrap">
                        {runOutput.map((line, i) => (
                          <span key={i} className={line.type === "stderr" ? "text-amber-300/80" : "text-white/70"}>{line.text}</span>
                        ))}
                      </pre>
                    )}
                    {runError && (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 mb-4">
                        <p className="text-xs font-semibold text-amber-300 mb-2">
                          {runState === "stopped" ? "Run stopped" : runError.includes("Install with:") ? "Missing dependency" : "Run failed"}
                        </p>
                        <pre className="text-xs text-amber-200/80 font-mono whitespace-pre-wrap">{runError}</pre>
                      </div>
                    )}
                    {runResults.length > 0 && (
                      <div ref={runResultsRef}>
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-sm font-medium">{runState === "running" ? "Live Results" : "Results"}</span>
                          {runState === "running" && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              updating
                            </span>
                          )}
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green/10 text-green border border-green/20">{runResults.filter(r => r.status === "passed").length} passed</span>
                          {runResults.filter(r => r.status !== "passed").length > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-300 border border-red-500/20">{runResults.filter(r => r.status !== "passed").length} failed</span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {runResults.map((r, i) => {
                            const idxMatch = r.name.match(/\[test_case(\d+)\]/);
                            const tcIdx = idxMatch ? parseInt(idxMatch[1]) : -1;
                            const tc = tcIdx >= 0 ? activeRunCases[tcIdx] : null;
                            return (
                              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/8 bg-white/2 text-xs">
                                <span className={`font-mono ${r.status === "passed" ? "text-green" : "text-red-400"}`}>{r.status === "passed" ? "✓" : "✗"}</span>
                                {tc?.id && <span className="px-1.5 py-0.5 rounded-md bg-white/8 text-white/40 font-mono text-[10px] shrink-0">{tc.id}</span>}
                                <span className="flex-1 text-white/75 truncate">{tc?.title || r.name}</span>
                                {r.duration && <span className="text-white/30 font-mono shrink-0">{r.duration}</span>}
                                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 ${r.status === "passed" ? "bg-green/10 text-green border-green/20" : "bg-red-500/10 text-red-300 border-red-500/20"}`}>
                                  {r.status.toUpperCase()}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === "capture" && (
              <div className="grid gap-6">
                <div className="bg-bg-card border border-border rounded-3xl p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                    <div>
                      <h2 className="text-xl font-semibold">Capture from the live app</h2>
                      <p className="text-sm text-white/40 mt-1 max-w-2xl">
                        Keep this project tied to the real application. Open QA Deck on the live page, capture steps there, and come back here to review cases, generate scripts, and run the pack you need.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`text-xs px-3 py-1.5 rounded-full border ${extState.connected ? "bg-green/10 text-green border-green/20" : "bg-amber-500/10 text-amber-300 border-amber-500/20"}`}>
                        {extState.connected ? `Connected${extState.email ? ` · ${extState.email}` : ""}` : "Extension not connected"}
                      </span>
                      <span className={`text-xs px-3 py-1.5 rounded-full border ${bundle.meta.mode === "journey" ? "bg-purple-500/10 text-purple-300 border-purple-500/20" : "bg-white/5 text-white/60 border-white/10"}`}>
                        {bundle.meta.mode === "journey" ? "Flow capture" : "Page capture"}
                      </span>
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-5 mt-6">
                    <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                      <div className="text-xs uppercase tracking-[0.2em] text-white/35 mb-3">How to use Capture</div>
                      <div className="space-y-3">
                        {[
                          "Open the target page with this project already selected in QA Deck.",
                          bundle.meta.mode === "journey"
                            ? "Record the user flow you care about so E2E test cases and scripts stay grounded in real steps."
                            : "Re-scan or capture the page to refresh locators and page understanding from the live app.",
                          "Return to Test Cases, Packs, Scripts, and Runs when you are ready to review or execute.",
                        ].map((step, index) => (
                          <div key={step} className="flex gap-3">
                            <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 text-xs font-semibold flex items-center justify-center shrink-0">
                              {index + 1}
                            </div>
                            <p className="text-sm text-white/70 leading-6">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-white/35 mb-2">Project-linked actions</div>
                        <div className="text-sm text-white/45">
                          These actions keep the website and extension working against the same project instead of sending you to a separate recorder product.
                        </div>
                      </div>
                      <button
                        onClick={handleCaptureFromApp}
                        disabled={openingCapture || !extState.connected}
                        className="w-full bg-green text-white font-semibold px-4 py-3 rounded-2xl hover:bg-green-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                        title={!extState.connected ? "Connect the QA Deck extension first." : "Open the live app in QA Deck Capture mode"}
                      >
                        {openingCapture && <span className="w-4 h-4 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />}
                        {openingCapture ? "Opening Capture…" : "Open Capture on live app"}
                      </button>
                      <button
                        onClick={handleRescan}
                        disabled={rescanning || bundle.meta.mode !== "page" || !extState.connected}
                        className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-white/75 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
                        title={
                          !extState.connected
                            ? "Connect the QA Deck extension first."
                            : bundle.meta.mode !== "page"
                            ? "Re-scan is for page projects only. Use Capture for journeys."
                            : "Refresh page understanding from the live app."
                        }
                      >
                        {rescanning ? "Refreshing page scan…" : "Re-scan current page"}
                      </button>
                      {!extState.connected && (
                        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                          Connect the QA Deck extension in this browser to use Capture or project-linked re-scan.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: Locators ────────────────────────────────────────────── */}
            {activeTab === "locators" && (() => {
              type LocatorStrategy = "test-id" | "id" | "aria-label" | "name" | "css" | "xpath" | string;
              type ScanEl = { locator?: string; locatorStrategy?: LocatorStrategy; testId?: string | null; id?: string | null; name?: string | null; ariaLabel?: string | null; label?: string | null; text?: string | null; type?: string | null; tag?: string | null; placeholder?: string | null; disabled?: boolean; flaky?: boolean; action?: string | null; href?: string | null; isExternal?: boolean; };
              type ScanForm = { locator?: string; purpose?: string; fields?: ScanEl[]; submitButton?: ScanEl | null; fieldCount?: number; };
              type ScanTable = { locator?: string; headers?: string[]; rowCount?: number; purpose?: string; hasSorting?: boolean; };

              const scan = bundle.artifacts.scan as Record<string, unknown> | null;
              const activeFramework = bundle.meta.activeFramework || "selenium-python";

              const strategyQuality = (s: LocatorStrategy) => {
                if (s === "test-id") return { label: "BEST", cls: "bg-green/10 text-green border-green/20" };
                if (s === "id") return { label: "GOOD", cls: "bg-blue-500/10 text-blue-300 border-blue-500/20" };
                if (s === "aria-label") return { label: "GOOD", cls: "bg-blue-500/10 text-blue-300 border-blue-500/20" };
                if (s === "name") return { label: "OK", cls: "bg-amber-500/10 text-amber-300 border-amber-500/20" };
                if (s === "css") return { label: "OK", cls: "bg-amber-500/10 text-amber-300 border-amber-500/20" };
                if (s === "xpath") return { label: "FRAGILE", cls: "bg-red-500/10 text-red-300 border-red-500/20" };
                return { label: s.toUpperCase(), cls: "bg-white/5 text-white/50 border-white/10" };
              };

              // Format raw locator into framework-ready copy string
              function formatLocator(rawLoc: string, strat: LocatorStrategy, fw: string): string {
                const isXpath = strat === "xpath" || rawLoc.startsWith("//") || rawLoc.startsWith("(//");
                if (fw === "selenium-python") {
                  if (strat === "test-id") return `By.CSS_SELECTOR, '${rawLoc}'`;
                  if (strat === "id") return `By.ID, '${rawLoc.replace(/^#/, '')}'`;
                  if (strat === "aria-label") return `By.CSS_SELECTOR, '${rawLoc}'`;
                  if (strat === "name") return `By.NAME, '${rawLoc}'`;
                  if (isXpath) return `By.XPATH, '${rawLoc}'`;
                  return `By.CSS_SELECTOR, '${rawLoc}'`;
                }
                if (fw === "selenium-java") {
                  if (strat === "test-id") return `By.cssSelector("${rawLoc}")`;
                  if (strat === "id") return `By.id("${rawLoc.replace(/^#/, '')}")`;
                  if (strat === "aria-label") return `By.cssSelector("${rawLoc}")`;
                  if (strat === "name") return `By.name("${rawLoc}")`;
                  if (isXpath) return `By.xpath("${rawLoc}")`;
                  return `By.cssSelector("${rawLoc}")`;
                }
                if (fw === "playwright-python") {
                  if (strat === "test-id") { const val = rawLoc.match(/data-testid=['"]([^'"]+)['"]/)?.[1] || rawLoc; return `page.get_by_test_id("${val}")`; }
                  if (strat === "aria-label") { const val = rawLoc.match(/aria-label=['"]([^'"]+)['"]/)?.[1] || rawLoc; return `page.get_by_label("${val}")`; }
                  if (isXpath) return `page.locator("xpath=${rawLoc}")`;
                  return `page.locator("${rawLoc}")`;
                }
                if (fw === "playwright-typescript") {
                  if (strat === "test-id") { const val = rawLoc.match(/data-testid=['"]([^'"]+)['"]/)?.[1] || rawLoc; return `page.getByTestId('${val}')`; }
                  if (strat === "aria-label") { const val = rawLoc.match(/aria-label=['"]([^'"]+)['"]/)?.[1] || rawLoc; return `page.getByLabel('${val}')`; }
                  if (isXpath) return `page.locator('xpath=${rawLoc}')`;
                  return `page.locator('${rawLoc}')`;
                }
                return rawLoc;
              }

              function copyLocator(formatted: string) {
                navigator.clipboard?.writeText(formatted).catch(() => {});
                setCopiedLocator(formatted);
                setTimeout(() => setCopiedLocator(null), 1500);
              }

              function LocatorRow({ el, context }: { el: ScanEl; context?: string }) {
                const rawLoc = el.locator || "";
                const strat = el.locatorStrategy || "css";
                const q = strategyQuality(strat);
                const label = el.label || el.ariaLabel || el.text || el.placeholder || el.name || el.id || "";
                const formatted = formatLocator(rawLoc, strat, activeFramework);

                // Quality filter
                if (locatorQualityFilter !== "all" && q.label.toLowerCase() !== locatorQualityFilter) return null;
                // Text search filter
                const searchLower = locatorSearch.toLowerCase();
                if (searchLower && !rawLoc.toLowerCase().includes(searchLower) && !label.toLowerCase().includes(searchLower)) return null;

                return (
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/8 bg-white/2 group hover:bg-white/4 transition-colors">
                    {el.flaky && <span title="May be flaky" className="text-amber-400 text-xs shrink-0">⚠</span>}
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {context && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-white/35 font-mono shrink-0">{context}</span>}
                        {el.type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 shrink-0">{el.type}</span>}
                        {el.disabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 shrink-0">disabled</span>}
                        {label && <span className="text-xs text-white/60 truncate">{label}</span>}
                      </div>
                      <code className="text-[11px] font-mono text-green-200/80 mt-1 truncate">{formatted}</code>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${q.cls}`}>{q.label}</span>
                      <button
                        onClick={() => copyLocator(formatted)}
                        className="text-[10px] px-2 py-1 rounded-lg border border-white/15 text-white/50 hover:text-white transition-colors"
                      >
                        {copiedLocator === formatted ? "✓" : "Copy"}
                      </button>
                    </div>
                  </div>
                );
              }

              const forms = Array.isArray(scan?.forms) ? scan!.forms as ScanForm[] : [];
              const buttons = Array.isArray(scan?.buttons) ? scan!.buttons as ScanEl[] : [];
              const inputs = Array.isArray(scan?.inputs) ? scan!.inputs as ScanEl[] : [];
              const links = Array.isArray(scan?.links) ? scan!.links as ScanEl[] : [];
              const tables = Array.isArray(scan?.tables) ? scan!.tables as ScanTable[] : [];
              const iframes = Array.isArray(scan?.iframes) ? scan!.iframes as { locator?: string; name?: string | null; title?: string | null; crossOrigin?: boolean; elements?: ScanEl[] }[] : [];

              const allFields = forms.flatMap(f => f.fields || []);
              const totalElements = buttons.length + inputs.length + links.length + allFields.length;

              if (!scan) return (
                <div className="bg-bg-card border border-border rounded-3xl p-10 text-center">
                  <p className="text-white/40 text-sm">No scan data saved for this project yet.</p>
                  <p className="text-white/25 text-xs mt-2">Run a scan from the extension to populate locators.</p>
                </div>
              );

              return (
                <div className="grid gap-6">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-xl font-semibold">Page locators</h2>
                      <p className="text-sm text-white/40 mt-1">
                        {totalElements} elements · <span className="font-mono text-white/60">{String((scan?.meta as Record<string,unknown>)?.url || bundle.meta.sourceUrl || "last scan")}</span>
                      </p>
                    </div>
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/40 self-start mt-1">
                      {activeFramework}
                    </span>
                  </div>

                  {/* Search + quality filter */}
                  <div className="flex flex-col gap-3">
                    <input
                      value={locatorSearch}
                      onChange={e => setLocatorSearch(e.target.value)}
                      placeholder="Filter by locator or element label…"
                      className="w-full bg-white/5 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-green font-mono"
                    />
                    <div className="flex gap-1.5 flex-wrap">
                      {(["all","best","good","ok","fragile"] as const).map(f => (
                        <button key={f} onClick={() => setLocatorQualityFilter(f)}
                          className={`text-[11px] px-2.5 py-1 rounded-full border capitalize transition-colors ${
                            locatorQualityFilter === f
                              ? "bg-white/10 text-white border-white/25"
                              : "border-white/8 text-white/35 hover:text-white/60"
                          }`}
                        >{f === "all" ? `All (${totalElements})` : f.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>

                  {/* Form fields */}
                  {forms.length > 0 && (
                    <div className="bg-bg-card border border-border rounded-3xl p-6">
                      <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                        Form fields
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">{allFields.length}</span>
                      </h3>
                      <div className="space-y-1.5">
                        {forms.map((form, fi) => (
                          <div key={fi}>
                            {forms.length > 1 && (
                              <div className="text-xs text-white/30 font-mono mb-2 mt-3 first:mt-0">
                                Form {fi + 1}{form.purpose ? ` · ${form.purpose}` : ""}
                              </div>
                            )}
                            {(form.fields || []).map((field, idx) => (
                              <LocatorRow key={idx} el={field} context={field.tag || "input"} />
                            ))}
                            {form.submitButton && (
                              <LocatorRow el={form.submitButton} context="submit" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Buttons */}
                  {buttons.length > 0 && (
                    <div className="bg-bg-card border border-border rounded-3xl p-6">
                      <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                        Buttons
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">{buttons.length}</span>
                      </h3>
                      <div className="space-y-1.5">
                        {buttons.map((btn, i) => (
                          <LocatorRow key={i} el={btn} context={btn.action || btn.type || "button"} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Standalone inputs */}
                  {inputs.length > 0 && (
                    <div className="bg-bg-card border border-border rounded-3xl p-6">
                      <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                        Inputs
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">{inputs.length}</span>
                      </h3>
                      <div className="space-y-1.5">
                        {inputs.map((inp, i) => (
                          <LocatorRow key={i} el={inp} context={inp.type || "input"} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Links */}
                  {links.length > 0 && (
                    <div className="bg-bg-card border border-border rounded-3xl p-6">
                      <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                        Links
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">{links.length}</span>
                      </h3>
                      <div className="space-y-1.5">
                        {links.map((lnk, i) => (
                          <LocatorRow key={i} el={{ ...lnk, label: lnk.text || lnk.ariaLabel }} context={(lnk as {isExternal?:boolean}).isExternal ? "external" : "link"} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tables */}
                  {tables.length > 0 && (
                    <div className="bg-bg-card border border-border rounded-3xl p-6">
                      <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                        Tables
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">{tables.length}</span>
                      </h3>
                      <div className="space-y-1.5">
                        {tables.map((tbl, i) => {
                          const loc = tbl.locator || "";
                          const filtered = locatorSearch && !loc.toLowerCase().includes(locatorSearch.toLowerCase());
                          if (filtered) return null;
                          return (
                            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/8 bg-white/2 group hover:bg-white/4 transition-colors">
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-xs text-white/50">{tbl.headers?.join(", ") || "Table"} · {tbl.rowCount} rows</span>
                                <code className="text-[11px] font-mono text-green-200/80 mt-1 truncate">{loc}</code>
                              </div>
                              <button onClick={() => copyLocator(loc)} className="text-[10px] px-2 py-1 rounded-lg border border-white/15 text-white/50 hover:text-white transition-colors">
                                {copiedLocator === loc ? "✓" : "Copy"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* iFrames */}
                  {iframes.length > 0 && (
                    <div className="bg-bg-card border border-border rounded-3xl p-6">
                      <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                        iFrames
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">{iframes.length}</span>
                      </h3>
                      <div className="space-y-3">
                        {iframes.map((fr, i) => (
                          <div key={i} className="rounded-2xl border border-white/8 bg-white/2 p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <code className="text-[11px] font-mono text-green-200/80 flex-1 truncate">{fr.locator}</code>
                              {fr.crossOrigin && <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-300">cross-origin</span>}
                              <button onClick={() => copyLocator(fr.locator || "")} className="text-[10px] px-2 py-1 rounded-lg border border-white/15 text-white/50 hover:text-white">{copiedLocator === fr.locator ? "✓" : "Copy"}</button>
                            </div>
                            {(fr.elements || []).length > 0 && (
                              <div className="space-y-1.5 pl-3 border-l border-white/8">
                                {(fr.elements || []).map((el, j) => (
                                  <LocatorRow key={j} el={el} context="iframe child" />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Tab: Insights ────────────────────────────────────────────── */}
            {activeTab === "insights" && (
              <div className="grid gap-5">

                {/* Release gate — always visible */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-3 py-1.5 rounded-full border text-sm font-medium ${decisionTone(quality.releaseGate.decision)}`}>
                    {quality.releaseGate.decision.toUpperCase()}
                  </span>
                  <span className="text-white/50 text-sm">{quality.releaseGate.score}/100</span>
                  {quality.releaseGate.blockers.length > 0 && (
                    <span className="text-xs text-red-300">{quality.releaseGate.blockers.length} blocker{quality.releaseGate.blockers.length > 1 ? "s" : ""}</span>
                  )}
                  <div className="ml-auto flex flex-wrap gap-2">
                    {quality.releaseGate.recommendedNextSteps.map((step) => (
                      <span key={step} className="text-[11px] px-2 py-1 rounded-full bg-green/10 border border-green/15 text-green">{step}</span>
                    ))}
                  </div>
                </div>

                {/* Blockers — always visible if any */}
                {quality.releaseGate.blockers.length > 0 && (
                  <div className="space-y-2">
                    {quality.releaseGate.blockers.map((b, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-red-300 bg-red-500/8 border border-red-500/15 rounded-xl px-4 py-3">
                        <span className="shrink-0 mt-0.5">✕</span>{b}
                      </div>
                    ))}
                  </div>
                )}

                {/* Risk signals — always visible if any */}
                {quality.riskSignals.length > 0 && (
                  <div className="bg-bg-card border border-border rounded-3xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Risk signals</h2>
                    <div className="space-y-3">
                      {quality.riskSignals.map((signal) => (
                        <div key={signal.id} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div className="min-w-0">
                              <div className="font-medium">{signal.title}</div>
                              <div className="text-sm text-white/65 mt-1.5">{signal.summary}</div>
                            </div>
                            <div className="flex flex-col gap-1.5 items-end shrink-0">
                              <span className={`text-[11px] px-2 py-1 rounded-full border ${riskTone(signal.level)}`}>{signal.level}</span>
                              {signal.blocker && <span className="text-[11px] px-2 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-300">blocker</span>}
                            </div>
                          </div>
                          <div className="text-xs text-white/35">{signal.recommendation}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quality modules & coverage — collapsible */}
                <details className="group bg-bg-card border border-border rounded-3xl overflow-hidden">
                  <summary className="flex items-center gap-2 px-6 py-4 cursor-pointer select-none list-none text-sm text-white/40 hover:text-white/65 transition-colors">
                    <span className="group-open:rotate-90 transition-transform inline-block text-[10px]">▶</span>
                    Quality modules &amp; coverage
                  </summary>
                  <div className="px-6 pb-6 grid gap-6">
                    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      {quality.modules.map((module) => (
                        <div key={module.key} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="font-medium">{module.label}</div>
                            <span className={`text-[11px] px-2 py-1 rounded-full border ${moduleTone(module.status)}`}>{module.status}</span>
                          </div>
                          <div className="text-sm text-white/70 mb-2">{module.summary}</div>
                          <div className="text-xs text-white/40">{module.recommendation}</div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      {quality.coverageAreas.map((area) => (
                        <div key={area.key} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="font-medium">{area.label}</div>
                            <span className={`text-[11px] px-2 py-1 rounded-full border ${moduleTone(area.status)}`}>{area.covered}/{area.total}</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-white/6 overflow-hidden mb-2">
                            <div className={`h-full ${area.status === "ready" ? "bg-green" : area.status === "partial" ? "bg-amber-400" : "bg-red-400"}`}
                              style={{ width: `${Math.max(5, Math.min(100, (area.covered / Math.max(area.total, 1)) * 100))}%` }} />
                          </div>
                          <div className="text-sm text-white/65">{area.summary}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>

                {/* Suggested runs + exploratory charters — collapsible */}
                <details className="group bg-bg-card border border-border rounded-3xl overflow-hidden">
                  <summary className="flex items-center gap-2 px-6 py-4 cursor-pointer select-none list-none text-sm text-white/40 hover:text-white/65 transition-colors">
                    <span className="group-open:rotate-90 transition-transform inline-block text-[10px]">▶</span>
                    Suggested runs &amp; exploratory charters
                  </summary>
                  <div className="px-6 pb-6 grid gap-6 lg:grid-cols-2">
                    <div>
                      <h3 className="text-base font-semibold mb-4">Suggested runs</h3>
                      <div className="space-y-3">
                        {quality.suggestedRuns.map((run) => (
                          <div key={run.id} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                            <div className="flex items-start justify-between gap-4 mb-2">
                              <div className="font-medium">{run.name}</div>
                              <span className={`text-[11px] px-2 py-1 rounded-full border ${riskTone(run.priority)}`}>{run.priority}</span>
                            </div>
                            <div className="text-sm text-white/70">{run.summary}</div>
                            <div className="text-xs text-white/35 mt-3">{run.cadence} · {run.scope} · {run.environment} · {run.estimatedMinutes} min</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold mb-4">Exploratory charters</h3>
                      <div className="space-y-3">
                        {quality.exploratoryCharters.map((charter) => (
                          <div key={charter.id} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                            <div className="font-medium">{charter.title}</div>
                            <div className="text-sm text-white/70 mt-2">{charter.mission}</div>
                            <div className="flex flex-wrap gap-2 mt-3">
                              {charter.focus.map((item) => (
                                <span key={item} className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/55">{item}</span>
                              ))}
                            </div>
                            <div className="text-xs text-white/35 mt-3">{charter.exitCriteria}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>

                {/* Version history & activity — collapsible */}
                <details className="group bg-bg-card border border-border rounded-3xl overflow-hidden">
                  <summary className="flex items-center gap-2 px-6 py-4 cursor-pointer select-none list-none text-sm text-white/40 hover:text-white/65 transition-colors">
                    <span className="group-open:rotate-90 transition-transform inline-block text-[10px]">▶</span>
                    Version history &amp; activity
                  </summary>
                  <div className="px-6 pb-6 grid gap-6">
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div>
                        <h3 className="text-base font-semibold mb-4">Version history</h3>
                        <div className="space-y-3">
                          {bundle.versions.length ? bundle.versions.map((version) => (
                            <div key={version.id} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="text-sm font-medium">{version.summary}</div>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${version.trigger === "run_saved" ? "bg-purple-500/10 text-purple-300 border-purple-500/20" : version.trigger.includes("testcase") ? "bg-orange-500/10 text-orange-300 border-orange-500/20" : "bg-white/5 text-white/50 border-white/10"}`}>{version.trigger}</span>
                                    {version.hasTestCases && <span className="text-[10px] text-white/40">{version.testCaseCount} tc</span>}
                                    {version.hasScripts && <span className="text-[10px] text-white/40">{version.scriptFileCount} scripts</span>}
                                    {version.hasRun && <span className="text-[10px] text-purple-300/60">Includes run result</span>}
                                  </div>
                                </div>
                                <div className="text-xs text-white/35 shrink-0">{formatDateTime(version.createdAt)}</div>
                              </div>
                            </div>
                          )) : <div className="text-sm text-white/35">No versions saved yet.</div>}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-base font-semibold mb-4">Activity timeline</h3>
                        <div className="space-y-3">
                          {bundle.activities.length ? bundle.activities.slice(0, 20).map((activity) => (
                            <div key={activity.id} className="rounded-2xl border border-white/8 bg-white/3 p-4">
                              <div className="text-sm">{activity.message}</div>
                              <div className="text-xs text-white/35 mt-2">{formatDateTime(activity.timestamp)}</div>
                            </div>
                          )) : <div className="text-sm text-white/35">No activities recorded yet.</div>}
                        </div>
                      </div>
                    </div>
                    {notes && (
                      <div>
                        <h3 className="text-base font-semibold mb-4">Notes</h3>
                        <pre className="rounded-2xl border border-white/8 bg-[#0B0F17] p-4 text-[12px] leading-6 font-mono text-white/75 overflow-x-auto">
                          <code>{JSON.stringify(notes, null, 2)}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}
          </div>
        ) : null}

        {/* ── Modals ─────────────────────────────────────────────────────────── */}

        {/* Delete project modal */}
        {showDeleteModal && bundle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-bg-card border border-red-500/20 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between">
                <h3 className="text-lg font-semibold text-red-300">
                  {showDeleteModal === "project" ? "Delete project" : "Delete page"}
                </h3>
                <button onClick={() => setShowDeleteModal(null)} disabled={deleting} className="text-white/40 hover:text-white transition-colors">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-white/70">
                  {showDeleteModal === "project"
                    ? <>This will permanently delete the whole project <span className="font-semibold text-white">{bundle.meta.appName || bundle.meta.name}</span>, including all saved pages, test cases, scripts, versions, and activity history. This cannot be undone.</>
                    : <>This will permanently delete the saved page <span className="font-semibold text-white">{bundle.meta.pageLabel || bundle.meta.name}</span> and all of its test cases, scripts, versions, and activity history. This cannot be undone.</>}
                </p>
                <div>
                  <label className="text-xs text-white/45 block mb-2">
                    Type <span className="font-mono text-white/70">{showDeleteModal === "project" ? (bundle.meta.appName || bundle.meta.name) : (bundle.meta.pageLabel || bundle.meta.name)}</span> to confirm
                  </label>
                  <input
                    value={deleteConfirmText}
                    onChange={e => setDeleteConfirmText(e.target.value)}
                    placeholder={showDeleteModal === "project" ? (bundle.meta.appName || bundle.meta.name) : (bundle.meta.pageLabel || bundle.meta.name)}
                    className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-500/50 transition-colors"
                    autoFocus
                  />
                </div>
                {deleteError && (
                  <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{deleteError}</div>
                )}
              </div>
              <div className="p-6 border-t border-border flex justify-end gap-3 bg-bg-card">
                <button onClick={() => setShowDeleteModal(null)} disabled={deleting} className="px-4 py-2 rounded-xl text-white/50 hover:text-white transition-colors text-sm font-medium">Cancel</button>
                <button
                  onClick={showDeleteModal === "project" ? handleDeleteProjectGroup : handleDeletePage}
                  disabled={deleting || deleteConfirmText !== (showDeleteModal === "project" ? (bundle.meta.appName || bundle.meta.name) : (bundle.meta.pageLabel || bundle.meta.name))}
                  className="bg-red-500 text-white font-semibold px-5 py-2 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-40 text-sm flex items-center gap-2"
                >
                  {deleting && <span className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />}
                  {deleting ? "Deleting…" : showDeleteModal === "project" ? "Delete project" : "Delete page"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit test case modal */}
        {editingTcId && editForm && bundle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-bg-card border border-border rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between sticky top-0 bg-bg-card/90 backdrop-blur z-10">
                <div>
                  <h3 className="text-xl font-semibold">Edit test case</h3>
                  <div className="text-xs text-white/35 mt-0.5 font-mono">{editingTcId}</div>
                </div>
                <button onClick={() => { setEditingTcId(null); setEditForm(null); }} className="text-white/40 hover:text-white transition-colors">✕</button>
              </div>
              <div className="p-6 overflow-y-auto space-y-5">
                {editErrorTc && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{editErrorTc}</div>}
                <div>
                  <label className="text-xs text-white/45 block mb-2">Title *</label>
                  <input value={editForm.title} onChange={e => setEditForm(prev => prev ? { ...prev, title: e.target.value } : prev)}
                    className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Case type</label>
                    <select value={editForm.caseKind} onChange={e => setEditForm(prev => prev ? { ...prev, caseKind: e.target.value as WebsiteTestCaseKind } : prev)}
                      className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors">
                      <option value="page">Test case</option>
                      {bundle.meta.mode === "journey" && <option value="step">Step case</option>}
                      {bundle.meta.mode === "journey" && <option value="flow">Flow case</option>}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Category</label>
                    <select value={editForm.category} onChange={e => setEditForm(prev => prev ? { ...prev, category: e.target.value } : prev)}
                      className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors">
                      <option value="functional">Functional</option>
                      <option value="navigation">Navigation</option>
                      <option value="ui">UI</option>
                      <option value="boundary">Boundary</option>
                      <option value="negative">Negative</option>
                      <option value="e2e">E2E</option>
                      <option value="performance">Performance</option>
                      <option value="security">Security</option>
                      <option value="accessibility">Accessibility</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Priority</label>
                    <select value={editForm.priority} onChange={e => setEditForm(prev => prev ? { ...prev, priority: e.target.value } : prev)}
                      className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Source</label>
                    <select value={editForm.source} onChange={e => setEditForm(prev => prev ? { ...prev, source: e.target.value as WebsiteTestCaseSource } : prev)}
                      className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors">
                      <option value="page">Page</option>
                      <option value="recording">Recording</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/45 block mb-2">Included packs</label>
                  <div className="flex flex-wrap gap-2">
                    {TESTCASE_PACK_ORDER.map((pack) => {
                      const disabled = pack === "e2e" && editForm.caseKind !== "flow";
                      const active = editForm.packs.includes(pack);
                      return (
                        <button
                          key={pack}
                          type="button"
                          disabled={disabled}
                          onClick={() => setEditForm((prev) => {
                            if (!prev) return prev;
                            const nextPacks = active
                              ? prev.packs.filter((entry) => entry !== pack)
                              : [...prev.packs, pack];
                            return { ...prev, packs: sanitizePackMembership(prev.caseKind, nextPacks) };
                          })}
                          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                            active
                              ? pack === "smoke"
                                ? "bg-blue-500/15 text-blue-300 border-blue-500/25"
                                : pack === "regression"
                                ? "bg-amber-500/15 text-amber-300 border-amber-500/25"
                                : "bg-purple-500/15 text-purple-300 border-purple-500/25"
                              : "border-white/10 text-white/45 hover:text-white"
                          } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          {TESTCASE_PACK_LABELS[pack]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {bundle.meta.mode === "journey" && (
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Scope</label>
                    <select value={editForm.scope} onChange={e => setEditForm(prev => prev ? { ...prev, scope: e.target.value as WebsiteTestCaseScope } : prev)}
                      className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors">
                      <option value="page">Page</option>
                      <option value="step">Step</option>
                      <option value="journey">Flow</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-xs text-white/45 block mb-2">{getGroupingFieldLabel(editForm)}</label>
                  <input value={editForm.groupingLabel} onChange={e => setEditForm(prev => prev ? { ...prev, groupingLabel: e.target.value } : prev)}
                    placeholder={editForm.caseKind === "flow" ? "Checkout flow" : "Login page"}
                    className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors" />
                </div>
                <div>
                  <label className="text-xs text-white/45 block mb-2">Preconditions</label>
                  <textarea value={editForm.preconditions} onChange={e => setEditForm(prev => prev ? { ...prev, preconditions: e.target.value } : prev)}
                    className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors min-h-[60px] resize-y" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-white/45">Steps</label>
                    <button onClick={() => setEditForm(prev => prev ? { ...prev, steps: [...prev.steps, ""] } : prev)} className="text-[11px] text-green hover:text-green-dark transition-colors">+ Add step</button>
                  </div>
                  <div className="space-y-2">
                    {editForm.steps.map((step, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-xs text-white/30 pt-3 w-4 text-right">{i + 1}.</span>
                        <input value={step}
                          onChange={e => { const s = [...editForm.steps]; s[i] = e.target.value; setEditForm(prev => prev ? { ...prev, steps: s } : prev); }}
                          className="flex-1 bg-white/5 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-green transition-colors"
                          placeholder={`Step ${i + 1}`} />
                        <button onClick={() => { const s = editForm.steps.filter((_, idx) => idx !== i); setEditForm(prev => prev ? { ...prev, steps: s.length ? s : [""] } : prev); }}
                          className="px-2 text-white/30 hover:text-red-300 transition-colors">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/45 block mb-2">Expected Result</label>
                  <textarea value={editForm.expectedResult} onChange={e => setEditForm(prev => prev ? { ...prev, expectedResult: e.target.value } : prev)}
                    className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors min-h-[60px] resize-y" />
                </div>
                <div>
                  <label className="text-xs text-white/45 block mb-2">Tags (comma separated)</label>
                  <input value={editForm.tags} onChange={e => setEditForm(prev => prev ? { ...prev, tags: e.target.value } : prev)}
                    placeholder="auth, core"
                    className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors" />
                </div>
              </div>
              <div className="p-6 border-t border-border flex justify-end gap-3 shrink-0 bg-bg-card">
                <button onClick={() => { setEditingTcId(null); setEditForm(null); }} disabled={editSavingTc} className="px-4 py-2 rounded-xl text-white/50 hover:text-white transition-colors text-sm font-medium">Cancel</button>
                <button onClick={handleEditTestCase} disabled={editSavingTc} className="bg-green text-white font-semibold px-5 py-2 rounded-xl hover:bg-green-dark transition-colors disabled:opacity-60 text-sm">
                  {editSavingTc ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddModal && addForm && bundle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-bg-card border border-border rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between sticky top-0 bg-bg-card/90 backdrop-blur z-10">
                <h3 className="text-xl font-semibold">Add test case</h3>
                <button onClick={() => setShowAddModal(false)} className="text-white/40 hover:text-white transition-colors">✕</button>
              </div>
              <div className="p-6 overflow-y-auto space-y-5">
                {addError && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{addError}</div>}
                <div>
                  <label className="text-xs text-white/45 block mb-2">Title *</label>
                  <input
                    placeholder="e.g. User can log in with valid credentials"
                    value={addForm.title} onChange={e => setAddForm(prev => prev ? ({ ...prev, title: e.target.value }) : prev)}
                    className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Case type</label>
                    <select value={addForm.caseKind} onChange={e => setAddForm(prev => prev ? ({ ...prev, caseKind: e.target.value as WebsiteTestCaseKind }) : prev)} className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors">
                      <option value="page">Test case</option>
                      {bundle.meta.mode === "journey" && <option value="step">Step case</option>}
                      {bundle.meta.mode === "journey" && <option value="flow">Flow case</option>}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Category</label>
                    <select value={addForm.category} onChange={e => setAddForm(prev => prev ? ({ ...prev, category: e.target.value }) : prev)} className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors">
                      <option value="functional">Functional</option>
                      <option value="navigation">Navigation</option>
                      <option value="ui">UI</option>
                      <option value="boundary">Boundary</option>
                      <option value="e2e">E2E</option>
                      <option value="negative">Negative</option>
                      <option value="performance">Performance</option>
                      <option value="security">Security</option>
                      <option value="accessibility">Accessibility</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Priority</label>
                    <select value={addForm.priority} onChange={e => setAddForm(prev => prev ? ({ ...prev, priority: e.target.value }) : prev)} className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Source</label>
                    <select value={addForm.source} onChange={e => setAddForm(prev => prev ? ({ ...prev, source: e.target.value as WebsiteTestCaseSource }) : prev)} className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors">
                      <option value="page">Page</option>
                      <option value="recording">Recording</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/45 block mb-2">Included packs</label>
                  <div className="flex flex-wrap gap-2">
                    {TESTCASE_PACK_ORDER.map((pack) => {
                      const disabled = pack === "e2e" && addForm.caseKind !== "flow";
                      const active = addForm.packs.includes(pack);
                      return (
                        <button
                          key={pack}
                          type="button"
                          disabled={disabled}
                          onClick={() => setAddForm((prev) => {
                            if (!prev) return prev;
                            const nextPacks = active
                              ? prev.packs.filter((entry) => entry !== pack)
                              : [...prev.packs, pack];
                            return { ...prev, packs: sanitizePackMembership(prev.caseKind, nextPacks) };
                          })}
                          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                            active
                              ? pack === "smoke"
                                ? "bg-blue-500/15 text-blue-300 border-blue-500/25"
                                : pack === "regression"
                                ? "bg-amber-500/15 text-amber-300 border-amber-500/25"
                                : "bg-purple-500/15 text-purple-300 border-purple-500/25"
                              : "border-white/10 text-white/45 hover:text-white"
                          } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          {TESTCASE_PACK_LABELS[pack]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {bundle.meta.mode === "journey" && (
                  <div>
                    <label className="text-xs text-white/45 block mb-2">Scope</label>
                    <select value={addForm.scope} onChange={e => setAddForm(prev => prev ? ({ ...prev, scope: e.target.value as WebsiteTestCaseScope }) : prev)} className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors">
                      <option value="page">Page</option>
                      <option value="step">Step</option>
                      <option value="journey">Flow</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="text-xs text-white/45 block mb-2">{getGroupingFieldLabel(addForm)}</label>
                  <input
                    placeholder={addForm.caseKind === "flow" ? "Checkout flow" : "Login page"}
                    value={addForm.groupingLabel} onChange={e => setAddForm(prev => prev ? ({ ...prev, groupingLabel: e.target.value }) : prev)}
                    className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/45 block mb-2">Preconditions</label>
                  <textarea
                    placeholder="e.g. User is logged out and on the homepage"
                    value={addForm.preconditions} onChange={e => setAddForm(prev => prev ? ({ ...prev, preconditions: e.target.value }) : prev)}
                    className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors min-h-[60px] resize-y"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-white/45">Steps</label>
                    <button onClick={() => setAddForm(prev => prev ? ({ ...prev, steps: [...prev.steps, ""] }) : prev)} className="text-[11px] text-green hover:text-green-dark transition-colors">+ Add step</button>
                  </div>
                  <div className="space-y-2">
                    {addForm.steps.map((step, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-xs text-white/30 pt-3 w-4 text-right">{i + 1}.</span>
                        <input
                          value={step}
                          onChange={e => {
                            const newSteps = [...addForm.steps];
                            newSteps[i] = e.target.value;
                            setAddForm(prev => prev ? ({ ...prev, steps: newSteps }) : prev);
                          }}
                          className="flex-1 bg-white/5 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-green transition-colors"
                          placeholder={`Step ${i + 1}`}
                        />
                        <button
                          onClick={() => {
                            const newSteps = addForm.steps.filter((_, idx) => idx !== i);
                            setAddForm(prev => prev ? ({ ...prev, steps: newSteps.length ? newSteps : [""] }) : prev);
                          }}
                          className="px-2 text-white/30 hover:text-red-300 transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/45 block mb-2">Expected Result</label>
                  <textarea
                    placeholder="e.g. User is redirected to dashboard"
                    value={addForm.expectedResult} onChange={e => setAddForm(prev => prev ? ({ ...prev, expectedResult: e.target.value }) : prev)}
                    className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors min-h-[60px] resize-y"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/45 block mb-2">Tags (comma separated)</label>
                  <input
                    placeholder="auth, core"
                    value={addForm.tags} onChange={e => setAddForm(prev => prev ? ({ ...prev, tags: e.target.value }) : prev)}
                    className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors"
                  />
                </div>
              </div>
              <div className="p-6 border-t border-border flex justify-end gap-3 shrink-0 bg-bg-card">
                <button onClick={() => setShowAddModal(false)} disabled={addSaving} className="px-4 py-2 rounded-xl text-white/50 hover:text-white transition-colors text-sm font-medium">Cancel</button>
                <button onClick={handleAddTestCase} disabled={addSaving} className="bg-green text-white font-semibold px-5 py-2 rounded-xl hover:bg-green-dark transition-colors disabled:opacity-60 text-sm">
                  {addSaving ? "Saving…" : "Save test case"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showPackModal && bundle && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-bg-card border border-border rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between sticky top-0 bg-bg-card/95 backdrop-blur z-10">
                <div>
                  <h3 className="text-xl font-semibold">Create packs from Test Cases</h3>
                  <p className="text-sm text-white/40 mt-1">Review QA Deck’s suggested memberships, then keep or remove cases for each pack.</p>
                </div>
                <button onClick={() => setShowPackModal(false)} disabled={packSaving} className="text-white/40 hover:text-white transition-colors">✕</button>
              </div>
              <div className="p-6 overflow-y-auto space-y-4">
                {packError && (
                  <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{packError}</div>
                )}
                <div className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(88px,0.6fr))] gap-3 px-3 text-[11px] uppercase tracking-[0.18em] text-white/35">
                  <div>Case</div>
                  <div>Smoke</div>
                  <div>Regression</div>
                  <div>E2E</div>
                </div>
                <div className="space-y-2">
                  {localTestcases.map((tc) => {
                    const selectedPacks = packSelections[tc.id] || [];
                    return (
                      <div key={tc.id} className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(88px,0.6fr))] gap-3 items-center rounded-2xl border border-white/8 bg-white/3 px-3 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/8 text-white/35 font-mono">{tc.id}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">{TESTCASE_KIND_LABELS[tc.caseKind]}</span>
                            {!tc.approved && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">pending approval</span>}
                          </div>
                          <div className="text-sm font-medium text-white truncate">{tc.title}</div>
                          <div className="text-xs text-white/40 mt-1 truncate">{getGroupingValue(tc, bundle.meta)}</div>
                        </div>
                        {TESTCASE_PACK_ORDER.map((pack) => {
                          const disabled = !tc.approved || (pack === "e2e" && tc.caseKind !== "flow");
                          const active = selectedPacks.includes(pack);
                          return (
                            <button
                              key={pack}
                              type="button"
                              disabled={disabled}
                              onClick={() => toggleDraftPack(tc.id, pack)}
                              className={`text-xs px-3 py-2 rounded-xl border transition-colors ${
                                active
                                  ? pack === "smoke"
                                    ? "bg-blue-500/15 text-blue-300 border-blue-500/25"
                                    : pack === "regression"
                                    ? "bg-amber-500/15 text-amber-300 border-amber-500/25"
                                    : "bg-purple-500/15 text-purple-300 border-purple-500/25"
                                  : "bg-white/5 text-white/45 border-white/10 hover:text-white hover:bg-white/8"
                              } disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                              {active ? "Included" : "Skip"}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-6 border-t border-border flex justify-end gap-3 bg-bg-card">
                <button onClick={() => setShowPackModal(false)} disabled={packSaving} className="px-4 py-2 rounded-xl text-white/50 hover:text-white transition-colors text-sm font-medium">Cancel</button>
                <button onClick={handleSavePackSelections} disabled={packSaving} className="bg-blue-500 text-white font-semibold px-5 py-2 rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-60 text-sm">
                  {packSaving ? "Saving…" : "Save packs"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showRegenModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-bg-card border border-border rounded-3xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between">
                <h3 className="text-lg font-semibold">Generate run-ready bundle</h3>
                <button onClick={() => setShowRegenModal(false)} disabled={regenSaving} className="text-white/40 hover:text-white transition-colors">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-white/60">Generate one validated Selenium Python bundle from approved test cases across the saved pages in this project.</p>
                {regenError && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{regenError}</div>}

                <div>
                  <label className="text-xs text-white/45 block mb-2">Framework</label>
                  <select value={regenFramework} onChange={e => setRegenFramework(e.target.value)} disabled={regenSaving} className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green transition-colors">
                    <option value="selenium-python">Selenium (Python)</option>
                  </select>
                </div>

                <div className="text-[11px] text-white/45 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                  This golden path validates syntax, imports, and <code>pytest --collect-only</code> before the bundle is marked ready.
                </div>

                {!extState.connected && (
                  <div className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mt-2">
                    <span className="shrink-0 mt-0.5">⚠</span>
                    <span>The QA Deck extension must be open to securely access your AI API key.</span>
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-border flex justify-end gap-3 bg-bg-card">
                <button onClick={() => setShowRegenModal(false)} disabled={regenSaving} className="px-4 py-2 rounded-xl text-white/50 hover:text-white transition-colors text-sm font-medium">Cancel</button>
                <button
                  onClick={handleRegenerateScript}
                  disabled={regenSaving || !extState.connected}
                  className="bg-blue-500 text-white font-semibold px-5 py-2 rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-60 text-sm flex items-center gap-2"
                >
                  {regenSaving && <span className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />}
                  {regenSaving ? "Generating…" : "Generate bundle"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showPageMismatchSaveModal && bundle && detectedCurrentPage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-bg-card border border-border rounded-3xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-border flex items-center justify-between">
                <h3 className="text-lg font-semibold text-amber-300">⚠ Page Mismatch Detected</h3>
                <button onClick={() => { setShowPageMismatchSaveModal(false); setPendingSaveAction(null); setDetectedCurrentPage(null); }} className="text-white/40 hover:text-white transition-colors">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-white/70">
                  You're about to save data for the wrong page. This could overwrite test cases and locators.
                </p>
                <div className="space-y-3 bg-white/5 border border-white/10 rounded-xl p-4">
                  <div>
                    <p className="text-xs text-white/45 mb-1">Selected page</p>
                    <p className="text-sm font-semibold text-white">{bundle.meta.pageLabel || "Unknown"}</p>
                  </div>
                  <div className="border-t border-white/10" />
                  <div>
                    <p className="text-xs text-white/45 mb-1">Current page detected</p>
                    <p className="text-sm font-semibold text-amber-300">{detectedCurrentPage.pageLabel || "Unknown"}</p>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-border flex flex-col gap-3 bg-bg-card">
                <button
                  onClick={handleCreateNewPageFromMismatch}
                  className="w-full bg-blue-500 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-600 transition-colors text-sm"
                >
                  Create new page
                </button>
                <button
                  onClick={handleSwitchPageFromMismatch}
                  className="w-full bg-white/10 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-white/15 transition-colors text-sm border border-white/20"
                >
                  Switch to existing page
                </button>
                <button
                  onClick={handleSaveAnywayFromMismatch}
                  className="w-full bg-red-500/20 text-red-300 font-semibold px-5 py-2.5 rounded-xl hover:bg-red-500/30 transition-colors text-sm border border-red-500/30"
                >
                  Save anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

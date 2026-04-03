import type { ProjectBundle, ProjectMeta } from "@/lib/project-store";

export type RiskLevel = "low" | "medium" | "high" | "critical";
export type ModuleStatus = "ready" | "partial" | "missing";
export type ReleaseDecision = "go" | "caution" | "no-go";

export interface QualityModuleSummary {
  key: "risk" | "runs" | "api" | "performance" | "accessibility" | "security" | "evidence" | "release";
  label: string;
  status: ModuleStatus;
  summary: string;
  recommendation: string;
}

export interface CoverageArea {
  key: "ui" | "journey" | "api" | "performance" | "accessibility" | "security" | "evidence";
  label: string;
  covered: number;
  total: number;
  status: ModuleStatus;
  summary: string;
}

export interface RiskSignal {
  id: string;
  level: RiskLevel;
  category: "coverage" | "stability" | "accessibility" | "performance" | "security" | "api" | "release";
  title: string;
  summary: string;
  recommendation: string;
  source: string;
  blocker: boolean;
}

export interface QualityFinding {
  id: string;
  title: string;
  severity: RiskLevel;
  owner: "qa" | "dev" | "pm" | "security" | "performance";
  source: string;
  affectedArea: string;
  recommendation: string;
  blocker: boolean;
}

export interface SuggestedRun {
  id: string;
  name: string;
  cadence: "daily" | "pre-release" | "post-deploy" | "on-change" | "weekly";
  scope: string;
  environment: string;
  summary: string;
  estimatedMinutes: number;
  priority: RiskLevel;
}

export interface MaintenanceSuggestion {
  id: string;
  title: string;
  impact: string;
  recommendation: string;
}

export interface ExploratoryCharter {
  id: string;
  title: string;
  mission: string;
  focus: string[];
  exitCriteria: string;
}

export interface EvidencePack {
  id: string;
  title: string;
  status: ModuleStatus;
  summary: string;
  contents: string[];
}

export interface SelfHealingSuggestion {
  id: string;
  element: string;
  currentStrategy: string;
  suggestedStrategy: string;
  confidence: "high" | "medium";
  reason: string;
}

export interface FailureCluster {
  id: string;
  title: string;
  likelyCause: string;
  affectedAreas: string[];
  nextAction: string;
}

export interface AskQaAnswer {
  prompt: string;
  answer: string;
}

export interface ReleaseGate {
  decision: ReleaseDecision;
  score: number;
  blockers: string[];
  rationale: string[];
  recommendedNextSteps: string[];
}

export interface ProjectQualitySnapshot {
  pageType: string;
  riskScore: number;
  riskSignals: RiskSignal[];
  findings: QualityFinding[];
  modules: QualityModuleSummary[];
  coverageAreas: CoverageArea[];
  suggestedRuns: SuggestedRun[];
  maintenanceSuggestions: MaintenanceSuggestion[];
  exploratoryCharters: ExploratoryCharter[];
  evidencePacks: EvidencePack[];
  selfHealingSuggestions: SelfHealingSuggestion[];
  failureClusters: FailureCluster[];
  changeImpactAreas: string[];
  recommendedTests: string[];
  askQaAnswers: AskQaAnswer[];
  releaseGate: ReleaseGate;
}

export interface ProjectReleaseRow {
  projectId: string;
  projectName: string;
  decision: ReleaseDecision;
  score: number;
  blockers: number;
  topRisk: string;
  nextTests: string[];
}

export interface PortfolioQualitySnapshot {
  averageRiskScore: number;
  goCount: number;
  cautionCount: number;
  noGoCount: number;
  totalBlockers: number;
  topRisks: ProjectReleaseRow[];
  stakeholderSummary: string[];
  askQaAnswers: AskQaAnswer[];
}

type UnknownRecord = Record<string, unknown>;

function toRiskWeight(level: RiskLevel) {
  return {
    low: 6,
    medium: 12,
    high: 20,
    critical: 30,
  }[level];
}

function toModuleStatus(covered: number, total: number): ModuleStatus {
  if (covered <= 0) return "missing";
  if (covered >= total) return "ready";
  return "partial";
}

function toSeverityLabel(level: RiskLevel) {
  return level.toUpperCase();
}

function inferPageType(bundle: ProjectBundle) {
  const scan = bundle.artifacts.scan as UnknownRecord | null;
  const journey = bundle.artifacts.journey as UnknownRecord | null;
  const scanMeta = (scan?.meta as UnknownRecord | undefined) || null;
  const url = bundle.meta.sourceUrl || String(scanMeta?.url || "");
  const explicit = String(scanMeta?.pageType || "");
  if (explicit) return explicit;

  const journeySteps = Array.isArray(journey?.steps) ? (journey?.steps as UnknownRecord[]) : [];
  const firstStepType = String(journeySteps[0]?.pageType || "");
  if (firstStepType) return firstStepType;

  const lower = url.toLowerCase();
  if (/checkout|payment|billing/.test(lower)) return "checkout";
  if (/login|signin|auth/.test(lower)) return "login";
  if (/signup|register/.test(lower)) return "registration";
  if (/admin|manage|ops/.test(lower)) return "admin";
  if (/search|results/.test(lower)) return "search";
  if (/account|profile|settings/.test(lower)) return "settings";
  if (/dashboard|overview/.test(lower)) return "dashboard";
  if (/product|detail|item/.test(lower)) return "product";
  return bundle.meta.mode === "journey" ? "journey" : "general";
}

function getCriticality(pageType: string) {
  if (["checkout", "login", "registration", "admin"].includes(pageType)) return "critical";
  if (["dashboard", "settings", "search", "journey"].includes(pageType)) return "high";
  return "standard";
}

function getTestCases(bundle: ProjectBundle) {
  return Array.isArray(bundle.artifacts.testcases)
    ? (bundle.artifacts.testcases as UnknownRecord[])
    : [];
}

function getScan(bundle: ProjectBundle) {
  return (bundle.artifacts.scan as UnknownRecord | null) || null;
}

function getJourney(bundle: ProjectBundle) {
  return (bundle.artifacts.journey as UnknownRecord | null) || null;
}

function getFlakyElements(scan: UnknownRecord | null) {
  if (!scan) return [];
  const forms = Array.isArray(scan.forms) ? (scan.forms as UnknownRecord[]) : [];
  const buttons = Array.isArray(scan.buttons) ? (scan.buttons as UnknownRecord[]) : [];
  const inputs = Array.isArray(scan.inputs) ? (scan.inputs as UnknownRecord[]) : [];

  const formFields = forms.flatMap((form) =>
    Array.isArray(form.fields) ? (form.fields as UnknownRecord[]) : []
  );

  return [...buttons, ...inputs, ...formFields].filter((element) => Boolean(element.flaky));
}

function getStableLocatorSuggestion(element: UnknownRecord) {
  if (element.testId) return { strategy: "test-id", reason: "data-testid is already present and should be preferred." };
  if (element.ariaLabel) return { strategy: "aria-label", reason: "ARIA labels are semantic and resilient for recovery." };
  if (element.name) return { strategy: "name", reason: "Name-based selectors are more stable than CSS hierarchy." };
  return { strategy: "add-test-id", reason: "This element needs a dedicated testing attribute to avoid future breakage." };
}

function getTags(bundle: ProjectBundle) {
  const tags = new Set(bundle.meta.tags.map((tag) => tag.toLowerCase()));
  getTestCases(bundle).forEach((testcase) => {
    const title = String(testcase.title || "").toLowerCase();
    if (/api|contract|schema/.test(title)) tags.add("api");
    if (/accessibility|wcag|aria/.test(title)) tags.add("accessibility");
    if (/security|permission|auth|session|role/.test(title)) tags.add("security");
    if (/performance|latency|load/.test(title)) tags.add("performance");
    if (/smoke/.test(title)) tags.add("smoke");
    if (/regression/.test(title)) tags.add("regression");
  });
  return tags;
}

function hasKeywordInTests(bundle: ProjectBundle, pattern: RegExp) {
  return getTestCases(bundle).some((testcase) => {
    const text = `${String(testcase.title || "")} ${String(testcase.expected || "")} ${String(testcase.category || "")}`.toLowerCase();
    return pattern.test(text);
  });
}

function getJourneyStepCount(bundle: ProjectBundle) {
  const journey = getJourney(bundle);
  return Array.isArray(journey?.steps) ? (journey.steps as UnknownRecord[]).length : 0;
}

function getAccessibilitySignals(scan: UnknownRecord | null) {
  const accessibility = (scan?.accessibility as UnknownRecord | undefined) || null;
  const inputsWithoutLabels = Number(accessibility?.inputsWithoutLabels || 0);
  const issues = Array.isArray(accessibility?.issues) ? (accessibility?.issues as UnknownRecord[]) : [];
  return { accessibility, inputsWithoutLabels, issues };
}

function getPerformanceSignals(scan: UnknownRecord | null) {
  const performance = (scan?.performance as UnknownRecord | undefined) || null;
  const loadTime = Number(performance?.loadTime || 0);
  const fcp = Number(performance?.fcp || 0);
  const ttfb = Number(performance?.ttfb || 0);
  return { performance, loadTime, fcp, ttfb };
}

function buildCoverageAreas(bundle: ProjectBundle, pageType: string) {
  const scan = getScan(bundle);
  const journeySteps = getJourneyStepCount(bundle);
  const tags = getTags(bundle);
  const hasAccessibilitySuite = hasKeywordInTests(bundle, /accessibility|wcag|aria/) || bundle.artifacts.scriptFiles.some((file) => /access|a11y/i.test(file.filename));
  const hasApiSuite = tags.has("api") || hasKeywordInTests(bundle, /api|contract|schema|network/);
  const hasSecuritySuite = tags.has("security") || hasKeywordInTests(bundle, /security|permission|auth|session|role|csrf/);
  const hasPerformanceSuite = tags.has("performance") || bundle.artifacts.scriptFiles.some((file) => /perf|load|k6|lighthouse/i.test(file.filename));
  const hasEvidence = bundle.activities.length > 0 || !!bundle.artifacts.notes;

  const testCases = getTestCases(bundle).length;
  const uiTarget = bundle.meta.mode === "journey" ? Math.max(4, journeySteps * 2) : getCriticality(pageType) === "critical" ? 6 : 4;
  const journeyTarget = bundle.meta.mode === "journey" ? Math.max(2, journeySteps) : 1;

  const coverageAreas: CoverageArea[] = [
    {
      key: "ui",
      label: "UI coverage",
      covered: Math.min(uiTarget, testCases),
      total: uiTarget,
      status: toModuleStatus(Math.min(uiTarget, testCases), uiTarget),
      summary: testCases
        ? `${testCases} saved test case${testCases === 1 ? "" : "s"} cover the latest flow.`
        : "No functional UI cases are saved yet.",
    },
    {
      key: "journey",
      label: "Journey coverage",
      covered: bundle.meta.mode === "journey" ? Math.max(1, journeySteps) : 0,
      total: journeyTarget,
      status: bundle.meta.mode === "journey"
        ? toModuleStatus(Math.max(1, journeySteps), journeyTarget)
        : "missing",
      summary: bundle.meta.mode === "journey"
        ? `${journeySteps} journey step${journeySteps === 1 ? "" : "s"} are stored in this project.`
        : "This project is page-based, so there is no multi-step regression baseline yet.",
    },
    {
      key: "api",
      label: "API quality",
      covered: hasApiSuite ? 1 : 0,
      total: 1,
      status: hasApiSuite ? "ready" : "missing",
      summary: hasApiSuite
        ? "API or contract-oriented coverage is present in the saved tests."
        : "No API or contract validation is represented in the saved assets.",
    },
    {
      key: "performance",
      label: "Performance baseline",
      covered: getPerformanceSignals(scan).performance ? (hasPerformanceSuite ? 2 : 1) : 0,
      total: 2,
      status: toModuleStatus(getPerformanceSignals(scan).performance ? (hasPerformanceSuite ? 2 : 1) : 0, 2),
      summary: getPerformanceSignals(scan).performance
        ? hasPerformanceSuite
          ? "Runtime metrics and a dedicated performance asset exist."
          : "Live page metrics exist, but no repeatable performance test asset is saved."
        : "No performance baseline is attached to this project.",
    },
    {
      key: "accessibility",
      label: "Accessibility coverage",
      covered: getAccessibilitySignals(scan).accessibility ? (hasAccessibilitySuite ? 2 : 1) : 0,
      total: 2,
      status: toModuleStatus(getAccessibilitySignals(scan).accessibility ? (hasAccessibilitySuite ? 2 : 1) : 0, 2),
      summary: getAccessibilitySignals(scan).accessibility
        ? hasAccessibilitySuite
          ? "Accessibility scan data and dedicated test coverage are both present."
          : "Accessibility scan data exists, but there is no explicit a11y test pack yet."
        : "No accessibility scan data is stored for the latest version.",
    },
    {
      key: "security",
      label: "Security smoke",
      covered: hasSecuritySuite ? 1 : 0,
      total: 1,
      status: hasSecuritySuite ? "ready" : "missing",
      summary: hasSecuritySuite
        ? "Security-oriented coverage is represented in the saved tests."
        : "No auth, permission, or session smoke checks are explicitly saved.",
    },
    {
      key: "evidence",
      label: "Evidence readiness",
      covered: hasEvidence ? 1 : 0,
      total: 1,
      status: hasEvidence ? "ready" : "missing",
      summary: hasEvidence
        ? "Version history and notes can be assembled into release evidence packs."
        : "No notes or evidence-oriented metadata are saved for the latest version.",
    },
  ];

  return coverageAreas;
}

function buildRiskSignals(bundle: ProjectBundle, coverageAreas: CoverageArea[], pageType: string) {
  const signals: RiskSignal[] = [];
  const criticality = getCriticality(pageType);
  const flakyElements = getFlakyElements(getScan(bundle));
  const scan = getScan(bundle);
  const { inputsWithoutLabels, issues } = getAccessibilitySignals(scan);
  const { loadTime, fcp, ttfb } = getPerformanceSignals(scan);
  const versions = bundle.versions.length;
  const source = bundle.meta.sourceUrl || "saved project";
  const uiCoverage = coverageAreas.find((area) => area.key === "ui");
  const apiCoverage = coverageAreas.find((area) => area.key === "api");
  const performanceCoverage = coverageAreas.find((area) => area.key === "performance");
  const accessibilityCoverage = coverageAreas.find((area) => area.key === "accessibility");
  const securityCoverage = coverageAreas.find((area) => area.key === "security");

  if (!getTestCases(bundle).length) {
    signals.push({
      id: `${bundle.meta.id}-missing-tests`,
      level: "critical",
      category: "coverage",
      title: "No saved functional tests",
      summary: "This project has no saved test cases, so release confidence is effectively zero.",
      recommendation: "Generate and approve a smoke pack before relying on this project for release decisions.",
      source,
      blocker: true,
    });
  }

  if (!bundle.artifacts.scriptFiles.length) {
    signals.push({
      id: `${bundle.meta.id}-missing-scripts`,
      level: "high",
      category: "release",
      title: "No executable scripts",
      summary: "Saved cases exist, but there is no executable automation bundle attached to the latest version.",
      recommendation: "Generate and save scripts so regression can be rerun without manual recreation.",
      source,
      blocker: criticality === "critical",
    });
  }

  if (uiCoverage?.status !== "ready") {
    signals.push({
      id: `${bundle.meta.id}-ui-gap`,
      level: criticality === "critical" ? "high" : "medium",
      category: "coverage",
      title: "UI coverage is thinner than the flow complexity",
      summary: uiCoverage?.summary || "Saved UI coverage is incomplete for this project.",
      recommendation: "Expand the smoke pack with validation, error-path, and recovery scenarios.",
      source,
      blocker: criticality === "critical" && uiCoverage?.status === "missing",
    });
  }

  if (apiCoverage?.status === "missing" && ["checkout", "login", "dashboard", "admin", "search"].includes(pageType)) {
    signals.push({
      id: `${bundle.meta.id}-api-gap`,
      level: "high",
      category: "api",
      title: "No API or contract coverage for a backend-heavy flow",
      summary: "The page type suggests meaningful backend calls, but no API checks are captured in the saved assets.",
      recommendation: "Add endpoint validation, response assertions, or contract checks alongside UI coverage.",
      source,
      blocker: pageType === "checkout" || pageType === "admin",
    });
  }

  if (securityCoverage?.status === "missing" && ["checkout", "login", "registration", "settings", "admin"].includes(pageType)) {
    signals.push({
      id: `${bundle.meta.id}-security-gap`,
      level: pageType === "admin" || pageType === "checkout" ? "critical" : "high",
      category: "security",
      title: "Security smoke coverage is missing",
      summary: "This flow touches auth, permissions, or payment, but there are no explicit security-focused checks.",
      recommendation: "Add session, role, permission, and auth smoke tests before promoting the release.",
      source,
      blocker: true,
    });
  }

  if (accessibilityCoverage?.status !== "ready" && ["checkout", "login", "registration", "settings"].includes(pageType)) {
    signals.push({
      id: `${bundle.meta.id}-accessibility-gap`,
      level: inputsWithoutLabels > 0 ? "high" : "medium",
      category: "accessibility",
      title: "Accessibility coverage is incomplete",
      summary: inputsWithoutLabels > 0
        ? `${inputsWithoutLabels} interactive element${inputsWithoutLabels === 1 ? "" : "s"} are missing accessible labels in the latest scan.`
        : accessibilityCoverage?.summary || "Accessibility checks are not yet part of the saved regression story.",
      recommendation: "Create an accessibility smoke pack and fix the top labeling or landmark issues before release.",
      source,
      blocker: inputsWithoutLabels > 0 && ["checkout", "login"].includes(pageType),
    });
  }

  if (performanceCoverage?.status !== "ready" && ["checkout", "dashboard", "search"].includes(pageType)) {
    signals.push({
      id: `${bundle.meta.id}-performance-gap`,
      level: "medium",
      category: "performance",
      title: "No repeatable performance guardrail",
      summary: "The project has page metrics, but there is no scheduled or scripted performance check to catch regressions.",
      recommendation: "Promote the captured metrics into a budgeted performance baseline before release.",
      source,
      blocker: false,
    });
  }

  if (loadTime > 3000 || fcp > 2500 || ttfb > 800) {
    signals.push({
      id: `${bundle.meta.id}-slow-page`,
      level: loadTime > 4500 || fcp > 3500 ? "high" : "medium",
      category: "performance",
      title: "Latest scan shows a slow critical path",
      summary: `Captured metrics show load ${loadTime || "n/a"}ms, FCP ${fcp || "n/a"}ms, and TTFB ${ttfb || "n/a"}ms.`,
      recommendation: "Run a focused performance investigation before shipping and set explicit budgets for this project.",
      source,
      blocker: pageType === "checkout" && loadTime > 4500,
    });
  }

  if (flakyElements.length > 0) {
    signals.push({
      id: `${bundle.meta.id}-flaky-locators`,
      level: flakyElements.length > 3 ? "high" : "medium",
      category: "stability",
      title: "Potentially flaky locators are present",
      summary: `${flakyElements.length} saved element${flakyElements.length === 1 ? "" : "s"} look unstable because of dynamic text, generated IDs, or brittle classes.`,
      recommendation: "Review self-healing suggestions and replace fragile selectors with test IDs, names, or ARIA-based locators.",
      source,
      blocker: false,
    });
  }

  if (versions < 2) {
    signals.push({
      id: `${bundle.meta.id}-thin-history`,
      level: "medium",
      category: "release",
      title: "There is no meaningful historical baseline yet",
      summary: "Only one saved version exists, so comparison, trend, and regression confidence are limited.",
      recommendation: "Capture another saved version after a meaningful change or run so future release analysis has a baseline.",
      source,
      blocker: false,
    });
  }

  if (bundle.meta.syncState !== "synced") {
    signals.push({
      id: `${bundle.meta.id}-unsynced`,
      level: "high",
      category: "release",
      title: "Cloud sync is not healthy",
      summary: "The project is not fully synced, so the dashboard may not reflect the latest work.",
      recommendation: "Retry cloud sync before using this project as release evidence.",
      source,
      blocker: true,
    });
  }

  if (!bundle.artifacts.cicd || Object.keys(bundle.artifacts.cicd).length === 0) {
    signals.push({
      id: `${bundle.meta.id}-no-cicd`,
      level: "medium",
      category: "release",
      title: "No CI/CD automation entrypoint is saved",
      summary: "The project can be reviewed manually, but it is not yet packaged for repeatable CI execution.",
      recommendation: "Generate CI/CD files so smoke or regression runs can be repeated consistently.",
      source,
      blocker: false,
    });
  }

  if (issues.length > 0 && signals.every((signal) => signal.id !== `${bundle.meta.id}-accessibility-gap`)) {
    signals.push({
      id: `${bundle.meta.id}-a11y-issues`,
      level: "medium",
      category: "accessibility",
      title: "Accessibility scan surfaced actionable issues",
      summary: `${issues.length} accessibility issue${issues.length === 1 ? "" : "s"} were captured in the latest scan.`,
      recommendation: "Bundle those findings into an accessibility fix pack for the next dev pass.",
      source,
      blocker: false,
    });
  }

  return signals.sort((left, right) => toRiskWeight(right.level) - toRiskWeight(left.level));
}

function buildFindings(riskSignals: RiskSignal[]) {
  return riskSignals.map((signal) => {
    const owner: QualityFinding["owner"] = signal.category === "security"
      ? "security"
      : signal.category === "performance"
        ? "performance"
        : signal.category === "release"
          ? "pm"
          : "dev";

    return {
      id: signal.id,
      title: `${toSeverityLabel(signal.level)}: ${signal.title}`,
      severity: signal.level,
      owner,
      source: signal.source,
      affectedArea: signal.category,
      recommendation: signal.recommendation,
      blocker: signal.blocker,
    };
  });
}

function buildSuggestedRuns(bundle: ProjectBundle, pageType: string, coverageAreas: CoverageArea[]) {
  const runs: SuggestedRun[] = [
    {
      id: `${bundle.meta.id}-smoke`,
      name: "Autonomous smoke pack",
      cadence: "daily",
      scope: bundle.meta.mode === "journey" ? "critical journey steps" : "core page actions",
      environment: "staging",
      summary: "Fast confidence run for every saved critical path.",
      estimatedMinutes: bundle.meta.mode === "journey" ? 12 : 8,
      priority: "high",
    },
    {
      id: `${bundle.meta.id}-release`,
      name: "Pre-release regression",
      cadence: "pre-release",
      scope: bundle.meta.mode === "journey" ? "full journey + regressions" : "saved UI regression set",
      environment: "release candidate",
      summary: "Expanded pack for ship readiness and blocker surfacing.",
      estimatedMinutes: 25,
      priority: "high",
    },
    {
      id: `${bundle.meta.id}-post-deploy`,
      name: "Post-deploy verification",
      cadence: "post-deploy",
      scope: "core smoke plus health checks",
      environment: "production-like",
      summary: "Quick validation after deploy or rollback.",
      estimatedMinutes: 10,
      priority: "medium",
    },
  ];

  if (coverageAreas.find((area) => area.key === "accessibility")?.status !== "ready") {
    runs.push({
      id: `${bundle.meta.id}-a11y`,
      name: "Accessibility smoke sweep",
      cadence: "weekly",
      scope: "labels, landmarks, keyboard focus, high-value forms",
      environment: "staging",
      summary: "Focused WCAG smoke coverage for the latest saved flow.",
      estimatedMinutes: 15,
      priority: pageType === "checkout" || pageType === "login" ? "high" : "medium",
    });
  }

  if (coverageAreas.find((area) => area.key === "security")?.status !== "ready") {
    runs.push({
      id: `${bundle.meta.id}-security`,
      name: "Security smoke checks",
      cadence: "on-change",
      scope: "auth, session, role, permission, and exposed endpoint checks",
      environment: "staging",
      summary: "Practical QA-level security smoke coverage for sensitive flows.",
      estimatedMinutes: 18,
      priority: ["checkout", "login", "admin"].includes(pageType) ? "critical" : "high",
    });
  }

  if (coverageAreas.find((area) => area.key === "api")?.status !== "ready") {
    runs.push({
      id: `${bundle.meta.id}-api`,
      name: "API contract checks",
      cadence: "on-change",
      scope: "network endpoints and response validation",
      environment: "integration",
      summary: "Contract and payload validation for backend-heavy flows.",
      estimatedMinutes: 16,
      priority: ["checkout", "dashboard", "admin", "search"].includes(pageType) ? "high" : "medium",
    });
  }

  if (coverageAreas.find((area) => area.key === "performance")?.status !== "ready") {
    runs.push({
      id: `${bundle.meta.id}-perf`,
      name: "Performance baseline capture",
      cadence: "weekly",
      scope: "page load, FCP, TTFB, and critical request timings",
      environment: "staging",
      summary: "Turns captured runtime metrics into an explicit budgeted baseline.",
      estimatedMinutes: 20,
      priority: ["checkout", "dashboard", "search"].includes(pageType) ? "high" : "medium",
    });
  }

  return runs;
}

function buildMaintenanceSuggestions(bundle: ProjectBundle, riskSignals: RiskSignal[]) {
  const suggestions: MaintenanceSuggestion[] = [];
  const testCases = getTestCases(bundle);
  const titleCounts = new Map<string, number>();

  testCases.forEach((testcase) => {
    const title = String(testcase.title || "Untitled").trim().toLowerCase();
    titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
  });

  if (Array.from(titleCounts.values()).some((count) => count > 1)) {
    suggestions.push({
      id: `${bundle.meta.id}-duplicate-tests`,
      title: "Merge duplicate or overlapping test cases",
      impact: "Low-value duplication makes maintenance harder and inflates perceived coverage.",
      recommendation: "Consolidate similar cases into parameterized smoke/regression packs.",
    });
  }

  if (!bundle.artifacts.scriptFiles.length && testCases.length) {
    suggestions.push({
      id: `${bundle.meta.id}-no-script-maintenance`,
      title: "Generate executable assets for saved cases",
      impact: "Manual review exists, but there is no repeatable automation artifact to rerun.",
      recommendation: "Generate scripts and store them with the project so regression is repeatable.",
    });
  }

  if (riskSignals.some((signal) => signal.category === "stability")) {
    suggestions.push({
      id: `${bundle.meta.id}-locator-maintenance`,
      title: "Replace fragile locators before they fail in CI",
      impact: "Generated IDs and class-based selectors are likely to create false failures.",
      recommendation: "Apply self-healing suggestions or add dedicated testing attributes on the app side.",
    });
  }

  if (!bundle.artifacts.notes) {
    suggestions.push({
      id: `${bundle.meta.id}-evidence-maintenance`,
      title: "Capture notes and evidence for this project",
      impact: "Stakeholder reviews and triage stay slow when evidence is only implicit.",
      recommendation: "Save notes, assertions, bug evidence, or findings alongside future versions.",
    });
  }

  if (!bundle.versions.length || bundle.versions.length < 2) {
    suggestions.push({
      id: `${bundle.meta.id}-baseline-maintenance`,
      title: "Build a second baseline version",
      impact: "Risk comparisons and what-changed analysis are weak with only one snapshot.",
      recommendation: "Save again after the next meaningful regression or feature change.",
    });
  }

  return suggestions;
}

function buildExploratoryCharters(bundle: ProjectBundle, pageType: string) {
  const sourceUrl = bundle.meta.sourceUrl || "this flow";
  const charters: ExploratoryCharter[] = [
    {
      id: `${bundle.meta.id}-happy-path`,
      title: "Critical path exploratory pass",
      mission: `Walk the highest-value happy path on ${sourceUrl} and confirm that saved automation still matches real behavior.`,
      focus: ["happy path", "major forms", "blocking errors", "navigation confidence"],
      exitCriteria: "You can describe whether the critical path is safe to ship or not.",
    },
  ];

  if (["checkout", "login", "registration", "settings", "admin"].includes(pageType)) {
    charters.push({
      id: `${bundle.meta.id}-permissions`,
      title: "Auth and permission edge sweep",
      mission: "Probe invalid credentials, expired sessions, role boundaries, and permission-denied paths.",
      focus: ["invalid input", "session timeout", "role switching", "denied actions"],
      exitCriteria: "Known auth and permission risks are either covered or turned into explicit findings.",
    });
  }

  if (["checkout", "search", "dashboard"].includes(pageType)) {
    charters.push({
      id: `${bundle.meta.id}-resilience`,
      title: "Resilience and recovery sweep",
      mission: "Interrupt the flow with reloads, slow input, empty states, and recovery actions to find brittle behavior.",
      focus: ["empty state", "retry", "slow responses", "navigation recovery"],
      exitCriteria: "Recovery paths are either tested, documented, or flagged as release risk.",
    });
  }

  return charters;
}

function buildEvidencePacks(bundle: ProjectBundle, pageType: string) {
  const packs: EvidencePack[] = [
    {
      id: `${bundle.meta.id}-release-pack`,
      title: "Release evidence pack",
      status: bundle.versions.length && bundle.artifacts.scriptFiles.length ? "ready" : "partial",
      summary: "Use this pack when a PM or developer asks why the release is safe or risky.",
      contents: [
        `${bundle.versions.length} saved version${bundle.versions.length === 1 ? "" : "s"}`,
        `${getTestCases(bundle).length} saved test case${getTestCases(bundle).length === 1 ? "" : "s"}`,
        `${bundle.artifacts.scriptFiles.length} script file${bundle.artifacts.scriptFiles.length === 1 ? "" : "s"}`,
        bundle.artifacts.cicd ? "CI/CD assets available" : "No CI/CD asset yet",
      ],
    },
    {
      id: `${bundle.meta.id}-bug-pack`,
      title: "Bug evidence pack",
      status: bundle.activities.length ? "ready" : "partial",
      summary: "Bundle repro hints, version history, and impacted artifacts into a faster defect handoff.",
      contents: [
        "Activity timeline",
        "Source URL and flow metadata",
        bundle.artifacts.notes ? "Notes attached" : "No saved notes",
        pageType === "journey" ? "Journey step context" : "Page scan context",
      ],
    },
  ];

  if (getAccessibilitySignals(getScan(bundle)).accessibility) {
    packs.push({
      id: `${bundle.meta.id}-a11y-pack`,
      title: "Accessibility fix pack",
      status: "ready",
      summary: "Turn scan issues into a focused dev-ready accessibility handoff.",
      contents: [
        `${getAccessibilitySignals(getScan(bundle)).issues.length} captured accessibility issue${getAccessibilitySignals(getScan(bundle)).issues.length === 1 ? "" : "s"}`,
        "Affected locators",
        "Recommended a11y smoke run",
      ],
    });
  }

  return packs;
}

function buildSelfHealingSuggestions(bundle: ProjectBundle) {
  return getFlakyElements(getScan(bundle)).slice(0, 8).map((element, index) => {
    const stableSuggestion = getStableLocatorSuggestion(element);
    return {
      id: `${bundle.meta.id}-heal-${index + 1}`,
      element: String(element.label || element.text || element.name || element.placeholder || element.locator || `Element ${index + 1}`),
      currentStrategy: String(element.locatorStrategy || "css"),
      suggestedStrategy: stableSuggestion.strategy,
      confidence: stableSuggestion.strategy === "add-test-id" ? "medium" : "high",
      reason: stableSuggestion.reason,
    } as SelfHealingSuggestion;
  });
}

function buildFailureClusters(riskSignals: RiskSignal[], pageType: string) {
  const clusters: FailureCluster[] = [];

  if (riskSignals.some((signal) => signal.category === "security")) {
    clusters.push({
      id: `cluster-security-${pageType}`,
      title: "Auth and permission failures",
      likelyCause: "Session handling, role checks, or security edge cases are under-covered.",
      affectedAreas: ["login", "account access", "privileged actions"],
      nextAction: "Run security smoke checks and validate permission-denied paths before release.",
    });
  }

  if (riskSignals.some((signal) => signal.category === "stability")) {
    clusters.push({
      id: `cluster-stability-${pageType}`,
      title: "Locator and selector instability",
      likelyCause: "Dynamic IDs, brittle CSS, or text-dependent locators are present in the saved scan.",
      affectedAreas: ["UI automation", "regression reruns", "post-deploy smoke"],
      nextAction: "Review self-healing suggestions and replace fragile selectors with stable alternatives.",
    });
  }

  if (riskSignals.some((signal) => signal.category === "api")) {
    clusters.push({
      id: `cluster-api-${pageType}`,
      title: "Backend contract regressions",
      likelyCause: "UI behavior depends on API responses that are not separately validated.",
      affectedAreas: ["data loading", "state transitions", "error handling"],
      nextAction: "Add API contract checks and compare environments before release.",
    });
  }

  if (riskSignals.some((signal) => signal.category === "performance")) {
    clusters.push({
      id: `cluster-performance-${pageType}`,
      title: "Slow-path and timeout regressions",
      likelyCause: "Performance budgets are missing or already trending above expected thresholds.",
      affectedAreas: ["page load", "critical user journeys", "backend latency"],
      nextAction: "Capture a performance baseline and watch the slowest critical paths in CI or pre-release checks.",
    });
  }

  return clusters;
}

function buildRecommendedTests(pageType: string, coverageAreas: CoverageArea[]) {
  const tests = ["Critical path smoke"];

  if (["checkout", "search", "dashboard", "admin"].includes(pageType)) tests.push("Backend/API validation");
  if (["checkout", "login", "registration", "settings"].includes(pageType)) tests.push("Accessibility smoke");
  if (["checkout", "login", "registration", "admin"].includes(pageType)) tests.push("Security and permission smoke");
  if (coverageAreas.find((area) => area.key === "performance")?.status !== "ready") tests.push("Performance baseline");
  if (coverageAreas.find((area) => area.key === "journey")?.status !== "ready") tests.push("Multi-step regression");

  return tests;
}

function buildChangeImpactAreas(bundle: ProjectBundle, pageType: string) {
  const areas = new Set<string>();
  const url = bundle.meta.sourceUrl.toLowerCase();
  const scan = getScan(bundle);
  const pageStructure = (scan?.pageStructure as UnknownRecord | undefined) || null;

  areas.add(pageType);
  if (/checkout|payment/.test(url)) areas.add("payment");
  if (/auth|login|account/.test(url)) areas.add("authentication");
  if (/admin|manage|ops/.test(url)) areas.add("permissions");
  if (/search/.test(url) || pageStructure?.hasSearch) areas.add("search");
  if (pageStructure?.hasFileUpload) areas.add("file upload");
  if (pageStructure?.hasTabs) areas.add("tab navigation");
  if (pageStructure?.hasDatePicker) areas.add("date handling");
  if (bundle.meta.mode === "journey") areas.add("cross-page transitions");

  return Array.from(areas);
}

function buildReleaseGate(riskSignals: RiskSignal[], coverageAreas: CoverageArea[]) {
  const blockers = riskSignals.filter((signal) => signal.blocker);
  const deductions = riskSignals.reduce((sum, signal) => sum + toRiskWeight(signal.level), 0);
  const coveragePenalty = coverageAreas.reduce((sum, area) => {
    if (area.status === "missing") return sum + 6;
    if (area.status === "partial") return sum + 2;
    return sum;
  }, 0);
  const score = Math.max(0, 100 - deductions - coveragePenalty);
  const decision: ReleaseDecision =
    blockers.length > 1 || score < 55 ? "no-go" : blockers.length || score < 78 ? "caution" : "go";

  return {
    decision,
    score,
    blockers: blockers.map((signal) => signal.title),
    rationale: riskSignals.slice(0, 4).map((signal) => signal.summary),
    recommendedNextSteps: Array.from(
      new Set(riskSignals.slice(0, 4).map((signal) => signal.recommendation))
    ).slice(0, 4),
  };
}

function buildModuleSummaries(coverageAreas: CoverageArea[], releaseGate: ReleaseGate, riskSignals: RiskSignal[]) {
  const byKey = Object.fromEntries(coverageAreas.map((area) => [area.key, area])) as Record<string, CoverageArea>;
  return [
    {
      key: "risk",
      label: "Risk",
      status: releaseGate.decision === "go" ? "ready" : releaseGate.decision === "caution" ? "partial" : "missing",
      summary: riskSignals.length
        ? `${riskSignals.length} active risk signal${riskSignals.length === 1 ? "" : "s"} are shaping release posture.`
        : "No major risks detected from the latest saved assets.",
      recommendation: "Use the top risk signals to decide the next run, fix, or release conversation.",
    },
    {
      key: "runs",
      label: "Runs",
      status: byKey.ui?.status === "ready" && byKey.evidence?.status !== "missing" ? "ready" : "partial",
      summary: "Autonomous run packs can be built from the latest saved version and risk posture.",
      recommendation: "Start with smoke, then add pre-release and post-deploy verification packs.",
    },
    {
      key: "api",
      label: "API",
      status: byKey.api?.status || "missing",
      summary: byKey.api?.summary || "No API quality signal is attached yet.",
      recommendation: byKey.api?.status === "ready"
        ? "Keep contract coverage aligned with the UI flow."
        : "Add API or contract validation for backend-heavy paths.",
    },
    {
      key: "performance",
      label: "Performance",
      status: byKey.performance?.status || "missing",
      summary: byKey.performance?.summary || "No performance signal is attached yet.",
      recommendation: byKey.performance?.status === "ready"
        ? "Review budgets and trend the baseline over future saves."
        : "Turn captured page metrics into an explicit baseline.",
    },
    {
      key: "accessibility",
      label: "Accessibility",
      status: byKey.accessibility?.status || "missing",
      summary: byKey.accessibility?.summary || "No accessibility signal is attached yet.",
      recommendation: byKey.accessibility?.status === "ready"
        ? "Keep accessibility smoke checks in the standard regression story."
        : "Run accessibility sweeps for critical forms and journeys.",
    },
    {
      key: "security",
      label: "Security",
      status: byKey.security?.status || "missing",
      summary: byKey.security?.summary || "No security signal is attached yet.",
      recommendation: byKey.security?.status === "ready"
        ? "Keep session and permission checks near the release path."
        : "Add QA-level security smoke coverage before ship decisions.",
    },
    {
      key: "evidence",
      label: "Evidence",
      status: byKey.evidence?.status || "missing",
      summary: byKey.evidence?.summary || "No evidence pack is available yet.",
      recommendation: byKey.evidence?.status === "ready"
        ? "Use saved versions and notes as stakeholder-ready evidence."
        : "Save findings and notes alongside future versions.",
    },
    {
      key: "release",
      label: "Release",
      status: releaseGate.decision === "go" ? "ready" : releaseGate.decision === "caution" ? "partial" : "missing",
      summary: `${releaseGate.decision.toUpperCase()} with score ${releaseGate.score}/100.`,
      recommendation: releaseGate.recommendedNextSteps[0] || "Keep saved quality signals fresh before release decisions.",
    },
  ] as QualityModuleSummary[];
}

function buildAskQaAnswers(bundle: ProjectBundle, releaseGate: ReleaseGate, riskSignals: RiskSignal[], recommendedTests: string[]) {
  const latestVersion = bundle.latestVersion || bundle.versions[0] || null;
  return [
    {
      prompt: "What is risky in this release?",
      answer: riskSignals.length
        ? `${riskSignals[0].title}. ${riskSignals[0].summary}`
        : "The latest saved assets do not show a dominant release risk right now.",
    },
    {
      prompt: "What should I test next before shipping?",
      answer: recommendedTests.length
        ? `Start with ${recommendedTests.slice(0, 3).join(", ")}.`
        : "Run the saved smoke pack first, then expand into regression if anything looks unstable.",
    },
    {
      prompt: "What broke compared to the last run?",
      answer: latestVersion
        ? `The latest meaningful change was "${latestVersion.summary}". Use the change-impact areas and risk signals to target retesting.`
        : "There is no historical run baseline yet, so compare against a second saved version first.",
    },
  ];
}

export function deriveProjectQuality(bundle: ProjectBundle): ProjectQualitySnapshot {
  const pageType = inferPageType(bundle);
  const coverageAreas = buildCoverageAreas(bundle, pageType);
  const riskSignals = buildRiskSignals(bundle, coverageAreas, pageType);
  const findings = buildFindings(riskSignals);
  const releaseGate = buildReleaseGate(riskSignals, coverageAreas);
  const suggestedRuns = buildSuggestedRuns(bundle, pageType, coverageAreas);
  const maintenanceSuggestions = buildMaintenanceSuggestions(bundle, riskSignals);
  const exploratoryCharters = buildExploratoryCharters(bundle, pageType);
  const evidencePacks = buildEvidencePacks(bundle, pageType);
  const selfHealingSuggestions = buildSelfHealingSuggestions(bundle);
  const failureClusters = buildFailureClusters(riskSignals, pageType);
  const changeImpactAreas = buildChangeImpactAreas(bundle, pageType);
  const recommendedTests = buildRecommendedTests(pageType, coverageAreas);
  const modules = buildModuleSummaries(coverageAreas, releaseGate, riskSignals);
  const askQaAnswers = buildAskQaAnswers(bundle, releaseGate, riskSignals, recommendedTests);

  return {
    pageType,
    riskScore: releaseGate.score,
    riskSignals,
    findings,
    modules,
    coverageAreas,
    suggestedRuns,
    maintenanceSuggestions,
    exploratoryCharters,
    evidencePacks,
    selfHealingSuggestions,
    failureClusters,
    changeImpactAreas,
    recommendedTests,
    askQaAnswers,
    releaseGate,
  };
}

export function derivePortfolioQuality(bundles: ProjectBundle[]): PortfolioQualitySnapshot {
  const rows = bundles.map((bundle) => {
    const quality = deriveProjectQuality(bundle);
    return {
      projectId: bundle.meta.id,
      projectName: bundle.meta.name,
      decision: quality.releaseGate.decision,
      score: quality.releaseGate.score,
      blockers: quality.releaseGate.blockers.length,
      topRisk: quality.riskSignals[0]?.title || "No major risks detected",
      nextTests: quality.recommendedTests.slice(0, 3),
    } as ProjectReleaseRow;
  });

  const averageRiskScore = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length)
    : 0;
  const goCount = rows.filter((row) => row.decision === "go").length;
  const cautionCount = rows.filter((row) => row.decision === "caution").length;
  const noGoCount = rows.filter((row) => row.decision === "no-go").length;
  const totalBlockers = rows.reduce((sum, row) => sum + row.blockers, 0);
  const topRisks = [...rows].sort((left, right) => {
    if (left.decision === right.decision) return left.score - right.score;
    const rank = { "no-go": 0, caution: 1, go: 2 };
    return rank[left.decision] - rank[right.decision];
  }).slice(0, 5);

  return {
    averageRiskScore,
    goCount,
    cautionCount,
    noGoCount,
    totalBlockers,
    topRisks,
    stakeholderSummary: [
      rows.length
        ? `${rows.length} project${rows.length === 1 ? "" : "s"} are currently tracked in the Quality OS view.`
        : "No synced projects are available yet.",
      noGoCount
        ? `${noGoCount} project${noGoCount === 1 ? "" : "s"} are in NO-GO posture and need attention before release.`
        : "No projects are currently in a hard NO-GO posture.",
      totalBlockers
        ? `${totalBlockers} blocker${totalBlockers === 1 ? "" : "s"} are active across the current portfolio.`
        : "There are no blocker-level signals in the current portfolio snapshot.",
    ],
    askQaAnswers: [
      {
        prompt: "What is risky right now?",
        answer: topRisks[0]
          ? `${topRisks[0].projectName} is the riskiest project right now because of ${topRisks[0].topRisk.toLowerCase()}.`
          : "There is no risky project yet because no synced quality data is available.",
      },
      {
        prompt: "Where should I focus first?",
        answer: topRisks[0]
          ? `Start with ${topRisks[0].projectName} and run ${topRisks[0].nextTests.join(", ").toLowerCase()}.`
          : "Create or sync a project first, then the dashboard can prioritize the next best test pack.",
      },
      {
        prompt: "Can we ship safely?",
        answer: noGoCount
          ? "Not safely yet. At least one project is in NO-GO posture and should be addressed before release."
          : cautionCount
            ? "Ship with caution. Some projects still need targeted retesting or evidence updates."
            : "Current signals point to GO, but keep the saved evidence and smoke packs fresh.",
      },
    ],
  };
}

export function deriveMetaQuality(meta: ProjectMeta) {
  const baseScore = 100
    - (meta.syncState !== "synced" ? 18 : 0)
    - (meta.artifactCounts.testCases === 0 ? 22 : meta.artifactCounts.testCases < 3 ? 10 : 0)
    - (meta.artifactCounts.scriptFiles === 0 ? 14 : 0)
    - (meta.artifactCounts.cicdFiles === 0 ? 6 : 0);

  const score = Math.max(0, baseScore);
  const decision: ReleaseDecision = score < 55 ? "no-go" : score < 78 ? "caution" : "go";
  return { score, decision };
}

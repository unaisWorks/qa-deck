import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export type ProjectStatus = "draft" | "active" | "review" | "done" | "archived";
export type ProjectMode = "page" | "journey";
export type ProjectSyncState = "synced" | "unsynced" | "local";

export interface ArtifactCounts {
  scans: number;
  journeys: number;
  testCases: number;
  scriptFiles: number;
  cicdFiles: number;
  notes: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  mode: ProjectMode;
  status: ProjectStatus;
  tags: string[];
  sourceUrl: string;
  activeFramework: string;
  artifactCounts: ArtifactCounts;
  latestVersionId: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  syncState: ProjectSyncState;
  appId: string | null;
  appName: string | null;
  pageKey: string | null;
  pageLabel: string | null;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  createdAt: string;
  trigger: string;
  summary: string;
  hasScan: boolean;
  hasJourney: boolean;
  hasTestCases: boolean;
  hasScripts: boolean;
  hasCicd: boolean;
  hasRun: boolean;
  testCaseCount?: number;
  scriptFileCount?: number;
  cicdFileCount?: number;
}

export interface SavedRunResult {
  id: string;
  savedAt: string;
  framework: string;
  headless: boolean;
  status: "passed" | "failed";
  summary: string;
  terminalOutput: string;
  results: { name: string; status: string; duration?: string | null }[];
}

export interface WebsiteTestCase {
  id: string;
  title: string;
  suite: WebsiteTestCaseSuite;
  caseKind: WebsiteTestCaseKind;
  packs: WebsiteTestCasePack[];
  category: string;
  priority: string;
  preconditions: string;
  steps: string[];
  expectedResult: string;
  tags: string[];
  approved: boolean;
  source: WebsiteTestCaseSource;
  scope: WebsiteTestCaseScope;
  pageKey: string | null;
  pageLabel: string | null;
  flowKey: string | null;
  flowLabel: string | null;
  sortOrder: number;
  stepId: string | null;
  stepOrder: number | null;
  groupLabel: string | null;
  locators: Record<string, unknown>;
  testData: Record<string, unknown>;
}

export interface ProjectGroupRecord {
  id: string;
  name: string;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type AppWorkspace = ProjectGroupRecord;

export interface ProjectPageSummary {
  id: string;
  name: string;
  sourceUrl: string;
  pageKey: string | null;
  pageLabel: string | null;
  mode: ProjectMode;
  status: ProjectStatus;
  updatedAt: string;
  testCaseCount: number;
  scriptFileCount: number;
}

export interface AppProjectGroup {
  id: string;
  name: string;
  baseUrl: string;
  status: ProjectStatus;
  syncState: ProjectSyncState;
  updatedAt: string;
  tags: string[];
  totalCases: number;
  totalFiles: number;
  pageCount: number;
  primaryProjectId: string;
  pages: ProjectPageSummary[];
}

async function removeProjectFromWorkspace(
  userId: string,
  projectId: string,
  appId: string | null
): Promise<void> {
  if (!appId) return;

  const database = requireDb();
  const workspaceRef = doc(database, "users", userId, "appWorkspaces", appId);
  const workspaceSnap = await getDoc(workspaceRef);
  if (!workspaceSnap.exists()) return;

  const projectIds = Array.isArray(workspaceSnap.data().projectIds)
    ? workspaceSnap.data().projectIds.map((id: unknown) => String(id))
    : [];
  const remaining = projectIds.filter((id: string) => id !== projectId);

  if (!remaining.length) {
    await deleteDoc(workspaceRef);
    return;
  }

  await updateDoc(workspaceRef, {
    projectIds: remaining,
    updatedAt: new Date().toISOString(),
  });
}

export interface ProjectActivity {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  versionId: string;
  actor: string;
}

export interface ProjectScriptFile {
  id: string;
  filename: string;
  content: string;
  key?: string | null;
  group?: string | null;
  stepId?: string | null;
  sortOrder?: number;
}

export interface ProjectArtifacts {
  scan: Record<string, unknown> | null;
  journey: Record<string, unknown> | null;
  testcases: unknown[];
  cicd: Record<string, { filename: string; content: string }> | null;
  notes: Record<string, unknown> | null;
  scriptFiles: ProjectScriptFile[];
  run: SavedRunResult | null;
}

export interface SaveVersionOptions {
  /** Artifact values to write / overwrite in the new version */
  artifactOverrides: {
    scan?: Record<string, unknown> | null;
    journey?: Record<string, unknown> | null;
    testcases?: unknown[];
    cicd?: Record<string, { filename: string; content: string }> | null;
    notes?: Record<string, unknown> | null;
    scriptFiles?: ProjectScriptFile[];
    run?: SavedRunResult | null;
    /** Updates meta.activeFramework when provided */
    activeFramework?: string;
  };
  /** Artifact keys that should be cleared (set to null/[]) in the new version */
  invalidate?: ("scan" | "journey" | "testcases" | "cicd" | "notes" | "scriptFiles" | "run")[];
  trigger: string;
  summary?: string;
}

export interface ProjectBundle {
  meta: ProjectMeta;
  latestVersion: ProjectVersion | null;
  versions: ProjectVersion[];
  activities: ProjectActivity[];
  artifacts: ProjectArtifacts;
}

export type WebsiteTestCaseSuite = "page" | "smoke" | "regression" | "e2e";
export type WebsiteTestCaseKind = "page" | "flow" | "step";
export type WebsiteTestCasePack = "smoke" | "regression" | "e2e";
export type WebsiteTestCaseScope = "page" | "journey" | "step";
export type WebsiteTestCaseSource = "page" | "recording" | "hybrid";

export const TESTCASE_SUITE_ORDER: readonly WebsiteTestCaseSuite[] = ["page", "smoke", "regression", "e2e"];
export const TESTCASE_SUITE_LABELS: Record<WebsiteTestCaseSuite, string> = {
  page: "Page",
  smoke: "Smoke",
  regression: "Regression",
  e2e: "E2E",
};
export const TESTCASE_PACK_ORDER: readonly WebsiteTestCasePack[] = ["smoke", "regression", "e2e"];
export const TESTCASE_PACK_LABELS: Record<WebsiteTestCasePack, string> = {
  smoke: "Smoke",
  regression: "Regression",
  e2e: "E2E",
};
export const TESTCASE_KIND_LABELS: Record<WebsiteTestCaseKind, string> = {
  page: "Test case",
  flow: "Flow case",
  step: "Step case",
};

const EMPTY_COUNTS: ArtifactCounts = {
  scans: 0,
  journeys: 0,
  testCases: 0,
  scriptFiles: 0,
  cicdFiles: 0,
  notes: 0,
};

function requireDb() {
  if (!db) throw new Error("Firebase not configured. Add your keys to .env.local");
  return db;
}

export function subscribeProjects(
  userId: string,
  onChange: (projects: ProjectMeta[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const database = requireDb();
  const projectsQuery = query(
    collection(database, "users", userId, "projects"),
    orderBy("updatedAt", "desc")
  );

  return onSnapshot(
    projectsQuery,
    (snapshot) => {
      onChange(snapshot.docs.map((docSnap) => normalizeProjectMeta({
        id: docSnap.id,
        ...docSnap.data(),
      })));
    },
    (error) => onError?.(error)
  );
}

export async function getProjectBundle(userId: string, projectId: string): Promise<ProjectBundle> {
  const database = requireDb();
  const metaRef = doc(database, "users", userId, "projects", projectId);
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) throw new Error("Project not found");

  const meta = normalizeProjectMeta({ id: metaSnap.id, ...metaSnap.data() });
  const versions = await getVersionList(userId, projectId);
  const activities = await getActivityList(userId, projectId);
  const latestVersion = versions.find((version) => version.id === meta.latestVersionId) || versions[0] || null;
  const artifacts = latestVersion
    ? await getArtifactsForVersion(userId, projectId, latestVersion.id)
    : createEmptyArtifacts();

  return { meta, latestVersion, versions, activities, artifacts };
}

export async function getProjectBundles(userId: string, projectIds?: string[]): Promise<ProjectBundle[]> {
  const database = requireDb();
  let projectList: ProjectMeta[] = [];

  if (projectIds?.length) {
    const metaSnapshots = await Promise.all(
      projectIds.map((projectId) => getDoc(doc(database, "users", userId, "projects", projectId)))
    );

    projectList = metaSnapshots
      .filter((snapshot) => snapshot.exists())
      .map((snapshot) => normalizeProjectMeta({ id: snapshot.id, ...snapshot.data() }));
  } else {
    const projectsQuery = query(
      collection(database, "users", userId, "projects"),
      orderBy("updatedAt", "desc")
    );
    const projectSnapshots = await getDocs(projectsQuery);
    projectList = projectSnapshots.docs.map((snapshot) =>
      normalizeProjectMeta({ id: snapshot.id, ...snapshot.data() })
    );
  }

  const bundles = await Promise.all(projectList.map((project) => getProjectBundle(userId, project.id)));
  return bundles.sort(
    (left, right) => new Date(right.meta.updatedAt).getTime() - new Date(left.meta.updatedAt).getTime()
  );
}

export async function updateProjectMetaFields(
  userId: string,
  projectId: string,
  updates: Partial<Pick<ProjectMeta, "name" | "status" | "tags" | "appName" | "pageLabel">>
) {
  const database = requireDb();
  const ref = doc(database, "users", userId, "projects", projectId);
  const metaSnap = await getDoc(ref);
  if (!metaSnap.exists()) throw new Error("Project not found");

  const current = normalizeProjectMeta({ id: metaSnap.id, ...metaSnap.data() });
  const nextAppName = updates.appName !== undefined ? sanitizeOptionalLabel(updates.appName) : current.appName;
  const nextPageLabel = updates.pageLabel !== undefined ? sanitizeOptionalLabel(updates.pageLabel) : current.pageLabel;
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    updatedAt: now,
  };

  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.tags !== undefined) payload.tags = updates.tags;

  if (updates.pageLabel !== undefined) {
    payload.pageLabel = nextPageLabel;
    payload.pageKey = nextPageLabel ? slugifyProjectKey(nextPageLabel) : null;
  }

  if (updates.appName !== undefined) {
    const previousAppId = current.appId;
    const nextAppId = nextAppName ? slugifyProjectKey(nextAppName) : null;

    if (previousAppId && previousAppId !== nextAppId) {
      await updateDoc(doc(database, "users", userId, "appWorkspaces", previousAppId), {
        projectIds: arrayRemove(projectId),
        updatedAt: now,
      }).catch(() => {});
    }

    if (nextAppId && nextAppName) {
      const workspaceRef = doc(database, "users", userId, "appWorkspaces", nextAppId);
      const workspaceSnap = await getDoc(workspaceRef);
      await setDoc(
        workspaceRef,
        {
          name: nextAppName,
          projectIds: workspaceSnap.exists() ? arrayUnion(projectId) : [projectId],
          createdAt: workspaceSnap.exists() ? workspaceSnap.data().createdAt || now : now,
          updatedAt: now,
        },
        { merge: true }
      );
      payload.appId = nextAppId;
      payload.appName = nextAppName;
    } else {
      payload.appId = null;
      payload.appName = null;
    }
  }

  await updateDoc(ref, payload);
}

export function subscribeProjectGroups(
  userId: string,
  onChange: (groups: ProjectGroupRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const database = requireDb();
  const groupsQuery = query(
    collection(database, "users", userId, "appWorkspaces"),
    orderBy("updatedAt", "desc")
  );

  return onSnapshot(
    groupsQuery,
    (snapshot) => {
      onChange(snapshot.docs.map((docSnap) => normalizeProjectGroupRecord({ id: docSnap.id, ...docSnap.data() })));
    },
    (error) => onError?.(error)
  );
}

export const subscribeAppWorkspaces = subscribeProjectGroups;

export function getProjectAppGroupKey(project: Pick<ProjectMeta, "appId" | "appName" | "sourceUrl" | "name">) {
  if (project.appId) return project.appId;
  if (project.appName) return slugifyProjectKey(project.appName);

  const url = String(project.sourceUrl || "").trim();
  if (url) {
    try {
      const parsed = new URL(url);
      return slugifyProjectKey(parsed.hostname);
    } catch {
      // fall through to project name
    }
  }

  return slugifyProjectKey(project.name || "project");
}

export function getProjectAppDisplayName(project: Pick<ProjectMeta, "appName" | "sourceUrl" | "name">) {
  if (project.appName) return project.appName;

  const url = String(project.sourceUrl || "").trim();
  if (url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "");
      const base = host.split(".")[0] || host;
      return base.charAt(0).toUpperCase() + base.slice(1);
    } catch {
      // fall through to project name
    }
  }

  return project.name || "Untitled App";
}

export function groupProjectsByApp(projects: ProjectMeta[]): AppProjectGroup[] {
  const groups = new Map<string, AppProjectGroup>();

  projects.forEach((project) => {
    const groupKey = getProjectAppGroupKey(project);
    const pageLabel = project.pageLabel || buildProjectPageContext(project).pageLabel || project.name;
    const pageSummary: ProjectPageSummary = {
      id: project.id,
      name: project.name,
      sourceUrl: project.sourceUrl,
      pageKey: project.pageKey,
      pageLabel,
      mode: project.mode,
      status: project.status,
      updatedAt: project.updatedAt,
      testCaseCount: project.artifactCounts.testCases,
      scriptFileCount: project.artifactCounts.scriptFiles,
    };

    const current = groups.get(groupKey);
    if (!current) {
      groups.set(groupKey, {
        id: groupKey,
        name: getProjectAppDisplayName(project),
        baseUrl: project.sourceUrl,
        status: project.status,
        syncState: project.syncState,
        updatedAt: project.updatedAt,
        tags: [...project.tags],
        totalCases: project.artifactCounts.testCases,
        totalFiles: project.artifactCounts.scriptFiles,
        pageCount: 1,
        primaryProjectId: project.id,
        pages: [pageSummary],
      });
      return;
    }

    current.pages.push(pageSummary);
    current.pageCount += 1;
    current.totalCases += project.artifactCounts.testCases;
    current.totalFiles += project.artifactCounts.scriptFiles;
    current.tags = Array.from(new Set([...current.tags, ...project.tags]));

    if (new Date(project.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
      current.updatedAt = project.updatedAt;
      current.status = project.status;
      current.syncState = project.syncState;
      current.baseUrl = project.sourceUrl || current.baseUrl;
      current.primaryProjectId = project.id;
    }
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      pages: group.pages.sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
    }))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export async function updateScriptFileContent(
  userId: string,
  projectId: string,
  versionId: string,
  fileId: string,
  content: string
) {
  const database = requireDb();
  const ref = doc(
    database,
    "users", userId,
    "projects", projectId,
    "versions", versionId,
    "scriptFiles", fileId
  );
  await updateDoc(ref, { content });
}

async function getVersionList(userId: string, projectId: string): Promise<ProjectVersion[]> {
  const database = requireDb();
  const versionsQuery = query(
    collection(database, "users", userId, "projects", projectId, "versions"),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(versionsQuery);
  return snapshot.docs.map((docSnap) => normalizeProjectVersion({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

async function getActivityList(userId: string, projectId: string): Promise<ProjectActivity[]> {
  const database = requireDb();
  const activitiesQuery = query(
    collection(database, "users", userId, "projects", projectId, "activities"),
    orderBy("timestamp", "desc")
  );
  const snapshot = await getDocs(activitiesQuery);
  return snapshot.docs.map((docSnap) => normalizeProjectActivity({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

async function getArtifactsForVersion(userId: string, projectId: string, versionId: string): Promise<ProjectArtifacts> {
  const database = requireDb();
  const artifactsSnap = await getDocs(collection(database, "users", userId, "projects", projectId, "versions", versionId, "artifacts"));
  const scriptsQuery = query(
    collection(database, "users", userId, "projects", projectId, "versions", versionId, "scriptFiles"),
    orderBy("sortOrder", "asc")
  );
  const scriptsSnap = await getDocs(scriptsQuery);

  const artifacts = createEmptyArtifacts();
  artifactsSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const parsed = parsePayloadJson(data.payloadJson);
    if (docSnap.id === "scan") artifacts.scan = parsed;
    if (docSnap.id === "journey") artifacts.journey = parsed;
    if (docSnap.id === "testcases") artifacts.testcases = Array.isArray(parsed) ? parsed : [];
    if (docSnap.id === "cicd") artifacts.cicd = parsed as ProjectArtifacts["cicd"];
    if (docSnap.id === "notes") artifacts.notes = parsed;
    if (docSnap.id === "run") artifacts.run = parsed as ProjectArtifacts["run"];
  });

  artifacts.scriptFiles = scriptsSnap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      filename: String(data.filename || docSnap.id),
      content: String(data.content || ""),
      key: data.key ? String(data.key) : null,
      group: data.group ? String(data.group) : null,
      stepId: data.stepId ? String(data.stepId) : null,
      sortOrder: Number(data.sortOrder || 0),
    };
  });

  return artifacts;
}

function normalizeProjectMeta(input: Record<string, unknown>): ProjectMeta {
  return {
    id: String(input.id || ""),
    name: String(input.name || "Untitled Project"),
    mode: input.mode === "journey" ? "journey" : "page",
    status: normalizeStatus(input.status),
    tags: Array.isArray(input.tags) ? input.tags.map((tag) => String(tag)) : [],
    sourceUrl: String(input.sourceUrl || ""),
    activeFramework: String(input.activeFramework || "selenium-python"),
    artifactCounts: normalizeArtifactCounts(input.artifactCounts),
    latestVersionId: String(input.latestVersionId || ""),
    createdAt: String(input.createdAt || ""),
    updatedAt: String(input.updatedAt || ""),
    lastOpenedAt: input.lastOpenedAt ? String(input.lastOpenedAt) : null,
    syncState: normalizeSyncState(input.syncState),
    appId: input.appId ? String(input.appId) : null,
    appName: input.appName ? String(input.appName) : null,
    pageKey: input.pageKey ? String(input.pageKey) : null,
    pageLabel: input.pageLabel ? String(input.pageLabel) : null,
  };
}

function normalizeProjectGroupRecord(input: Record<string, unknown>): ProjectGroupRecord {
  return {
    id: String(input.id || ""),
    name: String(input.name || "Untitled project"),
    projectIds: Array.isArray(input.projectIds) ? input.projectIds.map((id) => String(id)) : [],
    createdAt: String(input.createdAt || ""),
    updatedAt: String(input.updatedAt || ""),
  };
}

function normalizeProjectVersion(input: Record<string, unknown>): ProjectVersion {
  return {
    id: String(input.id || ""),
    projectId: String(input.projectId || ""),
    createdAt: String(input.createdAt || ""),
    trigger: String(input.trigger || "manual_save"),
    summary: String(input.summary || ""),
    hasScan: Boolean(input.hasScan),
    hasJourney: Boolean(input.hasJourney),
    hasTestCases: Boolean(input.hasTestCases),
    hasScripts: Boolean(input.hasScripts),
    hasCicd: Boolean(input.hasCicd),
    hasRun: Boolean(input.hasRun),
    testCaseCount: Number(input.testCaseCount || 0),
    scriptFileCount: Number(input.scriptFileCount || 0),
    cicdFileCount: Number(input.cicdFileCount || 0),
  };
}

function normalizeProjectActivity(input: Record<string, unknown>): ProjectActivity {
  return {
    id: String(input.id || ""),
    timestamp: String(input.timestamp || ""),
    type: String(input.type || "manual_save"),
    message: String(input.message || "Project updated"),
    versionId: String(input.versionId || ""),
    actor: String(input.actor || "extension"),
  };
}

function normalizeArtifactCounts(input: unknown): ArtifactCounts {
  if (!input || typeof input !== "object") return EMPTY_COUNTS;
  const counts = input as Record<string, unknown>;
  return {
    scans: Number(counts.scans || 0),
    journeys: Number(counts.journeys || 0),
    testCases: Number(counts.testCases || 0),
    scriptFiles: Number(counts.scriptFiles || 0),
    cicdFiles: Number(counts.cicdFiles || 0),
    notes: Number(counts.notes || 0),
  };
}

function normalizeStatus(value: unknown): ProjectStatus {
  return ["draft", "active", "review", "done", "archived"].includes(String(value))
    ? (value as ProjectStatus)
    : "draft";
}

function normalizeSyncState(value: unknown): ProjectSyncState {
  return ["synced", "unsynced", "local"].includes(String(value))
    ? (value as ProjectSyncState)
    : "synced";
}

function parsePayloadJson(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function createEmptyArtifacts(): ProjectArtifacts {
  return {
    scan: null,
    journey: null,
    testcases: [],
    cicd: null,
    notes: null,
    scriptFiles: [],
    run: null,
  };
}

// ─── Testcase normalization ───────────────────────────────────────────────────

/** Normalise a raw testcase from any saved version into the canonical WebsiteTestCase shape */
export function normalizeWebsiteTestCase(raw: Record<string, unknown>, index: number): WebsiteTestCase {
  return normalizeWebsiteTestCaseWithContext(raw, index);
}

export function normalizeWebsiteTestCaseWithContext(
  raw: Record<string, unknown>,
  index: number,
  meta?: Pick<ProjectMeta, "mode" | "name" | "sourceUrl" | "pageKey" | "pageLabel">
): WebsiteTestCase {
  const steps: string[] = Array.isArray(raw.steps)
    ? (raw.steps as unknown[]).map((s) => String(s))
    : typeof raw.steps === "string"
    ? (raw.steps as string).split("\n").map((s) => s.trim()).filter(Boolean)
    : [];

  const id =
    typeof raw.id === "string" && raw.id
      ? raw.id
      : `TC-${String(index + 1).padStart(3, "0")}`;

  const expectedResult =
    typeof raw.expectedResult === "string"
      ? raw.expectedResult
      : typeof raw.expected === "string"
      ? raw.expected
      : "";

  const legacySuite = normalizeWebsiteSuite(raw.suite, inferSuiteFromLegacyFields(raw, meta));
  const caseKind = normalizeWebsiteCaseKind(raw.caseKind, inferCaseKindFromLegacyFields(raw, meta, legacySuite));
  const packs = normalizeWebsitePacks(raw.packs, inferPacksFromLegacyFields(legacySuite));
  const suite = deriveLegacySuite(caseKind, packs);
  const scope = normalizeWebsiteScope(raw.scope, caseKind === "flow" ? "journey" : caseKind === "step" ? "step" : "page");
  const fallbackPage = buildProjectPageContext(meta);
  const pageLabel =
    raw.pageLabel ? String(raw.pageLabel) :
    raw.groupLabel && caseKind !== "flow" ? String(raw.groupLabel) :
    scope !== "journey" ? fallbackPage.pageLabel : null;
  const flowLabel =
    raw.flowLabel ? String(raw.flowLabel) :
    caseKind === "flow" || scope === "journey" ? String(raw.groupLabel || meta?.name || "Primary flow") : null;
  const pageKey =
    raw.pageKey ? String(raw.pageKey) :
    pageLabel ? slugifyProjectKey(pageLabel) : fallbackPage.pageKey;
  const flowKey =
    raw.flowKey ? String(raw.flowKey) :
    flowLabel ? slugifyProjectKey(flowLabel) : null;
  const sortOrder =
    typeof raw.sortOrder === "number"
      ? raw.sortOrder
      : Number(raw.sortOrder ?? index);
  const source = normalizeWebsiteSource(raw.source, "page");

  return {
    id,
    title: String(raw.title || "Untitled test case"),
    suite,
    caseKind,
    packs,
    category: String(raw.category || "functional"),
    priority: String(raw.priority || "medium"),
    preconditions: String(raw.preconditions || ""),
    steps,
    expectedResult,
    tags: Array.isArray(raw.tags) ? (raw.tags as unknown[]).map((t) => String(t)) : [],
    approved: raw.approved !== false,
    source,
    scope,
    pageKey,
    pageLabel,
    flowKey,
    flowLabel,
    sortOrder,
    stepId: raw.stepId ? String(raw.stepId) : null,
    stepOrder: raw.stepOrder !== undefined && raw.stepOrder !== null ? Number(raw.stepOrder) : null,
    groupLabel: raw.groupLabel ? String(raw.groupLabel) : pageLabel || flowLabel || null,
    locators: raw.locators && typeof raw.locators === "object" ? (raw.locators as Record<string, unknown>) : {},
    testData: raw.testData && typeof raw.testData === "object" ? (raw.testData as Record<string, unknown>) : {},
  };
}

/** Format a single WebsiteTestCase as readable plain-text markdown for clipboard copy */
export function formatTestCaseAsMarkdown(tc: WebsiteTestCase): string {
  const lines: string[] = [];
  lines.push(`## ${tc.id} — ${tc.title}`);
  lines.push(`**Case type:** ${TESTCASE_KIND_LABELS[tc.caseKind]}  |  **Category:** ${tc.category}  |  **Priority:** ${tc.priority}`);
  lines.push(`**Packs:** ${tc.packs.length ? tc.packs.map((pack) => TESTCASE_PACK_LABELS[pack]).join(", ") : "Base library only"}`);
  if (tc.pageLabel) lines.push(`**Page:** ${tc.pageLabel}`);
  if (tc.flowLabel) lines.push(`**Flow:** ${tc.flowLabel}`);
  if (tc.preconditions) lines.push(`\n**Preconditions:** ${tc.preconditions}`);
  lines.push("\n**Steps:**");
  tc.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  if (tc.expectedResult) lines.push(`\n**Expected result:** ${tc.expectedResult}`);
  if (tc.tags.length) lines.push(`\n**Tags:** ${tc.tags.join(", ")}`);
  return lines.join("\n");
}

// ─── Version save helper ──────────────────────────────────────────────────────

const TRIGGER_SUMMARIES: Record<string, string> = {
  testcase_added: "Test case added from website",
  testcase_deleted: "Test case deleted from website",
  testcase_edited: "Test case updated from website",
  packs_updated: "Pack memberships updated from website",
  testcase_reordered: "Test cases reordered from website",
  testcase_approval_updated: "Test case approval updated from website",
  script_regenerated: "Script regenerated from website",
  project_rescanned: "App re-scanned from website",
  run_saved: "Test run result saved",
};

function sanitizeOptionalLabel(value: unknown) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

function slugifyProjectKey(value: string) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

function buildProjectPageContext(meta?: Pick<ProjectMeta, "mode" | "name" | "sourceUrl" | "pageKey" | "pageLabel">) {
  if (!meta) return { pageKey: null as string | null, pageLabel: null as string | null };
  const explicitLabel = meta.pageLabel ? String(meta.pageLabel) : "";
  const explicitKey = meta.pageKey ? String(meta.pageKey) : "";
  if (explicitLabel || explicitKey) {
    return {
      pageKey: explicitKey || (explicitLabel ? slugifyProjectKey(explicitLabel) : null),
      pageLabel: explicitLabel || meta.name || null,
    };
  }

  const url = String(meta.sourceUrl || "");
  if (!url) {
    return {
      pageKey: meta.mode === "journey" ? "journey-overview" : slugifyProjectKey(meta.name || "page"),
      pageLabel: meta.mode === "journey" ? meta.name || "Journey overview" : meta.name || "Current page",
    };
  }

  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    const label = path === "/"
      ? meta.name || parsed.hostname
      : path
          .split("/")
          .filter(Boolean)
          .map((part) => part.replace(/[-_]/g, " "))
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" / ");

    return {
      pageKey: slugifyProjectKey(path === "/" ? parsed.hostname : path),
      pageLabel: label,
    };
  } catch {
    return {
      pageKey: slugifyProjectKey(meta.name || "page"),
      pageLabel: meta.name || "Current page",
    };
  }
}

function inferSuiteFromLegacyFields(
  raw: Record<string, unknown>,
  meta?: Pick<ProjectMeta, "mode">
): WebsiteTestCaseSuite {
  const tags = Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag).toLowerCase()) : [];
  const category = String(raw.category || "").toLowerCase();
  if (tags.includes("smoke") || category === "smoke") return "smoke";
  if (tags.includes("regression") || category === "regression") return "regression";
  if (category === "e2e" || tags.includes("e2e") || tags.includes("flow")) return "e2e";
  return meta?.mode === "journey" ? "e2e" : "page";
}

function inferCaseKindFromLegacyFields(
  raw: Record<string, unknown>,
  meta: Pick<ProjectMeta, "mode"> | undefined,
  suite: WebsiteTestCaseSuite
): WebsiteTestCaseKind {
  if (String(raw.scope || "").toLowerCase() === "step" || raw.stepId) return "step";
  if (suite === "e2e" || String(raw.scope || "").toLowerCase() === "journey") return "flow";
  if (meta?.mode === "journey" && String(raw.scope || "").toLowerCase() === "page") return "page";
  return "page";
}

function inferPacksFromLegacyFields(suite: WebsiteTestCaseSuite): WebsiteTestCasePack[] {
  if (suite === "page") return [];
  return [suite];
}

function deriveLegacySuite(caseKind: WebsiteTestCaseKind, packs: WebsiteTestCasePack[]): WebsiteTestCaseSuite {
  if (packs.includes("smoke")) return "smoke";
  if (packs.includes("regression")) return "regression";
  if (packs.includes("e2e") || caseKind === "flow") return "e2e";
  return "page";
}

function normalizeWebsiteSuite(value: unknown, fallback: WebsiteTestCaseSuite): WebsiteTestCaseSuite {
  const suite = String(value || "").toLowerCase();
  return TESTCASE_SUITE_ORDER.includes(suite as WebsiteTestCaseSuite)
    ? (suite as WebsiteTestCaseSuite)
    : fallback;
}

function normalizeWebsiteCaseKind(value: unknown, fallback: WebsiteTestCaseKind): WebsiteTestCaseKind {
  const caseKind = String(value || "").toLowerCase();
  return ["page", "flow", "step"].includes(caseKind)
    ? (caseKind as WebsiteTestCaseKind)
    : fallback;
}

function normalizeWebsitePacks(value: unknown, fallback: WebsiteTestCasePack[]): WebsiteTestCasePack[] {
  if (!Array.isArray(value)) return fallback;
  const normalized = value
    .map((entry) => String(entry || "").toLowerCase())
    .filter((entry): entry is WebsiteTestCasePack => TESTCASE_PACK_ORDER.includes(entry as WebsiteTestCasePack));
  return Array.from(new Set(normalized));
}

function normalizeWebsiteScope(value: unknown, fallback: WebsiteTestCaseScope): WebsiteTestCaseScope {
  const scope = String(value || "").toLowerCase();
  return ["page", "journey", "step"].includes(scope) ? (scope as WebsiteTestCaseScope) : fallback;
}

function normalizeWebsiteSource(value: unknown, fallback: WebsiteTestCaseSource): WebsiteTestCaseSource {
  const source = String(value || "").toLowerCase();
  return ["page", "recording", "hybrid"].includes(source) ? (source as WebsiteTestCaseSource) : fallback;
}

/**
 * Creates a new project version in Firestore, carrying forward unchanged artifacts
 * and applying overrides / invalidations as specified in opts.
 * Returns the new versionId.
 */
export async function saveNewProjectVersion(
  userId: string,
  projectId: string,
  opts: SaveVersionOptions
): Promise<string> {
  const database = requireDb();
  const now = new Date().toISOString();

  // 1. Load current bundle to get existing artifacts from latest version
  const metaRef = doc(database, "users", userId, "projects", projectId);
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) throw new Error("Project not found");
  const meta = normalizeProjectMeta({ id: metaSnap.id, ...metaSnap.data() });

  // Load current latest artifacts to carry forward unchanged ones
  let currentArtifacts = createEmptyArtifacts();
  if (meta.latestVersionId) {
    try {
      currentArtifacts = await getArtifactsForVersion(userId, projectId, meta.latestVersionId);
    } catch {
      // previous version missing — start fresh
    }
  }

  // 2. Compute resolved artifacts (current → invalidated → overridden)
  const invalidate = new Set(opts.invalidate ?? []);

  const resolved: ProjectArtifacts = {
    scan: invalidate.has("scan") ? null : (opts.artifactOverrides.scan !== undefined ? opts.artifactOverrides.scan ?? null : currentArtifacts.scan),
    journey: invalidate.has("journey") ? null : (opts.artifactOverrides.journey !== undefined ? opts.artifactOverrides.journey ?? null : currentArtifacts.journey),
    testcases: invalidate.has("testcases") ? [] : (opts.artifactOverrides.testcases !== undefined ? opts.artifactOverrides.testcases : currentArtifacts.testcases),
    cicd: invalidate.has("cicd") ? null : (opts.artifactOverrides.cicd !== undefined ? opts.artifactOverrides.cicd ?? null : currentArtifacts.cicd),
    notes: invalidate.has("notes") ? null : (opts.artifactOverrides.notes !== undefined ? opts.artifactOverrides.notes ?? null : currentArtifacts.notes),
    scriptFiles: invalidate.has("scriptFiles") ? [] : (opts.artifactOverrides.scriptFiles !== undefined ? opts.artifactOverrides.scriptFiles : currentArtifacts.scriptFiles),
    run: invalidate.has("run") ? null : (opts.artifactOverrides.run !== undefined ? opts.artifactOverrides.run ?? null : currentArtifacts.run),
  };

  // 3. Write new version doc
  const versionsCol = collection(database, "users", userId, "projects", projectId, "versions");
  const versionRef = doc(versionsCol);
  const versionId = versionRef.id;
  const versionSummary = opts.summary ?? TRIGGER_SUMMARIES[opts.trigger] ?? "Project updated from website";

  await setDoc(versionRef, {
    projectId,
    createdAt: now,
    trigger: opts.trigger,
    summary: versionSummary,
    hasScan: resolved.scan !== null,
    hasJourney: resolved.journey !== null,
    hasTestCases: resolved.testcases.length > 0,
    hasScripts: resolved.scriptFiles.length > 0,
    hasCicd: resolved.cicd !== null && Object.keys(resolved.cicd).length > 0,
    hasRun: resolved.run !== null,
    testCaseCount: resolved.testcases.length,
    scriptFileCount: resolved.scriptFiles.length,
    cicdFileCount: resolved.cicd ? Object.keys(resolved.cicd).length : 0,
  });

  // 4. Write artifact docs (only those that changed or are new)
  const artifactsCol = collection(database, "users", userId, "projects", projectId, "versions", versionId, "artifacts");

  const artifactWrites: Promise<unknown>[] = [];

  if (resolved.scan !== null || invalidate.has("scan") || opts.artifactOverrides.scan !== undefined) {
    artifactWrites.push(setDoc(doc(artifactsCol, "scan"), { payloadJson: resolved.scan ? JSON.stringify(resolved.scan) : "" }));
  } else if (currentArtifacts.scan) {
    artifactWrites.push(setDoc(doc(artifactsCol, "scan"), { payloadJson: JSON.stringify(currentArtifacts.scan) }));
  }

  if (resolved.journey !== null || invalidate.has("journey") || opts.artifactOverrides.journey !== undefined) {
    artifactWrites.push(setDoc(doc(artifactsCol, "journey"), { payloadJson: resolved.journey ? JSON.stringify(resolved.journey) : "" }));
  } else if (currentArtifacts.journey) {
    artifactWrites.push(setDoc(doc(artifactsCol, "journey"), { payloadJson: JSON.stringify(currentArtifacts.journey) }));
  }

  // Always write testcases to keep them consistent
  artifactWrites.push(setDoc(doc(artifactsCol, "testcases"), { payloadJson: JSON.stringify(resolved.testcases) }));

  if (resolved.cicd || currentArtifacts.cicd) {
    artifactWrites.push(setDoc(doc(artifactsCol, "cicd"), { payloadJson: resolved.cicd ? JSON.stringify(resolved.cicd) : "" }));
  }

  if (resolved.notes || currentArtifacts.notes) {
    artifactWrites.push(setDoc(doc(artifactsCol, "notes"), { payloadJson: resolved.notes ? JSON.stringify(resolved.notes) : "" }));
  }

  if (resolved.run) {
    artifactWrites.push(setDoc(doc(artifactsCol, "run"), { payloadJson: JSON.stringify(resolved.run) }));
  }

  await Promise.all(artifactWrites);

  // 5. Write scriptFiles as sub-collection docs
  const scriptFilesCol = collection(database, "users", userId, "projects", projectId, "versions", versionId, "scriptFiles");
  const scriptFileWrites = resolved.scriptFiles.map((file, index) =>
    setDoc(doc(scriptFilesCol, file.id || crypto.randomUUID()), {
      filename: file.filename,
      content: file.content,
      key: file.key ?? null,
      group: file.group ?? null,
      stepId: file.stepId ?? null,
      sortOrder: file.sortOrder ?? index,
    })
  );
  await Promise.all(scriptFileWrites);

  // 6. Write activity entry
  const activitiesCol = collection(database, "users", userId, "projects", projectId, "activities");
  await addDoc(activitiesCol, {
    timestamp: now,
    type: opts.trigger,
    message: versionSummary,
    versionId,
    actor: "website",
  });

  // 7. Update project meta
  const metaUpdate: Record<string, unknown> = {
    latestVersionId: versionId,
    updatedAt: now,
    "artifactCounts.testCases": resolved.testcases.length,
    "artifactCounts.scriptFiles": resolved.scriptFiles.length,
    "artifactCounts.cicdFiles": resolved.cicd ? Object.keys(resolved.cicd).length : 0,
    "artifactCounts.scans": resolved.scan ? 1 : 0,
    "artifactCounts.journeys": resolved.journey ? 1 : 0,
  };
  if (opts.artifactOverrides.activeFramework) {
    metaUpdate.activeFramework = opts.artifactOverrides.activeFramework;
  }
  await updateDoc(metaRef, metaUpdate);

  return versionId;
}

// ─── Delete project ───────────────────────────────────────────────────────────

/**
 * Permanently deletes a project and all its subcollections from Firestore.
 * Deletes: versions (+ nested artifacts, scriptFiles) → activities → project doc
 */
export async function deleteProject(userId: string, projectId: string): Promise<void> {
  const database = requireDb();
  const metaRef = doc(database, "users", userId, "projects", projectId);
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) return;
  const meta = normalizeProjectMeta({ id: metaSnap.id, ...metaSnap.data() });

  // Fetch versions and activities in parallel (2 round trips instead of sequential)
  const [versionsSnap, activitiesSnap] = await Promise.all([
    getDocs(collection(database, "users", userId, "projects", projectId, "versions")),
    getDocs(collection(database, "users", userId, "projects", projectId, "activities")),
  ]);

  // Delete all versions (+ their subcollections) and activities in parallel
  await Promise.all([
    // Delete each activity doc
    ...activitiesSnap.docs.map(d => deleteDoc(d.ref)),
    // For each version: fetch scriptFiles + artifacts in parallel, then delete everything
    ...versionsSnap.docs.map(async (versionDoc) => {
      const versionId = versionDoc.id;
      const [scriptFilesSnap, artifactsSnap] = await Promise.all([
        getDocs(collection(database, "users", userId, "projects", projectId, "versions", versionId, "scriptFiles")),
        getDocs(collection(database, "users", userId, "projects", projectId, "versions", versionId, "artifacts")),
      ]);
      await Promise.all([
        ...scriptFilesSnap.docs.map(d => deleteDoc(d.ref)),
        ...artifactsSnap.docs.map(d => deleteDoc(d.ref)),
        deleteDoc(versionDoc.ref),
      ]);
    }),
  ]);

  // Delete the project meta doc last
  await deleteDoc(metaRef);
  await removeProjectFromWorkspace(userId, projectId, meta.appId);
}

export async function deleteProjectGroup(userId: string, projectIds: string[]): Promise<void> {
  const ids = Array.from(new Set(projectIds.filter(Boolean)));
  await Promise.all(ids.map((projectId) => deleteProject(userId, projectId)));
}

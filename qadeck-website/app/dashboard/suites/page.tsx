"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardHeader from "@/components/DashboardHeader";
import { useDashboardSession } from "@/lib/use-dashboard-session";
import {
  getProjectBundles,
  normalizeWebsiteTestCaseWithContext,
  subscribeProjectGroups,
  subscribeProjects,
  TESTCASE_PACK_LABELS,
  TESTCASE_PACK_ORDER,
  type ProjectGroupRecord,
  type ProjectBundle,
  type ProjectMeta,
  type WebsiteTestCase,
} from "@/lib/project-store";

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function packTone(pack: keyof typeof TESTCASE_PACK_LABELS) {
  return {
    smoke: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    regression: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    e2e: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  }[pack];
}

type ProjectGroupSummary = {
  projectGroup: ProjectGroupRecord;
  bundles: ProjectBundle[];
  approvedCases: WebsiteTestCase[];
  pageCaseCount: number;
  packCounts: Record<(typeof TESTCASE_PACK_ORDER)[number], number>;
  pageCoverage: { key: string; label: string; count: number }[];
  flowCoverage: { key: string; label: string; count: number }[];
  missingPages: string[];
};

function buildProjectGroupSummary(projectGroup: ProjectGroupRecord, bundles: ProjectBundle[]): ProjectGroupSummary {
  const approvedCases = bundles.flatMap((bundle) => {
    const rawCases = Array.isArray(bundle.artifacts.testcases) ? (bundle.artifacts.testcases as Record<string, unknown>[]) : [];
    return rawCases
      .map((raw, index) => normalizeWebsiteTestCaseWithContext(raw, index, bundle.meta))
      .filter((testCase) => testCase.approved);
  });

  const pageCaseCount = approvedCases.filter((testCase) => testCase.caseKind !== "flow").length;
  const packCounts = TESTCASE_PACK_ORDER.reduce(
    (counts, pack) => {
      counts[pack] = approvedCases.filter((testCase) => testCase.packs.includes(pack)).length;
      return counts;
    },
    {
      smoke: 0,
      regression: 0,
      e2e: 0,
    } as Record<(typeof TESTCASE_PACK_ORDER)[number], number>
  );

  const pageMap = new Map<string, { key: string; label: string; count: number }>();
  approvedCases
    .filter((testCase) => testCase.caseKind !== "flow" && testCase.pageLabel)
    .forEach((testCase) => {
      const key = testCase.pageKey || testCase.pageLabel || "page";
      if (!pageMap.has(key)) {
        pageMap.set(key, { key, label: testCase.pageLabel || "Unnamed page", count: 0 });
      }
      const entry = pageMap.get(key);
      if (entry) entry.count += 1;
    });

  const flowMap = new Map<string, { key: string; label: string; count: number }>();
  approvedCases
    .filter((testCase) => testCase.caseKind === "flow" || testCase.packs.includes("e2e"))
    .forEach((testCase) => {
      const key = testCase.flowKey || testCase.flowLabel || projectGroup.name;
      if (!flowMap.has(key)) {
        flowMap.set(key, { key, label: testCase.flowLabel || projectGroup.name, count: 0 });
      }
      const entry = flowMap.get(key);
      if (entry) entry.count += 1;
    });

  const pageEntries = Array.from(pageMap.values());
  const flowEntries = Array.from(flowMap.values());

  const missingPages = bundles
    .filter((bundle) => bundle.meta.mode === "page")
    .map((bundle) => bundle.meta.pageLabel || bundle.meta.name)
    .filter((label) => !pageEntries.some((page) => page.label === label));

  return {
    projectGroup,
    bundles,
    approvedCases,
    pageCaseCount,
    packCounts,
    pageCoverage: pageEntries.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
    flowCoverage: flowEntries.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
    missingPages,
  };
}

export default function SuitesPage() {
  const { user, ready, signingOut, handleSignOut } = useDashboardSession();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [projectGroups, setProjectGroups] = useState<ProjectGroupRecord[]>([]);
  const [bundleMap, setBundleMap] = useState<Record<string, ProjectBundle[]>>({});
  const [error, setError] = useState("");

  const mergedProjectGroups = useMemo(() => {
    const projectGroupMap = new Map(projectGroups.map((group) => [group.id, group]));
    projects.forEach((project) => {
      if (!project.appId || !project.appName) return;
      const existing = projectGroupMap.get(project.appId);
      if (existing) {
        if (!existing.projectIds.includes(project.id)) {
          projectGroupMap.set(project.appId, {
            ...existing,
            projectIds: [...existing.projectIds, project.id],
          });
        }
        return;
      }

      projectGroupMap.set(project.appId, {
        id: project.appId,
        name: project.appName,
        projectIds: [project.id],
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });
    });

    return Array.from(projectGroupMap.values()).sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    );
  }, [projects, projectGroups]);

  useEffect(() => {
    if (!user) return;
    return subscribeProjects(
      user.uid,
      (nextProjects) => {
        setProjects(nextProjects);
        setError("");
      },
      (err) => setError(err.message)
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeProjectGroups(
      user.uid,
      (nextProjectGroups) => {
        setProjectGroups(nextProjectGroups);
        setError("");
      },
      (err) => setError(err.message)
    );
  }, [user]);

  useEffect(() => {
    if (!user || !mergedProjectGroups.length) {
      setBundleMap({});
      return;
    }

    let cancelled = false;
    Promise.all(
      mergedProjectGroups.map(async (projectGroup) => ({
        projectGroupId: projectGroup.id,
        bundles: await getProjectBundles(user.uid, projectGroup.projectIds),
      }))
    )
      .then((results) => {
        if (cancelled) return;
        const nextMap: Record<string, ProjectBundle[]> = {};
        results.forEach((result) => {
          nextMap[result.projectGroupId] = result.bundles;
        });
        setBundleMap(nextMap);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load project groups");
      });

    return () => {
      cancelled = true;
    };
  }, [user, mergedProjectGroups]);

  const summaries = useMemo(
    () =>
      mergedProjectGroups
        .map((projectGroup) => buildProjectGroupSummary(projectGroup, bundleMap[projectGroup.id] || []))
        .sort((left, right) => new Date(right.projectGroup.updatedAt).getTime() - new Date(left.projectGroup.updatedAt).getTime()),
    [mergedProjectGroups, bundleMap]
  );

  const unassignedProjects = projects.filter((project) => !project.appId);

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
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-green/70 font-mono mb-3">Project suites</p>
            <h1 className="text-3xl font-bold mb-2">Complete project suite</h1>
            <p className="text-white/45 text-sm max-w-2xl">
              Combine saved pages and captured flows into one project-level suite view so Smoke, Page, Regression, and E2E packs stay organized without turning QA into a spreadsheet exercise.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3">
              <div className="text-xs text-white/40">Workspaces</div>
              <div className="text-2xl font-semibold mt-1">{mergedProjectGroups.length}</div>
            </div>
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3">
              <div className="text-xs text-white/40">Test cases</div>
              <div className="text-2xl font-semibold mt-1">{summaries.reduce((sum, group) => sum + group.pageCaseCount, 0)}</div>
            </div>
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3">
              <div className="text-xs text-white/40">Smoke + regression</div>
              <div className="text-2xl font-semibold mt-1">{summaries.reduce((sum, group) => sum + group.packCounts.smoke + group.packCounts.regression, 0)}</div>
            </div>
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3">
              <div className="text-xs text-white/40">E2E flows</div>
              <div className="text-2xl font-semibold mt-1">{summaries.reduce((sum, group) => sum + group.packCounts.e2e, 0)}</div>
            </div>
          </div>
        </div>

        {unassignedProjects.length > 0 ? (
          <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-amber-300">Some projects are not assigned to an app suite yet</div>
                <p className="text-xs text-amber-200/65 mt-1">
                  Add a project name in project settings so QA Deck can organize the full suite for that website or web app automatically.
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full border border-amber-500/25 text-amber-200">{unassignedProjects.length} unassigned</span>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="border border-red-500/20 bg-red-500/10 rounded-2xl p-4 text-sm text-red-200 mb-6">
            {error}
          </div>
        ) : null}

        {!summaries.length ? (
          <div className="border border-dashed border-border rounded-3xl p-12 text-center bg-bg-card/50">
            <div className="w-14 h-14 rounded-2xl border border-green/20 bg-green/10 text-green flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M4 8h16M4 12h11M4 16h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">No project suites yet</h2>
            <p className="text-white/45 text-sm max-w-xl mx-auto">
              Open any project, add a shared project name in project settings, and QA Deck will roll those page and journey assets into one suite view here.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {summaries.map((summary) => (
              <section key={summary.projectGroup.id} className="bg-bg-card border border-border rounded-3xl p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h2 className="text-2xl font-semibold">{summary.projectGroup.name}</h2>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/50">
                        {summary.bundles.length} projects
                      </span>
                    </div>
                    <p className="text-sm text-white/45">
                      Updated {formatDate(summary.projectGroup.updatedAt)} · {summary.approvedCases.length} approved cases available for the full project suite
                    </p>
                  </div>
                  <Link href="/dashboard/projects" className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-white/55 hover:text-white hover:border-white/20 transition-colors">
                    Manage linked projects
                  </Link>
                </div>

                <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
                  <div className="rounded-2xl border border-white/8 bg-white/3 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] px-2 py-1 rounded-full border bg-green/10 text-green border-green/20">Page</span>
                      <span className="text-2xl font-semibold">{summary.pageCaseCount}</span>
                    </div>
                    <p className="text-xs text-white/40 mt-3">
                      Canonical page and step cases across linked projects.
                    </p>
                  </div>
                  {TESTCASE_PACK_ORDER.map((suite) => (
                    <div key={suite} className="rounded-2xl border border-white/8 bg-white/3 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`text-[11px] px-2 py-1 rounded-full border ${packTone(suite)}`}>{TESTCASE_PACK_LABELS[suite]}</span>
                        <span className="text-2xl font-semibold">{summary.packCounts[suite]}</span>
                      </div>
                      <p className="text-xs text-white/40 mt-3">
                        {suite === "smoke"
                          ? "Critical happy-path checks promoted from page coverage."
                          : suite === "regression"
                          ? "Broad retestable cases for safe change validation."
                          : "Cross-page or full-flow validations."}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-6">
                  <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <h3 className="text-lg font-semibold">Page coverage</h3>
                        <p className="text-xs text-white/40 mt-1">Which pages are covered by page-level cases right now.</p>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/50">
                        {summary.pageCoverage.length} covered
                      </span>
                    </div>

                    {summary.pageCoverage.length ? (
                      <div className="space-y-3">
                        {summary.pageCoverage.map((page) => (
                          <div key={page.key} className="rounded-2xl border border-white/8 bg-white/3 px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium truncate">{page.label}</div>
                              <div className="text-xs text-white/35 mt-1">Page suite coverage</div>
                            </div>
                            <span className="text-sm font-semibold">{page.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-white/35">No page-level cases have been approved in this project yet.</div>
                    )}

                    {summary.missingPages.length ? (
                      <div className="mt-5">
                        <div className="text-xs text-white/35 mb-2">Missing page coverage</div>
                        <div className="flex flex-wrap gap-2">
                          {summary.missingPages.map((page) => (
                            <span key={page} className="text-[11px] px-2 py-1 rounded-full border border-red-500/20 bg-red-500/10 text-red-300">
                              {page}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                          <h3 className="text-lg font-semibold">E2E flow coverage</h3>
                          <p className="text-xs text-white/40 mt-1">Flows grouped from journey or end-to-end cases.</p>
                        </div>
                        <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/50">
                          {summary.flowCoverage.length} flows
                        </span>
                      </div>

                      {summary.flowCoverage.length ? (
                        <div className="space-y-3">
                          {summary.flowCoverage.map((flow) => (
                            <div key={flow.key} className="rounded-2xl border border-white/8 bg-white/3 px-4 py-3 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{flow.label}</div>
                                <div className="text-xs text-white/35 mt-1">Journey or flow validation</div>
                              </div>
                              <span className="text-sm font-semibold">{flow.count}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-white/35">No E2E flows are approved in this project yet.</div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
                      <h3 className="text-lg font-semibold mb-4">Linked projects</h3>
                      <div className="space-y-3">
                        {summary.bundles.map((bundle) => (
                          <Link
                            key={bundle.meta.id}
                            href={`/dashboard/projects/${bundle.meta.id}`}
                            className="block rounded-2xl border border-white/8 bg-white/3 px-4 py-3 hover:border-green/25 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{bundle.meta.name}</div>
                                <div className="text-xs text-white/35 mt-1 truncate">{bundle.meta.pageLabel || bundle.meta.sourceUrl || "No page label"}</div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-sm font-semibold">{bundle.meta.artifactCounts.testCases}</div>
                                <div className="text-[11px] text-white/35">cases</div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

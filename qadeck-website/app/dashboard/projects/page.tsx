"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardHeader from "@/components/DashboardHeader";
import { useDashboardSession } from "@/lib/use-dashboard-session";
import {
  subscribeProjectGroups,
  subscribeProjects,
  deleteProject,
  deleteProjectGroup,
  groupProjectsByApp,
  type ProjectGroupRecord,
  type AppProjectGroup,
  type ProjectPageSummary,
  type ProjectMeta,
} from "@/lib/project-store";

function statusTone(status: ProjectMeta["status"]) {
  return {
    draft: "bg-white/5 text-white/60 border-white/10",
    active: "bg-green/10 text-green border-green/20",
    review: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    done: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    archived: "bg-white/5 text-white/40 border-white/10",
  }[status];
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ProjectsPage() {
  const { user, ready, signingOut, handleSignOut } = useDashboardSession();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [projectGroups, setProjectGroups] = useState<ProjectGroupRecord[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState("updated");
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "page" | "project";
    id: string;
    name: string;
    projectIds: string[];
  } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleDeleteProject() {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      if (deleteTarget.kind === "page") {
        await deleteProject(user.uid, deleteTarget.id);
      } else {
        await deleteProjectGroup(user.uid, deleteTarget.projectIds);
      }
      setDeleteTarget(null);
      setDeleteConfirmText("");
      setDeleting(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
      setDeleting(false);
    }
  }

  function openDeletePage(page: ProjectPageSummary) {
    setDeleteConfirmText("");
    setDeleteError("");
    setDeleteTarget({
      kind: "page",
      id: page.id,
      name: page.pageLabel || page.name,
      projectIds: [page.id],
    });
  }

  function openDeleteProject(group: AppProjectGroup) {
    setDeleteConfirmText("");
    setDeleteError("");
    setDeleteTarget({
      kind: "project",
      id: group.id,
      name: group.name,
      projectIds: group.pages.map((page) => page.id),
    });
  }

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
      (nextGroups) => setProjectGroups(nextGroups),
      () => {}
    );
  }, [user]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const tagOptions = Array.from(new Set(projects.flatMap((project) => project.tags))).sort((a, b) => a.localeCompare(b));

  const filtered = projects
    .filter((project) => {
      const query = search.trim().toLowerCase();
      const matchesQuery = !query
        || project.name.toLowerCase().includes(query)
        || project.sourceUrl.toLowerCase().includes(query)
        || (project.appName || "").toLowerCase().includes(query)
        || project.tags.some((item) => item.toLowerCase().includes(query));
      const matchesStatus = status === "all" || project.status === status;
      const matchesTag = tag === "all" || project.tags.includes(tag);
      return matchesQuery && matchesStatus && matchesTag;
    })
    .sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name);
      if (sort === "oldest") return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });

  const grouped = groupProjectsByApp(filtered).sort((left, right) => {
    if (sort === "name") return left.name.localeCompare(right.name);
    if (sort === "oldest") return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

  const totalCases = projects.reduce((count, project) => count + project.artifactCounts.testCases, 0);
  const totalFiles = projects.reduce((count, project) => count + project.artifactCounts.scriptFiles, 0);
  const projectGroupCount = new Set([
    ...projectGroups.map((group) => group.id),
    ...projects.flatMap((project) => (project.appId ? [project.appId] : [])),
  ]).size;

  return (
    <div className="min-h-screen bg-bg text-white">
      <DashboardHeader user={user} signingOut={signingOut} onSignOut={handleSignOut} />

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-green/70 font-mono mb-3">Projects</p>
            <h1 className="text-3xl font-bold mb-2">Saved QA Deck projects</h1>
            <p className="text-white/45 text-sm max-w-2xl">
              Revisit synced extension work, track version history, and manage project status without leaving your browser.
            </p>
            <div className="mt-4">
              <Link href="/dashboard/suites" className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-green/25 bg-green/10 text-green hover:bg-green/15 transition-colors">
                Open project suites
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3">
              <div className="text-xs text-white/40">Projects</div>
              <div className="text-2xl font-semibold mt-1">{grouped.length}</div>
            </div>
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3">
              <div className="text-xs text-white/40">Saved cases</div>
              <div className="text-2xl font-semibold mt-1">{totalCases}</div>
            </div>
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3 col-span-2 sm:col-span-1">
              <div className="text-xs text-white/40">Script files</div>
              <div className="text-2xl font-semibold mt-1">{totalFiles}</div>
            </div>
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3 col-span-2 sm:col-span-1">
              <div className="text-xs text-white/40">Saved pages</div>
              <div className="text-2xl font-semibold mt-1">{projectGroupCount}</div>
            </div>
          </div>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-4 mb-6">
          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, URL, or tag"
              className="bg-white/5 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-green"
            />

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="bg-white/5 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-green"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="review">Review</option>
              <option value="done">Done</option>
              <option value="archived">Archived</option>
            </select>

            <select
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              className="bg-white/5 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-green"
            >
              <option value="all">All tags</option>
              {tagOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="bg-white/5 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-green"
            >
              <option value="updated">Recently updated</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        {error ? (
          <div className="border border-red-500/20 bg-red-500/10 rounded-2xl p-4 text-sm text-red-200 mb-6">
            {error}
          </div>
        ) : null}

        {!grouped.length ? (
          <div className="border border-dashed border-border rounded-3xl p-12 text-center bg-bg-card/50">
            <div className="w-14 h-14 rounded-2xl border border-green/20 bg-green/10 text-green flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M5 8h14M5 12h14M5 16h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">No projects match this view</h2>
            <p className="text-white/45 text-sm max-w-xl mx-auto">
              Create or sync a project from the QA Deck extension, then come back here to manage status, history, and generated assets.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {grouped.map((group) => (
              <div key={group.id} className="relative group bg-bg-card border border-border rounded-3xl hover:border-green/30 hover:bg-bg-elevated/70 transition-colors">
                <Link
                  href={`/dashboard/projects/${group.primaryProjectId}`}
                  className="block p-5"
                >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`text-xs px-2.5 py-1 rounded-full border ${statusTone(group.status)}`}>
                            {group.status}
                          </span>
                          <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-white/55 border border-white/10">
                            project
                          </span>
                          <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-white/55 border border-white/10">
                            {group.syncState}
                          </span>
                        </div>
                        <h2 className="text-lg font-semibold text-white group-hover:text-green transition-colors truncate">
                          {group.name}
                        </h2>
                        <p className="text-xs text-white/40 mt-1 truncate">{group.baseUrl || "No source URL"}</p>
                        <p className="text-[11px] text-green/70 mt-2">
                          Pages: {group.pages.map((page) => page.pageLabel || page.name).slice(0, 3).join(", ")}
                          {group.pages.length > 3 ? ` +${group.pages.length - 3}` : ""}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <button
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            openDeleteProject(group);
                          }}
                          className="text-[11px] px-2.5 py-1 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400/60 hover:text-red-300 hover:bg-red-500/20 hover:border-red-500/40 transition-colors"
                        >Delete project</button>
                        <div className="text-right">
                          <div className="text-xs text-white/35">Updated</div>
                          <div className="text-sm text-white/70 mt-1">{formatDate(group.updatedAt)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3 mb-4">
                      <div className="rounded-2xl bg-white/4 border border-white/6 px-3 py-3">
                        <div className="text-xs text-white/35">Cases</div>
                        <div className="text-xl font-semibold mt-1">{group.totalCases}</div>
                      </div>
                      <div className="rounded-2xl bg-white/4 border border-white/6 px-3 py-3">
                        <div className="text-xs text-white/35">Script files</div>
                        <div className="text-xl font-semibold mt-1">{group.totalFiles}</div>
                      </div>
                      <div className="rounded-2xl bg-white/4 border border-white/6 px-3 py-3">
                        <div className="text-xs text-white/35">Pages</div>
                        <div className="text-sm font-medium mt-2 truncate">{group.pageCount}</div>
                      </div>
                      <div className="rounded-2xl bg-white/4 border border-white/6 px-3 py-3">
                        <div className="text-xs text-white/35">Framework</div>
                        <div className="text-sm font-medium mt-2 truncate">{projects.find((project) => project.id === group.primaryProjectId)?.activeFramework || "—"}</div>
                      </div>
                    </div>

                    <div className="mb-4 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.22em] text-white/35 mb-2">Saved pages</div>
                      <div className="space-y-2">
                        {group.pages.map((page) => (
                          <div key={page.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2">
                            <div className="min-w-0">
                              <div className="text-sm text-white truncate">{page.pageLabel || page.name}</div>
                              <div className="text-[11px] text-white/35 truncate">{page.sourceUrl || "No source URL"}</div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openDeletePage(page);
                              }}
                              className="shrink-0 text-[11px] px-2.5 py-1 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400/60 hover:text-red-300 hover:bg-red-500/20 hover:border-red-500/40 transition-colors"
                            >
                              Delete page
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {group.tags.length ? (
                      <div className="flex flex-wrap gap-2">
                        {group.tags.slice(0, 4).map((item) => (
                          <span key={item} className="text-xs px-2.5 py-1 rounded-full bg-green/10 text-green border border-green/15">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-white/30">No tags yet</div>
                    )}
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-bg-card border border-red-500/20 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h3 className="text-lg font-semibold text-red-300">
                {deleteTarget.kind === "project" ? "Delete project" : "Delete page"}
              </h3>
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="text-white/40 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-white/70">
                {deleteTarget.kind === "project"
                  ? <>This will permanently delete the whole project <span className="font-semibold text-white">{deleteTarget.name}</span>, including all saved pages, test cases, scripts, versions, and activity history. This cannot be undone.</>
                  : <>This will permanently delete the saved page <span className="font-semibold text-white">{deleteTarget.name}</span> and all of its test cases, scripts, versions, and activity history. This cannot be undone.</>}
              </p>
              <div>
                <label className="text-xs text-white/45 block mb-2">
                  Type <span className="font-mono text-white/70">{deleteTarget.name}</span> to confirm
                </label>
                <input
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder={deleteTarget.name}
                  className="w-full bg-white/5 border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-red-500/50 transition-colors"
                  autoFocus
                />
              </div>
              {deleteError && (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{deleteError}</div>
              )}
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-3 bg-bg-card">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-4 py-2 rounded-xl text-white/50 hover:text-white transition-colors text-sm font-medium">Cancel</button>
              <button
                onClick={handleDeleteProject}
                disabled={deleting || deleteConfirmText !== deleteTarget.name}
                className="bg-red-500 text-white font-semibold px-5 py-2 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-40 text-sm flex items-center gap-2"
              >
                {deleting && <span className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />}
                {deleting ? "Deleting…" : deleteTarget.kind === "project" ? "Delete project" : "Delete page"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardHeader from "@/components/DashboardHeader";
import { useDashboardSession } from "@/lib/use-dashboard-session";
import {
  getProjectBundles,
  subscribeProjects,
  type ProjectBundle,
  type ProjectMeta,
} from "@/lib/project-store";

type SavedRunRow = {
  projectId: string;
  projectName: string;
  sourceUrl: string;
  framework: string;
  status: "passed" | "failed";
  summary: string;
  savedAt: string;
  headless: boolean;
  resultCount: number;
};

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: "passed" | "failed") {
  return status === "passed"
    ? "bg-green/10 text-green border-green/20"
    : "bg-red-500/10 text-red-300 border-red-500/20";
}

export default function RunsDashboardPage() {
  const { user, ready, signingOut, handleSignOut } = useDashboardSession();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [bundles, setBundles] = useState<ProjectBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    return subscribeProjects(
      user.uid,
      (nextProjects) => {
        setProjects(nextProjects);
        setError("");
      },
      (nextError) => setError(nextError.message)
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!projects.length) {
      setBundles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getProjectBundles(user.uid, projects.map((project) => project.id))
      .then((nextBundles) => {
        if (cancelled) return;
        setBundles(nextBundles);
        setError("");
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : "Failed to load saved runs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, projects]);

  const savedRuns = useMemo<SavedRunRow[]>(() => {
    return bundles
      .filter((bundle) => bundle.artifacts.run)
      .map((bundle) => ({
        projectId: bundle.meta.id,
        projectName: bundle.meta.name,
        sourceUrl: bundle.meta.sourceUrl,
        framework: bundle.artifacts.run?.framework || bundle.meta.activeFramework,
        status: bundle.artifacts.run?.status || "failed",
        summary: bundle.artifacts.run?.summary || "Saved run result",
        savedAt: bundle.artifacts.run?.savedAt || bundle.meta.updatedAt,
        headless: bundle.artifacts.run?.headless || false,
        resultCount: bundle.artifacts.run?.results?.length || 0,
      }))
      .sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime());
  }, [bundles]);

  const passedCount = savedRuns.filter((run) => run.status === "passed").length;
  const failedCount = savedRuns.filter((run) => run.status === "failed").length;

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
            <p className="text-xs uppercase tracking-[0.28em] text-green/70 font-mono mb-3">Saved runs</p>
            <h1 className="text-3xl font-bold mb-2">Run history</h1>
            <p className="text-white/45 text-sm max-w-3xl">
              Review the latest saved run results from your projects and jump back into a page when you need to rerun or debug.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3">
              <div className="text-xs text-white/40">Saved runs</div>
              <div className="text-2xl font-semibold mt-1">{savedRuns.length}</div>
            </div>
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3">
              <div className="text-xs text-white/40">Passed</div>
              <div className="text-2xl font-semibold mt-1">{passedCount}</div>
            </div>
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3">
              <div className="text-xs text-white/40">Failed</div>
              <div className="text-2xl font-semibold mt-1">{failedCount}</div>
            </div>
            <div className="bg-bg-card border border-border rounded-2xl px-4 py-3">
              <div className="text-xs text-white/40">Projects with runs</div>
              <div className="text-2xl font-semibold mt-1">{new Set(savedRuns.map((run) => run.projectId)).size}</div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="border border-red-500/20 bg-red-500/10 rounded-2xl p-4 text-sm text-red-200 mb-6">
            {error}
          </div>
        ) : null}

        {!loading && !savedRuns.length ? (
          <div className="border border-dashed border-border rounded-3xl p-12 text-center bg-bg-card/50">
            <h2 className="text-xl font-semibold mb-2">No saved runs yet</h2>
            <p className="text-white/45 text-sm max-w-2xl mx-auto">
              Generate a script from a project, run it, then use <span className="text-white/70">Save run result</span> to keep it here for later review.
            </p>
          </div>
        ) : (
          <section className="bg-bg-card border border-border rounded-3xl p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-semibold">Latest saved run results</h2>
                <p className="text-sm text-white/40 mt-1">Focused on what actually ran, without the extra maintenance and release layers.</p>
              </div>
              <Link href="/dashboard/projects" className="text-sm text-green hover:text-green/80 transition-colors">
                Browse projects
              </Link>
            </div>

            {loading ? (
              <div className="h-32 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-green border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {savedRuns.map((run) => (
                  <Link
                    key={`${run.projectId}-${run.savedAt}`}
                    href={`/dashboard/projects/${run.projectId}`}
                    className="block rounded-2xl border border-white/8 bg-white/3 p-4 hover:border-green/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{run.projectName}</div>
                        <div className="text-xs text-white/35 mt-1 truncate">{run.sourceUrl || "No source URL"}</div>
                      </div>
                      <span className={`text-[11px] px-2.5 py-1 rounded-full border ${statusTone(run.status)}`}>
                        {run.status}
                      </span>
                    </div>

                    <div className="grid sm:grid-cols-4 gap-3 mb-3">
                      <div className="rounded-xl border border-white/8 bg-bg-elevated/70 px-3 py-3">
                        <div className="text-xs text-white/35">Framework</div>
                        <div className="text-sm font-medium mt-2">{run.framework}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-bg-elevated/70 px-3 py-3">
                        <div className="text-xs text-white/35">Mode</div>
                        <div className="text-sm font-medium mt-2">{run.headless ? "Headless" : "Browser"}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-bg-elevated/70 px-3 py-3">
                        <div className="text-xs text-white/35">Saved</div>
                        <div className="text-sm font-medium mt-2">{formatDate(run.savedAt)}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-bg-elevated/70 px-3 py-3">
                        <div className="text-xs text-white/35">Results</div>
                        <div className="text-sm font-medium mt-2">{run.resultCount} cases</div>
                      </div>
                    </div>

                    <div className="text-sm text-white/70">{run.summary}</div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

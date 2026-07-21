"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import DashboardHeader from "@/components/DashboardHeader";
import { useDashboardSession } from "@/lib/use-dashboard-session";
import { PROMPT_CARDS, PROMPT_CATEGORY_ORDER, type PromptCategory } from "@/lib/prompt-library";
import PromptCategoryNav from "@/components/prompts/PromptCategoryNav";
import PromptSearch from "@/components/prompts/PromptSearch";
import PromptCard from "@/components/prompts/PromptCard";

function isPromptCategory(value: string | null): value is PromptCategory {
  return value !== null && (PROMPT_CATEGORY_ORDER as readonly string[]).includes(value);
}

function PromptsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Public page — do not redirect signed-out visitors. Used only to decide
  // which existing header to render (see below), never to gate content.
  const { user, signingOut, handleSignOut } = useDashboardSession({ redirectOnSignedOut: false });

  const rawCategory = searchParams.get("category");
  const selectedCategory = isPromptCategory(rawCategory) ? rawCategory : null;
  const query = searchParams.get("q") ?? "";

  function updateParams(next: { category?: PromptCategory | null; q?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if ("category" in next) {
      if (next.category) params.set("category", next.category);
      else params.delete("category");
    }
    if ("q" in next) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    const qs = params.toString();
    router.replace(qs ? `/prompts?${qs}` : "/prompts", { scroll: false });
  }

  const searchMatched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PROMPT_CARDS;
    return PROMPT_CARDS.filter(
      (card) => card.title.toLowerCase().includes(q) || card.whenToUse.toLowerCase().includes(q)
    );
  }, [query]);

  const counts = useMemo(() => {
    const base: Record<PromptCategory, number> = {
      requirements: 0,
      "test-design": 0,
      "execution-defects": 0,
      automation: 0,
      "specialized-testing": 0,
      "reporting-closure": 0,
      "learning-career": 0,
    };
    for (const card of searchMatched) base[card.category]++;
    return base;
  }, [searchMatched]);

  const visibleCards = useMemo(() => {
    if (!selectedCategory) return searchMatched;
    return searchMatched.filter((card) => card.category === selectedCategory);
  }, [searchMatched, selectedCategory]);

  return (
    <div className="min-h-screen bg-bg text-white">
      {user ? (
        <DashboardHeader user={user} onSignOut={handleSignOut} signingOut={signingOut} />
      ) : (
        <Navbar />
      )}

      <main className={user ? "" : "pt-16"}>
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="mb-8">
            <span className="text-green text-sm font-semibold uppercase tracking-widest">Prompt Library</span>
            <h1 className="text-3xl font-bold mt-2 mb-2">QA prompts, ready to paste</h1>
            <p className="text-white/50 max-w-2xl">
              Production-ready prompts covering the QA lifecycle — each one self-contained with when to use it,
              what to paste in, and follow-ups to chain.
            </p>
          </div>

          <div className="grid gap-4 mb-6">
            <PromptSearch value={query} onChange={(q) => updateParams({ q })} />
            <PromptCategoryNav
              selected={selectedCategory}
              onSelect={(category) => updateParams({ category })}
              counts={counts}
              totalCount={searchMatched.length}
            />
          </div>

          {visibleCards.length === 0 ? (
            <div className="text-center py-16 text-white/40">
              No prompts match{query ? ` "${query}"` : ""}
              {selectedCategory ? " in this category" : ""}.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 items-start">
              {visibleCards.map((card) => (
                <PromptCard key={card.id} card={card} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function PromptsPage() {
  return (
    <Suspense fallback={null}>
      <PromptsPageContent />
    </Suspense>
  );
}

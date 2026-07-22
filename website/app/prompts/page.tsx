"use client";

import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import DashboardHeader from "@/components/DashboardHeader";
import { useDashboardSession } from "@/lib/use-dashboard-session";
import { usePromptLocalState } from "@/lib/use-prompt-local-state";
import { searchPrompts } from "@/lib/prompt-search";
import {
  PROMPT_CARDS,
  PROMPT_CATEGORY_ORDER,
  type Difficulty,
  type PromptCategory,
  type TestingType,
} from "@/lib/prompt-library";
import PromptCategoryNav from "@/components/prompts/PromptCategoryNav";
import PromptSearch from "@/components/prompts/PromptSearch";
import PromptFilters from "@/components/prompts/PromptFilters";
import PromptCard from "@/components/prompts/PromptCard";
import PromptRunDrawer from "@/components/prompts/PromptRunDrawer";
import PromptSettingsModal from "@/components/prompts/PromptSettingsModal";
import { decodeRunParams } from "@/lib/prompt-share-url";

const TESTING_TYPES: readonly TestingType[] = [
  "AI", "Manual", "Automation", "Backend", "Frontend", "API", "Database", "Security", "Performance",
];
const DIFFICULTIES: readonly Difficulty[] = ["Beginner", "Intermediate", "Advanced", "Senior QA"];
const RECENT_WINDOW_DAYS = 30;
const INITIAL_VISIBLE_COUNT = 30;
const VISIBLE_BATCH_SIZE = 30;

function isPromptCategory(value: string | null): value is PromptCategory {
  return value !== null && (PROMPT_CATEGORY_ORDER as readonly string[]).includes(value);
}

function parseListParam<T extends string>(value: string | null, valid: readonly T[]): T[] {
  if (!value) return [];
  return value.split(",").filter((v): v is T => (valid as readonly string[]).includes(v));
}

function isRecent(lastUpdated: string): boolean {
  const updated = new Date(lastUpdated).getTime();
  if (Number.isNaN(updated)) return false;
  const days = (Date.now() - updated) / (1000 * 60 * 60 * 24);
  return days <= RECENT_WINDOW_DAYS;
}

function PromptsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Public page — do not redirect signed-out visitors. Used only to decide
  // which existing header to render (see below), never to gate content.
  const { user, signingOut, handleSignOut } = useDashboardSession({ redirectOnSignedOut: false });
  const {
    hydrated,
    isFavorite,
    toggleFavorite,
    getUsageCount,
    recordUsage,
    favoriteIds,
    globalVariables,
    setGlobalVariable,
    clearGlobalVariables,
    addHistoryEntry,
    saveTemplate,
    deleteTemplate,
    listTemplates,
  } = usePromptLocalState();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  const [drawerCardId, setDrawerCardId] = useState<string | null>(null);
  const [drawerInitialValues, setDrawerInitialValues] = useState<Record<string, string> | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const rawCategory = searchParams.get("category");
  const selectedCategory = isPromptCategory(rawCategory) ? rawCategory : null;
  const query = searchParams.get("q") ?? "";
  const deferredQuery = useDeferredValue(query);
  const selectedTestingTypes = parseListParam(searchParams.get("testingType"), TESTING_TYPES);
  const selectedDifficulties = parseListParam(searchParams.get("difficulty"), DIFFICULTIES);
  const selectedTechnologies = useMemo(
    () => (searchParams.get("technology") ? searchParams.get("technology")!.split(",") : []),
    [searchParams]
  );
  const recentOnly = searchParams.get("recent") === "1";
  const favoritesOnly = searchParams.get("favorites") === "1";

  function updateParams(next: {
    category?: PromptCategory | null;
    q?: string;
    testingType?: TestingType[];
    difficulty?: Difficulty[];
    technology?: string[];
    recent?: boolean;
    favorites?: boolean;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    const setOrDelete = (key: string, value: string | null) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };
    if ("category" in next) setOrDelete("category", next.category ?? null);
    if ("q" in next) setOrDelete("q", next.q || null);
    if ("testingType" in next) setOrDelete("testingType", next.testingType!.length ? next.testingType!.join(",") : null);
    if ("difficulty" in next) setOrDelete("difficulty", next.difficulty!.length ? next.difficulty!.join(",") : null);
    if ("technology" in next) setOrDelete("technology", next.technology!.length ? next.technology!.join(",") : null);
    if ("recent" in next) setOrDelete("recent", next.recent ? "1" : null);
    if ("favorites" in next) setOrDelete("favorites", next.favorites ? "1" : null);
    const qs = params.toString();
    router.replace(qs ? `/prompts?${qs}` : "/prompts", { scroll: false });
  }

  // Search + every non-category filter, applied together — this is also
  // what category pill counts are derived from, so a pill's count always
  // matches what clicking it will actually show given the current filters.
  const filteredAcrossCategories = useMemo(() => {
    const base = searchPrompts(PROMPT_CARDS, deferredQuery);
    return base.filter((card) => {
      if (selectedTestingTypes.length && !selectedTestingTypes.some((t) => card.testingType.includes(t))) return false;
      if (selectedDifficulties.length && !selectedDifficulties.includes(card.difficulty)) return false;
      if (selectedTechnologies.length && !selectedTechnologies.some((t) => card.technologies.includes(t))) return false;
      if (favoritesOnly && !isFavorite(card.id)) return false;
      if (recentOnly && !isRecent(card.lastUpdated)) return false;
      return true;
    });
  }, [deferredQuery, selectedTestingTypes, selectedDifficulties, selectedTechnologies, favoritesOnly, recentOnly, favoriteIds]);

  const counts = useMemo(() => {
    const base: Record<PromptCategory, number> = Object.fromEntries(
      PROMPT_CATEGORY_ORDER.map((c) => [c, 0])
    ) as Record<PromptCategory, number>;
    for (const card of filteredAcrossCategories) base[card.category]++;
    return base;
  }, [filteredAcrossCategories]);

  const totalInSelectedCategory = useMemo(
    () => (selectedCategory ? PROMPT_CARDS.filter((c) => c.category === selectedCategory).length : PROMPT_CARDS.length),
    [selectedCategory]
  );

  const visibleCards = useMemo(() => {
    if (!selectedCategory) return filteredAcrossCategories;
    return filteredAcrossCategories.filter((card) => card.category === selectedCategory);
  }, [filteredAcrossCategories, selectedCategory]);

  // Lazy reveal: render a batch, grow it as the user scrolls near the bottom
  // sentinel. Resets whenever the active result set changes so a new search
  // or filter doesn't leave a stale, oversized batch (or an under-sized one
  // if the previous set was smaller).
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }, [visibleCards]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((v) => Math.min(v + VISIBLE_BATCH_SIZE, visibleCards.length));
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCards.length]);

  // Share-link auto-open: decode ?run=&v= once on mount, open the drawer
  // pre-filled if it resolves to a real card, then strip those params so
  // closing/reopening the drawer or navigating back later doesn't
  // re-trigger the auto-open.
  useEffect(() => {
    const decoded = decodeRunParams(searchParams);
    if (!decoded) return;
    const card = PROMPT_CARDS.find((c) => c.id === decoded.cardId);
    if (!card) return;
    setDrawerCardId(card.id);
    setDrawerInitialValues(decoded.values);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("run");
    params.delete("v");
    const qs = params.toString();
    router.replace(qs ? `/prompts?${qs}` : "/prompts", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts: `/` and Cmd/Ctrl+K focus search; Escape clears it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

      if ((event.key === "/" && !isTyping) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "Escape" && target === searchInputRef.current && query) {
        updateParams({ q: "" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const cardsToRender = visibleCards.slice(0, visibleCount);
  const isEmptyCategory = selectedCategory !== null && totalInSelectedCategory === 0;
  const drawerCard = drawerCardId ? PROMPT_CARDS.find((c) => c.id === drawerCardId) ?? null : null;

  function closeDrawer() {
    setDrawerCardId(null);
    setDrawerInitialValues(undefined);
  }

  return (
    <div className="min-h-screen bg-bg text-white">
      {user ? (
        <DashboardHeader user={user} onSignOut={handleSignOut} signingOut={signingOut} />
      ) : (
        <Navbar />
      )}

      <main className={user ? "" : "pt-16"}>
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <span className="text-green text-sm font-semibold uppercase tracking-widest">Prompt Library</span>
              <h1 className="text-3xl font-bold mt-2 mb-2">QA prompts, ready to paste</h1>
              <p className="text-white/50 max-w-2xl">
                Production-ready prompts covering the QA lifecycle — each one self-contained with when to use it,
                what to paste in, and follow-ups to chain.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="shrink-0 text-sm text-white/40 hover:text-white transition-colors whitespace-nowrap"
            >
              ⚙ Smart Variables
            </button>
          </div>

          <div className="grid gap-4 mb-6">
            <PromptSearch ref={searchInputRef} value={query} onChange={(q) => updateParams({ q })} />
            <PromptCategoryNav
              selected={selectedCategory}
              onSelect={(category) => updateParams({ category })}
              counts={counts}
              totalCount={filteredAcrossCategories.length}
            />
            <PromptFilters
              allCards={PROMPT_CARDS}
              selectedTestingTypes={selectedTestingTypes}
              onTestingTypesChange={(testingType) => updateParams({ testingType })}
              selectedDifficulties={selectedDifficulties}
              onDifficultiesChange={(difficulty) => updateParams({ difficulty })}
              selectedTechnologies={selectedTechnologies}
              onTechnologiesChange={(technology) => updateParams({ technology })}
              recentOnly={recentOnly}
              onRecentOnlyChange={(recent) => updateParams({ recent })}
              favoritesOnly={favoritesOnly}
              onFavoritesOnlyChange={(favorites) => updateParams({ favorites })}
            />
          </div>

          {isEmptyCategory ? (
            <div className="text-center py-16 text-white/40">
              <p className="mb-1">No prompts here yet — coming soon.</p>
              <p className="text-sm text-white/25">This category is part of the library&apos;s roadmap.</p>
            </div>
          ) : visibleCards.length === 0 ? (
            <div className="text-center py-16 text-white/40">
              No prompts match{query ? ` "${query}"` : ""}
              {selectedCategory || selectedTestingTypes.length || selectedDifficulties.length || selectedTechnologies.length || favoritesOnly || recentOnly
                ? " with the current filters"
                : ""}
              .
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 items-start">
                {cardsToRender.map((card) => (
                  <PromptCard
                    key={card.id}
                    card={card}
                    isFavorite={isFavorite(card.id)}
                    onToggleFavorite={() => toggleFavorite(card.id)}
                    usageCount={getUsageCount(card.id)}
                    hydrated={hydrated}
                    onRecordUsage={() => recordUsage(card.id)}
                    onOpenDrawer={() => {
                      setDrawerCardId(card.id);
                      setDrawerInitialValues(undefined);
                    }}
                  />
                ))}
              </div>
              {visibleCount < visibleCards.length && <div ref={loadMoreRef} aria-hidden="true" className="h-1" />}
            </>
          )}
        </div>
      </main>

      <PromptRunDrawer
        card={drawerCard}
        open={drawerCardId !== null}
        onClose={closeDrawer}
        globalVariables={globalVariables}
        onSetGlobalVariable={setGlobalVariable}
        templates={drawerCardId ? listTemplates(drawerCardId) : []}
        onSaveTemplate={(name, values) => drawerCardId && saveTemplate(drawerCardId, name, values)}
        onDeleteTemplate={(templateId) => drawerCardId && deleteTemplate(drawerCardId, templateId)}
        onCopySuccess={(values) => {
          if (!drawerCardId) return;
          recordUsage(drawerCardId);
          addHistoryEntry({ cardId: drawerCardId, values, copiedAt: new Date().toISOString() });
        }}
        initialValues={drawerInitialValues}
      />

      <PromptSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        globalVariables={globalVariables}
        onSetGlobalVariable={setGlobalVariable}
        onClearAll={clearGlobalVariables}
      />
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

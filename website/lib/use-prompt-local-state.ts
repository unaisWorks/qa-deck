"use client";

import { useEffect, useState } from "react";

// Favorites, usage counts, saved templates, run history, and smart global
// variables are all personal, per-visitor state — not part of the prompt
// content itself, so they live here instead of on PromptCard. localStorage
// only: this page is intentionally public/pre-login, so there's no account
// to attach server-side state to.
const STORAGE_KEY = "qa-deck:prompt-library:v1";
const HISTORY_LIMIT = 20;

export interface TemplateEntry {
  id: string;
  cardId: string;
  name: string;
  values: Record<string, string>;
  createdAt: string;
}

export interface HistoryEntry {
  cardId: string;
  values: Record<string, string>;
  copiedAt: string;
}

interface PromptLocalState {
  favorites: Record<string, true>;
  usageCount: Record<string, number>;
  globalVariables: Record<string, string>;
  history: HistoryEntry[];
  templates: Record<string, TemplateEntry[]>;
}

const EMPTY_STATE: PromptLocalState = {
  favorites: {},
  usageCount: {},
  globalVariables: {},
  history: [],
  templates: {},
};

export function usePromptLocalState() {
  const [state, setState] = useState<PromptLocalState>(EMPTY_STATE);
  // Starts false on both server and the pre-hydration client render (same
  // empty state either way, so no hydration mismatch), flips true once the
  // real localStorage value has been read — lets the UI hide usage-count
  // badges until it knows the real number instead of flashing "0" first.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      // Spread EMPTY_STATE first: a blob saved before globalVariables/
      // history/templates existed still produces a fully-shaped object
      // instead of undefined.push crashes, and existing favorites/usage
      // survive untouched.
      if (raw) setState({ ...EMPTY_STATE, ...JSON.parse(raw) });
    } catch {
      // Corrupt or inaccessible storage — fall back to empty state silently.
    }
    setHydrated(true);
  }, []);

  function persist(next: PromptLocalState) {
    setState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or unavailable (private browsing) — state still works
      // for the current session, it just won't survive a reload.
    }
  }

  function isFavorite(id: string) {
    return Boolean(state.favorites[id]);
  }

  function toggleFavorite(id: string) {
    const nextFavorites = { ...state.favorites };
    if (nextFavorites[id]) delete nextFavorites[id];
    else nextFavorites[id] = true;
    persist({ ...state, favorites: nextFavorites });
  }

  function getUsageCount(id: string) {
    return state.usageCount[id] ?? 0;
  }

  function recordUsage(id: string) {
    persist({ ...state, usageCount: { ...state.usageCount, [id]: getUsageCount(id) + 1 } });
  }

  function getGlobalVariable(key: string): string {
    return state.globalVariables[key] ?? "";
  }

  function setGlobalVariable(key: string, value: string) {
    persist({ ...state, globalVariables: { ...state.globalVariables, [key]: value } });
  }

  function clearGlobalVariables() {
    persist({ ...state, globalVariables: {} });
  }

  function addHistoryEntry(entry: HistoryEntry) {
    const next = [entry, ...state.history].slice(0, HISTORY_LIMIT);
    persist({ ...state, history: next });
  }

  function saveTemplate(cardId: string, name: string, values: Record<string, string>) {
    const entry: TemplateEntry = { id: `${cardId}-${Date.now()}`, cardId, name, values, createdAt: new Date().toISOString() };
    const existing = state.templates[cardId] ?? [];
    persist({ ...state, templates: { ...state.templates, [cardId]: [...existing, entry] } });
  }

  function deleteTemplate(cardId: string, templateId: string) {
    const existing = state.templates[cardId] ?? [];
    persist({ ...state, templates: { ...state.templates, [cardId]: existing.filter((t) => t.id !== templateId) } });
  }

  function listTemplates(cardId: string): TemplateEntry[] {
    return state.templates[cardId] ?? [];
  }

  return {
    hydrated,
    isFavorite,
    toggleFavorite,
    getUsageCount,
    recordUsage,
    favoriteIds: state.favorites,
    globalVariables: state.globalVariables,
    getGlobalVariable,
    setGlobalVariable,
    clearGlobalVariables,
    history: state.history,
    addHistoryEntry,
    saveTemplate,
    deleteTemplate,
    listTemplates,
  };
}

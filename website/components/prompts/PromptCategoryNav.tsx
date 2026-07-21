"use client";

import { PROMPT_CATEGORY_LABELS, PROMPT_CATEGORY_ORDER, type PromptCategory } from "@/lib/prompt-library";
import { CATEGORY_COLORS } from "@/lib/prompt-category-colors";

interface PromptCategoryNavProps {
  selected: PromptCategory | null;
  onSelect: (category: PromptCategory | null) => void;
  counts: Record<PromptCategory, number>;
  totalCount: number;
}

export default function PromptCategoryNav({ selected, onSelect, counts, totalCount }: PromptCategoryNavProps) {
  return (
    <nav
      aria-label="Filter prompts by category"
      className="flex items-center gap-2 overflow-x-auto pb-1"
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={selected === null}
        className={`shrink-0 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors border focus:outline-none focus-visible:ring-2 focus-visible:ring-green/60 ${
          selected === null
            ? "bg-green/15 text-green border-green/25"
            : "text-white/50 hover:text-white hover:bg-white/5 border-transparent"
        }`}
      >
        All <span className="text-xs opacity-70">({totalCount})</span>
      </button>
      {PROMPT_CATEGORY_ORDER.map((category) => {
        const active = selected === category;
        const color = CATEGORY_COLORS[category];
        const count = counts[category] ?? 0;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onSelect(category)}
            aria-pressed={active}
            disabled={count === 0}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors border focus:outline-none focus-visible:ring-2 focus-visible:ring-green/60 disabled:opacity-35 disabled:cursor-not-allowed ${
              active
                ? `${color.bg} ${color.text} ${color.border}`
                : "text-white/50 hover:text-white hover:bg-white/5 border-transparent"
            }`}
          >
            {PROMPT_CATEGORY_LABELS[category]} <span className="text-xs opacity-70">({count})</span>
          </button>
        );
      })}
    </nav>
  );
}

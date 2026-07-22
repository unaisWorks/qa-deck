"use client";

import type { Difficulty, PromptCard, TestingType } from "@/lib/prompt-library";
import { TogglePill } from "@/components/ToggleGroup";

const TESTING_TYPE_OPTIONS: TestingType[] = [
  "AI", "Manual", "Automation", "Backend", "Frontend", "API", "Database", "Security", "Performance",
];
const DIFFICULTY_OPTIONS: Difficulty[] = ["Beginner", "Intermediate", "Advanced", "Senior QA"];

function deriveTechnologyOptions(cards: readonly PromptCard[]): string[] {
  return Array.from(new Set(cards.flatMap((c) => c.technologies))).sort((a, b) => a.localeCompare(b));
}

function toggleInList<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

interface FilterDropdownProps<T extends string> {
  label: string;
  options: T[];
  selected: T[];
  onChange: (next: T[]) => void;
}

function FilterDropdown<T extends string>({ label, options, selected, onChange }: FilterDropdownProps<T>) {
  const active = selected.length > 0;
  return (
    <details className="relative shrink-0 group">
      <summary
        className={`list-none cursor-pointer select-none px-3 py-1.5 rounded-lg text-sm border transition-colors flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-green/60 ${
          active
            ? "bg-green/15 text-green border-green/25"
            : "text-white/50 hover:text-white hover:bg-white/5 border-white/10"
        }`}
      >
        {label}
        {active && <span className="text-xs opacity-70">({selected.length})</span>}
        <span className="text-[10px] opacity-60 group-open:rotate-180 transition-transform">&#9662;</span>
      </summary>
      <div className="absolute z-20 mt-1.5 min-w-[180px] rounded-xl border border-white/10 bg-bg-card shadow-xl p-1.5 grid gap-0.5">
        {options.map((option) => {
          const checked = selected.includes(option);
          return (
            <label
              key={option}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-white/70 hover:bg-white/5 hover:text-white cursor-pointer"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(toggleInList(selected, option))}
                className="accent-green"
              />
              {option}
            </label>
          );
        })}
      </div>
    </details>
  );
}

interface PromptFiltersProps {
  allCards: readonly PromptCard[];
  selectedTestingTypes: TestingType[];
  onTestingTypesChange: (types: TestingType[]) => void;
  selectedDifficulties: Difficulty[];
  onDifficultiesChange: (difficulties: Difficulty[]) => void;
  selectedTechnologies: string[];
  onTechnologiesChange: (technologies: string[]) => void;
  recentOnly: boolean;
  onRecentOnlyChange: (value: boolean) => void;
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (value: boolean) => void;
}

export default function PromptFilters({
  allCards,
  selectedTestingTypes,
  onTestingTypesChange,
  selectedDifficulties,
  onDifficultiesChange,
  selectedTechnologies,
  onTechnologiesChange,
  recentOnly,
  onRecentOnlyChange,
  favoritesOnly,
  onFavoritesOnlyChange,
}: PromptFiltersProps) {
  const technologyOptions = deriveTechnologyOptions(allCards);

  return (
    <div className="flex items-center gap-2 flex-wrap" aria-label="Filter prompts">
      <FilterDropdown
        label="Testing type"
        options={TESTING_TYPE_OPTIONS}
        selected={selectedTestingTypes}
        onChange={onTestingTypesChange}
      />
      <FilterDropdown
        label="Difficulty"
        options={DIFFICULTY_OPTIONS}
        selected={selectedDifficulties}
        onChange={onDifficultiesChange}
      />
      {technologyOptions.length > 0 && (
        <FilterDropdown
          label="Technology"
          options={technologyOptions}
          selected={selectedTechnologies}
          onChange={onTechnologiesChange}
        />
      )}
      <div className="w-px h-5 bg-white/10 mx-1" aria-hidden="true" />
      <TogglePill label="Recently added" active={recentOnly} onToggle={() => onRecentOnlyChange(!recentOnly)} />
      <TogglePill label="★ Favorites" active={favoritesOnly} onToggle={() => onFavoritesOnlyChange(!favoritesOnly)} />
    </div>
  );
}

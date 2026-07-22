"use client";

// Shared pill-toggle visual — extracted from PromptFilters (used there for
// Recently Added / Favorites) so PromptRunDrawer's Length / Output Mode /
// Preview Mode rows reuse the identical look instead of duplicating it.
export interface TogglePillProps {
  label: string;
  active: boolean;
  onToggle: () => void;
}

export function TogglePill({ label, active, onToggle }: TogglePillProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`shrink-0 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors border focus:outline-none focus-visible:ring-2 focus-visible:ring-green/60 ${
        active
          ? "bg-green/15 text-green border-green/25"
          : "text-white/50 hover:text-white hover:bg-white/5 border-white/10"
      }`}
    >
      {label}
    </button>
  );
}

export interface ToggleGroupProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

// A row of mutually-exclusive TogglePills — one always active. Used for
// Length / Output Mode / Preview Mode in the drawer.
export function ToggleGroup<T extends string>({ options, value, onChange }: ToggleGroupProps<T>) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {options.map((opt) => (
        <TogglePill key={opt.value} label={opt.label} active={value === opt.value} onToggle={() => onChange(opt.value)} />
      ))}
    </div>
  );
}

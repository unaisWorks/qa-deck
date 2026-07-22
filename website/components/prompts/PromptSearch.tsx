"use client";

import { forwardRef } from "react";

interface PromptSearchProps {
  value: string;
  onChange: (value: string) => void;
}

// Ref forwarded so the page can focus this input from a keyboard shortcut
// (`/` and Cmd/Ctrl+K) without either component needing to know about the
// other's internals.
const PromptSearch = forwardRef<HTMLInputElement, PromptSearchProps>(function PromptSearch(
  { value, onChange },
  ref
) {
  return (
    <div className="relative">
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search by title, tag, category, technology, or prompt text… (press / to focus)"
        aria-label="Search prompts"
        className="w-full bg-white/5 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-green"
      />
    </div>
  );
});

export default PromptSearch;

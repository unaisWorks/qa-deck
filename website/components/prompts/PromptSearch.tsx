"use client";

interface PromptSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export default function PromptSearch({ value, onChange }: PromptSearchProps) {
  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search prompt titles and when-to-use..."
        aria-label="Search prompts"
        className="w-full bg-white/5 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-green"
      />
    </div>
  );
}

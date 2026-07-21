import type { PromptCategory } from "@/lib/prompt-library";

// Hand-maintained — not generated. Presentation only; kept out of the
// generated data file so regenerating prompt-library.ts never touches this.
//
// 5 of these 6 hues (blue, purple, red, orange, amber) are already used
// elsewhere in the dashboard for badges/status pills. "indigo" is a new
// addition: the existing palette has exactly 5 non-brand hues in use, and 7
// categories need distinct colors (6 with cards in this PR + Learning &
// Career reserved for cyan). Brand green was deliberately excluded to keep
// it reserved for actions (Copy, Continue, etc.) — see the same reasoning
// for why "cyan" was chosen for Learning & Career over reusing green.
export const CATEGORY_COLORS: Record<PromptCategory, { bg: string; text: string; border: string }> = {
  requirements: { bg: "bg-blue-500/10", text: "text-blue-300", border: "border-blue-500/20" },
  "test-design": { bg: "bg-purple-500/10", text: "text-purple-300", border: "border-purple-500/20" },
  "execution-defects": { bg: "bg-red-500/10", text: "text-red-300", border: "border-red-500/20" },
  automation: { bg: "bg-orange-500/10", text: "text-orange-300", border: "border-orange-500/20" },
  "specialized-testing": { bg: "bg-amber-500/10", text: "text-amber-300", border: "border-amber-500/20" },
  "reporting-closure": { bg: "bg-indigo-500/10", text: "text-indigo-300", border: "border-indigo-500/20" },
  "learning-career": { bg: "bg-cyan-500/10", text: "text-cyan-300", border: "border-cyan-500/20" },
};

export function categoryBadgeClass(category: PromptCategory): string {
  const c = CATEGORY_COLORS[category];
  return `${c.bg} ${c.text} border ${c.border}`;
}

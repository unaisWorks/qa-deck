import type { PromptCategory } from "@/lib/prompt-library";

// Hand-maintained — not generated. Presentation only; kept out of the
// generated data file so regenerating prompt-library.ts never touches this.
//
// 12 categories need 12 distinct hues. blue/purple/red/orange/amber/indigo
// carry over from the old 7-category palette where the concept survived the
// IA rewrite (e.g. security-testing keeps amber, the old "specialized
// testing" hue, since OWASP content moved there). cyan frees up from the
// dropped "learning-career" category and goes to the brand-new ai-qa
// category. sky/teal/rose/lime/violet are new additions for the categories
// that didn't exist before (api/database/ui/mobile/performance testing).
// Brand green is deliberately excluded throughout — reserved for actions
// (Copy, Continue, etc.), never for category identity.
export const CATEGORY_COLORS: Record<PromptCategory, { bg: string; text: string; border: string }> = {
  "requirements-analysis": { bg: "bg-blue-500/10", text: "text-blue-300", border: "border-blue-500/20" },
  "test-design": { bg: "bg-purple-500/10", text: "text-purple-300", border: "border-purple-500/20" },
  "api-testing": { bg: "bg-sky-500/10", text: "text-sky-300", border: "border-sky-500/20" },
  "database-testing": { bg: "bg-teal-500/10", text: "text-teal-300", border: "border-teal-500/20" },
  "ui-testing": { bg: "bg-rose-500/10", text: "text-rose-300", border: "border-rose-500/20" },
  "mobile-testing": { bg: "bg-lime-500/10", text: "text-lime-300", border: "border-lime-500/20" },
  "security-testing": { bg: "bg-amber-500/10", text: "text-amber-300", border: "border-amber-500/20" },
  "performance-testing": { bg: "bg-violet-500/10", text: "text-violet-300", border: "border-violet-500/20" },
  automation: { bg: "bg-orange-500/10", text: "text-orange-300", border: "border-orange-500/20" },
  execution: { bg: "bg-red-500/10", text: "text-red-300", border: "border-red-500/20" },
  "ai-qa": { bg: "bg-cyan-500/10", text: "text-cyan-300", border: "border-cyan-500/20" },
  reporting: { bg: "bg-indigo-500/10", text: "text-indigo-300", border: "border-indigo-500/20" },
};

export function categoryBadgeClass(category: PromptCategory): string {
  const c = CATEGORY_COLORS[category];
  return `${c.bg} ${c.text} border ${c.border}`;
}

import { PROMPT_CATEGORY_LABELS, type PromptCard } from "@/lib/prompt-library";

// Weighted multi-field search — no fuzzy-search library needed at this
// dataset size (tens to low hundreds of cards). A query is split into terms;
// a card must match every term in at least one field each (AND across terms,
// OR across fields) so multi-word queries like "api security" meaningfully
// narrow results instead of over-matching. Matches are scored and sorted so
// a title hit always ranks above a prompt-body hit.
const FIELD_WEIGHTS = {
  title: 10,
  titlePrefix: 5, // bonus on top of `title` when the term prefixes the title
  tags: 8,
  categoryAndSubcategory: 6,
  technologies: 6,
  description: 4,
  prompt: 2,
} as const;

function scoreCardForTerm(card: PromptCard, term: string): number {
  const titleLower = card.title.toLowerCase();
  let score = 0;

  if (titleLower.includes(term)) {
    score += FIELD_WEIGHTS.title;
    if (titleLower.startsWith(term)) score += FIELD_WEIGHTS.titlePrefix;
  }
  if (card.tags.some((tag) => tag.toLowerCase().includes(term))) {
    score += FIELD_WEIGHTS.tags;
  }
  const categoryLabel = PROMPT_CATEGORY_LABELS[card.category].toLowerCase();
  if (categoryLabel.includes(term) || card.subcategory.toLowerCase().includes(term)) {
    score += FIELD_WEIGHTS.categoryAndSubcategory;
  }
  if (card.technologies.some((tech) => tech.toLowerCase().includes(term))) {
    score += FIELD_WEIGHTS.technologies;
  }
  if (card.description.toLowerCase().includes(term) || card.whenToUse.toLowerCase().includes(term)) {
    score += FIELD_WEIGHTS.description;
  }
  if (card.prompt.toLowerCase().includes(term)) {
    score += FIELD_WEIGHTS.prompt;
  }

  return score;
}

export function searchPrompts(cards: readonly PromptCard[], query: string): PromptCard[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...cards];

  const scored: { card: PromptCard; score: number; index: number }[] = [];
  cards.forEach((card, index) => {
    let total = 0;
    for (const term of terms) {
      const termScore = scoreCardForTerm(card, term);
      if (termScore === 0) return; // this term matched nothing on this card — card is excluded
      total += termScore;
    }
    scored.push({ card, score: total, index });
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.card);
}

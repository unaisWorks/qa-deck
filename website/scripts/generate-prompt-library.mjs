#!/usr/bin/env node
// Parses ../../QA-Deck-Prompt-Library.md into website/lib/prompt-library.ts.
//
// Run: node scripts/generate-prompt-library.mjs   (from website/)
//
// Why a parser instead of hand-typing the data: the prompt text is precisely
// worded and the constraint lines are load-bearing — a dropped rule silently
// degrades output quality. This guarantees the generated `prompt` field is
// byte-identical to the fenced block in the source doc.
//
// Cards are included by having a `**Category:**` line resolving to one of the
// 12 categories below — there is no separate allowlist. A card without a
// resolvable category (or a card that predates the new IA and hasn't been
// migrated yet) is skipped and logged, not thrown — extending the library is
// then just adding metadata lines to the .md, no script changes required.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_MD = path.join(__dirname, "..", "..", "QA-Deck-Prompt-Library.md");
const OUTPUT_TS = path.join(__dirname, "..", "lib", "prompt-library.ts");

// Ordered 12-category IA. The label here must match each card's own
// `**Category:** <label>` line exactly (case-sensitive).
const CATEGORY_ORDER = [
  { slug: "requirements-analysis", label: "Requirements & Analysis" },
  { slug: "test-design", label: "Test Design" },
  { slug: "api-testing", label: "API Testing" },
  { slug: "database-testing", label: "Database Testing" },
  { slug: "ui-testing", label: "UI Testing" },
  { slug: "mobile-testing", label: "Mobile Testing" },
  { slug: "security-testing", label: "Security Testing" },
  { slug: "performance-testing", label: "Performance Testing" },
  { slug: "automation", label: "Automation" },
  { slug: "execution", label: "Execution" },
  { slug: "ai-qa", label: "AI QA" },
  { slug: "reporting", label: "Reporting" },
];
const LABEL_TO_SLUG = new Map(CATEGORY_ORDER.map((c) => [c.label, c.slug]));

const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced", "Senior QA"];
const VARIABLE_TYPES = ["text", "textarea", "select", "checkbox", "radio", "date", "number", "multiselect", "tag"];
const OPTIONS_TYPES = new Set(["select", "radio", "multiselect"]);

// Strips markdown inline emphasis/code so plain-text rendering never shows
// literal **/*/` characters. Order matters: bold (**) before italic (*),
// so a bold span's asterisks aren't first read as two italic spans.
function stripInlineMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*([^*\n]+?)\*/g, "$1")
    .replace(/`([^`\n]+?)`/g, "$1")
    .trim();
}

function stripLeadingWarningIcons(text) {
  return text.replace(/^(⚠️\s*)+/, "").trim();
}

function splitList(value) {
  if (!value) return [];
  return value.split(",").map((s) => stripInlineMarkdown(s.trim())).filter(Boolean);
}

function main() {
  const raw = readFileSync(SOURCE_MD, "utf8");
  const lines = raw.split("\n");

  const sections = []; // { id, title, starred, bodyLines }

  for (const line of lines) {
    const cardMatch = line.match(/^## ([A-G]\d+) · (.+?)(\s*⭐)?$/);
    if (cardMatch) {
      const [, id, title, starMark] = cardMatch;
      sections.push({ id, title: title.trim(), starred: Boolean(starMark), bodyLines: [] });
      continue;
    }
    if (sections.length > 0) {
      sections[sections.length - 1].bodyLines.push(line);
    }
  }

  const parsed = sections.map((section) => parseCard(section));
  const cards = parsed.filter((c) => c.card !== null).map((c) => c.card);
  const skipped = parsed.filter((c) => c.card === null);

  writeOutput(cards);

  console.log(`Parsed ${sections.length} cards from source doc; wrote ${cards.length} to ${path.relative(process.cwd(), OUTPUT_TS)}`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} card(s) with no resolvable **Category:** line: ${skipped.map((s) => s.id).join(", ")}`);
  }
  for (const c of cards) {
    console.log(`  ${c.id} — ${c.category}/${c.subcategory} — variables: ${c.variables.length} — quality: ${c.qualityScore} — featured: ${c.featured}`);
  }
}

function parseCard(section) {
  const body = section.bodyLines.join("\n");

  const fenceMatch = body.match(/```\n([\s\S]*?)\n```/);
  if (!fenceMatch) {
    throw new Error(`Card ${section.id} has no fenced prompt block`);
  }
  const prompt = fenceMatch[1]; // verbatim — do not trim/alter

  const beforeFence = body.slice(0, body.indexOf(fenceMatch[0]));
  const afterFence = body.slice(body.indexOf(fenceMatch[0]) + fenceMatch[0].length);
  const afterLines = afterFence.split("\n");

  const whenToUseMatch = beforeFence.match(/\*\*When to use:\*\*\s*(.+)/);
  const needMatch = beforeFence.match(/\*\*You'll need:\*\*\s*(.+)/);
  const categoryMatch = beforeFence.match(/\*\*Category:\*\*\s*(.+)/);
  const subcategoryMatch = beforeFence.match(/\*\*Subcategory:\*\*\s*(.+)/);
  const tagsMatch = beforeFence.match(/\*\*Tags:\*\*\s*(.+)/);
  const technologiesMatch = beforeFence.match(/\*\*Technologies:\*\*\s*(.+)/);
  const testingTypeMatch = beforeFence.match(/\*\*Testing type:\*\*\s*(.+)/i);
  const difficultyMatch = beforeFence.match(/\*\*Difficulty:\*\*\s*(.+)/);
  const qualityMatch = beforeFence.match(/\*\*Quality:\*\*\s*(\d+)/);
  const timeSavedMatch = beforeFence.match(/\*\*Time saved:\*\*\s*(.+)/);
  const outputMatch = beforeFence.match(/\*\*Output:\*\*\s*(.+)/);
  const lastUpdatedMatch = beforeFence.match(/\*\*Last updated:\*\*\s*(.+)/);

  if (!categoryMatch) {
    return { id: section.id, card: null };
  }
  const categoryLabel = stripInlineMarkdown(categoryMatch[1]);
  const categorySlug = LABEL_TO_SLUG.get(categoryLabel);
  if (!categorySlug) {
    throw new Error(`Card ${section.id} has unrecognized **Category:** "${categoryLabel}"`);
  }

  let difficulty = difficultyMatch ? stripInlineMarkdown(difficultyMatch[1]) : null;
  if (difficulty && !DIFFICULTIES.includes(difficulty)) {
    throw new Error(`Card ${section.id} has invalid **Difficulty:** "${difficulty}"`);
  }
  if (!difficulty) {
    console.warn(`Card ${section.id} missing **Difficulty:** — defaulting to "Intermediate"`);
    difficulty = "Intermediate";
  }

  let qualityScore = qualityMatch ? Number(qualityMatch[1]) : null;
  if (!qualityScore || qualityScore < 1 || qualityScore > 5) {
    if (qualityMatch) console.warn(`Card ${section.id} has invalid **Quality:** — defaulting to 3`);
    qualityScore = 3;
  }

  // Variables: `- \`TOKEN\` — label [attrs]` lines following a **Variables:**
  // marker, parsed from beforeFence (metadata front-matter), not the prompt
  // body. Optional trailing attribute block: space-separated `type=X`,
  // `options=A,B,C`, and/or the bare presence-only flag `required` (no
  // value). Split points are recognized only immediately before one of
  // those three patterns, so free-text labels are safe as long as they
  // don't happen to contain a literal "type=", "options=", or the standalone
  // word "required".
  const ATTR_SPLIT_RE = /\s+(?=(?:type=|options=|required\b))/;
  const variables = [];
  let inVariables = false;
  for (const line of beforeFence.split("\n")) {
    const trimmed = line.trim();
    if (/^\*\*Variables:\*\*/.test(trimmed)) {
      inVariables = true;
      continue;
    }
    if (inVariables) {
      const itemMatch = trimmed.match(/^-\s*`([^`]+)`\s*—\s*(.+)$/);
      if (itemMatch) {
        const token = itemMatch[1];
        const parts = itemMatch[2].split(ATTR_SPLIT_RE);
        const label = stripInlineMarkdown(parts[0]);
        const variable = { token, label };
        for (const part of parts.slice(1)) {
          if (part === "required" || part.startsWith("required=")) {
            variable.required = true;
            continue;
          }
          const attrMatch = part.match(/^(type|options)=(.+)$/);
          if (!attrMatch) continue;
          const [, key, value] = attrMatch;
          if (key === "type") variable.type = value;
          else if (key === "options") variable.options = value.split(",").map((s) => s.trim()).filter(Boolean);
        }
        if (variable.type && !VARIABLE_TYPES.includes(variable.type)) {
          throw new Error(`Card ${section.id} variable ${token} has invalid type "${variable.type}"`);
        }
        if (OPTIONS_TYPES.has(variable.type) && (!variable.options || variable.options.length === 0)) {
          throw new Error(`Card ${section.id} variable ${token} has type "${variable.type}" but no options`);
        }
        if (variable.options && !OPTIONS_TYPES.has(variable.type)) {
          throw new Error(`Card ${section.id} variable ${token} has options but type "${variable.type || "text"}" doesn't use them`);
        }
        if (variable.type === "textarea") variable.multiline = true;
        variables.push(variable);
      } else if (trimmed !== "") {
        inVariables = false;
      }
    }
  }

  // Optional short/expert prompt variants — sibling fenced blocks after the
  // main prompt fence, before warnings/follow-ups. Absent → undefined (not
  // empty string) so the UI's `card.promptExpert ?? card.prompt` fallback
  // stays clean.
  const shortMatch = afterFence.match(/\*\*Short version:\*\*\s*\n```\n([\s\S]*?)\n```/);
  const expertMatch = afterFence.match(/\*\*Expert version:\*\*\s*\n```\n([\s\S]*?)\n```/);
  const promptShort = shortMatch ? shortMatch[1] : undefined;
  const promptExpert = expertMatch ? expertMatch[1] : undefined;

  // Warnings: group consecutive non-blank lines starting from a ⚠️ line into
  // one paragraph; a blank line separates distinct warnings.
  const warnings = [];
  let current = null;
  for (const line of afterLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("⚠️")) {
      current = [trimmed];
      warnings.push(current);
    } else if (current && trimmed !== "" && !trimmed.startsWith("**Follow-up") && !trimmed.startsWith("-") && trimmed !== "---") {
      current.push(trimmed);
    } else if (trimmed === "" || trimmed.startsWith("**Follow-up") || trimmed === "---") {
      current = null;
    }
  }
  const warningTexts = warnings.map((paraLines) =>
    stripInlineMarkdown(stripLeadingWarningIcons(paraLines.join(" ")))
  );

  // Follow-ups: `- \`...\`` list items following a **Follow-up** line.
  const followUps = [];
  let inFollowUps = false;
  for (const line of afterLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("**Follow-up")) {
      inFollowUps = true;
      continue;
    }
    if (inFollowUps) {
      if (trimmed === "---" || (trimmed === "" && followUps.length > 0)) break;
      const itemMatch = trimmed.match(/^-\s*`(.+)`$/);
      if (itemMatch) followUps.push(itemMatch[1]);
    }
  }

  const card = {
    id: section.id,
    category: categorySlug,
    subcategory: subcategoryMatch ? stripInlineMarkdown(subcategoryMatch[1]) : section.title,
    title: section.title,
    description: whenToUseMatch ? whenToUseMatch[1].trim() : "",
    whenToUse: whenToUseMatch ? whenToUseMatch[1].trim() : "",
    inputsNeeded: needMatch
      ? needMatch[1].split(" + ").map((s) => stripInlineMarkdown(s.trim())).filter(Boolean)
      : [],
    tags: splitList(tagsMatch ? tagsMatch[1] : ""),
    technologies: splitList(technologiesMatch ? technologiesMatch[1] : ""),
    testingType: splitList(testingTypeMatch ? testingTypeMatch[1] : "Manual"),
    difficulty,
    qualityScore,
    estimatedTimeSaved: timeSavedMatch ? stripInlineMarkdown(timeSavedMatch[1]) : "—",
    outputFormat: outputMatch ? stripInlineMarkdown(outputMatch[1]) : "Markdown",
    lastUpdated: lastUpdatedMatch ? lastUpdatedMatch[1].trim() : "2026-07-22",
    variables,
    prompt,
    ...(promptShort !== undefined ? { promptShort } : {}),
    ...(promptExpert !== undefined ? { promptExpert } : {}),
    warnings: warningTexts,
    followUps,
    featured: section.starred,
  };

  return { id: section.id, card };
}

function writeOutput(cards) {
  const banner = `// GENERATED — do not edit by hand.
// Source: QA-Deck-Prompt-Library.md (repo root)
// Regenerate: node scripts/generate-prompt-library.mjs (run from website/)
//
// Cards are included automatically once they have a **Category:** line in
// the source doc resolving to one of the 12 categories below. To add a new
// prompt: write it in the .md following the existing card shape, then
// regenerate — no changes needed here or in any component.
`;

  const categoryOrderLiteral = CATEGORY_ORDER.map((c) => `"${c.slug}"`).join(", ");
  const categoryLabelsLiteral = CATEGORY_ORDER.map((c) => `  "${c.slug}": "${c.label}",`).join("\n");
  const categoryTypeLiteral = CATEGORY_ORDER.map((c) => `"${c.slug}"`).join(" | ");

  const ts = `${banner}
export type PromptCategory = ${categoryTypeLiteral};

export const PROMPT_CATEGORY_ORDER: readonly PromptCategory[] = [${categoryOrderLiteral}];

export const PROMPT_CATEGORY_LABELS: Record<PromptCategory, string> = {
${categoryLabelsLiteral}
};

export type Difficulty = "Beginner" | "Intermediate" | "Advanced" | "Senior QA";

export type TestingType =
  | "AI" | "Manual" | "Automation" | "Backend" | "Frontend"
  | "API" | "Database" | "Security" | "Performance";

export type PromptVariableType =
  | "text" | "textarea" | "select" | "checkbox" | "radio"
  | "date" | "number" | "multiselect" | "tag";

export interface PromptVariable {
  /** Must exactly match a {{TOKEN}} substring in this card's \`prompt\`. */
  token: string;
  label: string;
  placeholder?: string;
  /** Defaults to "text" when omitted. */
  type?: PromptVariableType;
  required?: boolean;
  /** Only present (and only meaningful) for select/radio/multiselect. */
  options?: string[];
  multiline?: boolean;
}

export interface PromptCard {
  id: string;
  category: PromptCategory;
  /** Open-ended — new topics need zero code changes, only new .md content. */
  subcategory: string;
  title: string;
  description: string;
  whenToUse: string;
  inputsNeeded: string[];
  tags: string[];
  technologies: string[];
  testingType: TestingType[];
  difficulty: Difficulty;
  qualityScore: 1 | 2 | 3 | 4 | 5;
  estimatedTimeSaved: string;
  outputFormat: string;
  /** "YYYY-MM-DD" */
  lastUpdated: string;
  /** Curated allowlist of fillable {{TOKEN}}s — see prompt-template-engine.tsx for why this isn't auto-inferred from the prompt text. */
  variables: PromptVariable[];
  prompt: string;
  /** Optional hand-authored length variants. Absent on most cards — callers should fall back to \`prompt\`. */
  promptShort?: string;
  promptExpert?: string;
  warnings: string[];
  followUps: string[];
  /** Doc's own ⭐ — "highest-ROI in the library", not a per-PR scope flag. */
  featured: boolean;
}

export const PROMPT_CARDS: PromptCard[] = ${JSON.stringify(cards, null, 2)};
`;

  writeFileSync(OUTPUT_TS, ts, "utf8");
}

main();

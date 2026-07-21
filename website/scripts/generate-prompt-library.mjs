#!/usr/bin/env node
// Parses ../../QA-Deck-Prompt-Library.md into website/lib/prompt-library.ts.
//
// Run: node scripts/generate-prompt-library.mjs   (from website/)
//
// Why a parser instead of hand-typing the data: the prompt text is precisely
// worded and the constraint lines are load-bearing — a dropped rule silently
// degrades output quality. This guarantees the generated `prompt` field is
// byte-identical to the fenced block in the source doc.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_MD = path.join(__dirname, "..", "..", "QA-Deck-Prompt-Library.md");
const OUTPUT_TS = path.join(__dirname, "..", "lib", "prompt-library.ts");

// Cards to include in the generated output. Extend this list (or drop it
// entirely to include all parsed cards) to bring in more cards later — the
// parser itself always extracts every card in the doc, so widening this list
// requires no other changes.
const INCLUDED_IDS = ["A1", "A2", "B2", "B7", "B8", "C2", "C4", "D1", "D6", "E5", "F1", "F3"];

const CATEGORY_MAP = {
  A: { slug: "requirements", label: "Requirements & Planning" },
  B: { slug: "test-design", label: "Test Design" },
  C: { slug: "execution-defects", label: "Execution & Defects" },
  D: { slug: "automation", label: "Automation" },
  E: { slug: "specialized-testing", label: "Specialized Testing" },
  F: { slug: "reporting-closure", label: "Reporting & Closure" },
  G: { slug: "learning-career", label: "Learning & Career" },
};

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

function main() {
  const raw = readFileSync(SOURCE_MD, "utf8");
  const lines = raw.split("\n");

  let currentCategory = null;
  const sections = []; // { id, title, starred, categorySlug, categoryLabel, bodyLines }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const catMatch = line.match(/^# ([A-G])\. (.+)$/);
    if (catMatch) {
      const letter = catMatch[1];
      currentCategory = CATEGORY_MAP[letter];
      continue;
    }

    const cardMatch = line.match(/^## ([A-G]\d+) · (.+?)(\s*⭐)?$/);
    if (cardMatch) {
      const [, id, title, starMark] = cardMatch;
      sections.push({
        id,
        title: title.trim(),
        starred: Boolean(starMark),
        categorySlug: currentCategory?.slug ?? null,
        categoryLabel: currentCategory?.label ?? null,
        bodyLines: [],
      });
      continue;
    }

    if (sections.length > 0) {
      sections[sections.length - 1].bodyLines.push(line);
    }
  }

  const cards = sections.map((section) => parseCard(section)).filter(Boolean);

  const missing = INCLUDED_IDS.filter((id) => !cards.some((c) => c.id === id));
  if (missing.length) {
    throw new Error(`INCLUDED_IDS references cards not found in the source doc: ${missing.join(", ")}`);
  }

  const finalCards = cards.filter((c) => INCLUDED_IDS.includes(c.id));
  // Preserve INCLUDED_IDS order for a predictable, reviewable diff.
  finalCards.sort((a, b) => INCLUDED_IDS.indexOf(a.id) - INCLUDED_IDS.indexOf(b.id));

  writeOutput(finalCards);
  console.log(`Parsed ${cards.length} cards from source doc; wrote ${finalCards.length} to ${path.relative(process.cwd(), OUTPUT_TS)}`);
  for (const c of finalCards) {
    console.log(`  ${c.id} — inputsNeeded: ${JSON.stringify(c.inputsNeeded)} — warnings: ${c.warnings.length} — followUps: ${c.followUps.length} — featured: ${c.featured}`);
  }
}

function parseCard(section) {
  const body = section.bodyLines.join("\n");

  const whenToUseMatch = body.match(/\*\*When to use:\*\*\s*(.+)/);
  const needMatch = body.match(/\*\*You'll need:\*\*\s*(.+)/);

  const fenceMatch = body.match(/```\n([\s\S]*?)\n```/);
  if (!fenceMatch) {
    throw new Error(`Card ${section.id} has no fenced prompt block`);
  }
  const prompt = fenceMatch[1]; // verbatim — do not trim/alter

  // Only look at content AFTER the closing fence for warnings/follow-ups,
  // so nothing inside the prompt block itself is misread as either.
  const afterFence = body.slice(body.indexOf(fenceMatch[0]) + fenceMatch[0].length);
  const afterLines = afterFence.split("\n");

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

  if (!section.categorySlug) {
    throw new Error(`Card ${section.id} has no preceding category header`);
  }

  return {
    id: section.id,
    category: section.categorySlug,
    title: section.title,
    whenToUse: whenToUseMatch ? whenToUseMatch[1].trim() : "",
    inputsNeeded: needMatch
      ? needMatch[1].split(" + ").map((s) => stripInlineMarkdown(s.trim())).filter(Boolean)
      : [],
    prompt,
    warnings: warningTexts,
    followUps,
    featured: section.starred,
  };
}

function writeOutput(cards) {
  const banner = `// GENERATED — do not edit by hand.
// Source: QA-Deck-Prompt-Library.md (repo root)
// Regenerate: node scripts/generate-prompt-library.mjs (run from website/)
//
// The remaining cards in the source doc are not yet included — see
// INCLUDED_IDS in scripts/generate-prompt-library.mjs to add more.
`;

  const categoryEntries = Object.values(CATEGORY_MAP);
  const categoryOrderLiteral = categoryEntries.map((c) => `"${c.slug}"`).join(", ");
  const categoryLabelsLiteral = categoryEntries
    .map((c) => `  "${c.slug}": "${c.label}",`)
    .join("\n");
  const categoryTypeLiteral = categoryEntries.map((c) => `"${c.slug}"`).join(" | ");

  const ts = `${banner}
export type PromptCategory = ${categoryTypeLiteral};

export const PROMPT_CATEGORY_ORDER: readonly PromptCategory[] = [${categoryOrderLiteral}];

export const PROMPT_CATEGORY_LABELS: Record<PromptCategory, string> = {
${categoryLabelsLiteral}
};

export interface PromptCard {
  id: string;
  category: PromptCategory;
  title: string;
  whenToUse: string;
  inputsNeeded: string[];
  prompt: string;
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

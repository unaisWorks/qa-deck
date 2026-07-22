import type { PromptCard } from "@/lib/prompt-library";

export function exportMarkdown(card: PromptCard, substitutedPrompt: string): string {
  return `# ${card.title}\n\n${substitutedPrompt}\n`;
}

export function exportTxt(substitutedPrompt: string): string {
  return substitutedPrompt;
}

export function exportJson(card: PromptCard, values: Record<string, string>, substitutedPrompt: string): string {
  return JSON.stringify({ id: card.id, title: card.title, values, prompt: substitutedPrompt }, null, 2);
}

export function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function downloadPrompt(card: PromptCard, format: "markdown" | "txt" | "json", values: Record<string, string>, substitutedPrompt: string): void {
  const base = slugify(card.title);
  if (format === "markdown") downloadBlob(`${base}.md`, exportMarkdown(card, substitutedPrompt), "text/markdown");
  else if (format === "txt") downloadBlob(`${base}.txt`, exportTxt(substitutedPrompt), "text/plain");
  else downloadBlob(`${base}.json`, exportJson(card, values, substitutedPrompt), "application/json");
}

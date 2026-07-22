import type { PromptVariable } from "@/lib/prompt-library";

export const TOKEN_RE = /(\{\{[^{}]+\}\})/g;

export function tokenName(token: string): string {
  return token.slice(2, -2);
}

// Substitutes only tokens explicitly declared in `variables` with a
// non-empty filled value. Every other {{TOKEN}} — including declared-but-
// unfilled and non-declared instruction/option tokens like {{VERIFY_VERSION}}
// or {{Java / Python / JS / C#}} — passes through unchanged. Used for the
// text actually placed on the clipboard, exported, or shared.
export function substitutePrompt(prompt: string, variables: PromptVariable[], values: Record<string, string>): string {
  const declared = new Set(variables.map((v) => v.token));
  return prompt.replace(TOKEN_RE, (match) => {
    const name = tokenName(match);
    if (!declared.has(name)) return match;
    const value = values[name]?.trim();
    return value ? value : match;
  });
}

// Same substitution, but as highlighted JSX for a live preview: filled
// variables render as plain substituted text, everything else keeps the
// green-highlight treatment — including declared-but-unfilled variables, so
// the preview looks identical to the plain prompt until the user types.
export function renderPromptWithPlaceholders(prompt: string, variables: PromptVariable[], values: Record<string, string>) {
  const declared = new Set(variables.map((v) => v.token));
  const parts = prompt.split(TOKEN_RE);
  return parts.map((part, i) => {
    if (part.startsWith("{{") && part.endsWith("}}")) {
      const name = tokenName(part);
      const value = declared.has(name) ? values[name]?.trim() : undefined;
      if (value) {
        return (
          <span key={i} className="text-white bg-white/10 rounded px-0.5">
            {value}
          </span>
        );
      }
      return (
        <span key={i} className="text-green bg-green/10 rounded px-0.5">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

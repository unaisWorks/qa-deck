// Lightweight, fully static per-target framing adjustment — NOT a real
// per-model rewrite and NOT an AI call. Each mode just wraps the same
// substituted prompt with an optional preamble/suffix line. Any UI exposing
// this must say so plainly — see PromptRunDrawer's mode selector copy.
export type OutputMode = "chatgpt" | "claude" | "gemini" | "cursor" | "copilot" | "deepseek";

export interface OutputModeConfig {
  label: string;
  preamble?: string;
  suffix?: string;
}

export const OUTPUT_MODES: Record<OutputMode, OutputModeConfig> = {
  chatgpt: {
    label: "ChatGPT",
    preamble: "Follow the instructions below exactly.",
  },
  claude: {
    label: "Claude",
    preamble: "Be direct and concrete — skip preamble, get straight to the output.",
  },
  gemini: {
    label: "Gemini",
  },
  cursor: {
    label: "Cursor",
    preamble: "Use the current codebase as context where relevant.",
  },
  copilot: {
    label: "Copilot",
    suffix: "Keep the response inline-editor friendly — code first, explanation after.",
  },
  deepseek: {
    label: "DeepSeek",
  },
};

export const OUTPUT_MODE_ORDER: readonly OutputMode[] = ["chatgpt", "claude", "gemini", "cursor", "copilot", "deepseek"];

export const DEFAULT_OUTPUT_MODE: OutputMode = "chatgpt";

export function applyOutputMode(prompt: string, mode: OutputMode): string {
  const cfg = OUTPUT_MODES[mode];
  const pre = cfg.preamble ? `${cfg.preamble}\n\n` : "";
  const suf = cfg.suffix ? `\n\n${cfg.suffix}` : "";
  return `${pre}${prompt}${suf}`;
}

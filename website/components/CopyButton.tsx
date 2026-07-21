"use client";

import { useState } from "react";

interface CopyButtonProps {
  /** Exact text placed on the clipboard, verbatim — callers must not pre-process it. */
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  resetMs?: number;
}

const DEFAULT_CLASS =
  "px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 text-white/50 hover:text-white text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green/60";

/**
 * Shared copy-to-clipboard button with "Copied" confirmation feedback.
 * Extracted from three hand-duplicated inline instances in the projects
 * dashboard (script file copy, test case copy, locator copy) — this feature
 * adds a dozen+ more copy buttons (prompt block + every follow-up), so the
 * duplication was worth collapsing now.
 */
export default function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "✓ Copied",
  className = DEFAULT_CLASS,
  resetMs = 1500,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API unavailable (non-secure context, permissions) — no-op.
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), resetMs);
  }

  return (
    <button type="button" onClick={handleCopy} className={className} aria-live="polite">
      {copied ? copiedLabel : label}
    </button>
  );
}

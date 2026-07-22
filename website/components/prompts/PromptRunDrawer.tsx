"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PromptCard } from "@/lib/prompt-library";
import { PROMPT_CATEGORY_LABELS } from "@/lib/prompt-library";
import { categoryBadgeClass } from "@/lib/prompt-category-colors";
import { substitutePrompt, renderPromptWithPlaceholders } from "@/lib/prompt-template-engine";
import { renderMarkdownLite } from "@/lib/prompt-markdown-lite";
import { OUTPUT_MODES, OUTPUT_MODE_ORDER, DEFAULT_OUTPUT_MODE, applyOutputMode, type OutputMode } from "@/lib/prompt-output-modes";
import { matchGlobalKey } from "@/lib/prompt-global-variable-aliases";
import { downloadPrompt } from "@/lib/prompt-export";
import { buildShareUrl } from "@/lib/prompt-share-url";
import type { TemplateEntry } from "@/lib/use-prompt-local-state";
import { ToggleGroup } from "@/components/ToggleGroup";
import PromptVariableField from "@/components/prompts/PromptVariableField";
import CopyButton from "@/components/CopyButton";

type Length = "short" | "detailed" | "expert";
type PreviewMode = "rendered" | "raw";

interface PromptRunDrawerProps {
  card: PromptCard | null;
  open: boolean;
  onClose: () => void;
  globalVariables: Record<string, string>;
  onSetGlobalVariable: (key: string, value: string) => void;
  templates: TemplateEntry[];
  onSaveTemplate: (name: string, values: Record<string, string>) => void;
  onDeleteTemplate: (templateId: string) => void;
  onCopySuccess: (values: Record<string, string>) => void;
  initialValues?: Record<string, string>;
}

function resolveInitialValues(card: PromptCard, globalVariables: Record<string, string>, initialValues?: Record<string, string>) {
  if (initialValues) return initialValues;
  const values: Record<string, string> = {};
  for (const v of card.variables) {
    const key = matchGlobalKey(v.token);
    if (key && globalVariables[key]) values[v.token] = globalVariables[key];
  }
  return values;
}

export default function PromptRunDrawer({
  card,
  open,
  onClose,
  globalVariables,
  onSetGlobalVariable,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  onCopySuccess,
  initialValues,
}: PromptRunDrawerProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [length, setLength] = useState<Length>("detailed");
  const [outputMode, setOutputMode] = useState<OutputMode>(DEFAULT_OUTPUT_MODE);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("rendered");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // The parent clears `card` to null the instant it closes the drawer, but
  // the slide-out transition needs something to render while it animates
  // off-screen. Caching the last non-null card (read/write during render is
  // safe for this specific "remember previous prop" idiom) keeps content
  // visible through the close transition without ever needing to reset it.
  const lastCardRef = useRef<PromptCard | null>(null);
  if (card) lastCardRef.current = card;
  const displayCard = card ?? lastCardRef.current;

  // Reset per-card UI state and resolve starting values (share/history
  // payload, else global-variable prefill, else blank) whenever a new card
  // is opened.
  useEffect(() => {
    if (!card || !open) return;
    setValues(resolveInitialValues(card, globalVariables, initialValues));
    setLength("detailed");
    setOutputMode(DEFAULT_OUTPUT_MODE);
    setErrors({});
    setTemplateName("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, open]);

  // Focus management: move focus into the drawer on open, restore it to
  // whatever triggered the open once closed.
  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      drawerRef.current?.focus();
    } else {
      previouslyFocused.current?.focus?.();
    }
  }, [open]);

  const basePrompt = useMemo(() => {
    if (!displayCard) return "";
    if (length === "short") return displayCard.promptShort ?? displayCard.prompt;
    if (length === "expert") return displayCard.promptExpert ?? displayCard.prompt;
    return displayCard.prompt;
  }, [displayCard, length]);

  const lengthFallback =
    displayCard && length === "short" && !displayCard.promptShort
      ? "No short version authored for this card yet — showing the standard prompt."
      : displayCard && length === "expert" && !displayCard.promptExpert
        ? "No expert version authored for this card yet — showing the standard prompt."
        : null;

  const substitutedBody = useMemo(
    () => (displayCard ? substitutePrompt(basePrompt, displayCard.variables, values) : ""),
    [displayCard, basePrompt, values]
  );
  const fullText = useMemo(() => applyOutputMode(substitutedBody, outputMode), [substitutedBody, outputMode]);
  const modeConfig = OUTPUT_MODES[outputMode];

  function handleValueChange(token: string, value: string) {
    setValues((v) => ({ ...v, [token]: value }));
    setErrors((e) => (e[token] ? { ...e, [token]: "" } : e));
    const globalKey = displayCard ? matchGlobalKey(token) : null;
    if (globalKey) onSetGlobalVariable(globalKey, value);
  }

  function validate(): boolean {
    if (!displayCard) return false;
    const nextErrors: Record<string, string> = {};
    for (const v of displayCard.variables) {
      if (v.required && !values[v.token]?.trim()) nextErrors[v.token] = `${v.label} required.`;
    }
    setErrors(nextErrors);
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      document.getElementById(fieldId(firstInvalid))?.focus();
      return false;
    }
    return true;
  }

  async function handleCopy() {
    if (!validate()) return;
    try {
      await navigator.clipboard.writeText(fullText);
    } catch {
      return;
    }
    onCopySuccess(values);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    if (!displayCard) return;
    setValues(resolveInitialValues(displayCard, globalVariables, undefined));
    setErrors({});
  }

  function handleUseTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (template) setValues(template.values);
  }

  function handleSaveTemplate() {
    if (!displayCard || !templateName.trim()) return;
    onSaveTemplate(templateName.trim(), values);
    setTemplateName("");
  }

  function fieldId(token: string) {
    return `run-drawer-field-${token}`;
  }

  // Drawer-scoped keyboard shortcuts, only attached while open.
  useEffect(() => {
    if (!open || !card) return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleCopy();
        return;
      }
      // Ctrl+C only (not Cmd+C) so Mac's native text-selection copy is never
      // hijacked; also skipped while focus is in a form field so normal
      // in-field copy/select still works.
      if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "c" && !isTyping) {
        handleCopy();
        return;
      }
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card, fullText, values]);

  if (!displayCard) return null;

  const isValid = displayCard.variables.every((v) => !v.required || values[v.token]?.trim());

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Run: ${displayCard.title}`}
        tabIndex={-1}
        className={`absolute bg-bg-card border-white/10 shadow-2xl flex flex-col outline-none
          inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t
          sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-auto sm:max-h-none sm:h-full sm:w-[440px] sm:rounded-t-none sm:rounded-l-2xl sm:border-l sm:border-t-0
          transition-transform duration-300
          ${open ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-y-0 sm:translate-x-full"}`}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/8 shrink-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h2 className="font-semibold text-white text-base leading-snug">{displayCard.title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 text-white/40 hover:text-white p-1 -m-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-green/60"
            >
              &#10005;
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${categoryBadgeClass(displayCard.category)}`}>
              {PROMPT_CATEGORY_LABELS[displayCard.category]}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 text-white/50">{displayCard.difficulty}</span>
            <span className="text-xs text-white/40">⏱ {displayCard.estimatedTimeSaved}</span>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-sm text-white/60 leading-relaxed">{displayCard.description}</p>

          {templates.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => e.target.value && handleUseTemplate(e.target.value)}
                defaultValue=""
                className="flex-1 bg-white/5 border border-border rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-green"
              >
                <option value="" className="bg-bg-card">Use a saved template...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id} className="bg-bg-card">
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {displayCard.variables.length > 0 && (
            <div className="space-y-3">
              {displayCard.variables.map((variable) => (
                <PromptVariableField
                  key={variable.token}
                  variable={variable}
                  value={values[variable.token] ?? ""}
                  onChange={(value) => handleValueChange(variable.token, value)}
                  error={errors[variable.token]}
                  id={fieldId(variable.token)}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name..."
              className="flex-1 bg-white/5 border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-green"
            />
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={!templateName.trim()}
              className="shrink-0 px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 text-white/60 hover:text-white text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save as template
            </button>
          </div>
          {templates.length > 0 && (
            <div className="flex flex-wrap gap-1.5 -mt-2">
              {templates.map((t) => (
                <span key={t.id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-white/8 text-white/40">
                  {t.name}
                  <button type="button" onClick={() => onDeleteTemplate(t.id)} aria-label={`Delete template ${t.name}`} className="hover:text-red-300">
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="border-t border-white/8 pt-3.5 space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/35 mb-1.5">Length</div>
              <ToggleGroup
                value={length}
                onChange={setLength}
                options={[
                  { value: "short", label: "Short" },
                  { value: "detailed", label: "Detailed" },
                  { value: "expert", label: "Expert" },
                ]}
              />
              {lengthFallback && <p className="text-[10px] text-white/35 mt-1.5">{lengthFallback}</p>}
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/35 mb-1.5">Output for</div>
              <select
                value={outputMode}
                onChange={(e) => setOutputMode(e.target.value as OutputMode)}
                className="bg-white/5 border border-border rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-green"
              >
                {OUTPUT_MODE_ORDER.map((mode) => (
                  <option key={mode} value={mode} className="bg-bg-card">
                    {OUTPUT_MODES[mode].label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-white/35 mt-1.5">
                Lightweight framing adjustment only — not a full per-model rewrite.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] uppercase tracking-wide text-white/35">Generated prompt</div>
                <ToggleGroup
                  value={previewMode}
                  onChange={setPreviewMode}
                  options={[
                    { value: "rendered", label: "Rendered" },
                    { value: "raw", label: "Raw" },
                  ]}
                />
              </div>
              <div className="code-block whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-3.5 text-white/80 text-sm max-h-72 overflow-y-auto">
                {previewMode === "raw" ? (
                  <>
                    {modeConfig.preamble && <p className="text-white/50 italic mb-2">{modeConfig.preamble}</p>}
                    {renderPromptWithPlaceholders(basePrompt, displayCard.variables, values)}
                    {modeConfig.suffix && <p className="text-white/50 italic mt-2">{modeConfig.suffix}</p>}
                  </>
                ) : (
                  renderMarkdownLite(fullText)
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs">
              <button
                type="button"
                onClick={() => displayCard && downloadPrompt(displayCard, "markdown", values, fullText)}
                className="px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white transition-colors"
              >
                Export .md
              </button>
              <button
                type="button"
                onClick={() => displayCard && downloadPrompt(displayCard, "txt", values, fullText)}
                className="px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white transition-colors"
              >
                Export .txt
              </button>
              <button
                type="button"
                onClick={() => displayCard && downloadPrompt(displayCard, "json", values, fullText)}
                className="px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white transition-colors"
              >
                Export .json
              </button>
              <CopyButton
                text={buildShareUrl(displayCard.id, values)}
                label="Share link"
                copiedLabel="✓ Link copied"
                className="px-2.5 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Action row */}
        <div className="px-5 py-4 border-t border-white/8 shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              isValid ? "bg-green text-white hover:bg-green/80" : "bg-white/10 text-white/50 hover:bg-white/15"
            }`}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white text-sm transition-colors"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white text-sm transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

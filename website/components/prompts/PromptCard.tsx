"use client";

import { useId, useState } from "react";
import type { PromptCard as PromptCardData } from "@/lib/prompt-library";
import { PROMPT_CATEGORY_LABELS } from "@/lib/prompt-library";
import { categoryBadgeClass } from "@/lib/prompt-category-colors";
import { renderPromptWithPlaceholders } from "@/lib/prompt-template-engine";
import { buildShareUrl } from "@/lib/prompt-share-url";
import CopyButton from "@/components/CopyButton";

const NO_VALUES: Record<string, string> = {};

function QualityStars({ score }: { score: number }) {
  return (
    <span className="text-amber-300 text-xs tracking-tight" aria-label={`Quality score: ${score} out of 5`}>
      {"★".repeat(score)}
      <span className="text-white/20">{"★".repeat(5 - score)}</span>
    </span>
  );
}

interface PromptCardProps {
  card: PromptCardData;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  usageCount: number;
  hydrated: boolean;
  onRecordUsage: () => void;
  onOpenDrawer: () => void;
}

export default function PromptCard({ card, isFavorite, onToggleFavorite, usageCount, hydrated, onRecordUsage, onOpenDrawer }: PromptCardProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const hasWarnings = card.warnings.length > 0;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] hover:border-white/15 transition-colors">
      <div className="flex items-start gap-1 px-4 pt-3.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="flex-1 min-w-0 text-left flex items-start gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-green/60 rounded-xl"
        >
          <span
            className={`text-white/25 text-[10px] mt-1.5 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            &#9654;
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-medium text-white text-sm">{card.title}</span>
              {card.featured && (
                <span
                  className="text-amber-300 text-xs"
                  title="Highest-ROI card in the library"
                  aria-label="Featured: highest-ROI card in the library"
                >
                  &#9733;
                </span>
              )}
              {hasWarnings && (
                <span
                  className="text-amber-300 text-xs"
                  title="This card has an important warning"
                  aria-label="This card has an important warning"
                >
                  &#9888;
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${categoryBadgeClass(card.category)}`}>
                {PROMPT_CATEGORY_LABELS[card.category]}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 text-white/50">
                {card.difficulty}
              </span>
              <QualityStars score={card.qualityScore} />
              <span className="text-xs text-white/40">⏱ {card.estimatedTimeSaved}</span>
            </div>
            <p className="text-xs text-white/50 truncate mt-1">{card.description}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={isFavorite}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          className="shrink-0 p-1.5 rounded-lg text-white/30 hover:text-amber-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green/60"
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </div>

      <div className="px-4 pb-3.5 pt-1 flex items-center gap-2 flex-wrap">
        {card.tags.slice(0, 4).map((tag) => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded border border-white/8 text-white/40">
            {tag}
          </span>
        ))}
        {hydrated && usageCount > 0 && (
          <span className="text-[10px] text-white/30 ml-auto">used {usageCount}×</span>
        )}
      </div>

      {expanded && (
        <div id={bodyId} className="px-4 pb-4 border-t border-white/6 pt-3.5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/35 mb-1">When to use</div>
              <p className="text-sm text-white/70 leading-relaxed">{card.whenToUse}</p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/35 mb-1">You&apos;ll need</div>
              <ul className="text-sm text-white/70 leading-relaxed list-disc list-inside">
                {card.inputsNeeded.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {(card.technologies.length > 0 || card.outputFormat) && (
            <div className="flex items-center gap-2 flex-wrap text-xs text-white/40">
              {card.technologies.length > 0 && <span>{card.technologies.join(" · ")}</span>}
              {card.technologies.length > 0 && card.outputFormat && <span aria-hidden="true">—</span>}
              {card.outputFormat && <span>Output: {card.outputFormat}</span>}
              <span className="ml-auto">Updated {card.lastUpdated}</span>
            </div>
          )}

          {hasWarnings && (
            <div className="space-y-2">
              {card.warnings.map((warning, i) => (
                <div
                  key={i}
                  className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200 leading-relaxed"
                  role="note"
                >
                  <span aria-hidden="true">&#9888;</span>
                  <p>{warning}</p>
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <div className="text-[10px] uppercase tracking-wide text-white/35">Prompt</div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenDrawer}
                  className="px-3 py-1.5 rounded-xl bg-green text-white text-xs font-semibold hover:bg-green/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green/60"
                >
                  Run prompt
                </button>
                <CopyButton text={card.prompt} label="Copy prompt" onCopy={onRecordUsage} />
                <CopyButton
                  text={buildShareUrl(card.id, NO_VALUES)}
                  label="Share"
                  copiedLabel="✓ Link copied"
                  className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 text-white/50 hover:text-white text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green/60"
                />
              </div>
            </div>
            <pre className="code-block whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/30 p-3.5 text-white/80 max-h-96 overflow-y-auto">
              {renderPromptWithPlaceholders(card.prompt, card.variables, NO_VALUES)}
            </pre>
          </div>

          {card.followUps.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-white/35 mb-1.5">Follow-ups</div>
              <div className="space-y-1.5">
                {card.followUps.map((followUp, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2"
                  >
                    <p className="text-sm text-white/65 leading-relaxed flex-1">{followUp}</p>
                    <CopyButton
                      text={followUp}
                      label="Copy"
                      className="shrink-0 px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 text-white/50 hover:text-white text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green/60"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

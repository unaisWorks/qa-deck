"use client";

import { GLOBAL_VARIABLE_ORDER, GLOBAL_VARIABLE_LABELS } from "@/lib/prompt-global-variable-aliases";

interface PromptSettingsModalProps {
  open: boolean;
  onClose: () => void;
  globalVariables: Record<string, string>;
  onSetGlobalVariable: (key: string, value: string) => void;
  onClearAll: () => void;
}

export default function PromptSettingsModal({ open, onClose, globalVariables, onSetGlobalVariable, onClearAll }: PromptSettingsModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-bg-card border border-border rounded-3xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Smart variables"
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-semibold text-white text-base">Smart Variables</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-white/40 hover:text-white p-1 -m-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-green/60"
          >
            &#10005;
          </button>
        </div>
        <p className="text-xs text-white/40 mb-4">
          Values you set here automatically fill any prompt variable that represents the same thing — e.g. Project Name
          fills every card that asks for one.
        </p>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {GLOBAL_VARIABLE_ORDER.map((key) => (
            <div key={key}>
              <label className="block text-xs text-white/50 mb-1" htmlFor={`settings-${key}`}>
                {GLOBAL_VARIABLE_LABELS[key]}
              </label>
              <input
                id={`settings-${key}`}
                type="text"
                value={globalVariables[key] ?? ""}
                onChange={(e) => onSetGlobalVariable(key, e.target.value)}
                className="w-full bg-white/5 border border-border rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-green"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/8">
          <button type="button" onClick={onClearAll} className="text-xs text-white/40 hover:text-red-300 transition-colors">
            Clear all
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-green text-white text-sm font-semibold hover:bg-green/80 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { PromptVariable } from "@/lib/prompt-library";

const INPUT_CLASS = "w-full bg-white/5 border border-border rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-green";
const INPUT_ERROR_CLASS = "w-full bg-white/5 border border-red-500/50 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-red-500";

interface PromptVariableFieldProps {
  variable: PromptVariable;
  /** For multiselect/tag: comma-joined. For checkbox: "true" or "". */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  id: string;
}

// The form-generator core: renders the correct control for a variable purely
// from its declared `type` — no hardcoded per-prompt form logic anywhere.
// Adding a new prompt with new variables never requires touching this file.
export default function PromptVariableField({ variable, value, onChange, error, id }: PromptVariableFieldProps) {
  const type = variable.type ?? "text";
  const inputClass = error ? INPUT_ERROR_CLASS : INPUT_CLASS;

  return (
    <div>
      <label className="block text-xs text-white/50 mb-1" htmlFor={id}>
        {variable.label}
        {variable.required && <span className="text-red-300"> *</span>}
      </label>
      <FieldControl variable={variable} type={type} value={value} onChange={onChange} id={id} inputClass={inputClass} />
      {error && <p className="text-red-300 text-xs mt-1">{error}</p>}
    </div>
  );
}

function FieldControl({
  variable,
  type,
  value,
  onChange,
  id,
  inputClass,
}: {
  variable: PromptVariable;
  type: NonNullable<PromptVariable["type"]>;
  value: string;
  onChange: (value: string) => void;
  id: string;
  inputClass: string;
}) {
  switch (type) {
    case "textarea":
      return (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={variable.placeholder}
          rows={3}
          className={`${inputClass} resize-y`}
        />
      );

    case "number":
      return (
        <input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={variable.placeholder}
          className={inputClass}
        />
      );

    case "date":
      return (
        <input
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );

    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
          <input
            id={id}
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "")}
            className="accent-green"
          />
          {variable.placeholder || "Yes"}
        </label>
      );

    case "radio":
      return (
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-labelledby={id}>
          {(variable.options ?? []).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
              <input
                type="radio"
                name={id}
                checked={value === option}
                onChange={() => onChange(option)}
                className="accent-green"
              />
              {option}
            </label>
          ))}
        </div>
      );

    case "select":
      return (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="" className="bg-bg-card">
            {variable.placeholder || "Select..."}
          </option>
          {(variable.options ?? []).map((option) => (
            <option key={option} value={option} className="bg-bg-card">
              {option}
            </option>
          ))}
        </select>
      );

    case "multiselect": {
      const selected = value ? value.split(",") : [];
      const toggle = (option: string) => {
        const next = selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option];
        onChange(next.join(","));
      };
      return (
        <div className="grid gap-1">
          {(variable.options ?? []).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
              <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} className="accent-green" />
              {option}
            </label>
          ))}
        </div>
      );
    }

    case "tag":
      return <TagInput id={id} value={value} onChange={onChange} placeholder={variable.placeholder} inputClass={inputClass} />;

    case "text":
    default:
      return (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={variable.placeholder}
          className={inputClass}
        />
      );
  }
}

function TagInput({
  id,
  value,
  onChange,
  placeholder,
  inputClass,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputClass: string;
}) {
  const [draft, setDraft] = useState("");
  const tags = value ? value.split(",") : [];

  function addTag() {
    const trimmed = draft.trim();
    if (!trimmed || tags.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...tags, trimmed].join(","));
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag).join(","));
  }

  return (
    <div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green/10 text-green border border-green/20">
              {tag}
              <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`} className="hover:text-white">
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag();
          }
        }}
        onBlur={addTag}
        placeholder={placeholder || "Type and press Enter"}
        className={inputClass}
      />
    </div>
  );
}

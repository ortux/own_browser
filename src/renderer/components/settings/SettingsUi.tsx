/**
 * SettingsUi.tsx — the control vocabulary shared by every settings page.
 *
 * The agent settings screens already established these primitives (Section,
 * Panel, Row, Switch, Select, Button, ConfirmDialog …). Rather than growing a
 * second, near-identical set for the browser pages, this module re-exports
 * them and adds only what the browser settings genuinely need: a slider, a
 * radio group, and an editable URL list.
 */

import React from 'react';
import { Check, ChevronDown, Pencil, Plus, Trash2, X } from 'lucide-react';
import { normalizeSettingsUrl } from '../../../shared/generalSettings';

export {
  Section,
  Panel,
  Row,
  Switch,
  Select,
  TextInput,
  NumberField,
  Button,
  SearchField,
  Callout,
  EmptyState,
  LoadingState,
  ConfirmDialog,
} from '../agent/AgentUi';

// ─── Slider ──────────────────────────────────────────────────────────────────

/**
 * A labelled range input. The current value is always shown next to it: a
 * slider whose value you cannot read is a guess, not a setting.
 */
export const Slider: React.FC<{
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  label: string;
  /** Rendered next to the handle, e.g. "16 px" or "Off". */
  format?: (value: number) => string;
}> = ({ value, onChange, min, max, step = 1, label, format }) => (
  <div className="flex w-56 items-center gap-3">
    <input
      type="range"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--surface-2)] accent-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
    />
    <span className="w-14 shrink-0 text-right text-[12.5px] tabular-nums text-[var(--text-muted)]">
      {format ? format(value) : value}
    </span>
  </div>
);

// ─── Radio group ─────────────────────────────────────────────────────────────

/**
 * Mutually exclusive choices, stacked. Implemented with real radio inputs so
 * arrow-key navigation and screen-reader grouping come for free.
 */
export function RadioGroup<T extends string>({
  value,
  onChange,
  options,
  label,
  name,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ id: T; label: string; description?: string }>;
  label: string;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col">
      {options.map((option) => {
        const checked = option.id === value;
        return (
          <label
            key={option.id}
            className="flex cursor-pointer items-start gap-3 border-b border-[var(--border)] px-4 py-3.5 last:border-b-0 hover:bg-[var(--hover)]"
          >
            <input
              type="radio"
              name={name}
              checked={checked}
              onChange={() => onChange(option.id)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span className="block text-[14px] leading-snug text-[var(--text)]">
                {option.label}
              </span>
              {option.description && (
                <span className="mt-1 block text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                  {option.description}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ─── Segmented control ───────────────────────────────────────────────────────

/** A compact inline choice, for two or three short options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ id: T; label: string; icon?: React.ElementType }>;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex gap-1 rounded-md bg-[var(--surface-2)] p-1"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] ${
              active
                ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {Icon && <Icon size={14} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── URL list editor ─────────────────────────────────────────────────────────

/**
 * Add / edit / remove a list of pages. Input is validated with the same
 * normaliser the store uses, so what is displayed is exactly what is stored.
 */
export const UrlListEditor: React.FC<{
  urls: string[];
  onAdd: (url: string) => boolean;
  onUpdate: (index: number, url: string) => boolean;
  onRemove: (index: number) => void;
  emptyLabel?: string;
}> = ({ urls, onAdd, onUpdate, onRemove, emptyLabel = 'No pages added yet.' }) => {
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState('');
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [editDraft, setEditDraft] = React.useState('');
  const [editError, setEditError] = React.useState('');

  const commitAdd = () => {
    if (!draft.trim()) return;
    if (!onAdd(draft)) {
      setError('Enter a valid web address, for example example.com or https://example.com');
      return;
    }
    setDraft('');
    setError('');
  };

  const commitEdit = (index: number) => {
    if (!onUpdate(index, editDraft)) {
      setEditError('Enter a valid web address.');
      return;
    }
    setEditingIndex(null);
    setEditError('');
  };

  return (
    <div className="w-full">
      {urls.length === 0 ? (
        <p className="px-4 py-3 text-[12.5px] text-[var(--text-muted)]">{emptyLabel}</p>
      ) : (
        <ul className="mb-2">
          {urls.map((url, index) => (
            <li
              key={`${url}-${index}`}
              className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5 last:border-b-0"
            >
              {editingIndex === index ? (
                <>
                  <input
                    autoFocus
                    aria-label="Edit page address"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(index);
                      if (e.key === 'Escape') setEditingIndex(null);
                    }}
                    className="min-w-0 flex-1 rounded-md bg-[var(--surface-2)] px-3 py-1.5 text-[13px] text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={() => commitEdit(index)}
                    aria-label="Save page"
                    className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingIndex(null)}
                    aria-label="Cancel editing"
                    className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                  >
                    <X size={15} />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">
                    {url}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingIndex(index);
                      setEditDraft(url);
                      setEditError('');
                    }}
                    aria-label={`Edit ${url}`}
                    className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    aria-label={`Remove ${url}`}
                    className="rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--danger)]"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {editError && (
        <p role="alert" className="px-4 pb-2 text-[12px] text-[var(--danger)]">
          {editError}
        </p>
      )}

      <div className="flex items-center gap-2 px-4 pb-3 pt-1">
        <input
          aria-label="Add a page"
          value={draft}
          placeholder="example.com"
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && commitAdd()}
          className={`min-w-0 flex-1 rounded-md bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:ring-2 ${
            error ? 'ring-2 ring-[var(--danger)]' : 'focus:ring-[var(--accent)]'
          }`}
        />
        <button
          type="button"
          onClick={commitAdd}
          disabled={!draft.trim() || !normalizeSettingsUrl(draft)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-2 text-[13px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={14} /> Add page
        </button>
      </div>
      {error && (
        <p role="alert" className="px-4 pb-3 text-[12px] text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
};

// ─── Tag list ────────────────────────────────────────────────────────────────

/** An editable set of chips, used for "never translate these languages". */
export const TagList: React.FC<{
  values: string[];
  labelFor: (id: string) => string;
  options: ReadonlyArray<{ id: string; label: string }>;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  emptyLabel: string;
}> = ({ values, labelFor, options, onAdd, onRemove, emptyLabel }) => {
  const remaining = options.filter((option) => !values.includes(option.id));
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        {values.length === 0 && (
          <span className="text-[12.5px] text-[var(--text-muted)]">{emptyLabel}</span>
        )}
        {values.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] py-1 pl-3 pr-1.5 text-[12.5px] text-[var(--text)]"
          >
            {labelFor(id)}
            <button
              type="button"
              onClick={() => onRemove(id)}
              aria-label={`Remove ${labelFor(id)}`}
              className="rounded-full p-0.5 text-[var(--text-faint)] hover:bg-[var(--hover)] hover:text-[var(--danger)]"
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      {remaining.length > 0 && (
        <div className="relative mt-3 inline-block">
          <select
            aria-label="Add a language that should never be translated"
            value=""
            onChange={(e) => e.target.value && onAdd(e.target.value)}
            className="appearance-none rounded-md bg-[var(--surface-2)] py-1.5 pl-3 pr-8 text-[12.5px] text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <option value="">Add language…</option>
            {remaining.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
          />
        </div>
      )}
    </div>
  );
};

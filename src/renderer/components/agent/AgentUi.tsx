/**
 * AgentUi.tsx — the shared primitives every agent settings panel is built from.
 *
 * These deliberately mirror the vocabulary already used in SettingsPage
 * (MdSwitch, MdCard, SectionLabel) so the agent screens read as part of the
 * same application rather than a bolted-on dashboard. Anything reused by more
 * than one panel lives here; anything used once stays in its panel.
 */

import React from 'react';
import { AlertTriangle, Check, ChevronDown, Info, Search } from 'lucide-react';
import type { PermissionState } from '../../../shared/agentConfig';
import { PERMISSION_BADGES } from '../../../shared/agentConfig';

// ─── Layout ──────────────────────────────────────────────────────────────────

/** A titled block of related settings. */
export const Section: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}> = ({ title, description, children, action }) => (
  <section className="mb-9">
    <div className="mb-3 flex items-start justify-between gap-4 px-1">
      <div>
        <h2 className="text-[13px] font-medium tracking-[0.08em] text-[var(--text-faint)]">
          {title.toUpperCase()}
        </h2>
        {description && (
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-[var(--text-muted)]">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
    {children}
  </section>
);

/** A surface panel. Rows inside it are separated by hairlines, not gaps. */
export const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div className={`overflow-hidden rounded-md bg-[var(--surface)] shadow-sm ${className}`}>
    {children}
  </div>
);

/**
 * One setting: a label, an explanation, and a control.
 *
 * The description is not optional by convention — a setting a user cannot
 * understand is a setting they will leave at its default forever.
 */
export const Row: React.FC<{
  label: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Renders the row as a warning, for dangerous capabilities. */
  danger?: boolean;
  icon?: React.ElementType;
  /** Stack the control below the text, for wide controls. */
  stacked?: boolean;
}> = ({ label, description, children, danger, icon: Icon, stacked }) => (
  <div
    className={`flex gap-4 border-b border-[var(--border)] px-4 py-3.5 last:border-b-0 ${
      stacked ? 'flex-col' : 'items-center justify-between'
    }`}
  >
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {Icon && (
        <Icon
          size={16}
          className={`mt-0.5 shrink-0 ${danger ? 'text-[var(--danger)]' : 'text-[var(--text-faint)]'}`}
        />
      )}
      <div className="min-w-0">
        <div className="text-[14px] leading-snug text-[var(--text)]">{label}</div>
        {description && (
          <div className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
            {description}
          </div>
        )}
      </div>
    </div>
    {children && <div className={stacked ? 'w-full' : 'shrink-0'}>{children}</div>}
  </div>
);

// ─── Controls ────────────────────────────────────────────────────────────────

/** Matches the MdSwitch already used across Settings. */
export const Switch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}> = ({ checked, onChange, disabled, label }) => (
  <button
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40 ${
      checked
        ? 'border-[var(--accent)] bg-[var(--accent)]'
        : 'border-[var(--border-strong)] bg-transparent'
    }`}
  >
    <span
      className={`absolute top-1/2 -translate-y-1/2 rounded-full shadow-sm transition-all duration-200 ease-out ${
        checked ? 'left-[26px] h-5 w-5 bg-white' : 'left-[5px] h-4 w-4 bg-[var(--text-faint)]'
      }`}
    />
  </button>
);

/** SAFE / ASK / BLOCKED, per the UX spec. */
export const PermissionBadge: React.FC<{ state: PermissionState }> = ({ state }) => {
  const tone =
    state === 'allow'
      ? 'bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-[var(--success)]'
      : state === 'never'
        ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
        : 'bg-[var(--accent-soft)] text-[var(--text-muted)]';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] ${tone}`}
    >
      {PERMISSION_BADGES[state]}
    </span>
  );
};

/** Three-way permission picker. Keyboard accessible as a radio group. */
export const PermissionPicker: React.FC<{
  value: PermissionState;
  onChange: (next: PermissionState) => void;
  /** Hide 'allow' where policy forbids it (purchases). */
  disallowAllow?: boolean;
  label: string;
}> = ({ value, onChange, disallowAllow, label }) => {
  const options: Array<{ id: PermissionState; short: string }> = [
    { id: 'allow', short: 'Allow' },
    { id: 'ask', short: 'Ask' },
    { id: 'never', short: 'Never' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex shrink-0 overflow-hidden rounded-md border border-[var(--border)]"
    >
      {options.map((option) => {
        const blocked = disallowAllow && option.id === 'allow';
        const active = value === option.id;
        return (
          <button
            key={option.id}
            role="radio"
            aria-checked={active}
            disabled={blocked}
            title={blocked ? 'Purchases can never happen automatically.' : undefined}
            onClick={() => onChange(option.id)}
            className={`px-2.5 py-1.5 text-[12px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-30 ${
              active
                ? option.id === 'never'
                  ? 'bg-[var(--danger-soft)] font-medium text-[var(--danger)]'
                  : 'bg-[var(--accent-soft)] font-medium text-[var(--text)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--hover)]'
            }`}
          >
            {option.short}
          </button>
        );
      })}
    </div>
  );
};

export const Select: React.FC<{
  value: string;
  onChange: (next: string) => void;
  options: ReadonlyArray<{ id: string; label: string }>;
  label: string;
  className?: string;
}> = ({ value, onChange, options, label, className = '' }) => (
  <div className={`relative ${className}`}>
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none rounded-md bg-[var(--surface-2)] py-2 pl-3 pr-8 text-[13px] text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
    <ChevronDown
      size={14}
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
    />
  </div>
);

export const TextInput: React.FC<{
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  label: string;
  error?: string;
  onEnter?: () => void;
  type?: string;
  className?: string;
  monospace?: boolean;
}> = ({ value, onChange, placeholder, label, error, onEnter, type = 'text', className = '', monospace }) => (
  <div className={className}>
    <input
      aria-label={label}
      aria-invalid={Boolean(error)}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter?.();
      }}
      className={`w-full rounded-md bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:ring-2 ${
        error ? 'ring-2 ring-[var(--danger)]' : 'focus:ring-[var(--accent)]'
      } ${monospace ? 'font-[family-name:var(--font-mono)]' : ''}`}
    />
    {error && (
      <p role="alert" className="mt-1.5 text-[12px] text-[var(--danger)]">
        {error}
      </p>
    )}
  </div>
);

export const NumberField: React.FC<{
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  label: string;
  suffix?: string;
}> = ({ value, onChange, min, max, label, suffix }) => (
  <div className="flex items-center gap-2">
    <input
      type="number"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const parsed = Number(e.target.value);
        if (Number.isFinite(parsed)) onChange(Math.min(max, Math.max(min, parsed)));
      }}
      className="w-20 rounded-md bg-[var(--surface-2)] px-2.5 py-1.5 text-right text-[13px] text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
    />
    {suffix && <span className="text-[12.5px] text-[var(--text-muted)]">{suffix}</span>}
  </div>
);

export const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
  icon?: React.ElementType;
  type?: 'button' | 'submit';
  title?: string;
}> = ({ children, onClick, variant = 'secondary', size = 'md', disabled, icon: Icon, type = 'button', title }) => {
  const tones = {
    primary: 'bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)]',
    secondary:
      'border border-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)]',
    danger: 'bg-[var(--danger-soft)] text-[var(--danger)] hover:brightness-110',
    ghost: 'text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]',
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-40 ${
        size === 'sm' ? 'px-2.5 py-1.5 text-[12px]' : 'px-3.5 py-2 text-[13px]'
      } ${tones[variant]}`}
    >
      {Icon && <Icon size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  );
};

export const SearchField: React.FC<{
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}> = ({ value, onChange, placeholder }) => (
  <div className="relative">
    <Search
      size={14}
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
    />
    <input
      type="search"
      aria-label={placeholder}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md bg-[var(--surface-2)] py-2 pl-9 pr-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:ring-2 focus:ring-[var(--accent)]"
    />
  </div>
);

// ─── Feedback ────────────────────────────────────────────────────────────────

export const Callout: React.FC<{
  tone?: 'info' | 'warning' | 'danger';
  children: React.ReactNode;
}> = ({ tone = 'info', children }) => {
  const Icon = tone === 'info' ? Info : AlertTriangle;
  const styles = {
    info: 'bg-[var(--surface-2)] text-[var(--text-muted)]',
    warning: 'bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--text-muted)]',
    danger: 'bg-[var(--danger-soft)] text-[var(--text-muted)]',
  }[tone];
  const iconColor = {
    info: 'text-[var(--text-faint)]',
    warning: 'text-[var(--warning)]',
    danger: 'text-[var(--danger)]',
  }[tone];

  return (
    <div className={`flex items-start gap-2.5 rounded-md px-3.5 py-3 text-[12.5px] leading-relaxed ${styles}`}>
      <Icon size={15} className={`mt-0.5 shrink-0 ${iconColor}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
};

/** Shown wherever a list can legitimately be empty. */
export const EmptyState: React.FC<{
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
    <Icon size={22} className="text-[var(--text-faint)]" strokeWidth={1.5} />
    <p className="text-[13.5px] font-medium text-[var(--text)]">{title}</p>
    <p className="max-w-sm text-[12.5px] leading-relaxed text-[var(--text-muted)]">{description}</p>
    {action && <div className="mt-2">{action}</div>}
  </div>
);

export const LoadingState: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-2.5 px-6 py-12 text-[13px] text-[var(--text-muted)]">
    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
    {label}
  </div>
);

/** Progressive disclosure for the technical settings. */
export const Disclosure: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, description, children, defaultOpen = false }) => {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-md bg-[var(--surface)] shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--hover)]"
      >
        <ChevronDown
          size={15}
          className={`shrink-0 text-[var(--text-faint)] transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
        />
        <span className="flex-1">
          <span className="block text-[14px] text-[var(--text)]">{title}</span>
          {description && (
            <span className="mt-0.5 block text-[12.5px] text-[var(--text-muted)]">{description}</span>
          )}
        </span>
      </button>
      {open && <div className="border-t border-[var(--border)]">{children}</div>}
    </div>
  );
};

// ─── Dialog ──────────────────────────────────────────────────────────────────

/**
 * Modal confirmation. Used for anything destructive, and by the agent's own
 * permission prompts, so both look identical to the user.
 */
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  extraAction?: { label: string; onClick: () => void };
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  extraAction,
  onConfirm,
  onCancel,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);

  // Focus the dialog on open so keyboard users land inside it, and wire Escape.
  React.useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6">
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="w-full max-w-md rounded-lg bg-[var(--chrome)] p-5 shadow-[var(--shadow-overlay)] outline-none"
      >
        <h3 className="text-[15px] font-medium text-[var(--text)]">{title}</h3>
        <div className="mt-2 text-[13px] leading-relaxed text-[var(--text-muted)]">{body}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {extraAction && (
            <Button variant="secondary" onClick={extraAction.onClick}>
              {extraAction.label}
            </Button>
          )}
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} icon={danger ? undefined : Check}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

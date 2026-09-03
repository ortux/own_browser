/**
 * agent.ts — the AI agent's action vocabulary.
 *
 * SECURITY MODEL
 *
 * The model never emits code. It emits one of the fixed, named actions below,
 * and the main process validates every field before touching a page. This is
 * the single most important design decision in the agent: an LLM that can ask
 * for `executeJavaScript(<string>)` is a remote-code-execution primitive
 * driven by untrusted web content, because the page the agent is reading can
 * try to talk the model into running something (prompt injection).
 *
 * Keeping the vocabulary closed means the worst a hijacked model can do is
 * click, type or scroll somewhere unhelpful — which the confirmation gate and
 * the stop button are there to catch.
 */

/** Actions that change what the user sees but cannot submit anything. */
export type AgentNavigationAction =
  | { kind: 'navigate'; url: string }
  | { kind: 'new_tab'; url?: string }
  | { kind: 'switch_tab'; tabId: string }
  | { kind: 'close_tab'; tabId: string }
  | { kind: 'scroll'; direction: 'up' | 'down'; amount?: number }
  | { kind: 'wait'; ms: number };

/** Actions that interact with page content. */
export type AgentPageAction =
  | { kind: 'click'; ref: number }
  | { kind: 'type'; ref: number; text: string; secret?: boolean }
  | { kind: 'select'; ref: number; value: string }
  | { kind: 'key'; key: 'Enter' | 'Tab' | 'Escape' | 'Backspace' };

/** Terminal actions. */
export type AgentControlAction =
  | { kind: 'done'; summary: string }
  | { kind: 'ask'; question: string };

export type AgentAction = AgentNavigationAction | AgentPageAction | AgentControlAction;

export type AgentActionKind = AgentAction['kind'];

/**
 * Actions that can cause an irreversible side effect and therefore require
 * explicit user approval when autonomy is set to 'confirm-sensitive'.
 *
 * Clicking is included because a click is how a form gets submitted, a payment
 * gets made and an account gets deleted. The main process decides per-element
 * (see isSensitiveElement) rather than treating every click as dangerous,
 * which would make the agent unusably slow.
 */
export const IRREVERSIBLE_KINDS: ReadonlySet<AgentActionKind> = new Set<AgentActionKind>([
  'click',
  'key',
]);

/** One interactive element the agent can address, as shown to the model. */
export interface AgentElement {
  /** Stable within a single snapshot; the model refers to elements by this. */
  ref: number;
  tag: string;
  type?: string;
  /** Accessible name: label, aria-label, placeholder or visible text. */
  name: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  checked?: boolean;
  disabled?: boolean;
  /** Viewport rect, used to drive real mouse input. */
  rect: { x: number; y: number; width: number; height: number };
  /** True when the element is scrolled out of view. */
  offscreen: boolean;
  /** Options, for <select>. */
  options?: string[];
  /**
   * Structural sensitivity signals, computed from the DOM rather than from
   * label text, so they hold on any site in any language.
   */
  /** Activating this element submits a form. */
  submits?: boolean;
  /** The form this element belongs to collects a password or payment details. */
  formSensitive?: boolean;
}

/** What the agent can see of a page at one moment. */
export interface AgentSnapshot {
  tabId: string;
  url: string;
  title: string;
  /** Trimmed visible text, for context. */
  text: string;
  elements: AgentElement[];
  scroll: { y: number; height: number; viewport: number };
}

export type AgentRunState =
  | 'idle'
  | 'thinking'
  | 'acting'
  | 'awaiting-confirmation'
  | 'awaiting-answer'
  | 'paused'
  | 'stopped'
  | 'done'
  | 'error';

/** A single entry in the visible activity log. */
export interface AgentStep {
  id: string;
  action: AgentAction;
  /** Model's one-line justification, shown to the user. */
  reason?: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'rejected';
  error?: string;
  at: number;
}

/** Live events pushed from the agent runner to the sidebar. */
export type AgentEvent =
  | { type: 'state'; state: AgentRunState }
  | { type: 'step'; step: AgentStep }
  | { type: 'step-update'; id: string; status: AgentStep['status']; error?: string }
  | { type: 'message'; role: 'agent'; text: string }
  | {
      type: 'confirm';
      step: AgentStep;
      description: string;
      /** Site the action targets, shown in the dialog. */
      domain: string;
      /** Plain-language reason this needs approval. */
      reason: string;
      /** Which configured permission this is charged against. */
      actionId: string;
      /** Whether "Always allow this website" may be offered. */
      allowRemember: boolean;
    }
  | { type: 'ask'; question: string }
  | { type: 'error'; message: string };

export interface AgentProfileField {
  key: string;
  label: string;
  value: string;
  /** Encrypted at rest and never logged. */
  secret?: boolean;
}

export type AgentAutonomy = 'confirm-sensitive' | 'full-auto' | 'step-approval';

export interface AgentSettings {
  enabled: boolean;
  model: string;
  autonomy: AgentAutonomy;
  /** Hard ceiling on actions per run, so a loop cannot run forever. */
  maxSteps: number;
  /** Delay between actions, in ms. Also what makes it feel human. */
  actionDelayMs: number;
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  enabled: false,
  model: 'gemini-2.0-flash',
  autonomy: 'confirm-sensitive',
  maxSteps: 40,
  actionDelayMs: 350,
};

/** Models offered in Settings. */
export const AGENT_MODELS = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — fast, cheap' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite — fastest' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — better reasoning' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro — most capable, slowest' },
] as const;

const ACTION_KINDS: ReadonlySet<string> = new Set([
  'navigate',
  'new_tab',
  'switch_tab',
  'close_tab',
  'scroll',
  'wait',
  'click',
  'type',
  'select',
  'key',
  'done',
  'ask',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Validate a model-proposed action.
 *
 * Deliberately strict and total: anything not recognised is rejected rather
 * than coerced, because this is the boundary between model output and real
 * input events.
 */
export function parseAgentAction(value: unknown): AgentAction | null {
  if (!isRecord(value)) return null;
  const kind = value.kind;
  if (typeof kind !== 'string' || !ACTION_KINDS.has(kind)) return null;

  const ref = () => (typeof value.ref === 'number' && Number.isInteger(value.ref) ? value.ref : -1);
  const str = (v: unknown, max: number) =>
    typeof v === 'string' && v.length <= max ? v : null;

  switch (kind) {
    case 'navigate': {
      const url = str(value.url, 8_192);
      return url ? { kind, url } : null;
    }
    case 'new_tab': {
      const url = value.url === undefined ? undefined : str(value.url, 8_192);
      if (value.url !== undefined && url === null) return null;
      return { kind, url: url ?? undefined };
    }
    case 'switch_tab':
    case 'close_tab': {
      const tabId = str(value.tabId, 200);
      return tabId ? { kind, tabId } : null;
    }
    case 'scroll': {
      if (value.direction !== 'up' && value.direction !== 'down') return null;
      const amount =
        typeof value.amount === 'number' && Number.isFinite(value.amount)
          ? Math.max(0, Math.min(5_000, value.amount))
          : undefined;
      return { kind, direction: value.direction, amount };
    }
    case 'wait': {
      const ms = typeof value.ms === 'number' && Number.isFinite(value.ms) ? value.ms : 0;
      return { kind, ms: Math.max(0, Math.min(10_000, ms)) };
    }
    case 'click': {
      const r = ref();
      return r >= 0 ? { kind, ref: r } : null;
    }
    case 'type': {
      const r = ref();
      const text = str(value.text, 10_000);
      if (r < 0 || text === null) return null;
      return { kind, ref: r, text, secret: value.secret === true };
    }
    case 'select': {
      const r = ref();
      const v = str(value.value, 1_000);
      if (r < 0 || v === null) return null;
      return { kind, ref: r, value: v };
    }
    case 'key': {
      const k = value.key;
      if (k !== 'Enter' && k !== 'Tab' && k !== 'Escape' && k !== 'Backspace') return null;
      return { kind, key: k };
    }
    case 'done': {
      const summary = str(value.summary, 4_000);
      return summary === null ? null : { kind, summary };
    }
    case 'ask': {
      const question = str(value.question, 4_000);
      return question === null ? null : { kind, question };
    }
    default:
      return null;
  }
}

/** Short human description of an action, for the activity log. */
export function describeAction(action: AgentAction, elements?: AgentElement[]): string {
  const nameFor = (ref: number) => {
    const el = elements?.find((e) => e.ref === ref);
    return el?.name || el?.placeholder || `element ${ref}`;
  };
  switch (action.kind) {
    case 'navigate':
      return `Go to ${action.url}`;
    case 'new_tab':
      return action.url ? `Open ${action.url} in a new tab` : 'Open a new tab';
    case 'switch_tab':
      return 'Switch tab';
    case 'close_tab':
      return 'Close tab';
    case 'scroll':
      return `Scroll ${action.direction}`;
    case 'wait':
      return `Wait ${Math.round(action.ms / 100) / 10}s`;
    case 'click':
      return `Click "${nameFor(action.ref)}"`;
    case 'type':
      return action.secret
        ? `Type a saved value into "${nameFor(action.ref)}"`
        : `Type "${action.text}" into "${nameFor(action.ref)}"`;
    case 'select':
      return `Choose "${action.value}" in "${nameFor(action.ref)}"`;
    case 'key':
      return `Press ${action.key}`;
    case 'done':
      return action.summary;
    case 'ask':
      return action.question;
  }
}

/**
 * Words that mark an irreversible action, across the languages most likely to
 * appear in a browser UI. Purely a secondary signal — the primary checks are
 * structural (`submits`, `formSensitive`) and hold regardless of language.
 *
 * A words-only check silently failed on any non-English site: the gate that is
 * supposed to stop a payment simply never fired.
 */
const SENSITIVE_WORDS: readonly string[] = [
  // English
  'submit', 'send', 'pay', 'buy', 'purchase', 'order', 'checkout', 'confirm',
  'delete', 'remove', 'destroy', 'cancel subscription', 'unsubscribe',
  'sign up', 'signup', 'register', 'apply', 'book', 'reserve',
  'transfer', 'withdraw', 'donate', 'subscribe',
  'agree', 'accept', 'publish', 'post', 'save', 'continue to payment',
  // Spanish / Portuguese
  'enviar', 'pagar', 'comprar', 'pedido', 'confirmar', 'eliminar', 'borrar',
  'registrarse', 'suscribir', 'aceptar', 'continuar', 'excluir', 'cadastrar',
  // French
  'envoyer', 'payer', 'acheter', 'commander', 'confirmer', 'supprimer',
  "s'inscrire", 'accepter', 'valider', 'continuer',
  // German
  'senden', 'absenden', 'bezahlen', 'kaufen', 'bestellen', 'bestätigen',
  'löschen', 'entfernen', 'registrieren', 'anmelden', 'zustimmen', 'weiter',
  // Italian
  'invia', 'paga', 'acquista', 'ordina', 'conferma', 'elimina', 'registrati',
  // Dutch / Nordic
  'verzenden', 'betalen', 'kopen', 'bevestigen', 'verwijderen',
  'skicka', 'betala', 'köp', 'bekräfta', 'radera', 'slett', 'kjøp',
  // Hindi / Bengali
  'भेजें', 'जमा', 'भुगतान', 'खरीद', 'पुष्टि', 'हटाएं', 'आदेश',
  'পাঠান', 'জমা', 'পরিশোধ', 'কিনুন', 'নিশ্চিত', 'মুছুন',
  // Chinese (simplified + traditional)
  '提交', '发送', '支付', '付款', '购买', '下单', '确认', '删除', '注册', '订阅', '確認', '購買', '刪除',
  // Japanese
  '送信', '支払', '購入', '注文', '確認', '削除', '登録', '申し込',
  // Korean
  '제출', '전송', '결제', '구매', '주문', '확인', '삭제', '가입',
  // Russian / Ukrainian
  'отправить', 'оплатить', 'купить', 'заказать', 'подтвердить', 'удалить',
  'зарегистрироваться', 'надіслати', 'оплатити', 'купити', 'видалити',
  // Arabic
  'إرسال', 'ادفع', 'شراء', 'تأكيد', 'حذف', 'اشتراك', 'تسجيل',
  // Turkish / Indonesian / Vietnamese
  'gönder', 'öde', 'satın al', 'onayla', 'sil', 'kaydol',
  'kirim', 'bayar', 'beli', 'konfirmasi', 'hapus', 'daftar',
  'gửi', 'thanh toán', 'mua', 'xác nhận', 'xóa', 'đăng ký',
];

/**
 * Would activating this element do something the user cannot undo?
 *
 * Layered, most reliable signal first:
 *   1. structural — it submits a form, or sits in a credential/payment form;
 *   2. semantic   — a destructive ARIA role or a payment-typed input;
 *   3. lexical    — a known word in any of the supported languages.
 *
 * Used by the 'confirm-sensitive' autonomy mode. Deliberately errs toward
 * asking: a false positive costs one confirmation click, a false negative can
 * submit a payment.
 */
export function isSensitiveElement(el: AgentElement | undefined): boolean {
  if (!el) return false;

  // 1. Structural signals — language-independent.
  if (el.submits) return true;
  if (el.type === 'submit' || el.type === 'image') return true;
  if (el.formSensitive) return true;

  // 2. A link that leaves the page is not irreversible; a button in a payment
  //    context already matched above. Checkboxes and radios are cheap to undo.
  if (el.tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) return false;

  // 3. Lexical fallback for buttons that are not inside a <form> at all —
  //    common in single-page apps, where a plain <button> triggers the order.
  const haystack = `${el.name} ${el.value ?? ''}`.toLowerCase().normalize('NFKC');
  if (!haystack.trim()) return false;
  return SENSITIVE_WORDS.some((word) => haystack.includes(word));
}

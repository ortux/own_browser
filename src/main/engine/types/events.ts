/**
 * Standard Event Schema
 * Every integration adapter must convert its native events into this shape.
 */

export type EventType =
  // Messaging
  | 'message.received'
  | 'message.sent'
  | 'message.read'
  | 'call.incoming'
  | 'call.missed'
  // Email
  | 'email.received'
  | 'email.sent'
  | 'email.read'
  // Calendar
  | 'calendar.event.starting'
  | 'calendar.event.created'
  | 'calendar.event.updated'
  // Social / Professional
  | 'connection.request'
  | 'connection.accepted'
  | 'mention'
  | 'reaction'
  // Collaboration
  | 'channel.message'
  | 'direct.message'
  | 'thread.reply'
  // Code / DevOps
  | 'pr.review_requested'
  | 'pr.commented'
  | 'pr.merged'
  | 'issue.assigned'
  | 'issue.commented'
  | 'ci.failed'
  | 'ci.passed'
  // Generic
  | 'notification'
  | 'alert'
  | 'reminder'
  | string;

export type EventPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NormalizedEvent {
  /** Globally unique event ID (provider-scoped) */
  id: string;
  /** Which integration produced this event */
  provider: string;
  /** Which account (user may have multiple per provider) */
  accountId: string;
  /** Semantic event type */
  type: EventType;
  /** Unix milliseconds */
  timestamp: number;
  /** Event-specific payload */
  data: Record<string, unknown>;
  /** Extra metadata (e.g. thread ID, labels) */
  metadata?: Record<string, unknown>;
  /** Computed or rule-assigned priority */
  priority?: EventPriority;
}

export interface SenderInfo {
  id?: string;
  name: string;
  email?: string;
  avatar?: string;
}

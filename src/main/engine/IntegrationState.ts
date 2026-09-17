/**
 * IntegrationState
 * Canonical lifecycle states for every integration adapter.
 */

export type ConnectionStatus =
  | 'disconnected'
  | 'initializing'
  | 'connecting'
  | 'connected'
  | 'connection_lost'
  | 'reconnecting'
  | 'auth_required'
  | 'rate_limited'
  | 'error';

export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'NETWORK_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'SESSION_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'NOT_CONFIGURED'
  | 'UNKNOWN_ERROR';

export interface IntegrationError {
  code: ErrorCode;
  message: string;
  recoverable: boolean;
}

export interface IntegrationStateSnapshot {
  provider: string;
  accountId: string;
  status: ConnectionStatus;
  connectedAt: number | null;
  lastEventAt: number | null;
  lastError: IntegrationError | null;
}

export class IntegrationState {
  provider: string;
  accountId: string;
  status: ConnectionStatus = 'disconnected';
  connectedAt: number | null = null;
  lastEventAt: number | null = null;
  lastError: IntegrationError | null = null;

  constructor(provider: string, accountId: string) {
    this.provider = provider;
    this.accountId = accountId;
  }

  transition(next: ConnectionStatus, error?: IntegrationError) {
    this.status = next;
    if (next === 'connected') {
      this.connectedAt = Date.now();
      this.lastError = null;
    }
    if (error) this.lastError = error;
  }

  markEvent() {
    this.lastEventAt = Date.now();
  }

  snapshot(): IntegrationStateSnapshot {
    return {
      provider: this.provider,
      accountId: this.accountId,
      status: this.status,
      connectedAt: this.connectedAt,
      lastEventAt: this.lastEventAt,
      lastError: this.lastError,
    };
  }
}

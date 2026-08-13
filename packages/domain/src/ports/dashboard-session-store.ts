/**
 * A durable dashboard session after the application has HMACed its random
 * session and CSRF tokens. Raw bearer material must never cross this port.
 */
export interface DashboardSession {
  readonly absoluteExpiresAt: string;
  readonly csrfTokenHmac: string;
  readonly id: string;
  readonly idleExpiresAt: string;
  readonly issuedAt: string;
  readonly lastSeenAt: string;
  readonly principalId: string;
  readonly revokedAt?: string;
  readonly sessionTokenHmac: string;
}

/** Input for creating one server-rendered dashboard session. */
export interface DashboardSessionCreateInput {
  readonly absoluteExpiresAt: string;
  readonly csrfTokenHmac: string;
  readonly id: string;
  readonly idleExpiresAt: string;
  readonly issuedAt: string;
  readonly lastSeenAt: string;
  readonly principalId: string;
  readonly sessionTokenHmac: string;
}

/** Looks up a session only when it is unrevoked and inside both expiry windows. */
export interface DashboardSessionReadInput {
  readonly at: string;
  readonly sessionTokenHmac: string;
}

/**
 * Advances a live session. The adapter atomically rejects stale, revoked, idle
 * expired, and absolutely expired rows, then caps the requested idle expiry at
 * the immutable absolute expiry.
 */
export interface DashboardSessionTouchInput {
  readonly idleExpiresAt: string;
  readonly sessionTokenHmac: string;
  readonly touchedAt: string;
}

/** Revocation is idempotent so a dashboard logout can safely clear its cookie. */
export interface DashboardSessionRevokeInput {
  readonly revokedAt: string;
  readonly sessionTokenHmac: string;
}

/**
 * Durable boundary for server-rendered dashboard sessions. Implementations
 * receive only HMACed token material and never store raw session, CSRF,
 * password, inbox, or provider credentials.
 */
export interface DashboardSessionStore {
  create(input: DashboardSessionCreateInput): Promise<DashboardSession>;
  readActive(input: DashboardSessionReadInput): Promise<DashboardSession | undefined>;
  revoke(input: DashboardSessionRevokeInput): Promise<void>;
  touchActive(input: DashboardSessionTouchInput): Promise<DashboardSession | undefined>;
}

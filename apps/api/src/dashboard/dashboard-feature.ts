import type {
  DashboardSessionStore,
  InboundEventPage,
  InboundEventPageCursor
} from '@open-channel-hub/domain';

/** A server-side-only principal selected after password authentication. */
export interface DashboardPrincipal {
  readonly id: string;
  readonly inboxIds: readonly string[];
  readonly passwordHash: string;
}

/**
 * A dashboard-safe view of an inbox. It deliberately omits the inbox bearer
 * token so neither the renderer nor a browser route can expose it.
 */
export interface DashboardInbox {
  readonly connectionIds: readonly string[];
  readonly id: string;
  readonly readInboundEvents: (input: DashboardInboxReadInput) => Promise<InboundEventPage>;
}

/** A dashboard page request whose effective connection scope is immutable. */
export interface DashboardInboxReadInput {
  readonly cursor?: InboundEventPageCursor;
  readonly pageSize: number;
}

/**
 * The narrow composition-root capability required by the server-rendered
 * dashboard. It contains no provider credential and never passes an inbox
 * bearer to HTML or client-side code.
 */
export interface DashboardFeature {
  readonly publicOrigin: string;
  readonly sessionCookieSigningKeys: readonly string[];
  readonly sessionIdPepper: string;
  readonly sessionStore: DashboardSessionStore;
  findInbox: (principalId: string, inboxId: string) => DashboardInbox | undefined;
  findPrincipal: (principalId: string) => DashboardPrincipal | undefined;
  listInboxes: (principalId: string) => readonly DashboardInbox[];
}

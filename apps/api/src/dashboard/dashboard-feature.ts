import type {
  CreateOutboundReplyCommandResult,
  CreateOutboundTelegramDeliveryAuthorizationResult,
  DashboardGoogleIdentityStore,
  DashboardSessionStore,
  InboundEventPage,
  InboundEventPageCursor,
  OutboundReplyCommandHistoryPage,
  OutboundReplyCommandHistoryPageCursor
} from '@open-channel-hub/domain';

import type { DashboardGoogleOAuthClient } from './dashboard-google-oauth.js';

/** A server-side-only principal selected after password authentication. */
export interface DashboardPrincipal {
  readonly id: string;
  readonly inboxIds: readonly string[];
  readonly passwordHash: string;
  /** The configured subset allowed to record source-bound reply intent. */
  readonly replyIntentInboxIds: readonly string[];
  /** The separate configured subset allowed to record Telegram approval evidence. */
  readonly telegramDeliveryAuthorizationInboxIds: readonly string[];
}

/**
 * A dashboard-safe view of an inbox. It deliberately omits the inbox bearer
 * token so neither the renderer nor a browser route can expose it.
 */
export interface DashboardInbox {
  readonly connectionIds: readonly string[];
  readonly id: string;
  readonly readInboundEvents: (input: DashboardInboxReadInput) => Promise<InboundEventPage>;
  readonly readOutboundReplyCommandHistory: (
    input: DashboardOutboundCommandHistoryReadInput
  ) => Promise<OutboundReplyCommandHistoryPage>;
}

/** The exact source-bound fields a dashboard form may record. */
export interface DashboardReplyIntentInput {
  readonly clientOperationId: string;
  readonly sourceConnectionId: string;
  readonly sourceProviderEventId: string;
  readonly text: string;
}

/**
 * A server-only write capability bound to one configured inbox. It intentionally
 * omits bearer credentials, provider clients, delivery actions, and generic
 * storage access.
 */
export interface DashboardReplyIntentInbox {
  readonly id: string;
  readonly recordReplyIntent: (
    input: DashboardReplyIntentInput
  ) => Promise<CreateOutboundReplyCommandResult>;
}

/** The only dashboard input accepted for immutable Telegram approval evidence. */
export interface DashboardTelegramDeliveryAuthorizationInput {
  readonly commandId: string;
}

/**
 * A server-only capability to record human Telegram delivery authorization.
 * It contains no provider client, attempt writer, credential, or bearer.
 */
export interface DashboardTelegramDeliveryAuthorizationInbox {
  readonly id: string;
  readonly recordTelegramDeliveryAuthorization: (
    input: DashboardTelegramDeliveryAuthorizationInput
  ) => Promise<CreateOutboundTelegramDeliveryAuthorizationResult>;
}

/** A dashboard page request whose effective connection scope is immutable. */
export interface DashboardInboxReadInput {
  readonly cursor?: InboundEventPageCursor;
  readonly pageSize: number;
}

/** A dashboard-local history request with no caller-selectable connection scope. */
export interface DashboardOutboundCommandHistoryReadInput {
  readonly cursor?: OutboundReplyCommandHistoryPageCursor;
  readonly pageSize: number;
}

/**
 * The narrow composition-root capability required by the server-rendered
 * dashboard. It contains no provider credential and never passes an inbox
 * bearer to HTML or client-side code.
 */
export interface DashboardFeature {
  /** Optional server-only Google sign-in/linking boundary. */
  readonly googleAuthentication?: DashboardGoogleAuthentication;
  readonly publicOrigin: string;
  readonly sessionCookieSigningKeys: readonly string[];
  readonly sessionIdPepper: string;
  readonly sessionStore: DashboardSessionStore;
  findInbox: (principalId: string, inboxId: string) => DashboardInbox | undefined;
  findReplyIntentInbox: (
    principalId: string,
    inboxId: string
  ) => DashboardReplyIntentInbox | undefined;
  findTelegramDeliveryAuthorizationInbox: (
    principalId: string,
    inboxId: string
  ) => DashboardTelegramDeliveryAuthorizationInbox | undefined;
  findPrincipal: (principalId: string) => DashboardPrincipal | undefined;
  listInboxes: (principalId: string) => readonly DashboardInbox[];
}

/**
 * This graph reaches neither a browser bearer token nor a provider account.
 * The identity store receives only a domain-separated HMAC of Google `sub`.
 */
export interface DashboardGoogleAuthentication {
  readonly client: DashboardGoogleOAuthClient;
  readonly identityStore: DashboardGoogleIdentityStore;
}

/**
 * A storage-opaque position inside one stable outbound-command snapshot.
 * Sequence values stay decimal strings so JavaScript cannot lose PostgreSQL
 * bigint precision while an HTTP adapter remains free to encode this cursor.
 */
export interface OutboundReplyCommandHistoryPageCursor {
  readonly beforeSequence: string;
  readonly snapshotMaxSequence: string;
}

/**
 * A deliberately bounded summary of durable delivery evidence. These values
 * describe only what the local ledger recorded; none means delivered or read.
 */
export type OutboundDeliveryEvidenceStatus =
  'not_attempted' | 'outcome_unknown' | 'provider_accepted' | 'provider_rejected';

/**
 * The only command representation allowed to cross the read boundary. It
 * deliberately omits the private reply target, source-message metadata,
 * channel, client operation ID, provider response, and provider message ID.
 * The evidence flags are dashboard-safe summaries only; inbox HTTP adapters
 * must map their public response explicitly and omit every dashboard fact.
 */
export interface OutboundReplyCommandHistoryEntry {
  /** Whether immutable Phase 4h command provenance was recorded. */
  readonly authorizationRecorded: boolean;
  readonly createdAt: string;
  /** A local evidence label, never a claim of provider delivery or read. */
  readonly deliveryEvidenceStatus: OutboundDeliveryEvidenceStatus;
  readonly id: string;
  readonly sourceConnectionId: string;
  readonly sourceProviderEventId: string;
  readonly state: 'queued';
  /** Whether immutable Phase 4j Telegram approval evidence was recorded. */
  readonly telegramDeliveryAuthorizationRecorded: boolean;
  /**
   * Internal dashboard-only indicator. HTTP adapters must explicitly omit it
   * so an inbox bearer cannot learn delivery-authorization state.
   */
  readonly telegramDeliveryAuthorizationEligible: boolean;
  /** Whether immutable Phase 4i Telegram private-reply evidence was recorded. */
  readonly telegramPrivateReplyEligibilityRecorded: boolean;
  readonly text: string;
}

/** Input for a reverse-chronological command history across one inbox scope. */
export interface OutboundReplyCommandHistoryListInput {
  readonly allowedConnectionIds: readonly string[];
  /** Server-composed inbox ID used to bind Phase 4h provenance checks. */
  readonly inboxId: string;
  readonly pageSize: number;
  readonly cursor?: OutboundReplyCommandHistoryPageCursor;
}

/** One stable, scope-bound reverse-chronological command-history page. */
export interface OutboundReplyCommandHistoryPage {
  readonly commands: readonly OutboundReplyCommandHistoryEntry[];
  readonly nextCursor?: OutboundReplyCommandHistoryPageCursor;
}

/**
 * Read boundary for durable reply-command history. It has no dispatch,
 * retries, delivery receipts, state mutation, or provider-facing behavior.
 */
export interface OutboundReplyCommandHistoryReader {
  list(input: OutboundReplyCommandHistoryListInput): Promise<OutboundReplyCommandHistoryPage>;
}

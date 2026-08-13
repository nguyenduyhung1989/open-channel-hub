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
 * The only command representation allowed to cross the read boundary. It
 * deliberately omits the private reply target, source-message metadata,
 * channel, client operation ID, and all future delivery-attempt details.
 */
export interface OutboundReplyCommandHistoryEntry {
  readonly createdAt: string;
  readonly id: string;
  readonly sourceConnectionId: string;
  readonly sourceProviderEventId: string;
  readonly state: 'queued';
  readonly text: string;
}

/** Input for a reverse-chronological command history across one inbox scope. */
export interface OutboundReplyCommandHistoryListInput {
  readonly allowedConnectionIds: readonly string[];
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

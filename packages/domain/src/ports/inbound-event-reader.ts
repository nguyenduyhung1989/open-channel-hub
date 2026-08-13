import type { CanonicalEvent } from '@open-channel-hub/contracts';

/**
 * A storage-opaque position inside one stable inbound-event snapshot. Sequence
 * values remain decimal strings so JavaScript never loses PostgreSQL bigint
 * precision while an HTTP adapter remains free to encode this cursor.
 */
export interface InboundEventPageCursor {
  readonly beforeSequence: string;
  readonly snapshotMaxSequence: string;
}

/** Input for a connection-scoped, reverse-chronological inbound-event page. */
export interface InboundEventListInput {
  readonly connectionId: string;
  readonly pageSize: number;
  readonly cursor?: InboundEventPageCursor;
}

/** A canonical-only page; raw provider payloads never cross this boundary. */
export interface InboundEventPage {
  readonly events: readonly CanonicalEvent[];
  readonly nextCursor?: InboundEventPageCursor;
}

/**
 * Read boundary owned by the domain. The first page establishes a snapshot
 * ceiling; every continuation cursor preserves that ceiling while it advances
 * strictly below its previous sequence.
 */
export interface InboundEventReader {
  list(input: InboundEventListInput): Promise<InboundEventPage>;
}

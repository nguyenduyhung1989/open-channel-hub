import type { InboundEventPage, InboundEventPageCursor } from './inbound-event-reader.js';

/**
 * Input for a reverse-chronological inbound-event feed spanning an explicit,
 * bounded set of authorized connections.
 */
export interface InboundEventFeedListInput {
  readonly connectionIds: readonly string[];
  readonly pageSize: number;
  readonly cursor?: InboundEventPageCursor;
}

/**
 * Read boundary for one stable canonical inbound-event snapshot across a
 * caller-selected connection scope. Raw provider payloads never cross this
 * boundary.
 */
export interface InboundEventFeedReader {
  list(input: InboundEventFeedListInput): Promise<InboundEventPage>;
}

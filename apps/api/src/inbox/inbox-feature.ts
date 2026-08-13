import type { InboundEventPage, InboundEventPageCursor } from '@open-channel-hub/domain';

/** An inbox-local page request with no caller-selectable connection scope. */
export interface InboxInboundEventListInput {
  readonly cursor?: InboundEventPageCursor;
  readonly pageSize: number;
}

/**
 * A read-only principal for a configured inbox. Its immutable connection set
 * is selected from runtime configuration, never from the HTTP request.
 */
export interface InboxFeature {
  readonly connectionIds: readonly string[];
  readonly id: string;
  readonly readInboundEvents: (input: InboxInboundEventListInput) => Promise<InboundEventPage>;
  readonly token: string;
}

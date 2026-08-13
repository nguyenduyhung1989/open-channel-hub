import type {
  CreateOutboundReplyCommandResult,
  InboundEventPage,
  InboundEventPageCursor
} from '@open-channel-hub/domain';

/** An inbox-local page request with no caller-selectable connection scope. */
export interface InboxInboundEventListInput {
  readonly cursor?: InboundEventPageCursor;
  readonly pageSize: number;
}

/**
 * An operator's source-bound reply intent. The caller cannot supply a target:
 * the durable command store derives one later from the referenced event.
 */
export interface InboxOutboundReplyCommandInput {
  readonly clientOperationId: string;
  readonly sourceConnectionId: string;
  readonly sourceProviderEventId: string;
  readonly text: string;
}

/**
 * A configured inbox principal. Its immutable connection set is selected from
 * runtime configuration, never from the HTTP request.
 */
export interface InboxFeature {
  readonly connectionIds: readonly string[];
  readonly createOutboundReplyCommand: (
    input: InboxOutboundReplyCommandInput
  ) => Promise<CreateOutboundReplyCommandResult>;
  readonly id: string;
  readonly readInboundEvents: (input: InboxInboundEventListInput) => Promise<InboundEventPage>;
  readonly token: string;
}

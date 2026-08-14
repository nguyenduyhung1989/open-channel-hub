import type {
  CreateOutboundReplyCommandResult,
  CreateOutboundTelegramDeliveryAuthorizationResult,
  InboundEventPage,
  InboundEventPageCursor,
  OutboundReplyCommandHistoryPage,
  OutboundReplyCommandHistoryPageCursor
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
 * A dashboard-only write closure. The runtime composition root creates it
 * only after it has selected one configured dashboard principal; browser
 * forms and bearer routes receive neither the principal identifier nor this
 * factory.
 */
export interface InboxDashboardReplyIntentCapability {
  readonly recordReplyIntent: (
    input: InboxOutboundReplyCommandInput
  ) => Promise<CreateOutboundReplyCommandResult>;
}

/**
 * A separate dashboard-only capability for recording human approval of one
 * already-queued Telegram command. It has no attempt or provider behavior.
 */
export interface InboxDashboardTelegramDeliveryAuthorizationCapability {
  readonly recordTelegramDeliveryAuthorization: (
    input: InboxTelegramDeliveryAuthorizationInput
  ) => Promise<CreateOutboundTelegramDeliveryAuthorizationResult>;
}

/** The only untrusted command reference a browser form may transport. */
export interface InboxTelegramDeliveryAuthorizationInput {
  readonly commandId: string;
}

/** An inbox-local outbound-command history request with no caller-selected scope. */
export interface InboxOutboundReplyCommandHistoryListInput {
  readonly cursor?: OutboundReplyCommandHistoryPageCursor;
  readonly pageSize: number;
}

/**
 * The bearer-route view of a configured inbox. It deliberately excludes the
 * dashboard-only capability factory, so resolving a bearer credential cannot
 * yield a way to name a dashboard principal.
 */
export interface InboxBearerFeature {
  readonly connectionIds: readonly string[];
  readonly createOutboundReplyCommand: (
    input: InboxOutboundReplyCommandInput
  ) => Promise<CreateOutboundReplyCommandResult>;
  readonly id: string;
  readonly readInboundEvents: (input: InboxInboundEventListInput) => Promise<InboundEventPage>;
  readonly readOutboundReplyCommandHistory: (
    input: InboxOutboundReplyCommandHistoryListInput
  ) => Promise<OutboundReplyCommandHistoryPage>;
  readonly token: string;
}

/**
 * A configured inbox principal. Its immutable connection set is selected from
 * runtime configuration, never from the HTTP request. Only the server-side
 * dashboard composition root receives the additional capability factory.
 */
export interface InboxFeature extends InboxBearerFeature {
  /**
   * Returns a distinct write closure whose dashboard principal is fixed by the
   * server-side composition root. It is intentionally not part of a bearer
   * route or dashboard-rendering capability.
   */
  readonly createDashboardReplyIntentCapability: (
    dashboardPrincipalId: string
  ) => InboxDashboardReplyIntentCapability;
  /**
   * A distinct closure used only after server-side dashboard configuration has
   * granted this principal the separate Telegram-delivery authorization scope.
   */
  readonly createDashboardTelegramDeliveryAuthorizationCapability: (
    dashboardPrincipalId: string
  ) => InboxDashboardTelegramDeliveryAuthorizationCapability;
}

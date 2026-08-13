export type { ConnectionRegistry } from './ports/connection-registry.js';
export type {
  DashboardSession,
  DashboardSessionCreateInput,
  DashboardSessionReadInput,
  DashboardSessionRevokeInput,
  DashboardSessionStore,
  DashboardSessionTouchInput
} from './ports/dashboard-session-store.js';
export type { InboundEventStore } from './ports/inbound-event-store.js';
export type {
  InboundEventFeedListInput,
  InboundEventFeedReader
} from './ports/inbound-event-feed-reader.js';
export type {
  InboundEventListInput,
  InboundEventPage,
  InboundEventPageCursor,
  InboundEventReader
} from './ports/inbound-event-reader.js';
export type { OutboundMessagePort } from './ports/outbound-message-port.js';
export type {
  OutboundReplyCommandHistoryEntry,
  OutboundReplyCommandHistoryListInput,
  OutboundReplyCommandHistoryPage,
  OutboundReplyCommandHistoryPageCursor,
  OutboundReplyCommandHistoryReader
} from './ports/outbound-reply-command-history-reader.js';
export type {
  CreateOutboundReplyCommandResult,
  OutboundReplyCommand,
  OutboundReplyCommandCreateInput,
  OutboundReplyCommandStore
} from './ports/outbound-reply-command-store.js';
export { SendMessage } from './send-message.js';
export type {
  SendMessageConnectionMismatchError,
  SendMessageConnectionUnavailableError,
  SendMessageError,
  SendMessageInput,
  SendMessageInvalidInputError,
  SendMessageResult,
  SendMessageUnsupportedCapabilityError
} from './send-message.js';

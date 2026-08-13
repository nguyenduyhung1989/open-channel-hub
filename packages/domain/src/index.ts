export type { ConnectionRegistry } from './ports/connection-registry.js';
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

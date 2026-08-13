import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type {
  InboundEventListInput,
  InboundEventPage,
  SendMessageResult
} from '@open-channel-hub/domain';

/**
 * Application-facing Telegram slice. Credentials stay in the composition root;
 * HTTP routes only receive the minimum operations they need.
 */
export interface TelegramBotFeature {
  readonly connectionId: string;
  readonly normalize: (rawEvent: unknown) => readonly CanonicalEvent[];
  readonly operatorApiToken: string;
  readonly readInboundEvents: (input: InboundEventListInput) => Promise<InboundEventPage>;
  readonly receiveEvents: (events: readonly CanonicalEvent[]) => Promise<void>;
  readonly registration: ConnectionRegistration;
  readonly sendMessage: (input: unknown) => Promise<SendMessageResult>;
  readonly webhookSecret: string;
}

import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventListInput, InboundEventPage } from '@open-channel-hub/domain';

/**
 * Application-facing Zalo OA inbound slice. Provider credentials remain inside
 * the composition root; HTTP routes receive only the operations they need.
 */
export interface ZaloOaFeature {
  readonly appId: string;
  readonly connectionId: string;
  readonly normalize: (rawEvent: unknown) => readonly CanonicalEvent[];
  readonly oaId: string;
  readonly oaSecretKey: string;
  readonly operatorApiToken: string;
  readonly readInboundEvents: (input: InboundEventListInput) => Promise<InboundEventPage>;
  readonly receiveEvents: (events: readonly CanonicalEvent[]) => Promise<void>;
  readonly registration: ConnectionRegistration;
}

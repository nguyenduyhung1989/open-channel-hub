import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventListInput, InboundEventPage } from '@open-channel-hub/domain';

/**
 * Application-facing Zalo User bridge capability. Its bearer is limited to
 * inbound bridge events; QR/session material never enters this process.
 */
export interface ZaloUserFeature {
  readonly accountId: string;
  readonly bridgeToken: string;
  readonly connectionId: string;
  readonly normalize: (rawEvent: unknown) => readonly CanonicalEvent[];
  readonly operatorApiToken: string;
  readonly readInboundEvents: (input: InboundEventListInput) => Promise<InboundEventPage>;
  readonly receiveEvents: (events: readonly CanonicalEvent[]) => Promise<void>;
  readonly registration: ConnectionRegistration;
}

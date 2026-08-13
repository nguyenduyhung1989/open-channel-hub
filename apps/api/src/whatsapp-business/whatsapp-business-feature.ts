import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventListInput, InboundEventPage } from '@open-channel-hub/domain';

/**
 * Application-facing WhatsApp Business inbound slice. Graph API access tokens
 * remain outside this Phase 3c receive-only boundary.
 */
export interface WhatsAppBusinessFeature {
  readonly appId: string;
  readonly appSecret: string;
  readonly connectionId: string;
  readonly normalize: (rawEvent: unknown) => readonly CanonicalEvent[];
  readonly operatorApiToken: string;
  readonly phoneNumberId: string;
  readonly readInboundEvents: (input: InboundEventListInput) => Promise<InboundEventPage>;
  readonly receiveEvents: (events: readonly CanonicalEvent[]) => Promise<void>;
  readonly registration: ConnectionRegistration;
  readonly wabaId: string;
  readonly webhookVerifyToken: string;
}

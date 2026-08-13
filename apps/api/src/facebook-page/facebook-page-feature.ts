import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventListInput, InboundEventPage } from '@open-channel-hub/domain';

/**
 * Application-facing Facebook Page inbound slice. Graph API access tokens
 * stay outside this Phase 3b receive-only boundary.
 */
export interface FacebookPageFeature {
  readonly appId: string;
  readonly appSecret: string;
  readonly connectionId: string;
  readonly normalize: (rawEvent: unknown) => readonly CanonicalEvent[];
  readonly operatorApiToken: string;
  readonly pageId: string;
  readonly readInboundEvents: (input: InboundEventListInput) => Promise<InboundEventPage>;
  readonly receiveEvents: (events: readonly CanonicalEvent[]) => Promise<void>;
  readonly registration: ConnectionRegistration;
  readonly webhookVerifyToken: string;
}

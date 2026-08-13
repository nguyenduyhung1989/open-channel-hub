import { FacebookPageConnectorAdapter } from '@open-channel-hub/connector-facebook-page';
import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventListInput, InboundEventPage } from '@open-channel-hub/domain';

import type { FacebookPageFeature } from './facebook-page-feature.js';
import { fingerprintFacebookPageProviderIdentity } from './facebook-page-provider-identity.js';

export interface FacebookPageConnectionConfiguration {
  readonly appId: string;
  readonly appSecret: string;
  readonly connectionId: string;
  readonly operatorApiToken: string;
  readonly pageId: string;
  readonly webhookUrl?: string;
  readonly webhookVerifyToken: string;
}

export interface CreateFacebookPageFeatureOptions {
  readonly readInboundEvents: (input: InboundEventListInput) => Promise<InboundEventPage>;
  readonly receiveEvents: (events: readonly CanonicalEvent[]) => Promise<void>;
}

/**
 * Wires one configured official Facebook Page inbound boundary. This slice
 * intentionally has no Graph API transport, Page access token, OAuth, or send
 * behavior.
 */
export const createFacebookPageFeature = async (
  configuration: FacebookPageConnectionConfiguration,
  options: CreateFacebookPageFeatureOptions
): Promise<FacebookPageFeature> => {
  const connector = new FacebookPageConnectorAdapter({
    appId: configuration.appId,
    connectionId: configuration.connectionId,
    pageId: configuration.pageId
  });
  const manifest = connector.manifest();
  const registration: ConnectionRegistration = Object.freeze({
    channel: manifest.channel,
    connectorId: manifest.id,
    id: configuration.connectionId,
    providerIdentityFingerprint: fingerprintFacebookPageProviderIdentity(
      configuration.appId,
      configuration.pageId
    ),
    tier: manifest.tier
  });

  return Object.freeze({
    appId: configuration.appId,
    appSecret: configuration.appSecret,
    connectionId: configuration.connectionId,
    normalize: (rawEvent: unknown): readonly CanonicalEvent[] => connector.normalize(rawEvent),
    operatorApiToken: configuration.operatorApiToken,
    pageId: configuration.pageId,
    readInboundEvents: options.readInboundEvents,
    receiveEvents: async (events: readonly CanonicalEvent[]): Promise<void> => {
      if (
        !events.every(
          (event) =>
            event.connectionId === configuration.connectionId &&
            event.channel === registration.channel
        )
      ) {
        throw new Error('Facebook Page inbound events do not match their configured connection.');
      }

      await options.receiveEvents(events);
    },
    registration,
    webhookVerifyToken: configuration.webhookVerifyToken
  });
};

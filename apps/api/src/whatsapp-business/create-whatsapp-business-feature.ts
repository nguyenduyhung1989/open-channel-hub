import { WhatsAppBusinessConnectorAdapter } from '@open-channel-hub/connector-whatsapp-business';
import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventListInput, InboundEventPage } from '@open-channel-hub/domain';

import type { WhatsAppBusinessFeature } from './whatsapp-business-feature.js';
import { fingerprintWhatsAppBusinessProviderIdentity } from './whatsapp-business-provider-identity.js';

export interface WhatsAppBusinessConnectionConfiguration {
  readonly appId: string;
  readonly appSecret: string;
  readonly connectionId: string;
  readonly operatorApiToken: string;
  readonly phoneNumberId: string;
  readonly wabaId: string;
  readonly webhookUrl?: string;
  readonly webhookVerifyToken: string;
}

export interface CreateWhatsAppBusinessFeatureOptions {
  readonly readInboundEvents: (input: InboundEventListInput) => Promise<InboundEventPage>;
  readonly receiveEvents: (events: readonly CanonicalEvent[]) => Promise<void>;
}

/**
 * Wires one official WhatsApp Business inbound boundary. It deliberately has
 * no Graph API client, access token, OAuth flow, subscription behavior, or
 * outbound operation.
 */
export const createWhatsAppBusinessFeature = async (
  configuration: WhatsAppBusinessConnectionConfiguration,
  options: CreateWhatsAppBusinessFeatureOptions
): Promise<WhatsAppBusinessFeature> => {
  const connector = new WhatsAppBusinessConnectorAdapter({
    appId: configuration.appId,
    connectionId: configuration.connectionId,
    phoneNumberId: configuration.phoneNumberId,
    wabaId: configuration.wabaId
  });
  const manifest = connector.manifest();
  const registration: ConnectionRegistration = Object.freeze({
    channel: manifest.channel,
    connectorId: manifest.id,
    id: configuration.connectionId,
    providerIdentityFingerprint: fingerprintWhatsAppBusinessProviderIdentity(
      configuration.appId,
      configuration.wabaId,
      configuration.phoneNumberId
    ),
    tier: manifest.tier
  });

  return Object.freeze({
    appId: configuration.appId,
    appSecret: configuration.appSecret,
    connectionId: configuration.connectionId,
    normalize: (rawEvent: unknown): readonly CanonicalEvent[] => connector.normalize(rawEvent),
    operatorApiToken: configuration.operatorApiToken,
    phoneNumberId: configuration.phoneNumberId,
    readInboundEvents: options.readInboundEvents,
    receiveEvents: async (events: readonly CanonicalEvent[]): Promise<void> => {
      if (
        !events.every(
          (event) =>
            event.connectionId === configuration.connectionId &&
            event.channel === registration.channel
        )
      ) {
        throw new Error(
          'WhatsApp Business inbound events do not match their configured connection.'
        );
      }

      await options.receiveEvents(events);
    },
    registration,
    wabaId: configuration.wabaId,
    webhookVerifyToken: configuration.webhookVerifyToken
  });
};

import { ZaloOaConnectorAdapter } from '@open-channel-hub/connector-zalo-oa';
import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventListInput, InboundEventPage } from '@open-channel-hub/domain';

import type { ZaloOaFeature } from './zalo-oa-feature.js';
import { fingerprintZaloOaProviderIdentity } from './zalo-oa-provider-identity.js';

export interface ZaloOaConnectionConfiguration {
  readonly appId: string;
  readonly connectionId: string;
  readonly oaId: string;
  readonly oaSecretKey: string;
  readonly operatorApiToken: string;
  readonly webhookUrl?: string;
}

export interface CreateZaloOaFeatureOptions {
  readonly readInboundEvents: (input: InboundEventListInput) => Promise<InboundEventPage>;
  readonly receiveEvents: (events: readonly CanonicalEvent[]) => Promise<void>;
}

/**
 * Wires one configured official Zalo OA inbound boundary. This phase does not
 * construct any provider HTTP transport or OAuth workflow.
 */
export const createZaloOaFeature = async (
  configuration: ZaloOaConnectionConfiguration,
  options: CreateZaloOaFeatureOptions
): Promise<ZaloOaFeature> => {
  const connector = new ZaloOaConnectorAdapter({
    appId: configuration.appId,
    connectionId: configuration.connectionId,
    oaId: configuration.oaId
  });
  const manifest = connector.manifest();
  const registration: ConnectionRegistration = Object.freeze({
    channel: manifest.channel,
    connectorId: manifest.id,
    id: configuration.connectionId,
    providerIdentityFingerprint: fingerprintZaloOaProviderIdentity(
      configuration.appId,
      configuration.oaId
    ),
    tier: manifest.tier
  });

  return Object.freeze({
    appId: configuration.appId,
    connectionId: configuration.connectionId,
    normalize: (rawEvent: unknown): readonly CanonicalEvent[] => connector.normalize(rawEvent),
    oaId: configuration.oaId,
    oaSecretKey: configuration.oaSecretKey,
    operatorApiToken: configuration.operatorApiToken,
    readInboundEvents: options.readInboundEvents,
    receiveEvents: async (events: readonly CanonicalEvent[]): Promise<void> => {
      if (
        !events.every(
          (event) =>
            event.connectionId === configuration.connectionId &&
            event.channel === registration.channel
        )
      ) {
        throw new Error('Zalo OA inbound events do not match their configured connection.');
      }

      await options.receiveEvents(events);
    },
    registration
  });
};

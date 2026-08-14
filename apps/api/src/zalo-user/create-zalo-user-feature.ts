import { ZaloUserConnectorAdapter } from '@open-channel-hub/connector-zalo-user';
import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventListInput, InboundEventPage } from '@open-channel-hub/domain';

import type { ZaloUserFeature } from './zalo-user-feature.js';
import { fingerprintZaloUserProviderIdentity } from './zalo-user-provider-identity.js';

export interface ZaloUserConnectionConfiguration {
  readonly accountId: string;
  readonly bridgeToken: string;
  readonly connectionId: string;
  readonly operatorApiToken: string;
}

export interface CreateZaloUserFeatureOptions {
  readonly readInboundEvents: (input: InboundEventListInput) => Promise<InboundEventPage>;
  readonly receiveEvents: (events: readonly CanonicalEvent[]) => Promise<void>;
}

/**
 * Wires one experimental Zalo User inbound bridge. It admits only group text,
 * and deliberately does not construct a Web session or retain QR credentials.
 */
export const createZaloUserFeature = async (
  configuration: ZaloUserConnectionConfiguration,
  options: CreateZaloUserFeatureOptions
): Promise<ZaloUserFeature> => {
  const connector = new ZaloUserConnectorAdapter({
    accountId: configuration.accountId,
    connectionId: configuration.connectionId
  });
  const manifest = connector.manifest();
  const registration: ConnectionRegistration = Object.freeze({
    channel: manifest.channel,
    connectorId: manifest.id,
    id: configuration.connectionId,
    providerIdentityFingerprint: fingerprintZaloUserProviderIdentity(configuration.accountId),
    tier: manifest.tier
  });

  return Object.freeze({
    accountId: configuration.accountId,
    bridgeToken: configuration.bridgeToken,
    connectionId: configuration.connectionId,
    normalize: (rawEvent: unknown): readonly CanonicalEvent[] => connector.normalize(rawEvent),
    operatorApiToken: configuration.operatorApiToken,
    readInboundEvents: options.readInboundEvents,
    receiveEvents: async (events: readonly CanonicalEvent[]): Promise<void> => {
      if (
        events.length !== 1 ||
        !events.every(
          (event) =>
            event.connectionId === configuration.connectionId &&
            event.channel === registration.channel &&
            event.zaloUserThreadType === 'group'
        )
      ) {
        throw new Error('Zalo User inbound events do not match their configured connection.');
      }

      await options.receiveEvents(events);
    },
    registration
  });
};

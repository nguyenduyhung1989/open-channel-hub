import {
  TelegramBotConnectorAdapter,
  TelegramHttpBotGateway
} from '@open-channel-hub/connector-telegram';
import type {
  CanonicalEvent,
  ConnectionRegistration,
  ProviderCommand,
  ProviderReceipt
} from '@open-channel-hub/contracts';
import {
  SendMessage,
  type InboundEventListInput,
  type InboundEventPage,
  type OutboundMessagePort,
  type SendMessageResult
} from '@open-channel-hub/domain';

import type { TelegramBotFeature } from './telegram-bot-feature.js';
import { fingerprintTelegramBotProviderIdentity } from './telegram-bot-provider-identity.js';

export interface TelegramBotConnectionConfiguration {
  readonly botToken: string;
  readonly connectionId: string;
  readonly operatorApiToken: string;
  readonly webhookSecret: string;
  readonly webhookUrl?: string;
}

export interface CreateTelegramBotFeatureOptions {
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
  readonly readInboundEvents: (input: InboundEventListInput) => Promise<InboundEventPage>;
  readonly receiveEvents: (events: readonly CanonicalEvent[]) => Promise<void>;
}

/**
 * Wires one explicitly configured official Telegram Bot into the application.
 * Accepted inbound events are normalized and handed to the required durable
 * sink supplied by the composition root.
 */
export const createTelegramBotFeature = async (
  environment: TelegramBotConnectionConfiguration,
  options: CreateTelegramBotFeatureOptions
): Promise<TelegramBotFeature> => {
  const providerIdentityFingerprint = fingerprintTelegramBotProviderIdentity(environment.botToken);

  if (providerIdentityFingerprint === undefined) {
    throw new Error('Telegram Bot token does not have a stable Bot identity prefix.');
  }

  const gateway = new TelegramHttpBotGateway({
    botToken: environment.botToken,
    connectionId: environment.connectionId,
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    ...(options.now === undefined ? {} : { now: options.now })
  });
  const connector = new TelegramBotConnectorAdapter({
    connectionId: environment.connectionId,
    gateway
  });
  const outboundPort: OutboundMessagePort = Object.freeze({
    connection: await connector.health(),
    send: async (command: ProviderCommand): Promise<ProviderReceipt> => connector.execute(command)
  });
  const sendMessage = new SendMessage(outboundPort);
  const manifest = connector.manifest();

  const registration: ConnectionRegistration = Object.freeze({
    channel: manifest.channel,
    connectorId: manifest.id,
    id: environment.connectionId,
    providerIdentityFingerprint,
    tier: manifest.tier
  });

  return Object.freeze({
    connectionId: environment.connectionId,
    normalize: (rawEvent: unknown): readonly CanonicalEvent[] => connector.normalize(rawEvent),
    operatorApiToken: environment.operatorApiToken,
    readInboundEvents: options.readInboundEvents,
    receiveEvents: async (events: readonly CanonicalEvent[]): Promise<void> => {
      if (
        !events.every(
          (event) =>
            event.connectionId === environment.connectionId &&
            event.channel === registration.channel
        )
      ) {
        throw new Error('Telegram inbound events do not match their configured connection.');
      }

      await options.receiveEvents(events);
    },
    registration,
    sendMessage: async (input: unknown): Promise<SendMessageResult> => sendMessage.execute(input),
    webhookSecret: environment.webhookSecret
  });
};

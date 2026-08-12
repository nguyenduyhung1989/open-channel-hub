import {
  TelegramBotConnectorAdapter,
  TelegramHttpBotGateway
} from '@open-channel-hub/connector-telegram';
import type { CanonicalEvent, ProviderCommand, ProviderReceipt } from '@open-channel-hub/contracts';
import {
  SendMessage,
  type OutboundMessagePort,
  type SendMessageResult
} from '@open-channel-hub/domain';

import type { EnabledTelegramBotEnvironment } from '../config/environment.js';
import type { TelegramBotFeature } from './telegram-bot-feature.js';

export interface CreateTelegramBotFeatureOptions {
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
  readonly receiveEvents: (events: readonly CanonicalEvent[]) => Promise<void>;
}

/**
 * Wires one explicitly configured official Telegram Bot into the application.
 * Accepted inbound events are normalized and handed to the required durable
 * sink supplied by the composition root.
 */
export const createTelegramBotFeature = async (
  environment: EnabledTelegramBotEnvironment,
  options: CreateTelegramBotFeatureOptions
): Promise<TelegramBotFeature> => {
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

  return Object.freeze({
    connectionId: environment.connectionId,
    normalize: (rawEvent: unknown): readonly CanonicalEvent[] => connector.normalize(rawEvent),
    operatorApiToken: environment.operatorApiToken,
    receiveEvents: options.receiveEvents,
    sendMessage: async (input: unknown): Promise<SendMessageResult> => sendMessage.execute(input),
    webhookSecret: environment.webhookSecret
  });
};

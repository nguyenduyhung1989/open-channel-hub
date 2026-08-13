import type { TelegramBotEnvironment } from '../config/environment.js';
import {
  loadBase64UrlRuntimeConnectionConfiguration,
  loadRuntimeConnectionConfiguration
} from '../connections/runtime-connection-configuration.js';

import type { TelegramBotConnectionConfiguration } from './create-telegram-bot-feature.js';

/**
 * Converts either the legacy one-bot environment or the new secret-backed
 * multi-connection document into the one private shape used by Telegram wiring.
 * It only reads local configuration and never contacts Telegram.
 */
export const loadTelegramBotConnectionConfigurations = async (
  environment: TelegramBotEnvironment
): Promise<readonly TelegramBotConnectionConfiguration[]> => {
  if (!environment.enabled) {
    return Object.freeze([]);
  }

  if (!('configurationFile' in environment)) {
    return Object.freeze([
      Object.freeze({
        botToken: environment.botToken,
        connectionId: environment.connectionId,
        operatorApiToken: environment.operatorApiToken,
        webhookSecret: environment.webhookSecret,
        ...(environment.webhookUrl === undefined ? {} : { webhookUrl: environment.webhookUrl })
      })
    ]);
  }

  const configuration = await (environment.configurationEncoding === 'base64url'
    ? loadBase64UrlRuntimeConnectionConfiguration(environment.configurationFile)
    : loadRuntimeConnectionConfiguration(environment.configurationFile));

  return Object.freeze(
    configuration.connections.map((connection) =>
      Object.freeze({
        botToken: connection.botToken,
        connectionId: connection.id,
        operatorApiToken: connection.operatorApiToken,
        webhookSecret: connection.webhookSecret,
        ...(connection.webhookUrl === undefined ? {} : { webhookUrl: connection.webhookUrl })
      })
    )
  );
};

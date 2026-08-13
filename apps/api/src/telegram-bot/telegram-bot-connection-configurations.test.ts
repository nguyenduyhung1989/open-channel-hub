import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadBase64UrlRuntimeConnectionConfiguration,
  loadRuntimeConnectionConfiguration
} from '../connections/runtime-connection-configuration.js';
import type { TelegramBotEnvironment } from '../config/environment.js';
import { loadTelegramBotConnectionConfigurations } from './telegram-bot-connection-configurations.js';

vi.mock('../connections/runtime-connection-configuration.js', () => ({
  loadBase64UrlRuntimeConnectionConfiguration: vi.fn(),
  loadRuntimeConnectionConfiguration: vi.fn()
}));

const loadBase64UrlRuntimeConnectionConfigurationMock = vi.mocked(
  loadBase64UrlRuntimeConnectionConfiguration
);
const loadRuntimeConnectionConfigurationMock = vi.mocked(loadRuntimeConnectionConfiguration);

describe('loadTelegramBotConnectionConfigurations', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a disabled or legacy environment local without reading a file', async () => {
    const disabled: TelegramBotEnvironment = Object.freeze({ enabled: false });
    const legacy: TelegramBotEnvironment = Object.freeze({
      botToken: 'synthetic-legacy-bot-token',
      connectionId: 'telegram-bot-legacy',
      enabled: true,
      operatorApiToken: 'synthetic_legacy_operator_token_0123456789',
      webhookSecret: 'synthetic_legacy_webhook_secret_0123456789'
    });

    await expect(loadTelegramBotConnectionConfigurations(disabled)).resolves.toEqual([]);
    await expect(loadTelegramBotConnectionConfigurations(legacy)).resolves.toEqual([
      {
        botToken: legacy.botToken,
        connectionId: legacy.connectionId,
        operatorApiToken: legacy.operatorApiToken,
        webhookSecret: legacy.webhookSecret
      }
    ]);
    expect(loadRuntimeConnectionConfigurationMock).not.toHaveBeenCalled();
  });

  it('maps a loaded multi-connection configuration without exposing a caller-selected identity', async () => {
    loadRuntimeConnectionConfigurationMock.mockResolvedValue(
      Object.freeze({
        connections: Object.freeze([
          Object.freeze({
            botToken: 'synthetic-bot-token-support',
            id: 'telegram-bot-support',
            operatorApiToken: 'synthetic_operator_token_support_0123456789',
            type: 'telegram_bot' as const,
            webhookSecret: 'synthetic_webhook_secret_support_0123456789',
            webhookUrl: 'https://example.test/v1/webhooks/telegram-bot/telegram-bot-support'
          }),
          Object.freeze({
            botToken: 'synthetic-bot-token-sales',
            id: 'telegram-bot-sales',
            operatorApiToken: 'synthetic_operator_token_sales_01234567890',
            type: 'telegram_bot' as const,
            webhookSecret: 'synthetic_webhook_secret_sales_012345678901'
          }),
          Object.freeze({
            appId: '1234567890123456789',
            id: 'zalo-oa-support',
            oaId: '9876543210987654321',
            oaSecretKey: 'synthetic-zalo-oa-secret',
            operatorApiToken: 'synthetic_zalo_operator_support_012345678901234567',
            type: 'zalo_oa' as const
          })
        ])
      })
    );
    const environment: TelegramBotEnvironment = Object.freeze({
      configurationEncoding: 'json',
      configurationFile: '/run/secrets/runtime_connections',
      enabled: true
    });

    const connections = await loadTelegramBotConnectionConfigurations(environment);

    expect(loadRuntimeConnectionConfigurationMock).toHaveBeenCalledWith(
      '/run/secrets/runtime_connections'
    );
    expect(connections).toEqual([
      {
        botToken: 'synthetic-bot-token-support',
        connectionId: 'telegram-bot-support',
        operatorApiToken: 'synthetic_operator_token_support_0123456789',
        webhookSecret: 'synthetic_webhook_secret_support_0123456789',
        webhookUrl: 'https://example.test/v1/webhooks/telegram-bot/telegram-bot-support'
      },
      {
        botToken: 'synthetic-bot-token-sales',
        connectionId: 'telegram-bot-sales',
        operatorApiToken: 'synthetic_operator_token_sales_01234567890',
        webhookSecret: 'synthetic_webhook_secret_sales_012345678901'
      }
    ]);
    expect(Object.isFrozen(connections)).toBe(true);
    expect(Object.isFrozen(connections[0])).toBe(true);
  });

  it('uses the base64url reader only for the Compose secret mode', async () => {
    loadBase64UrlRuntimeConnectionConfigurationMock.mockResolvedValue(
      Object.freeze({
        connections: Object.freeze([
          Object.freeze({
            botToken: 'synthetic-bot-token-compose',
            id: 'telegram-bot-compose',
            operatorApiToken: 'synthetic_operator_token_compose_0123456789',
            type: 'telegram_bot' as const,
            webhookSecret: 'synthetic_webhook_secret_compose_0123456789'
          })
        ])
      })
    );
    const environment: TelegramBotEnvironment = Object.freeze({
      configurationEncoding: 'base64url',
      configurationFile: '/run/secrets/runtime_connections_base64',
      enabled: true
    });

    await expect(loadTelegramBotConnectionConfigurations(environment)).resolves.toMatchObject([
      { connectionId: 'telegram-bot-compose' }
    ]);
    expect(loadBase64UrlRuntimeConnectionConfigurationMock).toHaveBeenCalledWith(
      '/run/secrets/runtime_connections_base64'
    );
    expect(loadRuntimeConnectionConfigurationMock).not.toHaveBeenCalled();
  });
});

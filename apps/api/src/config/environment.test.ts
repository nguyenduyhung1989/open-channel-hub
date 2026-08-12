import { describe, expect, it } from 'vitest';

import { EnvironmentConfigurationError, parseEnvironment } from './environment.js';

describe('parseEnvironment', () => {
  it('returns only the documented runtime settings with safe defaults', () => {
    expect(parseEnvironment({})).toEqual({
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      PORT: 3000,
      sourceOfferUrl: 'https://github.com/nguyenduyhung1989/open-channel-hub',
      telegramBot: { enabled: false }
    });
  });

  it('does not enable Telegram merely because secrets are present', () => {
    expect(
      parseEnvironment({
        OPERATOR_API_TOKEN: 'a'.repeat(32),
        PORT: '3010',
        TELEGRAM_BOT_TOKEN: 'synthetic-bot-token',
        TELEGRAM_WEBHOOK_SECRET: 'synthetic_webhook_secret_0123456789'
      })
    ).toEqual({
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      PORT: 3010,
      sourceOfferUrl: 'https://github.com/nguyenduyhung1989/open-channel-hub',
      telegramBot: { enabled: false }
    });
  });

  it('rejects an invalid port before the server starts', () => {
    expect(() => parseEnvironment({ PORT: '0' })).toThrow(EnvironmentConfigurationError);
  });

  it('requires all Telegram secrets when the official connector is enabled', () => {
    expect(() => parseEnvironment({ TELEGRAM_BOT_ENABLED: 'true' })).toThrow(
      EnvironmentConfigurationError
    );
  });

  it('returns an enabled Telegram configuration only after validating secrets and HTTPS webhook URL', () => {
    expect(
      parseEnvironment({
        OPERATOR_API_TOKEN: 'operator-token-with-at-least-thirty-two-characters',
        TELEGRAM_BOT_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: 'synthetic-bot-token',
        TELEGRAM_CONNECTION_ID: 'telegram.bot:primary',
        TELEGRAM_WEBHOOK_SECRET: 'synthetic_webhook_secret_0123456789',
        TELEGRAM_WEBHOOK_URL: 'https://example.test/v1/webhooks/telegram-bot'
      })
    ).toEqual({
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      PORT: 3000,
      sourceOfferUrl: 'https://github.com/nguyenduyhung1989/open-channel-hub',
      telegramBot: {
        botToken: 'synthetic-bot-token',
        connectionId: 'telegram.bot:primary',
        enabled: true,
        operatorApiToken: 'operator-token-with-at-least-thirty-two-characters',
        webhookSecret: 'synthetic_webhook_secret_0123456789',
        webhookUrl: 'https://example.test/v1/webhooks/telegram-bot'
      }
    });
  });

  it('requires an exact corresponding-source URL in production', () => {
    expect(() => parseEnvironment({ NODE_ENV: 'production' })).toThrow(
      EnvironmentConfigurationError
    );
    expect(
      parseEnvironment({
        NODE_ENV: 'production',
        SOURCE_OFFER_URL: 'https://example.test/open-channel-hub/source/phase-1a'
      }).sourceOfferUrl
    ).toBe('https://example.test/open-channel-hub/source/phase-1a');
    expect(() =>
      parseEnvironment({
        SOURCE_OFFER_URL: 'https://example.test/open-channel-hub/source?credential=synthetic'
      })
    ).toThrow(EnvironmentConfigurationError);
  });

  it('allows an omitted or blank optional Telegram webhook URL', () => {
    const configuration = {
      OPERATOR_API_TOKEN: 'operator-token-with-at-least-thirty-two-characters',
      TELEGRAM_BOT_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: 'synthetic-bot-token',
      TELEGRAM_WEBHOOK_SECRET: 'synthetic_webhook_secret_0123456789'
    };

    expect(parseEnvironment(configuration).telegramBot).toMatchObject({ enabled: true });
    expect(
      parseEnvironment({
        ...configuration,
        TELEGRAM_WEBHOOK_URL: '   '
      }).telegramBot
    ).toMatchObject({ enabled: true });
  });

  it('requires separate operator and Telegram webhook secrets', () => {
    const sharedSecret = 'synthetic_shared_secret_0123456789';

    expect(() =>
      parseEnvironment({
        OPERATOR_API_TOKEN: sharedSecret,
        TELEGRAM_BOT_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: 'synthetic-bot-token',
        TELEGRAM_WEBHOOK_SECRET: sharedSecret
      })
    ).toThrow(EnvironmentConfigurationError);
  });

  it('rejects a short or malformed Telegram webhook secret and unsafe webhook URL', () => {
    const configuration = {
      OPERATOR_API_TOKEN: 'operator-token-with-at-least-thirty-two-characters',
      TELEGRAM_BOT_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: 'synthetic-bot-token',
      TELEGRAM_WEBHOOK_SECRET: 'short-secret'
    };

    expect(() => parseEnvironment(configuration)).toThrow(EnvironmentConfigurationError);
    expect(() =>
      parseEnvironment({
        ...configuration,
        TELEGRAM_WEBHOOK_SECRET: 'synthetic_webhook_secret_0123456789',
        TELEGRAM_WEBHOOK_URL: 'http://example.test/v1/webhooks/telegram-bot'
      })
    ).toThrow(EnvironmentConfigurationError);
    expect(() =>
      parseEnvironment({
        ...configuration,
        TELEGRAM_WEBHOOK_SECRET: 'invalid secret that cannot be used here'
      })
    ).toThrow(EnvironmentConfigurationError);
    expect(() =>
      parseEnvironment({
        ...configuration,
        TELEGRAM_WEBHOOK_SECRET: 'synthetic_webhook_secret_0123456789',
        TELEGRAM_WEBHOOK_URL: 'https://example.test/v1/webhooks/telegram-bot?secret=synthetic'
      })
    ).toThrow(EnvironmentConfigurationError);
    expect(() =>
      parseEnvironment({
        ...configuration,
        TELEGRAM_WEBHOOK_SECRET: 'synthetic_webhook_secret_0123456789',
        TELEGRAM_WEBHOOK_URL: 'https://example.test/v1/webhooks/telegram-bot#synthetic'
      })
    ).toThrow(EnvironmentConfigurationError);
  });
});

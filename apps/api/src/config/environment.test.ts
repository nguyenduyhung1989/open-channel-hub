import { describe, expect, it } from 'vitest';

import { EnvironmentConfigurationError, parseEnvironment } from './environment.js';

const POSTGRES_ENVIRONMENT = Object.freeze({
  DATABASE_HOST: 'postgres',
  DATABASE_NAME: 'open_channel_hub',
  DATABASE_PASSWORD_FILE: '/run/secrets/database_password',
  DATABASE_PORT: '5432',
  DATABASE_USER: 'open_channel_hub'
});

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
        ...POSTGRES_ENVIRONMENT,
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
      postgres: {
        database: 'open_channel_hub',
        host: 'postgres',
        passwordFile: '/run/secrets/database_password',
        port: 5432,
        user: 'open_channel_hub'
      },
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
        ...POSTGRES_ENVIRONMENT,
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

  it('requires an isolated PostgreSQL configuration in production and when Telegram is enabled', () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        SOURCE_OFFER_URL: 'https://example.test/open-channel-hub/source/phase-2a'
      })
    ).toThrow(EnvironmentConfigurationError);
    expect(() =>
      parseEnvironment({
        TELEGRAM_BOT_ENABLED: 'true',
        OPERATOR_API_TOKEN: 'operator-token-with-at-least-thirty-two-characters',
        TELEGRAM_BOT_TOKEN: 'synthetic-bot-token',
        TELEGRAM_WEBHOOK_SECRET: 'synthetic_webhook_secret_0123456789'
      })
    ).toThrow(EnvironmentConfigurationError);
  });

  it('rejects partial, unsafe, or differently named PostgreSQL configuration', () => {
    expect(() => parseEnvironment({ DATABASE_HOST: 'postgres' })).toThrow(
      EnvironmentConfigurationError
    );
    expect(() =>
      parseEnvironment({
        DATABASE_HOST: 'postgres',
        DATABASE_NAME: 'another_database',
        DATABASE_PASSWORD_FILE: '/run/secrets/database_password',
        DATABASE_PORT: '5432',
        DATABASE_USER: 'open_channel_hub'
      })
    ).toThrow(EnvironmentConfigurationError);
    expect(() =>
      parseEnvironment({
        DATABASE_HOST: 'postgres',
        DATABASE_NAME: 'open_channel_hub',
        DATABASE_PASSWORD_FILE: 'relative-password-file',
        DATABASE_PORT: '5432',
        DATABASE_USER: 'open_channel_hub'
      })
    ).toThrow(EnvironmentConfigurationError);
  });

  it('allows an omitted or blank optional Telegram webhook URL', () => {
    const configuration = {
      ...POSTGRES_ENVIRONMENT,
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
        ...POSTGRES_ENVIRONMENT,
        OPERATOR_API_TOKEN: sharedSecret,
        TELEGRAM_BOT_ENABLED: 'true',
        TELEGRAM_BOT_TOKEN: 'synthetic-bot-token',
        TELEGRAM_WEBHOOK_SECRET: sharedSecret
      })
    ).toThrow(EnvironmentConfigurationError);
  });

  it('rejects a short or malformed Telegram webhook secret and unsafe webhook URL', () => {
    const configuration = {
      ...POSTGRES_ENVIRONMENT,
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

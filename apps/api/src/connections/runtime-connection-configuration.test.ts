import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadBase64UrlRuntimeConnectionConfiguration,
  loadRuntimeConnectionConfiguration,
  RuntimeConnectionConfigurationError,
  type RuntimeTelegramBotConnection
} from './runtime-connection-configuration.js';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));

const readFileMock = vi.mocked(readFile);
const CONFIGURATION_PATH = '/run/secrets/open-channel-hub-connections.json';

describe('loadRuntimeConnectionConfiguration', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('loads two synthetic Telegram Bot connections from one exact JSON document', async () => {
    const configuration = validConfiguration();
    readFileMock.mockResolvedValue(JSON.stringify(configuration));

    await expect(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH)).resolves.toEqual({
      connections: configuration.connections
    });
    expect(readFileMock).toHaveBeenCalledWith(CONFIGURATION_PATH, 'utf8');
  });

  it('loads a canonical base64url JSON document without interpreting credential characters', async () => {
    const configuration = validConfiguration();
    configuration.connections[0]!.botToken = 'synthetic-bot-$credential';
    const encoded = Buffer.from(JSON.stringify(configuration), 'utf8').toString('base64url');
    readFileMock.mockResolvedValue(encoded);

    await expect(loadBase64UrlRuntimeConnectionConfiguration(CONFIGURATION_PATH)).resolves.toEqual({
      connections: configuration.connections
    });
    expect(readFileMock).toHaveBeenCalledWith(CONFIGURATION_PATH, 'utf8');
  });

  it('returns a deeply immutable snapshot', async () => {
    readFileMock.mockResolvedValue(JSON.stringify(validConfiguration()));

    const configuration = await loadRuntimeConnectionConfiguration(CONFIGURATION_PATH);
    const firstConnection = configuration.connections[0];

    expect(firstConnection).toBeDefined();
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.connections)).toBe(true);
    expect(Object.isFrozen(firstConnection)).toBe(true);
    expect(() => {
      (configuration.connections as RuntimeTelegramBotConnection[]).push(
        firstConnection as RuntimeTelegramBotConnection
      );
    }).toThrow(TypeError);
    expect(() => {
      (firstConnection as { id: string }).id = 'mutated-id';
    }).toThrow(TypeError);
  });

  it('rejects invalid JSON and an inexact document without exposing its contents', async () => {
    readFileMock.mockResolvedValue('{"botToken":"synthetic-content-that-must-not-leak"');

    const parseError = await expectGenericFailure(
      loadRuntimeConnectionConfiguration(CONFIGURATION_PATH)
    );

    expect(String(parseError)).not.toContain('synthetic-content-that-must-not-leak');

    const configuration = validConfiguration();
    Object.assign(configuration, { unexpected: true });
    readFileMock.mockResolvedValue(JSON.stringify(configuration));

    await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
  });

  it('rejects non-canonical, malformed, oversized, and non-UTF8 base64url documents', async () => {
    const invalidSources = [
      'not base64url',
      `${Buffer.from(JSON.stringify(validConfiguration()), 'utf8').toString('base64url')}=`,
      Buffer.from([0xff, 0xfe]).toString('base64url'),
      'a'.repeat(349_527)
    ];

    for (const source of invalidSources) {
      readFileMock.mockResolvedValueOnce(source);
      const error = await expectGenericFailure(
        loadBase64UrlRuntimeConnectionConfiguration(CONFIGURATION_PATH)
      );

      expect(String(error)).not.toContain(source.slice(0, 32));
    }
  });

  it('rejects invalid paths before reading a file', async () => {
    for (const path of ['', 'relative.json', '   ', `/${'a'.repeat(1024)}`]) {
      await expectGenericFailure(loadRuntimeConnectionConfiguration(path));
    }

    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('returns a generic error when the configuration file cannot be read', async () => {
    readFileMock.mockRejectedValue(
      new Error(`${CONFIGURATION_PATH}: synthetic file-system detail must never leave the loader.`)
    );

    const error = await expectGenericFailure(
      loadRuntimeConnectionConfiguration(CONFIGURATION_PATH)
    );

    expect(String(error)).not.toContain(CONFIGURATION_PATH);
    expect(String(error)).not.toContain('file-system detail');
  });

  it('rejects duplicate connection identifiers and every cross-connection secret collision', async () => {
    const duplicateIdentifier = validConfiguration();
    duplicateIdentifier.connections[1]!.id = duplicateIdentifier.connections[0]!.id;
    duplicateIdentifier.connections[1]!.webhookUrl =
      'https://example.test/v1/webhooks/telegram-bot/telegram-bot-primary';

    const duplicateSecret = validConfiguration();
    duplicateSecret.connections[1]!.botToken = duplicateSecret.connections[0]!.botToken;

    const crossRoleSecret = validConfiguration();
    crossRoleSecret.connections[1]!.operatorApiToken =
      crossRoleSecret.connections[0]!.webhookSecret;

    for (const configuration of [duplicateIdentifier, duplicateSecret, crossRoleSecret]) {
      readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));
      await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
    }
  });

  it('rejects path-normalizing connection identifiers before they can become webhook paths', async () => {
    for (const id of ['.', '..']) {
      const configuration = validConfiguration();
      configuration.connections[0]!.id = id;
      delete configuration.connections[0]!.webhookUrl;
      readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));

      await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
    }
  });

  it('rejects non-public, malformed, and mismatched webhook URLs', async () => {
    const invalidUrls = [
      'http://example.test/v1/webhooks/telegram-bot/telegram-bot-primary',
      'https://operator:synthetic@example.test/v1/webhooks/telegram-bot/telegram-bot-primary',
      'https://example.test/v1/webhooks/telegram-bot/telegram-bot-secondary',
      'https://example.test/v1/webhooks/telegram-bot/telegram-bot-primary?credential=synthetic',
      'https://example.test/v1/webhooks/telegram-bot/telegram-bot-primary#synthetic',
      '/v1/webhooks/telegram-bot/telegram-bot-primary',
      'https://localhost/v1/webhooks/telegram-bot/telegram-bot-primary',
      'https://127.0.0.1/v1/webhooks/telegram-bot/telegram-bot-primary'
    ];

    for (const webhookUrl of invalidUrls) {
      const configuration = validConfiguration();
      configuration.connections[0]!.webhookUrl = webhookUrl;
      readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));

      await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
    }
  });
});

const validConfiguration = (): MutableRuntimeConnectionConfiguration => ({
  version: 1,
  connections: [
    {
      id: 'telegram-bot-primary',
      type: 'telegram_bot',
      botToken: 'synthetic-bot-token-primary',
      operatorApiToken: 'synthetic_operator_api_token_primary_0123456789',
      webhookSecret: 'synthetic_webhook_secret_primary_0123456789',
      webhookUrl: 'https://example.test/v1/webhooks/telegram-bot/telegram-bot-primary'
    },
    {
      id: 'telegram-bot-secondary',
      type: 'telegram_bot',
      botToken: 'synthetic-bot-token-secondary',
      operatorApiToken: 'synthetic_operator_api_token_secondary_0123456789',
      webhookSecret: 'synthetic_webhook_secret_secondary_0123456789',
      webhookUrl: 'https://example.test/v1/webhooks/telegram-bot/telegram-bot-secondary'
    }
  ]
});

interface MutableRuntimeConnectionConfiguration {
  version: number;
  connections: MutableRuntimeTelegramBotConnection[];
}

interface MutableRuntimeTelegramBotConnection {
  id: string;
  type: string;
  botToken: string;
  operatorApiToken: string;
  webhookSecret: string;
  webhookUrl?: string;
}

const expectGenericFailure = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeConnectionConfigurationError);
    expect(error).toMatchObject({
      message: 'The runtime connection configuration is invalid.',
      name: 'RuntimeConnectionConfigurationError'
    });
    expect(error).not.toHaveProperty('cause');

    return error as Error;
  }

  throw new Error('Expected runtime connection configuration loading to fail.');
};

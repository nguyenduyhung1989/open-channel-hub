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

  it('loads an optional immutable inbox scope while keeping old v1 documents inbox-free', async () => {
    const legacyConfiguration = validConfiguration();
    readFileMock.mockResolvedValueOnce(JSON.stringify(legacyConfiguration));

    const legacy = await loadRuntimeConnectionConfiguration(CONFIGURATION_PATH);

    expect(legacy).toEqual({ connections: legacyConfiguration.connections });
    expect(Object.hasOwn(legacy, 'inboxes')).toBe(false);

    const configuration = validInboxConfiguration();
    readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));

    const result = await loadRuntimeConnectionConfiguration(CONFIGURATION_PATH);

    expect(result).toEqual({
      connections: configuration.connections,
      inboxes: [
        {
          connectionIds: ['telegram-bot-primary', 'telegram-bot-secondary'],
          id: 'support-inbox',
          token: 'synthetic_inbox_support_token_01234567890123456789'
        }
      ]
    });
    const inbox = result.inboxes?.[0];
    expect(inbox).toBeDefined();
    expect(Object.isFrozen(result.inboxes)).toBe(true);
    expect(Object.isFrozen(inbox)).toBe(true);
    expect(Object.isFrozen(inbox?.connectionIds)).toBe(true);
    expect(() => {
      (inbox?.connectionIds as string[]).push('telegram-bot-another');
    }).toThrow(TypeError);
  });

  it('rejects invalid inbox scopes and every collision with a connection credential', async () => {
    const emptyScope = validInboxConfiguration();
    emptyScope.inboxes[0]!.connectionIds = [];

    const duplicateScopeMember = validInboxConfiguration();
    duplicateScopeMember.inboxes[0]!.connectionIds = [
      'telegram-bot-primary',
      'telegram-bot-primary'
    ];

    const unknownScopeMember = validInboxConfiguration();
    unknownScopeMember.inboxes[0]!.connectionIds = ['not-configured'];

    const duplicateInboxId = validInboxConfiguration();
    duplicateInboxId.inboxes.push({
      connectionIds: ['telegram-bot-primary'],
      id: 'support-inbox',
      token: 'synthetic_inbox_sales_token_01234567890123456789012'
    });

    const duplicateInboxToken = validInboxConfiguration();
    duplicateInboxToken.inboxes.push({
      connectionIds: ['telegram-bot-primary'],
      id: 'sales-inbox',
      token: duplicateInboxToken.inboxes[0]!.token
    });

    const operatorCredentialCollision = validInboxConfiguration();
    operatorCredentialCollision.inboxes[0]!.token =
      operatorCredentialCollision.connections[0]!.operatorApiToken;

    const botCredentialCollision = validInboxConfiguration();
    botCredentialCollision.inboxes[0]!.token = botCredentialCollision.connections[0]!.botToken;

    const webhookCredentialCollision = validInboxConfiguration();
    webhookCredentialCollision.inboxes[0]!.token =
      webhookCredentialCollision.connections[0]!.webhookSecret;

    for (const configuration of [
      emptyScope,
      duplicateScopeMember,
      unknownScopeMember,
      duplicateInboxId,
      duplicateInboxToken,
      operatorCredentialCollision,
      botCredentialCollision,
      webhookCredentialCollision
    ]) {
      readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));
      await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
    }
  });

  it('rejects an inbox token that collides with a shared Meta App credential', async () => {
    const configuration =
      validFacebookPageConfiguration() as MutableRuntimeFacebookPageConfiguration & {
        inboxes: MutableRuntimeInbox[];
      };
    configuration.inboxes = [
      {
        connectionIds: ['facebook-page-support'],
        id: 'support-inbox',
        token: configuration.connections[0]!.appSecret
      }
    ];
    readFileMock.mockResolvedValue(JSON.stringify(configuration));

    await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
  });

  it('rejects an inbox token that collides with a Zalo OA provider credential', async () => {
    const configuration = validZaloOaConfiguration() as MutableRuntimeZaloOaConfiguration & {
      inboxes: MutableRuntimeInbox[];
    };
    configuration.inboxes = [
      {
        connectionIds: ['zalo-oa-support'],
        id: 'support-inbox',
        token: configuration.connections[0]!.oaSecretKey
      }
    ];
    readFileMock.mockResolvedValue(JSON.stringify(configuration));

    await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
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

  it('accepts several OA accounts for one Zalo App with independently configured OA secrets', async () => {
    const configuration = validZaloOaConfiguration();
    configuration.connections[1]!.oaSecretKey = 'synthetic-zalo-sales-oa-secret';
    readFileMock.mockResolvedValue(JSON.stringify(configuration));

    await expect(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH)).resolves.toEqual({
      connections: configuration.connections
    });
  });

  it('rejects ambiguous Zalo App/OA mappings and cross-platform credential reuse', async () => {
    const duplicatePair = validZaloOaConfiguration();
    duplicatePair.connections[1]!.oaId = duplicatePair.connections[0]!.oaId;

    const crossPlatformCredential = validConfiguration();
    crossPlatformCredential.connections.push({
      ...validZaloOaConnection(),
      oaSecretKey: crossPlatformCredential.connections[0]!.botToken
    } as unknown as MutableRuntimeTelegramBotConnection);

    for (const configuration of [duplicatePair, crossPlatformCredential]) {
      readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));
      await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
    }
  });

  it('rejects malformed Zalo identifiers and a webhook URL outside its fixed App-level path', async () => {
    const invalidIdentifiers = [
      { appId: 'app-123' },
      { oaId: 'oa-456' },
      { id: '.' },
      { oaSecretKey: '' }
    ];

    for (const override of invalidIdentifiers) {
      const configuration = validZaloOaConfiguration();
      Object.assign(configuration.connections[0]!, override);
      readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));

      await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
    }

    for (const webhookUrl of [
      'https://example.test/v1/webhooks/zalo-oa?credential=synthetic',
      'https://example.test/v1/webhooks/zalo-oa/another-oa',
      'https://localhost/v1/webhooks/zalo-oa'
    ]) {
      const configuration = validZaloOaConfiguration();
      configuration.connections[0]!.webhookUrl = webhookUrl;
      readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));

      await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
    }
  });

  it('accepts multiple Facebook Pages for one App when its App credentials are identical', async () => {
    const configuration = validFacebookPageConfiguration();
    readFileMock.mockResolvedValue(JSON.stringify(configuration));

    await expect(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH)).resolves.toEqual({
      connections: configuration.connections
    });
  });

  it('rejects ambiguous Facebook Page mappings, App credential drift, and cross-role reuse', async () => {
    const duplicatePage = validFacebookPageConfiguration();
    duplicatePage.connections[1]!.pageId = duplicatePage.connections[0]!.pageId;

    const appSecretDrift = validFacebookPageConfiguration();
    appSecretDrift.connections[1]!.appSecret = 'synthetic-facebook-app-secret-sales-012345678901';

    const verifyTokenAcrossApps = validFacebookPageConfiguration();
    verifyTokenAcrossApps.connections[1]!.appId = '1234567890123456790';

    const facebookWithZalo = validFacebookPageConfiguration();
    facebookWithZalo.connections.push(
      validZaloOaConnection({
        id: 'zalo-oa-collision',
        oaId: '9876543210987654333',
        oaSecretKey: facebookWithZalo.connections[0]!.appSecret
      }) as unknown as MutableRuntimeFacebookPageConnection
    );

    for (const configuration of [
      duplicatePage,
      appSecretDrift,
      verifyTokenAcrossApps,
      facebookWithZalo
    ]) {
      readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));
      await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
    }
  });

  it('rejects malformed Facebook identifiers, short credentials, and a webhook URL outside its fixed path', async () => {
    const invalidConnections: readonly Readonly<Partial<MutableRuntimeFacebookPageConnection>>[] = [
      { appId: 'app-123' },
      { pageId: 'page-456' },
      { id: '..' },
      { appSecret: 'too-short' },
      { webhookVerifyToken: 'too-short' }
    ];

    for (const override of invalidConnections) {
      const configuration = validFacebookPageConfiguration();
      Object.assign(configuration.connections[0]!, override);
      readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));
      await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
    }

    for (const webhookUrl of [
      'https://example.test/v1/webhooks/facebook-page?credential=synthetic',
      'https://example.test/v1/webhooks/facebook-page/another-page',
      'https://localhost/v1/webhooks/facebook-page'
    ]) {
      const configuration = validFacebookPageConfiguration();
      configuration.connections[0]!.webhookUrl = webhookUrl;
      readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));
      await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
    }
  });

  it('accepts multiple WhatsApp Business phone numbers for one WABA and a shared Meta App', async () => {
    const configuration = validWhatsAppBusinessConfiguration();
    readFileMock.mockResolvedValue(JSON.stringify(configuration));

    await expect(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH)).resolves.toEqual({
      connections: configuration.connections
    });
  });

  it('accepts Facebook Page and WhatsApp Business connections that share one exact Meta callback URL', async () => {
    const sharedWebhookUrl = 'https://example.test/v1/webhooks/meta';
    const configuration: MutableMixedMetaRuntimeConnectionConfiguration = {
      version: 1,
      connections: [
        validFacebookPageConnection({ webhookUrl: sharedWebhookUrl }),
        validWhatsAppBusinessConnection({ webhookUrl: sharedWebhookUrl })
      ]
    };
    readFileMock.mockResolvedValue(JSON.stringify(configuration));

    await expect(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH)).resolves.toEqual({
      connections: configuration.connections
    });
  });

  it('rejects ambiguous WhatsApp mappings, incompatible shared Meta callbacks, credential drift, and cross-role reuse', async () => {
    const duplicatePhoneNumber = validWhatsAppBusinessConfiguration();
    duplicatePhoneNumber.connections[1]!.phoneNumberId =
      duplicatePhoneNumber.connections[0]!.phoneNumberId;

    const wabaAcrossApps = validWhatsAppBusinessConfiguration();
    Object.assign(wabaAcrossApps.connections[1]!, {
      appId: '1234567890123456790',
      appSecret: 'synthetic-whatsapp-second-app-secret-012345678901',
      webhookVerifyToken: 'synthetic-whatsapp-second-verify-token-0123456789'
    });

    const metaCredentialDrift: MutableMixedMetaRuntimeConnectionConfiguration = {
      version: 1,
      connections: [
        validFacebookPageConnection(),
        validWhatsAppBusinessConnection({
          appSecret: 'synthetic-whatsapp-drift-app-secret-01234567890123'
        })
      ]
    };

    const incompatibleSharedMetaCallbacks: MutableMixedMetaRuntimeConnectionConfiguration = {
      version: 1,
      connections: [validFacebookPageConnection(), validWhatsAppBusinessConnection()]
    };

    const differentSharedMetaHosts: MutableMixedMetaRuntimeConnectionConfiguration = {
      version: 1,
      connections: [
        validFacebookPageConnection({
          webhookUrl: 'https://facebook.example.test/v1/webhooks/meta'
        }),
        validWhatsAppBusinessConnection({
          webhookUrl: 'https://whatsapp.example.test/v1/webhooks/meta'
        })
      ]
    };

    const crossRoleReuse = validWhatsAppBusinessConfiguration();
    crossRoleReuse.connections.push(
      validZaloOaConnection({
        id: 'zalo-oa-whatsapp-collision',
        oaId: '9876543210987654333',
        oaSecretKey: crossRoleReuse.connections[0]!.appSecret
      }) as unknown as MutableRuntimeWhatsAppBusinessConnection
    );

    for (const configuration of [
      duplicatePhoneNumber,
      wabaAcrossApps,
      metaCredentialDrift,
      incompatibleSharedMetaCallbacks,
      differentSharedMetaHosts,
      crossRoleReuse
    ]) {
      readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));
      await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
    }
  });

  it('rejects malformed WhatsApp Business identifiers, short credentials, and a webhook URL outside its fixed path', async () => {
    const invalidConnections: readonly Readonly<
      Partial<MutableRuntimeWhatsAppBusinessConnection>
    >[] = [
      { appId: 'app-123' },
      { wabaId: 'waba-456' },
      { phoneNumberId: 'phone-789' },
      { id: '.' },
      { appSecret: 'too-short' },
      { webhookVerifyToken: 'too-short' }
    ];

    for (const override of invalidConnections) {
      const configuration = validWhatsAppBusinessConfiguration();
      Object.assign(configuration.connections[0]!, override);
      readFileMock.mockResolvedValueOnce(JSON.stringify(configuration));
      await expectGenericFailure(loadRuntimeConnectionConfiguration(CONFIGURATION_PATH));
    }

    for (const webhookUrl of [
      'https://example.test/v1/webhooks/whatsapp-business?credential=synthetic',
      'https://example.test/v1/webhooks/whatsapp-business/another-phone',
      'https://localhost/v1/webhooks/whatsapp-business'
    ]) {
      const configuration = validWhatsAppBusinessConfiguration();
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

const validInboxConfiguration = (): MutableRuntimeInboxConfiguration => ({
  ...validConfiguration(),
  inboxes: [
    {
      connectionIds: ['telegram-bot-secondary', 'telegram-bot-primary'],
      id: 'support-inbox',
      token: 'synthetic_inbox_support_token_01234567890123456789'
    }
  ]
});

interface MutableRuntimeConnectionConfiguration {
  version: number;
  connections: MutableRuntimeTelegramBotConnection[];
}

interface MutableRuntimeInboxConfiguration extends MutableRuntimeConnectionConfiguration {
  inboxes: MutableRuntimeInbox[];
}

interface MutableRuntimeInbox {
  connectionIds: string[];
  id: string;
  token: string;
}

interface MutableRuntimeTelegramBotConnection {
  id: string;
  type: string;
  botToken: string;
  operatorApiToken: string;
  webhookSecret: string;
  webhookUrl?: string;
}

const validZaloOaConfiguration = (): MutableRuntimeZaloOaConfiguration => ({
  version: 1,
  connections: [
    validZaloOaConnection(),
    validZaloOaConnection({
      id: 'zalo-oa-sales',
      oaId: '9876543210987654322',
      operatorApiToken: 'synthetic_zalo_operator_sales_0123456789012345678'
    })
  ]
});

const validZaloOaConnection = (
  overrides: Readonly<Partial<MutableRuntimeZaloOaConnection>> = {}
): MutableRuntimeZaloOaConnection => ({
  appId: '1234567890123456789',
  id: 'zalo-oa-support',
  oaId: '9876543210987654321',
  oaSecretKey: 'synthetic-zalo-oa-secret',
  operatorApiToken: 'synthetic_zalo_operator_support_012345678901234567',
  type: 'zalo_oa',
  webhookUrl: 'https://example.test/v1/webhooks/zalo-oa',
  ...overrides
});

interface MutableRuntimeZaloOaConfiguration {
  version: number;
  connections: MutableRuntimeZaloOaConnection[];
}

interface MutableRuntimeZaloOaConnection {
  appId: string;
  id: string;
  oaId: string;
  oaSecretKey: string;
  operatorApiToken: string;
  type: string;
  webhookUrl?: string;
}

const validFacebookPageConfiguration = (): MutableRuntimeFacebookPageConfiguration => ({
  version: 1,
  connections: [
    validFacebookPageConnection(),
    validFacebookPageConnection({
      id: 'facebook-page-sales',
      operatorApiToken: 'synthetic_facebook_sales_operator_012345678901234567',
      pageId: '9876543210987654322'
    })
  ]
});

const validFacebookPageConnection = (
  overrides: Readonly<Partial<MutableRuntimeFacebookPageConnection>> = {}
): MutableRuntimeFacebookPageConnection => ({
  appId: '1234567890123456789',
  appSecret: 'synthetic-facebook-app-secret-01234567890123456789',
  id: 'facebook-page-support',
  operatorApiToken: 'synthetic_facebook_operator_support_012345678901234567',
  pageId: '9876543210987654321',
  type: 'facebook_page',
  webhookUrl: 'https://example.test/v1/webhooks/facebook-page',
  webhookVerifyToken: 'synthetic-facebook-verify-token-012345678901234567',
  ...overrides
});

interface MutableRuntimeFacebookPageConfiguration {
  version: number;
  connections: MutableRuntimeFacebookPageConnection[];
}

interface MutableRuntimeFacebookPageConnection {
  appId: string;
  appSecret: string;
  id: string;
  operatorApiToken: string;
  pageId: string;
  type: string;
  webhookUrl?: string;
  webhookVerifyToken: string;
}

const validWhatsAppBusinessConfiguration = (): MutableRuntimeWhatsAppBusinessConfiguration => ({
  version: 1,
  connections: [
    validWhatsAppBusinessConnection(),
    validWhatsAppBusinessConnection({
      id: 'whatsapp-business-sales',
      operatorApiToken: 'synthetic_whatsapp_operator_sales_012345678901234567',
      phoneNumberId: '9876543210987654322'
    })
  ]
});

const validWhatsAppBusinessConnection = (
  overrides: Readonly<Partial<MutableRuntimeWhatsAppBusinessConnection>> = {}
): MutableRuntimeWhatsAppBusinessConnection => ({
  appId: '1234567890123456789',
  appSecret: 'synthetic-facebook-app-secret-01234567890123456789',
  id: 'whatsapp-business-support',
  operatorApiToken: 'synthetic_whatsapp_operator_support_012345678901234567',
  phoneNumberId: '9876543210987654321',
  type: 'whatsapp_business',
  wabaId: '1111111111111111111',
  webhookUrl: 'https://example.test/v1/webhooks/whatsapp-business',
  webhookVerifyToken: 'synthetic-facebook-verify-token-012345678901234567',
  ...overrides
});

interface MutableRuntimeWhatsAppBusinessConfiguration {
  version: number;
  connections: MutableRuntimeWhatsAppBusinessConnection[];
}

interface MutableMixedMetaRuntimeConnectionConfiguration {
  version: number;
  connections: Array<
    MutableRuntimeFacebookPageConnection | MutableRuntimeWhatsAppBusinessConnection
  >;
}

interface MutableRuntimeWhatsAppBusinessConnection {
  appId: string;
  appSecret: string;
  id: string;
  operatorApiToken: string;
  phoneNumberId: string;
  type: string;
  wabaId: string;
  webhookUrl?: string;
  webhookVerifyToken: string;
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

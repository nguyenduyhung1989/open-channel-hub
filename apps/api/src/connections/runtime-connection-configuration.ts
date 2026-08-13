import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';

export interface RuntimeTelegramBotConnection {
  readonly id: string;
  readonly type: 'telegram_bot';
  readonly botToken: string;
  readonly operatorApiToken: string;
  readonly webhookSecret: string;
  readonly webhookUrl?: string;
}

/**
 * Zalo OA inbound credentials are deliberately separate from OAuth and access
 * tokens. Phase 3a verifies signed inbound webhooks only; it does not send
 * messages or refresh provider credentials.
 */
export interface RuntimeZaloOaConnection {
  readonly appId: string;
  readonly id: string;
  readonly oaId: string;
  readonly oaSecretKey: string;
  readonly operatorApiToken: string;
  readonly type: 'zalo_oa';
  readonly webhookUrl?: string;
}

/**
 * Facebook Page inbound credentials stay deliberately separate from Graph API
 * access tokens. Phase 3b validates signed webhooks only; it does not call
 * Meta, subscribe a Page, send messages, or store OAuth credentials.
 */
export interface RuntimeFacebookPageConnection {
  readonly appId: string;
  readonly appSecret: string;
  readonly id: string;
  readonly operatorApiToken: string;
  readonly pageId: string;
  readonly type: 'facebook_page';
  readonly webhookUrl?: string;
  readonly webhookVerifyToken: string;
}

export type RuntimeConnection =
  RuntimeTelegramBotConnection | RuntimeZaloOaConnection | RuntimeFacebookPageConnection;

export interface RuntimeConnectionConfiguration {
  readonly connections: readonly RuntimeConnection[];
}

/**
 * The only error exposed by the runtime configuration boundary. It deliberately
 * omits filesystem, JSON, and secret details so startup callers can fail safely.
 */
export class RuntimeConnectionConfigurationError extends Error {
  public constructor() {
    super('The runtime connection configuration is invalid.');
    this.name = 'RuntimeConnectionConfigurationError';
  }
}

const MAXIMUM_FILE_PATH_LENGTH = 1_024;
const MAXIMUM_CONFIGURATION_SOURCE_LENGTH = 262_144;
const MAXIMUM_BASE64URL_CONFIGURATION_SOURCE_LENGTH = 349_526;
const MAXIMUM_CONNECTIONS = 100;
const ROOT_KEYS = Object.freeze(['version', 'connections']);
const TELEGRAM_BOT_CONNECTION_REQUIRED_KEYS = Object.freeze([
  'id',
  'type',
  'botToken',
  'operatorApiToken',
  'webhookSecret'
]);
const TELEGRAM_BOT_CONNECTION_OPTIONAL_KEYS = Object.freeze(['webhookUrl']);
const ZALO_OA_CONNECTION_REQUIRED_KEYS = Object.freeze([
  'id',
  'type',
  'appId',
  'oaId',
  'oaSecretKey',
  'operatorApiToken'
]);
const ZALO_OA_CONNECTION_OPTIONAL_KEYS = Object.freeze(['webhookUrl']);
const FACEBOOK_PAGE_CONNECTION_REQUIRED_KEYS = Object.freeze([
  'id',
  'type',
  'appId',
  'pageId',
  'appSecret',
  'webhookVerifyToken',
  'operatorApiToken'
]);
const FACEBOOK_PAGE_CONNECTION_OPTIONAL_KEYS = Object.freeze(['webhookUrl']);
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PRINTABLE_TOKEN_PATTERN = /^[!-~]+$/;
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const ZALO_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;
const FACEBOOK_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;
const PRIVATE_HOSTNAME_SUFFIXES = Object.freeze(['.localhost', '.local', '.internal']);

/**
 * Loads one explicit, local runtime connection configuration file. The loader
 * performs no provider, DNS, or other network operation; it only accepts a
 * strict JSON document and returns an immutable credential snapshot.
 */
export const loadRuntimeConnectionConfiguration = async (
  filePath: string
): Promise<RuntimeConnectionConfiguration> =>
  loadConfigurationFile(filePath, parseJsonConfiguration);

/**
 * Reads an unpadded base64url JSON document from a Docker secret. Base64url is
 * an encoding boundary, not encryption: it prevents Compose `.env` expansion
 * from treating `$` inside a provider credential as a variable reference.
 */
export const loadBase64UrlRuntimeConnectionConfiguration = async (
  filePath: string
): Promise<RuntimeConnectionConfiguration> =>
  loadConfigurationFile(filePath, parseBase64UrlJsonConfiguration);

const loadConfigurationFile = async (
  filePath: string,
  parseSource: (source: string) => unknown
): Promise<RuntimeConnectionConfiguration> => {
  try {
    if (!isValidFilePath(filePath)) {
      throw new RuntimeConnectionConfigurationError();
    }

    const source = await readFile(filePath, 'utf8');
    const parsed = parseSource(source);

    return parseRuntimeConnectionConfiguration(parsed);
  } catch {
    throw new RuntimeConnectionConfigurationError();
  }
};

const parseJsonConfiguration = (source: string): unknown => {
  if (source.length > MAXIMUM_CONFIGURATION_SOURCE_LENGTH) {
    throw new RuntimeConnectionConfigurationError();
  }

  return JSON.parse(source);
};

const parseBase64UrlJsonConfiguration = (source: string): unknown => {
  if (
    source.length === 0 ||
    source.length > MAXIMUM_BASE64URL_CONFIGURATION_SOURCE_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(source)
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  const decodedBytes = Buffer.from(source, 'base64url');

  if (decodedBytes.toString('base64url') !== source) {
    throw new RuntimeConnectionConfigurationError();
  }

  const decoded = decodedBytes.toString('utf8');

  if (!Buffer.from(decoded, 'utf8').equals(decodedBytes)) {
    throw new RuntimeConnectionConfigurationError();
  }

  return parseJsonConfiguration(decoded);
};

const parseRuntimeConnectionConfiguration = (value: unknown): RuntimeConnectionConfiguration => {
  if (
    !hasExactKeys(value, ROOT_KEYS, []) ||
    value.version !== 1 ||
    !Array.isArray(value.connections) ||
    value.connections.length < 1 ||
    value.connections.length > MAXIMUM_CONNECTIONS
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  const identifiers = new Set<string>();
  const operatorTokens = new Set<string>();
  const exclusiveCredentials = new Set<string>();
  const zaloOaSecrets = new Set<string>();
  const zaloOaPairs = new Set<string>();
  const facebookCredentials = new Set<string>();
  const facebookPageIds = new Set<string>();
  const facebookApps = new Map<
    string,
    Readonly<{ appSecret: string; webhookVerifyToken: string }>
  >();
  const connections = value.connections.map((candidate) => {
    const connection = parseConnection(candidate);

    if (identifiers.has(connection.id)) {
      throw new RuntimeConnectionConfigurationError();
    }

    identifiers.add(connection.id);

    if (
      operatorTokens.has(connection.operatorApiToken) ||
      exclusiveCredentials.has(connection.operatorApiToken) ||
      zaloOaSecrets.has(connection.operatorApiToken) ||
      facebookCredentials.has(connection.operatorApiToken)
    ) {
      throw new RuntimeConnectionConfigurationError();
    }

    operatorTokens.add(connection.operatorApiToken);
    exclusiveCredentials.add(connection.operatorApiToken);

    if (connection.type === 'telegram_bot') {
      for (const credential of [connection.botToken, connection.webhookSecret]) {
        if (
          exclusiveCredentials.has(credential) ||
          zaloOaSecrets.has(credential) ||
          facebookCredentials.has(credential)
        ) {
          throw new RuntimeConnectionConfigurationError();
        }

        exclusiveCredentials.add(credential);
      }
    } else if (connection.type === 'zalo_oa') {
      const pairKey = `${connection.appId}\u0000${connection.oaId}`;

      if (
        exclusiveCredentials.has(connection.oaSecretKey) ||
        facebookCredentials.has(connection.oaSecretKey) ||
        zaloOaPairs.has(pairKey)
      ) {
        throw new RuntimeConnectionConfigurationError();
      }

      zaloOaSecrets.add(connection.oaSecretKey);
      zaloOaPairs.add(pairKey);
    } else {
      const existingApp = facebookApps.get(connection.appId);

      if (facebookPageIds.has(connection.pageId)) {
        throw new RuntimeConnectionConfigurationError();
      }

      if (
        existingApp !== undefined &&
        (existingApp.appSecret !== connection.appSecret ||
          existingApp.webhookVerifyToken !== connection.webhookVerifyToken)
      ) {
        throw new RuntimeConnectionConfigurationError();
      }

      if (existingApp === undefined) {
        for (const credential of [connection.appSecret, connection.webhookVerifyToken]) {
          if (
            exclusiveCredentials.has(credential) ||
            zaloOaSecrets.has(credential) ||
            facebookCredentials.has(credential)
          ) {
            throw new RuntimeConnectionConfigurationError();
          }
        }

        facebookCredentials.add(connection.appSecret);
        facebookCredentials.add(connection.webhookVerifyToken);
        facebookApps.set(
          connection.appId,
          Object.freeze({
            appSecret: connection.appSecret,
            webhookVerifyToken: connection.webhookVerifyToken
          })
        );
      }

      facebookPageIds.add(connection.pageId);
    }

    return connection;
  });

  return Object.freeze({ connections: Object.freeze(connections) });
};

const parseConnection = (value: unknown): RuntimeConnection => {
  if (!isRecord(value)) {
    throw new RuntimeConnectionConfigurationError();
  }

  if (value.type === 'telegram_bot') {
    return parseTelegramBotConnection(value);
  }

  if (value.type === 'zalo_oa') {
    return parseZaloOaConnection(value);
  }

  if (value.type === 'facebook_page') {
    return parseFacebookPageConnection(value);
  }

  throw new RuntimeConnectionConfigurationError();
};

const parseTelegramBotConnection = (value: unknown): RuntimeTelegramBotConnection => {
  if (
    !hasExactKeys(
      value,
      TELEGRAM_BOT_CONNECTION_REQUIRED_KEYS,
      TELEGRAM_BOT_CONNECTION_OPTIONAL_KEYS
    ) ||
    !isConnectionId(value.id) ||
    value.type !== 'telegram_bot' ||
    !isPrintableToken(value.botToken, 1) ||
    !isPrintableToken(value.operatorApiToken, 32) ||
    !isWebhookSecret(value.webhookSecret)
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  const webhookUrl = value.webhookUrl;

  if (
    webhookUrl !== undefined &&
    (!isString(webhookUrl) || !isValidPublicWebhookUrl(webhookUrl, value.id))
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  const connection: RuntimeTelegramBotConnection = {
    id: value.id,
    type: 'telegram_bot',
    botToken: value.botToken,
    operatorApiToken: value.operatorApiToken,
    webhookSecret: value.webhookSecret,
    ...(webhookUrl === undefined ? {} : { webhookUrl })
  };

  return Object.freeze(connection);
};

const parseZaloOaConnection = (value: unknown): RuntimeZaloOaConnection => {
  if (
    !hasExactKeys(value, ZALO_OA_CONNECTION_REQUIRED_KEYS, ZALO_OA_CONNECTION_OPTIONAL_KEYS) ||
    !isConnectionId(value.id) ||
    value.type !== 'zalo_oa' ||
    !isZaloIdentifier(value.appId) ||
    !isZaloIdentifier(value.oaId) ||
    !isPrintableToken(value.oaSecretKey, 1) ||
    !isPrintableToken(value.operatorApiToken, 32)
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  const webhookUrl = value.webhookUrl;

  if (
    webhookUrl !== undefined &&
    (!isString(webhookUrl) || !isValidPublicZaloOaWebhookUrl(webhookUrl))
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  return Object.freeze({
    appId: value.appId,
    id: value.id,
    oaId: value.oaId,
    oaSecretKey: value.oaSecretKey,
    operatorApiToken: value.operatorApiToken,
    type: 'zalo_oa',
    ...(webhookUrl === undefined ? {} : { webhookUrl })
  });
};

const parseFacebookPageConnection = (value: unknown): RuntimeFacebookPageConnection => {
  if (
    !hasExactKeys(
      value,
      FACEBOOK_PAGE_CONNECTION_REQUIRED_KEYS,
      FACEBOOK_PAGE_CONNECTION_OPTIONAL_KEYS
    ) ||
    !isConnectionId(value.id) ||
    value.type !== 'facebook_page' ||
    !isFacebookIdentifier(value.appId) ||
    !isFacebookIdentifier(value.pageId) ||
    !isPrintableToken(value.appSecret, 32) ||
    !isPrintableToken(value.webhookVerifyToken, 32) ||
    !isPrintableToken(value.operatorApiToken, 32)
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  const webhookUrl = value.webhookUrl;

  if (
    webhookUrl !== undefined &&
    (!isString(webhookUrl) || !isValidPublicFacebookPageWebhookUrl(webhookUrl))
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  return Object.freeze({
    appId: value.appId,
    appSecret: value.appSecret,
    id: value.id,
    operatorApiToken: value.operatorApiToken,
    pageId: value.pageId,
    type: 'facebook_page',
    webhookVerifyToken: value.webhookVerifyToken,
    ...(webhookUrl === undefined ? {} : { webhookUrl })
  });
};

const isValidFilePath = (value: unknown): value is string =>
  isString(value) &&
  value.length <= MAXIMUM_FILE_PATH_LENGTH &&
  value.trim().length > 0 &&
  value.startsWith('/') &&
  !value.includes('\u0000');

const hasExactKeys = (
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[]
): value is Record<string, unknown> => {
  if (!isRecord(value)) {
    return false;
  }

  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  const keys = Object.keys(value);

  return (
    keys.every((key) => allowedKeys.has(key)) &&
    requiredKeys.every((key) => Object.hasOwn(value, key))
  );
};

const isConnectionId = (value: unknown): value is string =>
  isString(value) && CONNECTION_ID_PATTERN.test(value) && value !== '.' && value !== '..';

const isPrintableToken = (value: unknown, minimumLength: number): value is string =>
  isString(value) &&
  value.length >= minimumLength &&
  value.length <= 512 &&
  PRINTABLE_TOKEN_PATTERN.test(value);

const isWebhookSecret = (value: unknown): value is string =>
  isString(value) && WEBHOOK_SECRET_PATTERN.test(value);

const isZaloIdentifier = (value: unknown): value is string =>
  isString(value) && ZALO_IDENTIFIER_PATTERN.test(value);

const isFacebookIdentifier = (value: unknown): value is string =>
  isString(value) && FACEBOOK_IDENTIFIER_PATTERN.test(value);

const isValidPublicWebhookUrl = (value: string, connectionId: string): boolean => {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      url.pathname === `/v1/webhooks/telegram-bot/${connectionId}` &&
      isPublicHostname(url.hostname)
    );
  } catch {
    return false;
  }
};

const isValidPublicZaloOaWebhookUrl = (value: string): boolean => {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      url.pathname === '/v1/webhooks/zalo-oa' &&
      isPublicHostname(url.hostname)
    );
  } catch {
    return false;
  }
};

const isValidPublicFacebookPageWebhookUrl = (value: string): boolean => {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      url.pathname === '/v1/webhooks/facebook-page' &&
      isPublicHostname(url.hostname)
    );
  } catch {
    return false;
  }
};

const isPublicHostname = (hostname: string): boolean => {
  const normalized = normalizeHostname(hostname);

  if (
    normalized.length === 0 ||
    normalized === 'localhost' ||
    normalized === 'local' ||
    normalized === 'internal' ||
    PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  ) {
    return false;
  }

  const addressKind = isIP(normalized);

  if (addressKind === 4) {
    return isPublicIpv4Address(normalized);
  }

  if (addressKind === 6) {
    return isPublicIpv6Address(normalized);
  }

  return normalized.includes('.') && !normalized.startsWith('.') && !normalized.endsWith('.');
};

const normalizeHostname = (hostname: string): string =>
  (hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  ).toLowerCase();

const isPublicIpv4Address = (address: string): boolean => {
  const octets = address.split('.').map((part) => Number(part));
  const first = octets[0];
  const second = octets[1];
  const third = octets[2];

  if (first === undefined || second === undefined || third === undefined) {
    return false;
  }

  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0 && third === 113)
  );
};

const isPublicIpv6Address = (address: string): boolean => {
  const normalized = address.toLowerCase();

  return !(
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('::ffff:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('2001:db8:')
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

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

export interface RuntimeConnectionConfiguration {
  readonly connections: readonly RuntimeTelegramBotConnection[];
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
const CONNECTION_REQUIRED_KEYS = Object.freeze([
  'id',
  'type',
  'botToken',
  'operatorApiToken',
  'webhookSecret'
]);
const CONNECTION_OPTIONAL_KEYS = Object.freeze(['webhookUrl']);
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PRINTABLE_TOKEN_PATTERN = /^[!-~]+$/;
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
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
  const secrets = new Set<string>();
  const connections = value.connections.map((candidate) => {
    const connection = parseTelegramBotConnection(candidate);

    if (identifiers.has(connection.id)) {
      throw new RuntimeConnectionConfigurationError();
    }

    identifiers.add(connection.id);

    for (const secret of [
      connection.botToken,
      connection.operatorApiToken,
      connection.webhookSecret
    ]) {
      if (secrets.has(secret)) {
        throw new RuntimeConnectionConfigurationError();
      }

      secrets.add(secret);
    }

    return connection;
  });

  return Object.freeze({ connections: Object.freeze(connections) });
};

const parseTelegramBotConnection = (value: unknown): RuntimeTelegramBotConnection => {
  if (
    !hasExactKeys(value, CONNECTION_REQUIRED_KEYS, CONNECTION_OPTIONAL_KEYS) ||
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

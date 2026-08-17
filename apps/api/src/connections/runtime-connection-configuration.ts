import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';

import { isTelegramBotToken } from '../telegram-bot/telegram-bot-provider-identity.js';

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
 * The experimental Zalo User bridge holds the short-lived QR session outside
 * the API process. This runtime entry contains only its opaque account binding
 * and the bridge-to-hub bearer, never cookies, an IMEI, or a user agent.
 */
export interface RuntimeZaloUserConnection {
  readonly accountId: string;
  readonly bridgeToken: string;
  readonly id: string;
  readonly operatorApiToken: string;
  readonly type: 'zalo_user';
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

/**
 * WhatsApp Business inbound credentials deliberately exclude Graph API access
 * tokens. Phase 3c verifies signed inbound webhooks only; it does not call
 * Meta, subscribe a WABA, send messages, or store OAuth credentials.
 */
export interface RuntimeWhatsAppBusinessConnection {
  readonly appId: string;
  readonly appSecret: string;
  readonly id: string;
  readonly operatorApiToken: string;
  readonly phoneNumberId: string;
  readonly type: 'whatsapp_business';
  readonly wabaId: string;
  readonly webhookUrl?: string;
  readonly webhookVerifyToken: string;
}

export type RuntimeConnection =
  | RuntimeTelegramBotConnection
  | RuntimeZaloOaConnection
  | RuntimeZaloUserConnection
  | RuntimeFacebookPageConnection
  | RuntimeWhatsAppBusinessConnection;

/**
 * A locally configured bearer principal for the unified, read-only inbox.
 * Its connection identifiers form an immutable allow-list; HTTP callers never
 * choose an account themselves.
 */
export interface RuntimeInbox {
  readonly connectionIds: readonly string[];
  readonly id: string;
  readonly token: string;
}

/**
 * One password-authenticated, deployment-local dashboard principal. Its inbox
 * identifiers are immutable configuration scope, never browser input.
 */
export interface RuntimeDashboardPrincipal {
  readonly id: string;
  readonly inboxIds: readonly string[];
  readonly passwordHash: string;
  /**
   * The explicitly configured subset allowed to create durable reply intent.
   * Omission from the configuration becomes a frozen empty allow-list so every
   * existing dashboard principal remains read-only by default.
   */
  readonly replyIntentInboxIds: readonly string[];
  /**
   * The independent subset allowed to record Telegram delivery authorization
   * evidence. Omission is a frozen empty allow-list; it never enables a send.
   */
  readonly telegramDeliveryAuthorizationInboxIds: readonly string[];
}

/**
 * The optional server-rendered dashboard boundary. The loader only validates
 * and freezes its secret material; password hashes are verified later by the
 * dashboard authentication feature and are never logged from this boundary.
 */
export interface RuntimeDashboard {
  readonly principals: readonly RuntimeDashboardPrincipal[];
  readonly publicOrigin: string;
  readonly sessionCookieSigningKeys: readonly string[];
  readonly sessionIdPepper: string;
}

export interface RuntimeConnectionConfiguration {
  readonly connections: readonly RuntimeConnection[];
  readonly dashboard?: RuntimeDashboard;
  readonly inboxes?: readonly RuntimeInbox[];
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
const MAXIMUM_INBOXES = 100;
const MAXIMUM_DASHBOARD_PRINCIPALS = 100;
const ROOT_KEYS = Object.freeze(['version', 'connections']);
const ROOT_OPTIONAL_KEYS = Object.freeze(['inboxes', 'dashboard']);
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
const ZALO_USER_CONNECTION_REQUIRED_KEYS = Object.freeze([
  'id',
  'type',
  'accountId',
  'bridgeToken',
  'operatorApiToken'
]);
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
const WHATSAPP_BUSINESS_CONNECTION_REQUIRED_KEYS = Object.freeze([
  'id',
  'type',
  'appId',
  'wabaId',
  'phoneNumberId',
  'appSecret',
  'webhookVerifyToken',
  'operatorApiToken'
]);
const WHATSAPP_BUSINESS_CONNECTION_OPTIONAL_KEYS = Object.freeze(['webhookUrl']);
const INBOX_REQUIRED_KEYS = Object.freeze(['id', 'token', 'connectionIds']);
const DASHBOARD_REQUIRED_KEYS = Object.freeze([
  'publicOrigin',
  'sessionCookieSigningKeys',
  'sessionIdPepper',
  'principals'
]);
const DASHBOARD_PRINCIPAL_REQUIRED_KEYS = Object.freeze(['id', 'passwordHash', 'inboxIds']);
const DASHBOARD_PRINCIPAL_OPTIONAL_KEYS = Object.freeze([
  'replyIntentInboxIds',
  'telegramDeliveryAuthorizationInboxIds'
]);
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PRINTABLE_TOKEN_PATTERN = /^[!-~]+$/;
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;
const ARGON2ID_PHC_PREFIX = '$argon2id$v=19$';
const ARGON2ID_PHC_BASE64_PATTERN = /^[A-Za-z0-9+/]+$/;
const ARGON2ID_PHC_POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const ARGON2ID_PHC_PARAMETER_KEYS = Object.freeze(['m', 'p', 't']);
// Keep every configured principal on the same bounded verification cost as the
// dashboard password-hash CLI and the unknown-principal dummy verifier.
const DASHBOARD_ARGON2_MEMORY_COST = 19_456;
const DASHBOARD_ARGON2_TIME_COST = 2;
const DASHBOARD_ARGON2_PARALLELISM = 1;
const ZALO_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;
const FACEBOOK_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;
const WHATSAPP_BUSINESS_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;
const PRIVATE_HOSTNAME_SUFFIXES = Object.freeze(['.localhost', '.local', '.internal']);
const DASHBOARD_PRIVATE_HOSTNAME_SUFFIXES = Object.freeze([
  '.localhost',
  '.local',
  '.internal',
  '.private',
  '.lan',
  '.home',
  '.corp'
]);

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
    !hasExactKeys(value, ROOT_KEYS, ROOT_OPTIONAL_KEYS) ||
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
  const zaloUserAccountIds = new Set<string>();
  const metaCredentials = new Set<string>();
  const metaApps = new Map<string, Readonly<{ appSecret: string; webhookVerifyToken: string }>>();
  const facebookPageIds = new Set<string>();
  const whatsappBusinessPhoneNumberIds = new Set<string>();
  const whatsappBusinessWabaApps = new Map<string, string>();
  const metaAppWebhookUrls = new Map<string, Set<string>>();
  const metaAppChannels = new Map<string, Set<'facebook_page' | 'whatsapp_business'>>();
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
      metaCredentials.has(connection.operatorApiToken)
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
          metaCredentials.has(credential)
        ) {
          throw new RuntimeConnectionConfigurationError();
        }

        exclusiveCredentials.add(credential);
      }
    } else if (connection.type === 'zalo_oa') {
      const pairKey = `${connection.appId}\u0000${connection.oaId}`;

      if (
        exclusiveCredentials.has(connection.oaSecretKey) ||
        metaCredentials.has(connection.oaSecretKey) ||
        zaloOaPairs.has(pairKey)
      ) {
        throw new RuntimeConnectionConfigurationError();
      }

      zaloOaSecrets.add(connection.oaSecretKey);
      zaloOaPairs.add(pairKey);
    } else if (connection.type === 'zalo_user') {
      if (
        exclusiveCredentials.has(connection.bridgeToken) ||
        zaloOaSecrets.has(connection.bridgeToken) ||
        metaCredentials.has(connection.bridgeToken) ||
        zaloUserAccountIds.has(connection.accountId)
      ) {
        throw new RuntimeConnectionConfigurationError();
      }

      exclusiveCredentials.add(connection.bridgeToken);
      zaloUserAccountIds.add(connection.accountId);
    } else if (connection.type === 'facebook_page') {
      registerMetaAppCredentials({
        appId: connection.appId,
        appSecret: connection.appSecret,
        webhookVerifyToken: connection.webhookVerifyToken,
        exclusiveCredentials,
        metaApps,
        metaCredentials,
        zaloOaSecrets
      });

      if (facebookPageIds.has(connection.pageId)) {
        throw new RuntimeConnectionConfigurationError();
      }

      facebookPageIds.add(connection.pageId);
      recordMetaWebhookConfiguration({
        appId: connection.appId,
        channel: connection.type,
        metaAppChannels,
        metaAppWebhookUrls,
        webhookUrl: connection.webhookUrl
      });
    } else {
      registerMetaAppCredentials({
        appId: connection.appId,
        appSecret: connection.appSecret,
        webhookVerifyToken: connection.webhookVerifyToken,
        exclusiveCredentials,
        metaApps,
        metaCredentials,
        zaloOaSecrets
      });

      if (whatsappBusinessPhoneNumberIds.has(connection.phoneNumberId)) {
        throw new RuntimeConnectionConfigurationError();
      }

      const existingWabaApp = whatsappBusinessWabaApps.get(connection.wabaId);

      if (existingWabaApp !== undefined && existingWabaApp !== connection.appId) {
        throw new RuntimeConnectionConfigurationError();
      }

      whatsappBusinessPhoneNumberIds.add(connection.phoneNumberId);
      whatsappBusinessWabaApps.set(connection.wabaId, connection.appId);
      recordMetaWebhookConfiguration({
        appId: connection.appId,
        channel: connection.type,
        metaAppChannels,
        metaAppWebhookUrls,
        webhookUrl: connection.webhookUrl
      });
    }

    return connection;
  });

  for (const [appId, channels] of metaAppChannels) {
    const webhookUrls = metaAppWebhookUrls.get(appId) ?? new Set<string>();

    if (
      channels.has('facebook_page') &&
      channels.has('whatsapp_business') &&
      (webhookUrls.size > 1 ||
        [...webhookUrls].some((webhookUrl) => !isMetaSharedWebhookUrl(webhookUrl)))
    ) {
      throw new RuntimeConnectionConfigurationError();
    }
  }

  const credentials = new Set([...exclusiveCredentials, ...zaloOaSecrets, ...metaCredentials]);
  const inboxes = parseInboxes({
    candidate: value.inboxes,
    connectionIds: identifiers,
    credentials
  });
  const dashboard = parseDashboard({
    candidate: value.dashboard,
    credentials: new Set([...credentials, ...(inboxes ?? []).map((inbox) => inbox.token)]),
    inboxes
  });

  return Object.freeze({
    connections: Object.freeze(connections),
    ...(inboxes === undefined ? {} : { inboxes }),
    ...(dashboard === undefined ? {} : { dashboard })
  });
};

interface ParseInboxesInput {
  readonly candidate: unknown;
  readonly connectionIds: ReadonlySet<string>;
  readonly credentials: ReadonlySet<string>;
}

const parseInboxes = ({
  candidate,
  connectionIds,
  credentials
}: ParseInboxesInput): readonly RuntimeInbox[] | undefined => {
  if (candidate === undefined) {
    return undefined;
  }

  if (!Array.isArray(candidate) || candidate.length < 1 || candidate.length > MAXIMUM_INBOXES) {
    throw new RuntimeConnectionConfigurationError();
  }

  const inboxIds = new Set<string>();
  const inboxTokens = new Set<string>();

  const inboxes = candidate.map((value) => {
    const inbox = parseInbox(value, connectionIds);

    if (inboxIds.has(inbox.id) || inboxTokens.has(inbox.token) || credentials.has(inbox.token)) {
      throw new RuntimeConnectionConfigurationError();
    }

    inboxIds.add(inbox.id);
    inboxTokens.add(inbox.token);

    return inbox;
  });

  return Object.freeze(inboxes);
};

const parseInbox = (value: unknown, configuredConnectionIds: ReadonlySet<string>): RuntimeInbox => {
  if (
    !hasExactKeys(value, INBOX_REQUIRED_KEYS, []) ||
    !isInboxId(value.id) ||
    !isPrintableToken(value.token, 32) ||
    !Array.isArray(value.connectionIds) ||
    value.connectionIds.length < 1 ||
    value.connectionIds.length > MAXIMUM_CONNECTIONS
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  const connectionIds = new Set<string>();

  for (const connectionId of value.connectionIds) {
    if (
      !isConnectionId(connectionId) ||
      !configuredConnectionIds.has(connectionId) ||
      connectionIds.has(connectionId)
    ) {
      throw new RuntimeConnectionConfigurationError();
    }

    connectionIds.add(connectionId);
  }

  return Object.freeze({
    connectionIds: Object.freeze([...connectionIds].sort()),
    id: value.id,
    token: value.token
  });
};

interface ParseDashboardInput {
  readonly candidate: unknown;
  readonly credentials: ReadonlySet<string>;
  readonly inboxes: readonly RuntimeInbox[] | undefined;
}

const parseDashboard = ({
  candidate,
  credentials,
  inboxes
}: ParseDashboardInput): RuntimeDashboard | undefined => {
  if (candidate === undefined) {
    return undefined;
  }

  if (
    inboxes === undefined ||
    !hasExactKeys(candidate, DASHBOARD_REQUIRED_KEYS, []) ||
    !Array.isArray(candidate.sessionCookieSigningKeys) ||
    candidate.sessionCookieSigningKeys.length < 1 ||
    candidate.sessionCookieSigningKeys.length > 2
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  const publicOrigin = parseDashboardPublicOrigin(candidate.publicOrigin);
  const dashboardSecrets = parseDashboardSecrets(
    candidate.sessionCookieSigningKeys,
    candidate.sessionIdPepper,
    credentials
  );
  const principals = parseDashboardPrincipals(
    candidate.principals,
    new Set(inboxes.map(({ id }) => id))
  );

  return Object.freeze({
    principals,
    publicOrigin,
    sessionCookieSigningKeys: dashboardSecrets.sessionCookieSigningKeys,
    sessionIdPepper: dashboardSecrets.sessionIdPepper
  });
};

const parseDashboardPublicOrigin = (value: unknown): string => {
  if (!isString(value)) {
    throw new RuntimeConnectionConfigurationError();
  }

  try {
    const url = new URL(value);

    if (
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== '' ||
      url.pathname !== '/' ||
      !isAllowedDashboardOrigin(url)
    ) {
      throw new RuntimeConnectionConfigurationError();
    }

    return url.origin;
  } catch {
    throw new RuntimeConnectionConfigurationError();
  }
};

/**
 * Dashboard sessions normally require a public HTTPS origin. The sole local
 * development exception is an exact `localhost` origin, which browsers and
 * Google's OAuth rules treat as loopback-only. Raw IPs and every other HTTP
 * hostname remain rejected.
 */
const isAllowedDashboardOrigin = (url: URL): boolean =>
  (url.protocol === 'https:' && isDashboardPublicHostname(url.hostname)) ||
  ((url.protocol === 'http:' || url.protocol === 'https:') &&
    url.hostname === 'localhost' &&
    isValidPort(url.port));

const isValidPort = (value: string): boolean => {
  if (value === '') {
    return true;
  }

  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
};

const parseDashboardSecrets = (
  candidateSigningKeys: readonly unknown[],
  candidatePepper: unknown,
  credentials: ReadonlySet<string>
): Readonly<{
  sessionCookieSigningKeys: readonly string[];
  sessionIdPepper: string;
}> => {
  if (!isPrintableToken(candidatePepper, 32)) {
    throw new RuntimeConnectionConfigurationError();
  }

  const secrets = new Set<string>();
  const signingKeys: string[] = [];

  for (const signingKey of candidateSigningKeys) {
    if (
      !isPrintableToken(signingKey, 32) ||
      secrets.has(signingKey) ||
      credentials.has(signingKey)
    ) {
      throw new RuntimeConnectionConfigurationError();
    }

    secrets.add(signingKey);
    signingKeys.push(signingKey);
  }

  if (secrets.has(candidatePepper) || credentials.has(candidatePepper)) {
    throw new RuntimeConnectionConfigurationError();
  }

  return Object.freeze({
    sessionCookieSigningKeys: Object.freeze(signingKeys),
    sessionIdPepper: candidatePepper
  });
};

const parseDashboardPrincipals = (
  candidate: unknown,
  configuredInboxIds: ReadonlySet<string>
): readonly RuntimeDashboardPrincipal[] => {
  if (
    !Array.isArray(candidate) ||
    candidate.length < 1 ||
    candidate.length > MAXIMUM_DASHBOARD_PRINCIPALS
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  const principalIds = new Set<string>();
  const principals = candidate.map((value) => {
    const principal = parseDashboardPrincipal(value, configuredInboxIds);

    if (principalIds.has(principal.id)) {
      throw new RuntimeConnectionConfigurationError();
    }

    principalIds.add(principal.id);
    return principal;
  });

  return Object.freeze(principals);
};

const parseDashboardPrincipal = (
  value: unknown,
  configuredInboxIds: ReadonlySet<string>
): RuntimeDashboardPrincipal => {
  if (
    !hasExactKeys(value, DASHBOARD_PRINCIPAL_REQUIRED_KEYS, DASHBOARD_PRINCIPAL_OPTIONAL_KEYS) ||
    !isDashboardPrincipalId(value.id) ||
    !isArgon2idPhcPasswordHash(value.passwordHash) ||
    !Array.isArray(value.inboxIds) ||
    value.inboxIds.length < 1 ||
    value.inboxIds.length > MAXIMUM_INBOXES
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  const inboxIds = new Set<string>();

  for (const inboxId of value.inboxIds) {
    if (!isInboxId(inboxId) || !configuredInboxIds.has(inboxId) || inboxIds.has(inboxId)) {
      throw new RuntimeConnectionConfigurationError();
    }

    inboxIds.add(inboxId);
  }

  const replyIntentInboxIds = parseReplyIntentInboxIds({
    candidate: value.replyIntentInboxIds,
    configuredInboxIds,
    readableInboxIds: inboxIds
  });
  const telegramDeliveryAuthorizationInboxIds = parseTelegramDeliveryAuthorizationInboxIds({
    candidate: value.telegramDeliveryAuthorizationInboxIds,
    configuredInboxIds,
    readableInboxIds: inboxIds
  });

  return Object.freeze({
    id: value.id,
    inboxIds: Object.freeze([...inboxIds].sort()),
    passwordHash: value.passwordHash,
    replyIntentInboxIds,
    telegramDeliveryAuthorizationInboxIds
  });
};

interface ParseReplyIntentInboxIdsInput {
  readonly candidate: unknown;
  readonly configuredInboxIds: ReadonlySet<string>;
  readonly readableInboxIds: ReadonlySet<string>;
}

const parseReplyIntentInboxIds = ({
  candidate,
  configuredInboxIds,
  readableInboxIds
}: ParseReplyIntentInboxIdsInput): readonly string[] => {
  if (candidate === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(candidate) || candidate.length > MAXIMUM_INBOXES) {
    throw new RuntimeConnectionConfigurationError();
  }

  const replyIntentInboxIds = new Set<string>();

  for (const inboxId of candidate) {
    if (
      !isInboxId(inboxId) ||
      !configuredInboxIds.has(inboxId) ||
      !readableInboxIds.has(inboxId) ||
      replyIntentInboxIds.has(inboxId)
    ) {
      throw new RuntimeConnectionConfigurationError();
    }

    replyIntentInboxIds.add(inboxId);
  }

  return Object.freeze([...replyIntentInboxIds].sort());
};

interface ParseTelegramDeliveryAuthorizationInboxIdsInput {
  readonly candidate: unknown;
  readonly configuredInboxIds: ReadonlySet<string>;
  readonly readableInboxIds: ReadonlySet<string>;
}

const parseTelegramDeliveryAuthorizationInboxIds = ({
  candidate,
  configuredInboxIds,
  readableInboxIds
}: ParseTelegramDeliveryAuthorizationInboxIdsInput): readonly string[] => {
  if (candidate === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(candidate) || candidate.length > MAXIMUM_INBOXES) {
    throw new RuntimeConnectionConfigurationError();
  }

  const telegramDeliveryAuthorizationInboxIds = new Set<string>();

  for (const inboxId of candidate) {
    if (
      !isInboxId(inboxId) ||
      !configuredInboxIds.has(inboxId) ||
      !readableInboxIds.has(inboxId) ||
      telegramDeliveryAuthorizationInboxIds.has(inboxId)
    ) {
      throw new RuntimeConnectionConfigurationError();
    }

    telegramDeliveryAuthorizationInboxIds.add(inboxId);
  }

  return Object.freeze([...telegramDeliveryAuthorizationInboxIds].sort());
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

  if (value.type === 'zalo_user') {
    return parseZaloUserConnection(value);
  }

  if (value.type === 'facebook_page') {
    return parseFacebookPageConnection(value);
  }

  if (value.type === 'whatsapp_business') {
    return parseWhatsAppBusinessConnection(value);
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
    !isTelegramBotToken(value.botToken) ||
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

const parseZaloUserConnection = (value: unknown): RuntimeZaloUserConnection => {
  if (
    !hasExactKeys(value, ZALO_USER_CONNECTION_REQUIRED_KEYS, []) ||
    !isConnectionId(value.id) ||
    value.type !== 'zalo_user' ||
    !isZaloIdentifier(value.accountId) ||
    !isPrintableToken(value.bridgeToken, 32) ||
    !isPrintableToken(value.operatorApiToken, 32)
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  return Object.freeze({
    accountId: value.accountId,
    bridgeToken: value.bridgeToken,
    id: value.id,
    operatorApiToken: value.operatorApiToken,
    type: 'zalo_user'
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

const parseWhatsAppBusinessConnection = (value: unknown): RuntimeWhatsAppBusinessConnection => {
  if (
    !hasExactKeys(
      value,
      WHATSAPP_BUSINESS_CONNECTION_REQUIRED_KEYS,
      WHATSAPP_BUSINESS_CONNECTION_OPTIONAL_KEYS
    ) ||
    !isConnectionId(value.id) ||
    value.type !== 'whatsapp_business' ||
    !isWhatsAppBusinessIdentifier(value.appId) ||
    !isWhatsAppBusinessIdentifier(value.wabaId) ||
    !isWhatsAppBusinessIdentifier(value.phoneNumberId) ||
    !isPrintableToken(value.appSecret, 32) ||
    !isPrintableToken(value.webhookVerifyToken, 32) ||
    !isPrintableToken(value.operatorApiToken, 32)
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  const webhookUrl = value.webhookUrl;

  if (
    webhookUrl !== undefined &&
    (!isString(webhookUrl) || !isValidPublicWhatsAppBusinessWebhookUrl(webhookUrl))
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  return Object.freeze({
    appId: value.appId,
    appSecret: value.appSecret,
    id: value.id,
    operatorApiToken: value.operatorApiToken,
    phoneNumberId: value.phoneNumberId,
    type: 'whatsapp_business',
    wabaId: value.wabaId,
    webhookVerifyToken: value.webhookVerifyToken,
    ...(webhookUrl === undefined ? {} : { webhookUrl })
  });
};

interface MetaAppCredentialRegistration {
  readonly appId: string;
  readonly appSecret: string;
  readonly webhookVerifyToken: string;
  readonly exclusiveCredentials: Set<string>;
  readonly metaApps: Map<string, Readonly<{ appSecret: string; webhookVerifyToken: string }>>;
  readonly metaCredentials: Set<string>;
  readonly zaloOaSecrets: Set<string>;
}

interface MetaWebhookConfiguration {
  readonly appId: string;
  readonly channel: 'facebook_page' | 'whatsapp_business';
  readonly metaAppChannels: Map<string, Set<'facebook_page' | 'whatsapp_business'>>;
  readonly metaAppWebhookUrls: Map<string, Set<string>>;
  readonly webhookUrl: string | undefined;
}

const registerMetaAppCredentials = ({
  appId,
  appSecret,
  webhookVerifyToken,
  exclusiveCredentials,
  metaApps,
  metaCredentials,
  zaloOaSecrets
}: MetaAppCredentialRegistration): void => {
  const existingApp = metaApps.get(appId);

  if (
    existingApp !== undefined &&
    (existingApp.appSecret !== appSecret || existingApp.webhookVerifyToken !== webhookVerifyToken)
  ) {
    throw new RuntimeConnectionConfigurationError();
  }

  if (existingApp !== undefined) {
    return;
  }

  for (const credential of [appSecret, webhookVerifyToken]) {
    if (
      exclusiveCredentials.has(credential) ||
      zaloOaSecrets.has(credential) ||
      metaCredentials.has(credential)
    ) {
      throw new RuntimeConnectionConfigurationError();
    }
  }

  metaCredentials.add(appSecret);
  metaCredentials.add(webhookVerifyToken);
  metaApps.set(appId, Object.freeze({ appSecret, webhookVerifyToken }));
};

const recordMetaWebhookConfiguration = ({
  appId,
  channel,
  metaAppChannels,
  metaAppWebhookUrls,
  webhookUrl
}: MetaWebhookConfiguration): void => {
  const channels = metaAppChannels.get(appId) ?? new Set<'facebook_page' | 'whatsapp_business'>();
  channels.add(channel);
  metaAppChannels.set(appId, channels);

  if (webhookUrl !== undefined) {
    const urls = metaAppWebhookUrls.get(appId) ?? new Set<string>();
    urls.add(webhookUrl);
    metaAppWebhookUrls.set(appId, urls);
  }
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

const isInboxId = (value: unknown): value is string =>
  isString(value) && CONNECTION_ID_PATTERN.test(value) && value !== '.' && value !== '..';

const isDashboardPrincipalId = (value: unknown): value is string =>
  isString(value) && CONNECTION_ID_PATTERN.test(value) && value !== '.' && value !== '..';

const isPrintableToken = (value: unknown, minimumLength: number): value is string =>
  isString(value) &&
  value.length >= minimumLength &&
  value.length <= 512 &&
  PRINTABLE_TOKEN_PATTERN.test(value);

const isWebhookSecret = (value: unknown): value is string =>
  isString(value) && WEBHOOK_SECRET_PATTERN.test(value);

const isArgon2idPhcPasswordHash = (value: unknown): value is string => {
  if (!isString(value) || value.length > 512 || !value.startsWith(ARGON2ID_PHC_PREFIX)) {
    return false;
  }

  const segments = value.split('$');

  if (
    segments.length !== 6 ||
    segments[0] !== '' ||
    segments[1] !== 'argon2id' ||
    segments[2] !== 'v=19' ||
    !isArgon2idPhcParameters(segments[3]) ||
    !isArgon2idPhcBase64Segment(segments[4], 8) ||
    !isArgon2idPhcBase64Segment(segments[5], 16)
  ) {
    return false;
  }

  return true;
};

const isArgon2idPhcParameters = (value: string | undefined): boolean => {
  if (value === undefined) {
    return false;
  }

  const values = value.split(',');

  if (values.length !== ARGON2ID_PHC_PARAMETER_KEYS.length) {
    return false;
  }

  const parameters = new Map<string, number>();

  for (const parameter of values) {
    const [key, parameterValue, ...remaining] = parameter.split('=');

    if (
      key === undefined ||
      parameterValue === undefined ||
      remaining.length !== 0 ||
      !ARGON2ID_PHC_PARAMETER_KEYS.includes(key) ||
      !ARGON2ID_PHC_POSITIVE_INTEGER_PATTERN.test(parameterValue) ||
      parameters.has(key)
    ) {
      return false;
    }

    const numericValue = Number(parameterValue);

    if (!Number.isSafeInteger(numericValue)) {
      return false;
    }

    parameters.set(key, numericValue);
  }

  const memoryCost = parameters.get('m');
  const parallelism = parameters.get('p');
  const timeCost = parameters.get('t');

  return (
    parameters.size === ARGON2ID_PHC_PARAMETER_KEYS.length &&
    memoryCost !== undefined &&
    parallelism !== undefined &&
    timeCost !== undefined &&
    memoryCost === DASHBOARD_ARGON2_MEMORY_COST &&
    timeCost === DASHBOARD_ARGON2_TIME_COST &&
    parallelism === DASHBOARD_ARGON2_PARALLELISM
  );
};

const isArgon2idPhcBase64Segment = (value: string | undefined, minimumLength: number): boolean =>
  value !== undefined &&
  value.length >= minimumLength &&
  ARGON2ID_PHC_BASE64_PATTERN.test(value) &&
  Buffer.from(value, 'base64').toString('base64').replace(/=+$/, '') === value;

const isZaloIdentifier = (value: unknown): value is string =>
  isString(value) && ZALO_IDENTIFIER_PATTERN.test(value);

const isFacebookIdentifier = (value: unknown): value is string =>
  isString(value) && FACEBOOK_IDENTIFIER_PATTERN.test(value);

const isWhatsAppBusinessIdentifier = (value: unknown): value is string =>
  isString(value) && WHATSAPP_BUSINESS_IDENTIFIER_PATTERN.test(value);

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
      (url.pathname === '/v1/webhooks/facebook-page' || isMetaSharedWebhookPath(url.pathname)) &&
      isPublicHostname(url.hostname)
    );
  } catch {
    return false;
  }
};

const isValidPublicWhatsAppBusinessWebhookUrl = (value: string): boolean => {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      (url.pathname === '/v1/webhooks/whatsapp-business' ||
        isMetaSharedWebhookPath(url.pathname)) &&
      isPublicHostname(url.hostname)
    );
  } catch {
    return false;
  }
};

const isMetaSharedWebhookPath = (value: string): boolean => value === '/v1/webhooks/meta';

const isMetaSharedWebhookUrl = (value: string): boolean => {
  try {
    return isMetaSharedWebhookPath(new URL(value).pathname);
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

const isDashboardPublicHostname = (hostname: string): boolean => {
  const normalized = normalizeHostname(hostname);

  return (
    !DASHBOARD_PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix)) &&
    !DASHBOARD_PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => normalized === suffix.slice(1)) &&
    isPublicHostname(normalized) &&
    isIP(normalized) === 0
  );
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

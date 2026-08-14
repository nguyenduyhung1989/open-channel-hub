import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const ACCOUNT_ID_PATTERN = /^[0-9]{1,32}$/;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PRINTABLE_TOKEN_PATTERN = /^[!-~]{32,512}$/;
const ARGON2ID_PHC_PREFIX = '$argon2id$v=19$';
const ARGON2ID_PHC_BASE64_PATTERN = /^[A-Za-z0-9+/]+$/;
const MAXIMUM_PATH_LENGTH = 1_024;
const DEFAULT_CONTROL_PORT = 9_472;
const DEFAULT_OPERATOR_UI_PORT = 9_473;

export interface ZaloUserBridgeOperatorUiRuntimeConfiguration {
  readonly passwordHash: string;
  readonly port: number;
  readonly sessionPepper: string;
}

export interface ZaloUserBridgeRuntimeConfiguration {
  readonly accountId: string;
  readonly bridgeToken: string;
  readonly connectionId: string;
  readonly controlPort: number;
  readonly controlToken: string;
  readonly hubBaseUrl: string;
  readonly operatorUi?: ZaloUserBridgeOperatorUiRuntimeConfiguration;
}

export interface ZaloUserBridgeRuntimeEnvironment {
  readonly ZALO_USER_BRIDGE_ACCOUNT_ID?: string;
  readonly ZALO_USER_BRIDGE_CONNECTION_ID?: string;
  readonly ZALO_USER_BRIDGE_CONTROL_PORT?: string;
  readonly ZALO_USER_BRIDGE_CONTROL_TOKEN_FILE?: string;
  readonly ZALO_USER_BRIDGE_HUB_URL?: string;
  readonly ZALO_USER_BRIDGE_TOKEN_FILE?: string;
  readonly ZALO_USER_BRIDGE_UI_PASSWORD_HASH_FILE?: string;
  readonly ZALO_USER_BRIDGE_UI_PORT?: string;
  readonly ZALO_USER_BRIDGE_UI_SESSION_PEPPER_FILE?: string;
}

/** A deliberately generic startup failure that cannot echo secret file paths or tokens. */
export class ZaloUserBridgeRuntimeConfigurationError extends Error {
  public constructor() {
    super('The Zalo User bridge runtime configuration is invalid.');
    this.name = 'ZaloUserBridgeRuntimeConfigurationError';
  }
}

/**
 * Loads only the non-session bridge settings. QR cookies, IMEI and user agent
 * are intentionally absent: they stay in memory in the local bridge process.
 */
export const loadZaloUserBridgeRuntimeConfiguration = async (
  environment: ZaloUserBridgeRuntimeEnvironment = process.env
): Promise<ZaloUserBridgeRuntimeConfiguration> => {
  try {
    const accountId = environment.ZALO_USER_BRIDGE_ACCOUNT_ID;
    const connectionId = environment.ZALO_USER_BRIDGE_CONNECTION_ID;
    const hubBaseUrl = toHubBaseUrl(environment.ZALO_USER_BRIDGE_HUB_URL);
    const controlPort = toControlPort(environment.ZALO_USER_BRIDGE_CONTROL_PORT);
    const bridgeTokenPath = environment.ZALO_USER_BRIDGE_TOKEN_FILE;
    const controlTokenPath = environment.ZALO_USER_BRIDGE_CONTROL_TOKEN_FILE;
    const operatorUi = await loadOperatorUiConfiguration(environment);

    if (
      !isAccountId(accountId) ||
      !isConnectionId(connectionId) ||
      hubBaseUrl === undefined ||
      controlPort === undefined ||
      !isSafeSecretFilePath(bridgeTokenPath) ||
      !isSafeSecretFilePath(controlTokenPath)
    ) {
      throw new ZaloUserBridgeRuntimeConfigurationError();
    }

    const [bridgeToken, controlToken] = await Promise.all([
      readSecretFile(bridgeTokenPath),
      readSecretFile(controlTokenPath)
    ]);

    if (
      bridgeToken === controlToken ||
      (operatorUi !== undefined &&
        (operatorUi.sessionPepper === bridgeToken || operatorUi.sessionPepper === controlToken))
    ) {
      throw new ZaloUserBridgeRuntimeConfigurationError();
    }

    return Object.freeze({
      accountId,
      bridgeToken,
      connectionId,
      controlPort,
      controlToken,
      hubBaseUrl,
      ...(operatorUi === undefined ? {} : { operatorUi })
    });
  } catch (error) {
    if (error instanceof ZaloUserBridgeRuntimeConfigurationError) {
      throw error;
    }

    throw new ZaloUserBridgeRuntimeConfigurationError();
  }
};

const loadOperatorUiConfiguration = async (
  environment: ZaloUserBridgeRuntimeEnvironment
): Promise<ZaloUserBridgeOperatorUiRuntimeConfiguration | undefined> => {
  const passwordHashPath = environment.ZALO_USER_BRIDGE_UI_PASSWORD_HASH_FILE;
  const sessionPepperPath = environment.ZALO_USER_BRIDGE_UI_SESSION_PEPPER_FILE;
  const portValue = environment.ZALO_USER_BRIDGE_UI_PORT;
  const supplied = [passwordHashPath, sessionPepperPath, portValue].filter(
    (value) => value !== undefined
  ).length;

  if (supplied === 0) {
    return undefined;
  }

  if (
    !isSafeSecretFilePath(passwordHashPath) ||
    !isSafeSecretFilePath(sessionPepperPath) ||
    (portValue !== undefined && toOperatorUiPort(portValue) === undefined)
  ) {
    throw new ZaloUserBridgeRuntimeConfigurationError();
  }

  const [passwordHash, sessionPepper] = await Promise.all([
    readPasswordHashFile(passwordHashPath),
    readSecretFile(sessionPepperPath)
  ]);

  return Object.freeze({
    passwordHash,
    port: toOperatorUiPort(portValue) ?? DEFAULT_OPERATOR_UI_PORT,
    sessionPepper
  });
};

const readSecretFile = async (filePath: string): Promise<string> => {
  const metadata = await stat(filePath);

  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new ZaloUserBridgeRuntimeConfigurationError();
  }

  const token = (await readFile(filePath, 'utf8')).trim();

  if (!PRINTABLE_TOKEN_PATTERN.test(token)) {
    throw new ZaloUserBridgeRuntimeConfigurationError();
  }

  return token;
};

const readPasswordHashFile = async (filePath: string): Promise<string> => {
  const metadata = await stat(filePath);

  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new ZaloUserBridgeRuntimeConfigurationError();
  }

  const passwordHash = (await readFile(filePath, 'utf8')).trim();

  if (!isArgon2idPasswordHash(passwordHash)) {
    throw new ZaloUserBridgeRuntimeConfigurationError();
  }

  return passwordHash;
};

const isAccountId = (value: unknown): value is string =>
  typeof value === 'string' && ACCOUNT_ID_PATTERN.test(value);

const isConnectionId = (value: unknown): value is string =>
  typeof value === 'string' && CONNECTION_ID_PATTERN.test(value) && value !== '.' && value !== '..';

const isSafeSecretFilePath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAXIMUM_PATH_LENGTH &&
  isAbsolute(value);

const toControlPort = (value: unknown): number | undefined => {
  if (value === undefined) {
    return DEFAULT_CONTROL_PORT;
  }

  if (typeof value !== 'string' || !/^[1-9][0-9]{0,4}$/.test(value)) {
    return undefined;
  }

  const port = Number(value);
  return Number.isSafeInteger(port) && port >= 1 && port <= 65_535 ? port : undefined;
};

const toOperatorUiPort = (value: unknown): number | undefined => {
  if (value === undefined) {
    return DEFAULT_OPERATOR_UI_PORT;
  }

  return toControlPort(value);
};

const toHubBaseUrl = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) {
    return undefined;
  }

  try {
    const url = new URL(value);

    if (
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0 ||
      url.pathname !== '/' ||
      !isAllowedHubProtocol(url)
    ) {
      return undefined;
    }

    return url.origin;
  } catch {
    return undefined;
  }
};

const isAllowedHubProtocol = (url: URL): boolean => {
  if (url.protocol === 'https:') {
    return true;
  }

  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  );
};

const isArgon2idPasswordHash = (value: string): boolean => {
  if (value.length > 512 || !value.startsWith(ARGON2ID_PHC_PREFIX)) {
    return false;
  }

  const segments = value.split('$');
  if (
    segments.length !== 6 ||
    segments[1] !== 'argon2id' ||
    segments[2] !== 'v=19' ||
    segments[3] === undefined ||
    segments[4] === undefined ||
    segments[5] === undefined
  ) {
    return false;
  }

  const parameters = new Map<string, number>();
  for (const parameter of segments[3].split(',')) {
    const [key, numericValue] = parameter.split('=');
    if (
      key === undefined ||
      numericValue === undefined ||
      !['m', 'p', 't'].includes(key) ||
      !/^[1-9][0-9]*$/.test(numericValue) ||
      parameters.has(key)
    ) {
      return false;
    }

    const parsed = Number(numericValue);
    if (!Number.isSafeInteger(parsed)) {
      return false;
    }
    parameters.set(key, parsed);
  }

  return (
    parameters.size === 3 &&
    parameters.get('m') === 19_456 &&
    parameters.get('p') === 1 &&
    parameters.get('t') === 2 &&
    isCanonicalPhcBase64(segments[4], 8) &&
    isCanonicalPhcBase64(segments[5], 16)
  );
};

const isCanonicalPhcBase64 = (value: string, minimumLength: number): boolean =>
  value.length >= minimumLength &&
  ARGON2ID_PHC_BASE64_PATTERN.test(value) &&
  Buffer.from(value, 'base64').toString('base64').replace(/=+$/, '') === value;

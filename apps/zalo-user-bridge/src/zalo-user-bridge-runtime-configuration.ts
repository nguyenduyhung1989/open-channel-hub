import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const ACCOUNT_ID_PATTERN = /^[0-9]{1,32}$/;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PRINTABLE_TOKEN_PATTERN = /^[!-~]{32,512}$/;
const MAXIMUM_PATH_LENGTH = 1_024;
const DEFAULT_CONTROL_PORT = 9_472;

export interface ZaloUserBridgeRuntimeConfiguration {
  readonly accountId: string;
  readonly bridgeToken: string;
  readonly connectionId: string;
  readonly controlPort: number;
  readonly controlToken: string;
  readonly hubBaseUrl: string;
}

export interface ZaloUserBridgeRuntimeEnvironment {
  readonly ZALO_USER_BRIDGE_ACCOUNT_ID?: string;
  readonly ZALO_USER_BRIDGE_CONNECTION_ID?: string;
  readonly ZALO_USER_BRIDGE_CONTROL_PORT?: string;
  readonly ZALO_USER_BRIDGE_CONTROL_TOKEN_FILE?: string;
  readonly ZALO_USER_BRIDGE_HUB_URL?: string;
  readonly ZALO_USER_BRIDGE_TOKEN_FILE?: string;
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

    if (bridgeToken === controlToken) {
      throw new ZaloUserBridgeRuntimeConfigurationError();
    }

    return Object.freeze({
      accountId,
      bridgeToken,
      connectionId,
      controlPort,
      controlToken,
      hubBaseUrl
    });
  } catch (error) {
    if (error instanceof ZaloUserBridgeRuntimeConfigurationError) {
      throw error;
    }

    throw new ZaloUserBridgeRuntimeConfigurationError();
  }
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

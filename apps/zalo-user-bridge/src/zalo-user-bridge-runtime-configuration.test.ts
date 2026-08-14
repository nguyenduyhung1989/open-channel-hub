import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  loadZaloUserBridgeRuntimeConfiguration,
  ZaloUserBridgeRuntimeConfigurationError,
  type ZaloUserBridgeRuntimeEnvironment
} from './zalo-user-bridge-runtime-configuration.js';

const temporaryDirectories: string[] = [];
const BRIDGE_TOKEN = 'synthetic_zalo_user_bridge_token_0123456789012345678';
const CONTROL_TOKEN = 'synthetic_zalo_user_control_token_0123456789012345678';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe('loadZaloUserBridgeRuntimeConfiguration', () => {
  it('loads a secret-file configuration for the loopback-only control service', async () => {
    const secrets = await createSecretFiles();

    await expect(loadZaloUserBridgeRuntimeConfiguration(environment(secrets))).resolves.toEqual({
      accountId: '1234567890123456789',
      bridgeToken: BRIDGE_TOKEN,
      connectionId: 'zalo-user-support',
      controlPort: 9472,
      controlToken: CONTROL_TOKEN,
      hubBaseUrl: 'https://hub.example.test'
    });
  });

  it('allows an explicit loopback Hub only for local development', async () => {
    const secrets = await createSecretFiles();

    await expect(
      loadZaloUserBridgeRuntimeConfiguration(
        environment(secrets, { ZALO_USER_BRIDGE_HUB_URL: 'http://127.0.0.1:3100' })
      )
    ).resolves.toMatchObject({ hubBaseUrl: 'http://127.0.0.1:3100' });
  });

  it.each([
    { ZALO_USER_BRIDGE_ACCOUNT_ID: 'account-id' },
    { ZALO_USER_BRIDGE_CONNECTION_ID: '..' },
    { ZALO_USER_BRIDGE_CONTROL_PORT: '65536' },
    { ZALO_USER_BRIDGE_HUB_URL: 'http://hub.example.test' },
    { ZALO_USER_BRIDGE_HUB_URL: 'http://[2001:db8::1]' },
    { ZALO_USER_BRIDGE_HUB_URL: 'https://hub.example.test/not-a-root-url' },
    { ZALO_USER_BRIDGE_HUB_URL: 'https://token@hub.example.test' }
  ])('rejects malformed non-secret bridge settings: %j', async (override) => {
    const secrets = await createSecretFiles();

    await expectGenericFailure(
      loadZaloUserBridgeRuntimeConfiguration(environment(secrets, override))
    );
  });

  it('rejects a secret file that other local users can read', async () => {
    const secrets = await createSecretFiles();
    await chmod(secrets.controlTokenPath, 0o644);

    await expectGenericFailure(loadZaloUserBridgeRuntimeConfiguration(environment(secrets)));
  });

  it('rejects a bridge/control token collision without exposing either value', async () => {
    const secrets = await createSecretFiles({ controlToken: BRIDGE_TOKEN });

    const failure = loadZaloUserBridgeRuntimeConfiguration(environment(secrets));
    await expectGenericFailure(failure);
    await expect(failure).rejects.not.toThrow(BRIDGE_TOKEN);
  });
});

const environment = (
  secrets: Readonly<{ bridgeTokenPath: string; controlTokenPath: string }>,
  override: Readonly<Partial<ZaloUserBridgeRuntimeEnvironment>> = {}
): ZaloUserBridgeRuntimeEnvironment => ({
  ZALO_USER_BRIDGE_ACCOUNT_ID: '1234567890123456789',
  ZALO_USER_BRIDGE_CONNECTION_ID: 'zalo-user-support',
  ZALO_USER_BRIDGE_CONTROL_TOKEN_FILE: secrets.controlTokenPath,
  ZALO_USER_BRIDGE_HUB_URL: 'https://hub.example.test/',
  ZALO_USER_BRIDGE_TOKEN_FILE: secrets.bridgeTokenPath,
  ...override
});

const createSecretFiles = async (
  values: Readonly<{ bridgeToken?: string; controlToken?: string }> = {}
): Promise<Readonly<{ bridgeTokenPath: string; controlTokenPath: string }>> => {
  const directory = await mkdtemp(join(tmpdir(), 'open-channel-hub-zalo-user-bridge-test-'));
  temporaryDirectories.push(directory);
  const bridgeTokenPath = join(directory, 'bridge-token');
  const controlTokenPath = join(directory, 'control-token');
  await Promise.all([
    writeFile(bridgeTokenPath, values.bridgeToken ?? BRIDGE_TOKEN, { mode: 0o600 }),
    writeFile(controlTokenPath, values.controlToken ?? CONTROL_TOKEN, { mode: 0o600 })
  ]);
  await Promise.all([chmod(bridgeTokenPath, 0o600), chmod(controlTokenPath, 0o600)]);

  return Object.freeze({ bridgeTokenPath, controlTokenPath });
};

const expectGenericFailure = async (result: Promise<unknown>): Promise<void> => {
  await expect(result).rejects.toBeInstanceOf(ZaloUserBridgeRuntimeConfigurationError);
  await expect(result).rejects.toThrow('The Zalo User bridge runtime configuration is invalid.');
};

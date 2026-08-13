import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConnectorRuntimeEnvironment } from '../config/environment.js';
import {
  loadBase64UrlRuntimeConnectionConfiguration,
  loadRuntimeConnectionConfiguration
} from './runtime-connection-configuration.js';
import { loadRuntimeConnections } from './load-runtime-connections.js';

vi.mock('./runtime-connection-configuration.js', () => ({
  loadBase64UrlRuntimeConnectionConfiguration: vi.fn(),
  loadRuntimeConnectionConfiguration: vi.fn()
}));

const loadBase64UrlMock = vi.mocked(loadBase64UrlRuntimeConnectionConfiguration);
const loadJsonMock = vi.mocked(loadRuntimeConnectionConfiguration);

describe('loadRuntimeConnections', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('does not read a connection secret for disabled or legacy Telegram runtime modes', async () => {
    const disabled: ConnectorRuntimeEnvironment = Object.freeze({ enabled: false });
    const legacy: ConnectorRuntimeEnvironment = Object.freeze({
      botToken: 'synthetic-bot-token',
      connectionId: 'telegram-bot-default',
      enabled: true,
      operatorApiToken: 'synthetic_operator_token_01234567890123456789',
      webhookSecret: 'synthetic_webhook_secret_0123456789'
    });

    await expect(loadRuntimeConnections(disabled)).resolves.toBeUndefined();
    await expect(loadRuntimeConnections(legacy)).resolves.toBeUndefined();
    expect(loadJsonMock).not.toHaveBeenCalled();
    expect(loadBase64UrlMock).not.toHaveBeenCalled();
  });

  it('reads exactly one matching runtime secret loader for each configured source encoding', async () => {
    const configuration = Object.freeze({ connections: Object.freeze([]) });
    loadJsonMock.mockResolvedValueOnce(configuration);
    loadBase64UrlMock.mockResolvedValueOnce(configuration);
    const jsonEnvironment: ConnectorRuntimeEnvironment = Object.freeze({
      configurationEncoding: 'json',
      configurationFile: '/run/secrets/connections',
      enabled: true
    });
    const base64Environment: ConnectorRuntimeEnvironment = Object.freeze({
      configurationEncoding: 'base64url',
      configurationFile: '/run/secrets/connections-base64',
      enabled: true
    });

    await expect(loadRuntimeConnections(jsonEnvironment)).resolves.toBe(configuration);
    await expect(loadRuntimeConnections(base64Environment)).resolves.toBe(configuration);
    expect(loadJsonMock).toHaveBeenCalledTimes(1);
    expect(loadJsonMock).toHaveBeenCalledWith('/run/secrets/connections');
    expect(loadBase64UrlMock).toHaveBeenCalledTimes(1);
    expect(loadBase64UrlMock).toHaveBeenCalledWith('/run/secrets/connections-base64');
  });
});

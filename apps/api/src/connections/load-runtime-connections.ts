import type { ConnectorRuntimeEnvironment } from '../config/environment.js';

import {
  loadBase64UrlRuntimeConnectionConfiguration,
  loadRuntimeConnectionConfiguration,
  type RuntimeConnectionConfiguration
} from './runtime-connection-configuration.js';

/**
 * Loads a shared runtime connector document once. Consumers split the returned
 * immutable snapshot by connector type instead of rereading a secret file.
 */
export const loadRuntimeConnections = async (
  environment: ConnectorRuntimeEnvironment
): Promise<RuntimeConnectionConfiguration | undefined> => {
  if (!environment.enabled || !('configurationFile' in environment)) {
    return undefined;
  }

  return environment.configurationEncoding === 'base64url'
    ? loadBase64UrlRuntimeConnectionConfiguration(environment.configurationFile)
    : loadRuntimeConnectionConfiguration(environment.configurationFile);
};

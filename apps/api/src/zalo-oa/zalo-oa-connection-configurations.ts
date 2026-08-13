import type {
  RuntimeConnection,
  RuntimeZaloOaConnection
} from '../connections/runtime-connection-configuration.js';

import type { ZaloOaConnectionConfiguration } from './create-zalo-oa-feature.js';

/**
 * Selects Zalo OA accounts from an already-loaded immutable runtime snapshot.
 * It deliberately performs no filesystem or provider operation.
 */
export const toZaloOaConnectionConfigurations = (
  connections: readonly RuntimeConnection[]
): readonly ZaloOaConnectionConfiguration[] =>
  Object.freeze(
    connections.filter(isRuntimeZaloOaConnection).map((connection) =>
      Object.freeze({
        appId: connection.appId,
        connectionId: connection.id,
        oaId: connection.oaId,
        oaSecretKey: connection.oaSecretKey,
        operatorApiToken: connection.operatorApiToken,
        ...(connection.webhookUrl === undefined ? {} : { webhookUrl: connection.webhookUrl })
      })
    )
  );

const isRuntimeZaloOaConnection = (
  connection: RuntimeConnection
): connection is RuntimeZaloOaConnection => connection.type === 'zalo_oa';

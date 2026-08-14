import type {
  RuntimeConnection,
  RuntimeZaloUserConnection
} from '../connections/runtime-connection-configuration.js';

import type { ZaloUserConnectionConfiguration } from './create-zalo-user-feature.js';

/** Selects Zalo User bridges from one already-loaded immutable config snapshot. */
export const toZaloUserConnectionConfigurations = (
  connections: readonly RuntimeConnection[]
): readonly ZaloUserConnectionConfiguration[] =>
  Object.freeze(
    connections.filter(isRuntimeZaloUserConnection).map((connection) =>
      Object.freeze({
        accountId: connection.accountId,
        bridgeToken: connection.bridgeToken,
        connectionId: connection.id,
        operatorApiToken: connection.operatorApiToken
      })
    )
  );

const isRuntimeZaloUserConnection = (
  connection: RuntimeConnection
): connection is RuntimeZaloUserConnection => connection.type === 'zalo_user';

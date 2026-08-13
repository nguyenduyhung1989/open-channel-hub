import type {
  RuntimeConnection,
  RuntimeFacebookPageConnection
} from '../connections/runtime-connection-configuration.js';

import type { FacebookPageConnectionConfiguration } from './create-facebook-page-feature.js';

/** Selects Page accounts from the immutable, already-loaded runtime snapshot. */
export const toFacebookPageConnectionConfigurations = (
  connections: readonly RuntimeConnection[]
): readonly FacebookPageConnectionConfiguration[] =>
  Object.freeze(
    connections.filter(isRuntimeFacebookPageConnection).map((connection) =>
      Object.freeze({
        appId: connection.appId,
        appSecret: connection.appSecret,
        connectionId: connection.id,
        operatorApiToken: connection.operatorApiToken,
        pageId: connection.pageId,
        webhookVerifyToken: connection.webhookVerifyToken,
        ...(connection.webhookUrl === undefined ? {} : { webhookUrl: connection.webhookUrl })
      })
    )
  );

const isRuntimeFacebookPageConnection = (
  connection: RuntimeConnection
): connection is RuntimeFacebookPageConnection => connection.type === 'facebook_page';

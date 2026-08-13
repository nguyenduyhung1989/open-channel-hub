import type {
  RuntimeConnection,
  RuntimeWhatsAppBusinessConnection
} from '../connections/runtime-connection-configuration.js';

import type { WhatsAppBusinessConnectionConfiguration } from './create-whatsapp-business-feature.js';

/** Selects WhatsApp Business accounts from an immutable runtime snapshot. */
export const toWhatsAppBusinessConnectionConfigurations = (
  connections: readonly RuntimeConnection[]
): readonly WhatsAppBusinessConnectionConfiguration[] =>
  Object.freeze(
    connections.filter(isRuntimeWhatsAppBusinessConnection).map((connection) =>
      Object.freeze({
        appId: connection.appId,
        appSecret: connection.appSecret,
        connectionId: connection.id,
        operatorApiToken: connection.operatorApiToken,
        phoneNumberId: connection.phoneNumberId,
        wabaId: connection.wabaId,
        webhookVerifyToken: connection.webhookVerifyToken,
        ...(connection.webhookUrl === undefined ? {} : { webhookUrl: connection.webhookUrl })
      })
    )
  );

const isRuntimeWhatsAppBusinessConnection = (
  connection: RuntimeConnection
): connection is RuntimeWhatsAppBusinessConnection => connection.type === 'whatsapp_business';

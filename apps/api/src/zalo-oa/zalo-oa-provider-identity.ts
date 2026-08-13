import { createHash } from 'node:crypto';

const ZALO_OA_PROVIDER_IDENTITY_DOMAIN = 'open-channel-hub:zalo-oa:provider-identity:v1';

/**
 * Produces the non-secret durable account binding for one configured Zalo OA.
 * The domain-separated digest keeps provider account identifiers out of the
 * connection registry while preventing a connection ID from being rebound to a
 * different App/OA pair after it has stored inbound history.
 */
export const fingerprintZaloOaProviderIdentity = (appId: string, oaId: string): string =>
  createHash('sha256')
    .update(ZALO_OA_PROVIDER_IDENTITY_DOMAIN, 'utf8')
    .update('\u0000', 'utf8')
    .update(appId, 'utf8')
    .update('\u0000', 'utf8')
    .update(oaId, 'utf8')
    .digest('hex');

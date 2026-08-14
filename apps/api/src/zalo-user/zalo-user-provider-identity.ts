import { createHash } from 'node:crypto';

const ZALO_USER_PROVIDER_IDENTITY_DOMAIN = 'open-channel-hub:zalo-user:provider-identity:v1';

/**
 * Produces the opaque non-secret account binding for a Zalo User bridge. The
 * durable registry never stores the account identifier itself.
 */
export const fingerprintZaloUserProviderIdentity = (accountId: string): string =>
  createHash('sha256')
    .update(ZALO_USER_PROVIDER_IDENTITY_DOMAIN, 'utf8')
    .update('\u0000', 'utf8')
    .update(accountId, 'utf8')
    .digest('hex');

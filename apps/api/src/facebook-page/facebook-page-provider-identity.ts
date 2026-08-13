import { createHash } from 'node:crypto';

const FACEBOOK_PAGE_PROVIDER_IDENTITY_DOMAIN =
  'open-channel-hub:facebook-page:provider-identity:v1';

/**
 * Produces the non-secret durable account binding for a Meta App/Page pair.
 * It prevents an opaque connection id with historic data from being rebound to
 * a different Page without persisting provider identifiers or credentials.
 */
export const fingerprintFacebookPageProviderIdentity = (appId: string, pageId: string): string =>
  createHash('sha256')
    .update(FACEBOOK_PAGE_PROVIDER_IDENTITY_DOMAIN, 'utf8')
    .update('\u0000', 'utf8')
    .update(appId, 'utf8')
    .update('\u0000', 'utf8')
    .update(pageId, 'utf8')
    .digest('hex');

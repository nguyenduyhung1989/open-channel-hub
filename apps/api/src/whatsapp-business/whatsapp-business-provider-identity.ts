import { createHash } from 'node:crypto';

/**
 * Produces an opaque, non-secret binding for the Meta App, WABA, and business
 * phone number. The registry never stores these provider identifiers directly.
 */
export const fingerprintWhatsAppBusinessProviderIdentity = (
  appId: string,
  wabaId: string,
  phoneNumberId: string
): string =>
  createHash('sha256')
    .update('open-channel-hub:whatsapp-business:provider-identity:v1\u0000', 'utf8')
    .update(appId, 'utf8')
    .update('\u0000', 'utf8')
    .update(wabaId, 'utf8')
    .update('\u0000', 'utf8')
    .update(phoneNumberId, 'utf8')
    .digest('hex');

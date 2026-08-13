import {
  matchesMetaHubWebhookSignature,
  type MetaHubSignatureInput
} from '../http/meta-hub-signature.js';

export type FacebookPageSignatureInput = MetaHubSignatureInput;

/**
 * Verifies Meta's documented HMAC-SHA256 over the untouched request bytes.
 * JSON reconstruction is intentionally forbidden: whitespace and escaped
 * Unicode are part of the signed payload.
 */
export const matchesFacebookPageWebhookSignature = (input: FacebookPageSignatureInput): boolean =>
  matchesMetaHubWebhookSignature(input);

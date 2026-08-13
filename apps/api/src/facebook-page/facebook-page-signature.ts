import { createHmac } from 'node:crypto';

import { matchesSecret } from '../http/secret-match.js';

const SIGNATURE_PATTERN = /^sha256=[a-f0-9]{64}$/;

export interface FacebookPageSignatureInput {
  readonly appSecret: string;
  readonly rawBody: Buffer;
  readonly signature: string | undefined;
}

/**
 * Verifies Meta's documented HMAC-SHA256 over the untouched request bytes.
 * JSON reconstruction is intentionally forbidden: whitespace and escaped
 * Unicode are part of the signed payload.
 */
export const matchesFacebookPageWebhookSignature = (input: FacebookPageSignatureInput): boolean => {
  try {
    if (!SIGNATURE_PATTERN.test(input.signature ?? '') || !Buffer.isBuffer(input.rawBody)) {
      return false;
    }

    const expectedSignature = createHmac('sha256', input.appSecret)
      .update(input.rawBody)
      .digest('hex');

    return matchesSecret(input.signature?.slice('sha256='.length), expectedSignature);
  } catch {
    return false;
  }
};

import { createHmac } from 'node:crypto';

import { matchesSecret } from './secret-match.js';

const SIGNATURE_PATTERN = /^sha256=[a-f0-9]{64}$/;

export interface MetaHubSignatureInput {
  readonly appSecret: string;
  readonly rawBody: Buffer;
  readonly signature: string | undefined;
}

/**
 * Verifies Meta's documented HMAC-SHA256 over untouched request bytes. JSON
 * reconstruction is intentionally forbidden because whitespace and escaped
 * Unicode remain part of the signed payload.
 */
export const matchesMetaHubWebhookSignature = (input: MetaHubSignatureInput): boolean => {
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

import { createHash } from 'node:crypto';

import { matchesSecret } from '../http/secret-match.js';

const SIGNATURE_PATTERN = /^[a-fA-F0-9]{64}$/;

export interface ZaloOaSignatureInput {
  readonly appId: string;
  readonly oaSecretKey: string;
  readonly rawJson: string;
  readonly signature: string | undefined;
  readonly timestamp: string;
}

/**
 * Verifies the official documented Zalo OA hash over the exact raw JSON string.
 * It intentionally does not reconstruct JSON from an object: whitespace, key
 * order, and Unicode bytes are part of the provider's signed data.
 */
export const matchesZaloOaWebhookSignature = (input: ZaloOaSignatureInput): boolean => {
  try {
    if (!SIGNATURE_PATTERN.test(input.signature ?? '')) {
      return false;
    }

    const expectedSignature = createHash('sha256')
      .update(`${input.appId}${input.rawJson}${input.timestamp}${input.oaSecretKey}`, 'utf8')
      .digest('hex');

    return matchesSecret(input.signature?.toLowerCase(), expectedSignature);
  } catch {
    return false;
  }
};

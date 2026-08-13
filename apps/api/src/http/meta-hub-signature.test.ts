import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { matchesMetaHubWebhookSignature } from './meta-hub-signature.js';

const APP_SECRET = 'synthetic-meta-app-secret-01234567890123456789';

describe('matchesMetaHubWebhookSignature', () => {
  it('accepts only the exact raw bytes and canonical lowercase sha256 header', () => {
    const rawBody = Buffer.from('{"message":"xin chào 👋"}', 'utf8');
    const signature = `sha256=${createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')}`;

    expect(matchesMetaHubWebhookSignature({ appSecret: APP_SECRET, rawBody, signature })).toBe(
      true
    );
    expect(
      matchesMetaHubWebhookSignature({
        appSecret: APP_SECRET,
        rawBody: Buffer.from('{"message":"xin  chào 👋"}', 'utf8'),
        signature
      })
    ).toBe(false);
    expect(
      matchesMetaHubWebhookSignature({
        appSecret: APP_SECRET,
        rawBody,
        signature: signature.toUpperCase()
      })
    ).toBe(false);
  });

  it('fails closed for malformed input without exposing crypto details', () => {
    expect(
      matchesMetaHubWebhookSignature({
        appSecret: APP_SECRET,
        rawBody: Buffer.from('{}', 'utf8'),
        signature: 'sha256:invalid'
      })
    ).toBe(false);
    expect(
      matchesMetaHubWebhookSignature({
        appSecret: '',
        rawBody: Buffer.from('{}', 'utf8'),
        signature: undefined
      })
    ).toBe(false);
  });
});

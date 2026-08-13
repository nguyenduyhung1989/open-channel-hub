import { describe, expect, it } from 'vitest';

import { fingerprintFacebookPageProviderIdentity } from './facebook-page-provider-identity.js';

describe('fingerprintFacebookPageProviderIdentity', () => {
  it('is deterministic, account-bound, opaque, and domain-separated', () => {
    const first = fingerprintFacebookPageProviderIdentity('123456789', '987654321');

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(fingerprintFacebookPageProviderIdentity('123456789', '987654321'));
    expect(first).not.toBe(fingerprintFacebookPageProviderIdentity('123456780', '987654321'));
    expect(first).not.toBe(fingerprintFacebookPageProviderIdentity('123456789', '987654320'));
    expect(first).not.toContain('123456789');
    expect(first).not.toContain('987654321');
  });
});

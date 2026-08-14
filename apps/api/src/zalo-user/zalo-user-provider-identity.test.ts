import { describe, expect, it } from 'vitest';

import { fingerprintZaloUserProviderIdentity } from './zalo-user-provider-identity.js';

describe('fingerprintZaloUserProviderIdentity', () => {
  it('creates a deterministic domain-separated opaque account binding', () => {
    const support = fingerprintZaloUserProviderIdentity('1234567890123456789');

    expect(support).toMatch(/^[a-f0-9]{64}$/);
    expect(support).toBe(fingerprintZaloUserProviderIdentity('1234567890123456789'));
    expect(support).not.toBe(fingerprintZaloUserProviderIdentity('1234567890123456790'));
    expect(support).not.toContain('1234567890123456789');
  });
});

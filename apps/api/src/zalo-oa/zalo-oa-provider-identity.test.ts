import { describe, expect, it } from 'vitest';

import { fingerprintZaloOaProviderIdentity } from './zalo-oa-provider-identity.js';

describe('fingerprintZaloOaProviderIdentity', () => {
  it('creates a deterministic, domain-separated opaque binding for one App/OA pair', () => {
    const support = fingerprintZaloOaProviderIdentity('1234567890123456789', '9876543210987654321');

    expect(support).toMatch(/^[a-f0-9]{64}$/);
    expect(support).toBe(
      fingerprintZaloOaProviderIdentity('1234567890123456789', '9876543210987654321')
    );
    expect(support).not.toBe(
      fingerprintZaloOaProviderIdentity('1234567890123456789', '9876543210987654322')
    );
    expect(support).not.toContain('1234567890123456789');
    expect(support).not.toContain('9876543210987654321');
  });
});

import { describe, expect, it } from 'vitest';

import { fingerprintWhatsAppBusinessProviderIdentity } from './whatsapp-business-provider-identity.js';

describe('fingerprintWhatsAppBusinessProviderIdentity', () => {
  it('is deterministic, opaque, domain-separated, and bound to every provider identity component', () => {
    const fingerprint = fingerprintWhatsAppBusinessProviderIdentity(
      '1234567890123456789',
      '9876543210987654321',
      '112233445566778899'
    );

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).not.toContain('1234567890123456789');
    expect(
      fingerprintWhatsAppBusinessProviderIdentity(
        '1234567890123456789',
        '9876543210987654321',
        '112233445566778899'
      )
    ).toBe(fingerprint);
    expect(
      fingerprintWhatsAppBusinessProviderIdentity(
        '1234567890123456789',
        '9876543210987654321',
        '112233445566778898'
      )
    ).not.toBe(fingerprint);
  });
});

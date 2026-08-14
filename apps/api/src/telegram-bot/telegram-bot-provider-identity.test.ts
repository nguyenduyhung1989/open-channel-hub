import { describe, expect, it } from 'vitest';

import {
  fingerprintTelegramBotProviderIdentity,
  isTelegramBotToken
} from './telegram-bot-provider-identity.js';

describe('Telegram Bot provider identity', () => {
  it("derives a stable opaque fingerprint from only the token's numeric Bot prefix", () => {
    const original = '123456789:synthetic-secret-current';
    const rotated = '123456789:synthetic-secret-rotated';
    const anotherBot = '987654321:synthetic-secret-current';

    const fingerprint = fingerprintTelegramBotProviderIdentity(original);

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).toBe(fingerprintTelegramBotProviderIdentity(rotated));
    expect(fingerprint).not.toBe(fingerprintTelegramBotProviderIdentity(anotherBot));
    expect(fingerprint).not.toContain('123456789');
    expect(fingerprint).not.toContain('synthetic-secret-current');
  });

  it('accepts only a numeric Bot prefix and one printable non-colon token suffix', () => {
    for (const token of [
      '1:x',
      '9223372036854775807:synthetic-token',
      '123456789:synthetic-token_with.allowed-characters'
    ]) {
      expect(isTelegramBotToken(token)).toBe(true);
    }

    for (const token of [
      '',
      '0:synthetic-token',
      '-1:synthetic-token',
      'telegram-bot-token',
      '123456789:',
      '123456789:synthetic:token',
      '123456789:contains a space'
    ]) {
      expect(isTelegramBotToken(token)).toBe(false);
      expect(fingerprintTelegramBotProviderIdentity(token)).toBeUndefined();
    }
  });
});

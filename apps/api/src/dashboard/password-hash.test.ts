import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';

import { DashboardPasswordHashError, hashDashboardPassword } from './password-hash.js';

describe('dashboard password hash', () => {
  it('creates an Argon2id verifier from bounded lossless private input', async () => {
    const password = Buffer.from('synthetic-long-dashboard-password', 'utf8');
    const hash = await hashDashboardPassword(password);

    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
    await expect(argon2.verify(hash, password)).resolves.toBe(true);
    expect(hash).not.toContain(password.toString('utf8'));
  });

  it('refuses short, newline-containing, invalid UTF-8, and oversized input', async () => {
    for (const password of [
      Buffer.from('too-short'),
      Buffer.from('synthetic-password\n'),
      Buffer.from([0xff, 0xfe]),
      Buffer.alloc(513, 1)
    ]) {
      await expect(hashDashboardPassword(password)).rejects.toBeInstanceOf(
        DashboardPasswordHashError
      );
    }
  });
});

import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';

import type { DashboardPrincipal } from './dashboard-feature.js';
import { createDashboardLoginThrottle, verifyDashboardPassword } from './dashboard-auth.js';

describe('dashboard authentication helpers', () => {
  it('verifies only the selected configured principal and fails closed for malformed input', async () => {
    const passwordHash = await argon2.hash('synthetic dashboard password', {
      memoryCost: 19456,
      parallelism: 1,
      timeCost: 2,
      type: argon2.argon2id
    });
    const principal: DashboardPrincipal = {
      id: 'support-agent',
      inboxIds: ['support-inbox'],
      passwordHash,
      replyIntentInboxIds: [],
      telegramDeliveryAuthorizationInboxIds: []
    };

    await expect(verifyDashboardPassword(principal, 'synthetic dashboard password')).resolves.toBe(
      true
    );
    await expect(verifyDashboardPassword(principal, 'wrong synthetic password')).resolves.toBe(
      false
    );
    await expect(verifyDashboardPassword(undefined, 'synthetic dashboard password')).resolves.toBe(
      false
    );
    await expect(verifyDashboardPassword(principal, '')).resolves.toBe(false);
  });

  it('reserves at most two concurrent password verifications before doing Argon2 work', () => {
    const now = 0;
    const throttle = createDashboardLoginThrottle({ now: () => new Date(now) });
    const first = throttle.reserveVerification();
    const second = throttle.reserveVerification();

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(throttle.reserveVerification()).toBeUndefined();

    first?.complete(false);
    expect(throttle.reserveVerification()).toBeDefined();
    second?.complete(false);
  });

  it('temporarily blocks five completed failed reservations and releases only after time passes', () => {
    let now = 0;
    const throttle = createDashboardLoginThrottle({ now: () => new Date(now) });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reservation = throttle.reserveVerification();

      expect(reservation).toBeDefined();
      reservation?.complete(false);
      now += 100;
    }

    expect(throttle.reserveVerification()).toBeUndefined();
    now += 10 * 60 * 1_000;
    expect(throttle.reserveVerification()).toBeDefined();
  });
});

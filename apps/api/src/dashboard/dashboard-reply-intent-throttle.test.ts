import { describe, expect, it } from 'vitest';

import { createDashboardReplyIntentThrottle } from './dashboard-reply-intent-throttle.js';

describe('dashboard reply-intent throttle', () => {
  it('caps each authenticated principal across all sessions at twenty writes per rolling minute', () => {
    let timestamp = Date.parse('2026-08-13T00:00:00.000Z');
    const throttle = createDashboardReplyIntentThrottle({ now: () => new Date(timestamp) });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(throttle.reserve('support-agent')).toBe(true);
    }

    expect(throttle.reserve('support-agent')).toBe(false);
    expect(throttle.reserve('sales-agent')).toBe(true);

    timestamp += 60_001;

    expect(throttle.reserve('support-agent')).toBe(true);
  });
});

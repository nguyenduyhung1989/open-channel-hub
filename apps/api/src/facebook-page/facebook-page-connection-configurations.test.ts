import { describe, expect, it } from 'vitest';

import { toFacebookPageConnectionConfigurations } from './facebook-page-connection-configurations.js';

describe('toFacebookPageConnectionConfigurations', () => {
  it('selects Facebook Page accounts from a shared immutable runtime snapshot', () => {
    const configurations = toFacebookPageConnectionConfigurations([
      Object.freeze({
        appId: '1234567890123456789',
        appSecret: 'synthetic-facebook-app-secret-01234567890123456789',
        id: 'facebook-page-support',
        operatorApiToken: 'synthetic_facebook_operator_support_012345678901234567',
        pageId: '9876543210987654321',
        type: 'facebook_page' as const,
        webhookUrl: 'https://example.test/v1/webhooks/facebook-page',
        webhookVerifyToken: 'synthetic-facebook-verify-token-012345678901234567'
      }),
      Object.freeze({
        botToken: 'synthetic-telegram-bot-token',
        id: 'telegram-bot-support',
        operatorApiToken: 'synthetic_telegram_operator_support_012345678901234567',
        type: 'telegram_bot' as const,
        webhookSecret: 'synthetic_telegram_webhook_secret_0123456789'
      })
    ]);

    expect(configurations).toEqual([
      {
        appId: '1234567890123456789',
        appSecret: 'synthetic-facebook-app-secret-01234567890123456789',
        connectionId: 'facebook-page-support',
        operatorApiToken: 'synthetic_facebook_operator_support_012345678901234567',
        pageId: '9876543210987654321',
        webhookUrl: 'https://example.test/v1/webhooks/facebook-page',
        webhookVerifyToken: 'synthetic-facebook-verify-token-012345678901234567'
      }
    ]);
    expect(Object.isFrozen(configurations)).toBe(true);
    expect(Object.isFrozen(configurations[0])).toBe(true);
  });
});

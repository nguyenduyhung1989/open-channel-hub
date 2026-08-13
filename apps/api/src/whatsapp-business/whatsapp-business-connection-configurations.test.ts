import { describe, expect, it } from 'vitest';

import { toWhatsAppBusinessConnectionConfigurations } from './whatsapp-business-connection-configurations.js';

describe('toWhatsAppBusinessConnectionConfigurations', () => {
  it('selects business phones from a shared immutable runtime snapshot', () => {
    const configurations = toWhatsAppBusinessConnectionConfigurations([
      Object.freeze({
        appId: '1234567890123456789',
        appSecret: 'synthetic-whatsapp-app-secret-01234567890123456789',
        id: 'whatsapp-business-support',
        operatorApiToken: 'synthetic_whatsapp_operator_support_012345678901234567',
        phoneNumberId: '112233445566778899',
        type: 'whatsapp_business' as const,
        wabaId: '9876543210987654321',
        webhookUrl: 'https://example.test/v1/webhooks/whatsapp-business',
        webhookVerifyToken: 'synthetic-whatsapp-verify-token-012345678901234567'
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
        appSecret: 'synthetic-whatsapp-app-secret-01234567890123456789',
        connectionId: 'whatsapp-business-support',
        operatorApiToken: 'synthetic_whatsapp_operator_support_012345678901234567',
        phoneNumberId: '112233445566778899',
        wabaId: '9876543210987654321',
        webhookUrl: 'https://example.test/v1/webhooks/whatsapp-business',
        webhookVerifyToken: 'synthetic-whatsapp-verify-token-012345678901234567'
      }
    ]);
    expect(Object.isFrozen(configurations)).toBe(true);
    expect(Object.isFrozen(configurations[0])).toBe(true);
  });
});

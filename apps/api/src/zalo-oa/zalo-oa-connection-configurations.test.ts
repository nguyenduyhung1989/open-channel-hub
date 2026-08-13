import type { RuntimeConnection } from '../connections/runtime-connection-configuration.js';
import { describe, expect, it } from 'vitest';

import { toZaloOaConnectionConfigurations } from './zalo-oa-connection-configurations.js';

describe('toZaloOaConnectionConfigurations', () => {
  it('selects only Zalo OA accounts from one already-loaded connector snapshot', () => {
    const connections: readonly RuntimeConnection[] = Object.freeze([
      Object.freeze({
        appId: '1234567890123456789',
        id: 'zalo-oa-support',
        oaId: '9876543210987654321',
        oaSecretKey: 'synthetic-zalo-oa-secret',
        operatorApiToken: 'synthetic_zalo_operator_support_012345678901234567',
        type: 'zalo_oa' as const,
        webhookUrl: 'https://example.test/v1/webhooks/zalo-oa'
      }),
      Object.freeze({
        botToken: 'synthetic-telegram-token',
        id: 'telegram-bot-support',
        operatorApiToken: 'synthetic_telegram_operator_support_012345678901234',
        type: 'telegram_bot' as const,
        webhookSecret: 'synthetic_telegram_webhook_secret_0123456789'
      })
    ]);

    expect(toZaloOaConnectionConfigurations(connections)).toEqual([
      {
        appId: '1234567890123456789',
        connectionId: 'zalo-oa-support',
        oaId: '9876543210987654321',
        oaSecretKey: 'synthetic-zalo-oa-secret',
        operatorApiToken: 'synthetic_zalo_operator_support_012345678901234567',
        webhookUrl: 'https://example.test/v1/webhooks/zalo-oa'
      }
    ]);
  });
});

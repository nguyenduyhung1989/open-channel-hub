import type { RuntimeConnection } from '../connections/runtime-connection-configuration.js';
import { describe, expect, it } from 'vitest';

import { toZaloUserConnectionConfigurations } from './zalo-user-connection-configurations.js';

describe('toZaloUserConnectionConfigurations', () => {
  it('selects only experimental Zalo User bridges from one loaded runtime snapshot', () => {
    const connections: readonly RuntimeConnection[] = Object.freeze([
      Object.freeze({
        accountId: '1234567890123456789',
        bridgeToken: 'synthetic_zalo_user_bridge_token_0123456789012345678',
        id: 'zalo-user-support',
        operatorApiToken: 'synthetic_zalo_user_operator_token_0123456789012345',
        type: 'zalo_user' as const
      }),
      Object.freeze({
        botToken: '123456789:synthetic-telegram-token',
        id: 'telegram-bot-support',
        operatorApiToken: 'synthetic_telegram_operator_token_012345678901234',
        type: 'telegram_bot' as const,
        webhookSecret: 'synthetic_telegram_webhook_secret_0123456789'
      })
    ]);

    expect(toZaloUserConnectionConfigurations(connections)).toEqual([
      {
        accountId: '1234567890123456789',
        bridgeToken: 'synthetic_zalo_user_bridge_token_0123456789012345678',
        connectionId: 'zalo-user-support',
        operatorApiToken: 'synthetic_zalo_user_operator_token_0123456789012345'
      }
    ]);
  });
});

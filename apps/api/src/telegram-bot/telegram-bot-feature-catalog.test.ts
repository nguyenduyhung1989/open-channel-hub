import type { CanonicalEvent } from '@open-channel-hub/contracts';
import type { InboundEventPage, SendMessageResult } from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import {
  TelegramBotFeatureCatalogError,
  createTelegramBotFeatureCatalog
} from './telegram-bot-feature-catalog.js';
import type { TelegramBotFeature } from './telegram-bot-feature.js';

const createFeature = (
  input: Readonly<{ connectionId: string; operatorApiToken: string }>
): TelegramBotFeature =>
  Object.freeze({
    connectionId: input.connectionId,
    normalize: (): readonly CanonicalEvent[] => [],
    operatorApiToken: input.operatorApiToken,
    readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
    receiveEvents: vi.fn(async (): Promise<void> => undefined),
    registration: Object.freeze({
      channel: 'telegram_bot',
      connectorId: 'telegram-bot',
      id: input.connectionId,
      tier: 'OFFICIAL'
    }),
    sendMessage: vi.fn(async (): Promise<SendMessageResult> => ({
      error: { code: 'connection_unavailable', connectionId: input.connectionId },
      ok: false
    })),
    webhookSecret: `synthetic_webhook_secret_${input.connectionId.replaceAll('-', '_')}_0123456789`
  });

describe('createTelegramBotFeatureCatalog', () => {
  it('resolves exactly the connection selected by a valid operator bearer token', () => {
    const support = createFeature({
      connectionId: 'telegram-bot-support',
      operatorApiToken: 'synthetic_operator_support_01234567890123456789'
    });
    const sales = createFeature({
      connectionId: 'telegram-bot-sales',
      operatorApiToken: 'synthetic_operator_sales_0123456789012345678901'
    });
    const catalog = createTelegramBotFeatureCatalog([support, sales]);

    expect(catalog.findByConnectionId('telegram-bot-support')).toBe(support);
    expect(catalog.findByConnectionId('telegram-bot-sales')).toBe(sales);
    expect(catalog.findByConnectionId('unknown')).toBeUndefined();
    expect(catalog.findByOperatorAuthorization(`Bearer ${support.operatorApiToken}`)).toBe(support);
    expect(catalog.findByOperatorAuthorization(`Bearer ${sales.operatorApiToken}`)).toBe(sales);
    expect(
      catalog.findByOperatorAuthorization('Bearer synthetic_wrong_token_012345678901')
    ).toBeUndefined();
  });

  it('rejects missing, duplicate, or malformed feature identities before routes are registered', () => {
    const feature = createFeature({
      connectionId: 'telegram-bot-support',
      operatorApiToken: 'synthetic_operator_support_01234567890123456789'
    });

    expect(() => createTelegramBotFeatureCatalog([])).toThrow(TelegramBotFeatureCatalogError);
    expect(() => createTelegramBotFeatureCatalog([feature, feature])).toThrow(
      TelegramBotFeatureCatalogError
    );
    expect(() =>
      createTelegramBotFeatureCatalog([
        feature,
        createFeature({
          connectionId: 'telegram-bot-sales',
          operatorApiToken: feature.operatorApiToken
        })
      ])
    ).toThrow(TelegramBotFeatureCatalogError);
    expect(() =>
      createTelegramBotFeatureCatalog([
        createFeature({
          connectionId: '.',
          operatorApiToken: 'synthetic_operator_dot_012345678901234567890'
        })
      ])
    ).toThrow(TelegramBotFeatureCatalogError);
    expect(() =>
      createTelegramBotFeatureCatalog([
        createFeature({
          connectionId: 'not a safe connection id',
          operatorApiToken: 'synthetic_operator_support_01234567890123456789'
        })
      ])
    ).toThrow(TelegramBotFeatureCatalogError);
    expect(() =>
      createTelegramBotFeatureCatalog([
        feature,
        Object.freeze({
          ...createFeature({
            connectionId: 'telegram-bot-sales',
            operatorApiToken: 'synthetic_operator_sales_0123456789012345678901'
          }),
          webhookSecret: feature.operatorApiToken
        })
      ])
    ).toThrow(TelegramBotFeatureCatalogError);
  });

  it('allows a dot-segment identifier only for the fixed legacy one-Bot route', () => {
    const legacyFeature = Object.freeze({
      ...createFeature({
        connectionId: '.',
        operatorApiToken: 'synthetic_operator_dot_012345678901234567890'
      }),
      webhookSecret: 'synthetic_webhook_secret_dot_0123456789'
    });

    const catalog = createTelegramBotFeatureCatalog([legacyFeature], {
      allowLegacyDotSegmentConnectionId: true
    });

    expect(catalog.findByConnectionId('.')).toBe(legacyFeature);
  });
});

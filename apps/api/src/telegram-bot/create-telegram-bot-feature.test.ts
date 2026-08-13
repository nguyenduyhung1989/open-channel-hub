import type { EnabledTelegramBotEnvironment } from '../config/environment.js';
import type { InboundEventPage } from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import { createTelegramBotFeature } from './create-telegram-bot-feature.js';

const ENVIRONMENT: EnabledTelegramBotEnvironment = Object.freeze({
  botToken: 'synthetic-bot-token',
  connectionId: 'telegram-bot-default',
  enabled: true,
  operatorApiToken: 'operator-token-with-at-least-thirty-two-characters',
  webhookSecret: 'synthetic_webhook_secret_0123456789'
});

describe('createTelegramBotFeature', () => {
  it('wires the domain use case to the official gateway without a real network call', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: { message_id: 301 } }), { status: 200 })
      );
    const receiveEvents = vi.fn(async (): Promise<void> => undefined);
    const readInboundEvents = vi.fn(async (): Promise<InboundEventPage> => ({ events: [] }));
    const feature = await createTelegramBotFeature(ENVIRONMENT, {
      fetchImpl,
      now: () => new Date('2026-08-12T00:00:00.000Z'),
      readInboundEvents,
      receiveEvents
    });

    await expect(
      feature.sendMessage({
        connectionId: 'telegram-bot-default',
        recipientId: '42',
        text: 'Synthetic outbound message'
      })
    ).resolves.toEqual({
      ok: true,
      receipt: {
        acceptedAt: '2026-08-12T00:00:00.000Z',
        connectionId: 'telegram-bot-default',
        providerMessageId: '301'
      }
    });
    expect(fetchImpl).toHaveBeenCalledOnce();

    const events = feature.normalize({
      message: {
        chat: { id: 42, type: 'private' },
        date: 1_786_492_800,
        message_id: 302,
        text: 'Synthetic inbound message'
      },
      update_id: 9001
    });
    await feature.receiveEvents(events);

    await feature.readInboundEvents({
      connectionId: 'telegram-bot-default',
      pageSize: 50
    });

    expect(receiveEvents).toHaveBeenCalledWith(events);
    expect(readInboundEvents).toHaveBeenCalledWith({
      connectionId: 'telegram-bot-default',
      pageSize: 50
    });
  });

  it('completes a synthetic authenticated HTTP send through every Phase 1a layer', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: { message_id: 303 } }), { status: 200 })
      );
    const feature = await createTelegramBotFeature(ENVIRONMENT, {
      fetchImpl,
      now: () => new Date('2026-08-12T00:00:00.000Z'),
      readInboundEvents: async (): Promise<InboundEventPage> => ({ events: [] }),
      receiveEvents: async (): Promise<void> => undefined
    });
    const app = await buildApp({ telegramBot: feature });

    try {
      const response = await app.inject({
        headers: { authorization: `Bearer ${ENVIRONMENT.operatorApiToken}` },
        method: 'POST',
        payload: { recipientId: '42', text: 'Synthetic end-to-end message' },
        url: '/v1/telegram-bot/messages'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        success: true,
        data: {
          acceptedAt: '2026-08-12T00:00:00.000Z',
          connectionId: 'telegram-bot-default',
          providerMessageId: '303'
        }
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        'https://api.telegram.org/botsynthetic-bot-token/sendMessage',
        expect.objectContaining({
          body: JSON.stringify({ chat_id: '42', text: 'Synthetic end-to-end message' }),
          method: 'POST',
          redirect: 'error'
        })
      );
    } finally {
      await app.close();
    }
  });

  it('rejects a normalized event that cannot belong to its configured connection before durable storage', async () => {
    const receiveEvents = vi.fn(async (): Promise<void> => undefined);
    const feature = await createTelegramBotFeature(ENVIRONMENT, {
      fetchImpl: vi.fn<typeof fetch>(),
      readInboundEvents: async (): Promise<InboundEventPage> => ({ events: [] }),
      receiveEvents
    });

    await expect(
      feature.receiveEvents([
        {
          channel: 'telegram_bot',
          connectionId: 'telegram-bot-other',
          id: 'telegram:event:9001',
          message: {
            conversationId: '42',
            id: '301',
            senderId: '42',
            text: 'Synthetic inbound message'
          },
          occurredAt: '2026-08-12T00:00:00.000Z',
          providerEventId: '9001',
          type: 'message.received'
        }
      ])
    ).rejects.toThrow('Telegram inbound events do not match their configured connection.');
    expect(receiveEvents).not.toHaveBeenCalled();
  });
});

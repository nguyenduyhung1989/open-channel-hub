import type { CanonicalEvent } from '@open-channel-hub/contracts';
import { ConnectorProviderError } from '@open-channel-hub/connector-sdk';
import type { SendMessageResult } from '@open-channel-hub/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { TelegramBotFeature } from './telegram-bot-feature.js';

const OPERATOR_TOKEN = 'operator-token-with-at-least-thirty-two-characters';
const WEBHOOK_SECRET = 'synthetic_webhook_secret_0123456789';
const EVENT: CanonicalEvent = Object.freeze({
  channel: 'telegram_bot',
  connectionId: 'telegram-bot-default',
  id: 'telegram:event:9001',
  message: Object.freeze({
    conversationId: '42',
    id: '301',
    senderId: '42',
    text: 'Synthetic inbound message'
  }),
  occurredAt: '2026-08-12T00:00:00.000Z',
  providerEventId: '9001',
  type: 'message.received'
});

const SUCCESSFUL_SEND: SendMessageResult = Object.freeze({
  ok: true,
  receipt: Object.freeze({
    acceptedAt: '2026-08-12T00:00:00.000Z',
    connectionId: 'telegram-bot-default',
    providerMessageId: '301'
  })
});

describe('Telegram Bot routes', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (app) => app.close()));
  });

  it('does not expose Telegram routes when the connector is disabled', async () => {
    const app = await buildApp();
    applications.push(app);

    const response = await app.inject({ method: 'POST', url: '/v1/telegram-bot/messages' });

    expect(response.statusCode).toBe(404);
  });

  it('requires the local operator credential before sending a Telegram message', async () => {
    const { feature, sendMessage } = createFeature();
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const response = await app.inject({
      method: 'POST',
      payload: { recipientId: '42', text: 'No credential.' },
      url: '/v1/telegram-bot/messages'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'unauthorized', message: 'The operator credential is invalid.' }
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('sends a bounded text request through the configured Telegram connection', async () => {
    const { feature, sendMessage } = createFeature();
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'POST',
      payload: { recipientId: ' 42 ', text: 'Synthetic outbound message' },
      url: '/v1/telegram-bot/messages'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: {
        acceptedAt: '2026-08-12T00:00:00.000Z',
        connectionId: 'telegram-bot-default',
        providerMessageId: '301'
      }
    });
    expect(sendMessage).toHaveBeenCalledWith({
      connectionId: 'telegram-bot-default',
      recipientId: '42',
      text: 'Synthetic outbound message'
    });
  });

  it('rejects a malformed outbound request before reaching the Telegram feature', async () => {
    const { feature, sendMessage } = createFeature();
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'POST',
      payload: { recipientId: '42', text: 'x'.repeat(4097) },
      url: '/v1/telegram-bot/messages'
    });

    expect(response.statusCode).toBe(400);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('returns a safe client error for malformed JSON without reaching the Telegram feature', async () => {
    const { feature, sendMessage } = createFeature();
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const response = await app.inject({
      headers: {
        authorization: `Bearer ${OPERATOR_TOKEN}`,
        'content-type': 'application/json'
      },
      method: 'POST',
      payload: '{this is not JSON',
      url: '/v1/telegram-bot/messages'
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'validation_error', message: 'The request is invalid.' }
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(response.body).not.toContain('JSON');
  });

  it('returns a generic upstream error without leaking provider details', async () => {
    const { feature } = createFeature({
      sendMessage: vi.fn(async () => {
        throw new ConnectorProviderError({
          cause: new Error('Synthetic provider error description must never leave the server.'),
          channel: 'telegram_bot',
          operation: 'telegram.sendMessage'
        });
      })
    });
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'POST',
      payload: { recipientId: '42', text: 'Synthetic outbound message' },
      url: '/v1/telegram-bot/messages'
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      success: false,
      error: {
        code: 'provider_failure',
        message: 'The Telegram provider could not accept the request.'
      }
    });
    expect(response.body).not.toContain('Synthetic provider error description');
  });

  it('rejects a webhook without its separate Telegram secret before normalizing input', async () => {
    const { feature, normalize } = createFeature();
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const response = await app.inject({
      method: 'POST',
      payload: { update_id: 9001 },
      url: '/v1/webhooks/telegram-bot'
    });

    expect(response.statusCode).toBe(401);
    expect(normalize).not.toHaveBeenCalled();
  });

  it('normalizes and hands off an authenticated Telegram webhook without returning its payload', async () => {
    const { feature, normalize, receiveEvents } = createFeature();
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const response = await app.inject({
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      method: 'POST',
      payload: { update_id: 9001 },
      url: '/v1/webhooks/telegram-bot'
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(normalize).toHaveBeenCalledWith({ update_id: 9001 });
    expect(receiveEvents).toHaveBeenCalledWith([EVENT]);
  });
});

function createFeature(overrides: Partial<TelegramBotFeature> = {}) {
  const sendMessage = vi.fn(async (): Promise<SendMessageResult> => SUCCESSFUL_SEND);
  const normalize = vi.fn((): readonly CanonicalEvent[] => [EVENT]);
  const receiveEvents = vi.fn(async (): Promise<void> => undefined);
  const feature: TelegramBotFeature = {
    connectionId: 'telegram-bot-default',
    normalize,
    operatorApiToken: OPERATOR_TOKEN,
    receiveEvents,
    sendMessage,
    webhookSecret: WEBHOOK_SECRET,
    ...overrides
  };

  return { feature, normalize, receiveEvents, sendMessage };
}

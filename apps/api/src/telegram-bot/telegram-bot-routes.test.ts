import type { CanonicalEvent } from '@open-channel-hub/contracts';
import { ConnectorProviderError } from '@open-channel-hub/connector-sdk';
import type { InboundEventPage, SendMessageResult } from '@open-channel-hub/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { TelegramBotFeature } from './telegram-bot-feature.js';

const OPERATOR_TOKEN = 'operator-token-with-at-least-thirty-two-characters';
const WEBHOOK_SECRET = 'synthetic_webhook_secret_0123456789';
const SUPPORT_OPERATOR_TOKEN = 'synthetic_operator_support_01234567890123456789';
const SUPPORT_WEBHOOK_SECRET = 'synthetic_support_webhook_secret_0123456789';
const SALES_OPERATOR_TOKEN = 'synthetic_operator_sales_0123456789012345678901';
const SALES_WEBHOOK_SECRET = 'synthetic_sales_webhook_secret_01234567890123456789';
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

    const inboundEventsResponse = await app.inject({
      method: 'GET',
      url: '/v1/telegram-bot/inbound-events'
    });

    expect(inboundEventsResponse.statusCode).toBe(404);
  });

  it('requires the local operator credential before reading inbound events', async () => {
    const { feature, readInboundEvents } = createFeature();
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/telegram-bot/inbound-events?limit=not-a-number'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'unauthorized', message: 'The operator credential is invalid.' }
    });
    expect(readInboundEvents).not.toHaveBeenCalled();
  });

  it('rejects malformed inbound-event queries and cursors before reaching storage', async () => {
    const { feature, readInboundEvents } = createFeature();
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const invalidLimit = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: '/v1/telegram-bot/inbound-events?limit=101'
    });
    const arbitraryConnection = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: '/v1/telegram-bot/inbound-events?connectionId=another-connection'
    });
    const malformedCursor = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: '/v1/telegram-bot/inbound-events?cursor=not-a-cursor%40'
    });
    const invalidCursorOrder = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: `/v1/telegram-bot/inbound-events?cursor=${encodeCursor({
        beforeSequence: '42',
        snapshotMaxSequence: '41'
      })}`
    });
    const overflowingCursor = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: `/v1/telegram-bot/inbound-events?cursor=${encodeCursor({
        beforeSequence: '9223372036854775808',
        snapshotMaxSequence: '9223372036854775808'
      })}`
    });
    const oversizedCursor = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: `/v1/telegram-bot/inbound-events?cursor=${'a'.repeat(513)}`
    });

    for (const response of [
      invalidLimit,
      arbitraryConnection,
      malformedCursor,
      invalidCursorOrder,
      overflowingCursor,
      oversizedCursor
    ]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        success: false,
        error: { code: 'validation_error', message: 'The request is invalid.' }
      });
    }
    expect(readInboundEvents).not.toHaveBeenCalled();
  });

  it('reads a stable inbound-event page for only the configured Telegram connection', async () => {
    const cursor = encodeCursor({ beforeSequence: '29', snapshotMaxSequence: '41' });
    const nextCursor = { beforeSequence: '11', snapshotMaxSequence: '41' };
    const rawProviderPayload = 'Synthetic raw provider payload must never leave the server.';
    const eventWithUnexpectedField = Object.freeze({
      ...EVENT,
      rawProviderPayload,
      telegramChatType: 'private' as const
    }) as CanonicalEvent;
    const { feature, readInboundEvents } = createFeature({
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({
        events: [eventWithUnexpectedField],
        nextCursor
      }))
    });
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: `/v1/telegram-bot/inbound-events?cursor=${cursor}&limit=2`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: {
        events: [EVENT],
        nextCursor: encodeCursor(nextCursor)
      }
    });
    expect(readInboundEvents).toHaveBeenCalledWith({
      connectionId: 'telegram-bot-default',
      cursor: { beforeSequence: '29', snapshotMaxSequence: '41' },
      pageSize: 2
    });
    expect(response.body).not.toContain(rawProviderPayload);
    expect(response.body).not.toContain('telegramChatType');
  });

  it('invalidates unversioned connection-bound and Phase 2b cursors even in legacy one-Bot mode', async () => {
    const { feature, readInboundEvents } = createFeature();
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);
    const unversionedBoundCursor = encodeRawCursor({
      beforeSequence: '29',
      connectionId: 'telegram-bot-default',
      snapshotMaxSequence: '41'
    });
    const phase2bCursor = encodeRawCursor({ beforeSequence: '29', snapshotMaxSequence: '41' });

    const [unversionedBound, phase2b] = await Promise.all([
      app.inject({
        headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
        method: 'GET',
        url: `/v1/telegram-bot/inbound-events?cursor=${unversionedBoundCursor}`
      }),
      app.inject({
        headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
        method: 'GET',
        url: `/v1/telegram-bot/inbound-events?cursor=${phase2bCursor}`
      })
    ]);

    for (const response of [unversionedBound, phase2b]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        success: false,
        error: { code: 'validation_error', message: 'The request is invalid.' }
      });
    }
    expect(readInboundEvents).not.toHaveBeenCalled();
  });

  it('does not expose a dynamic webhook path in legacy one-Bot mode', async () => {
    const { feature } = createFeature({ connectionId: '.' });
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const response = await app.inject({
      method: 'POST',
      payload: { update_id: 9001 },
      url: '/v1/webhooks/telegram-bot/not-a-legacy-route'
    });

    expect(response.statusCode).toBe(404);
  });

  it('keeps a bound next cursor usable for a historical legacy dot-segment label', async () => {
    const readInboundEvents = vi.fn(async (): Promise<InboundEventPage> => ({
      events: [],
      nextCursor: { beforeSequence: '29', snapshotMaxSequence: '41' }
    }));
    const { feature } = createFeature({ connectionId: '.', readInboundEvents });
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const firstResponse = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: '/v1/telegram-bot/inbound-events'
    });
    const nextCursor = firstResponse.json().data.nextCursor as string;
    const secondResponse = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: `/v1/telegram-bot/inbound-events?cursor=${nextCursor}`
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(decodeCursor(nextCursor)).toEqual({
      beforeSequence: '29',
      connectionId: '.',
      orderVersion: 2,
      snapshotMaxSequence: '41'
    });
    expect(secondResponse.statusCode).toBe(200);
    expect(readInboundEvents).toHaveBeenLastCalledWith({
      connectionId: '.',
      cursor: { beforeSequence: '29', snapshotMaxSequence: '41' },
      pageSize: 50
    });
  });

  it('rejects a Phase 2b cursor for runtime-configured connections, even with one connection', async () => {
    const { feature, readInboundEvents } = createFeature();
    const app = await buildApp({ telegramBots: [feature] });
    applications.push(app);
    const legacyCursor = Buffer.from(
      JSON.stringify({ beforeSequence: '29', snapshotMaxSequence: '41' }),
      'utf8'
    ).toString('base64url');

    const response = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: `/v1/telegram-bot/inbound-events?cursor=${legacyCursor}`
    });

    expect(response.statusCode).toBe(400);
    expect(readInboundEvents).not.toHaveBeenCalled();
  });

  it('returns a generic failure when inbound-event storage cannot be read', async () => {
    const { feature, readInboundEvents } = createFeature({
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => {
        throw new Error(
          'Synthetic PostgreSQL credential and query detail must never leave the server.'
        );
      })
    });
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: '/v1/telegram-bot/inbound-events'
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'internal_error', message: 'An unexpected error occurred.' }
    });
    expect(response.body).not.toContain('Synthetic PostgreSQL credential');
    expect(readInboundEvents).toHaveBeenCalledWith({
      connectionId: 'telegram-bot-default',
      pageSize: 50
    });
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

  it('does not acknowledge a webhook when durable event recording fails', async () => {
    const receiveEvents = vi.fn(async (): Promise<void> => {
      throw new Error('Synthetic PostgreSQL failure detail must never reach Telegram.');
    });
    const { feature } = createFeature({ receiveEvents });
    const app = await buildApp({ telegramBot: feature });
    applications.push(app);

    const response = await app.inject({
      headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET },
      method: 'POST',
      payload: { update_id: 9001 },
      url: '/v1/webhooks/telegram-bot'
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'internal_error', message: 'An unexpected error occurred.' }
    });
    expect(receiveEvents).toHaveBeenCalledWith([EVENT]);
    expect(response.body).not.toContain('Synthetic PostgreSQL failure detail');
  });

  it('scopes operator reads and sends to the connection selected by its bearer token', async () => {
    const supportReadInboundEvents = vi.fn(async (): Promise<InboundEventPage> => ({
      events: [Object.freeze({ ...EVENT, connectionId: 'telegram-bot-support' })]
    }));
    const salesSendMessage = vi.fn(async (): Promise<SendMessageResult> => ({
      ok: true,
      receipt: {
        acceptedAt: '2026-08-13T00:00:00.000Z',
        connectionId: 'telegram-bot-sales',
        providerMessageId: 'sales-301'
      }
    }));
    const { feature: support, sendMessage: supportSendMessage } = createFeature({
      connectionId: 'telegram-bot-support',
      operatorApiToken: SUPPORT_OPERATOR_TOKEN,
      readInboundEvents: supportReadInboundEvents,
      webhookSecret: SUPPORT_WEBHOOK_SECRET
    });
    const { feature: sales, readInboundEvents: salesReadInboundEvents } = createFeature({
      connectionId: 'telegram-bot-sales',
      operatorApiToken: SALES_OPERATOR_TOKEN,
      sendMessage: salesSendMessage,
      webhookSecret: SALES_WEBHOOK_SECRET
    });
    const app = await buildApp({ telegramBots: [support, sales] });
    applications.push(app);

    const supportRead = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_OPERATOR_TOKEN}` },
      method: 'GET',
      url: '/v1/telegram-bot/inbound-events'
    });
    const salesSend = await app.inject({
      headers: { authorization: `Bearer ${SALES_OPERATOR_TOKEN}` },
      method: 'POST',
      payload: { recipientId: '42', text: 'Synthetic sales message' },
      url: '/v1/telegram-bot/messages'
    });
    const crossConnectionCursor = await app.inject({
      headers: { authorization: `Bearer ${SALES_OPERATOR_TOKEN}` },
      method: 'GET',
      url: `/v1/telegram-bot/inbound-events?cursor=${encodeCursor(
        { beforeSequence: '1', snapshotMaxSequence: '1' },
        'telegram-bot-support'
      )}`
    });

    expect(supportRead.statusCode).toBe(200);
    expect(supportReadInboundEvents).toHaveBeenCalledWith({
      connectionId: 'telegram-bot-support',
      pageSize: 50
    });
    expect(salesReadInboundEvents).not.toHaveBeenCalled();
    expect(salesSend.statusCode).toBe(200);
    expect(salesSendMessage).toHaveBeenCalledWith({
      connectionId: 'telegram-bot-sales',
      recipientId: '42',
      text: 'Synthetic sales message'
    });
    expect(supportSendMessage).not.toHaveBeenCalled();
    expect(crossConnectionCursor.statusCode).toBe(400);
    expect(salesReadInboundEvents).not.toHaveBeenCalled();
  });

  it('dispatches a dynamic webhook only to its configured connection without revealing an unknown one', async () => {
    const supportNormalize = vi.fn((): readonly CanonicalEvent[] => [
      Object.freeze({ ...EVENT, connectionId: 'telegram-bot-support' })
    ]);
    const supportReceiveEvents = vi.fn(async (): Promise<void> => undefined);
    const { feature: support } = createFeature({
      connectionId: 'telegram-bot-support',
      normalize: supportNormalize,
      operatorApiToken: SUPPORT_OPERATOR_TOKEN,
      receiveEvents: supportReceiveEvents,
      webhookSecret: SUPPORT_WEBHOOK_SECRET
    });
    const { feature: sales, normalize: salesNormalize } = createFeature({
      connectionId: 'telegram-bot-sales',
      operatorApiToken: SALES_OPERATOR_TOKEN,
      webhookSecret: SALES_WEBHOOK_SECRET
    });
    const app = await buildApp({ telegramBots: [support, sales] });
    applications.push(app);

    const unknownConnection = await app.inject({
      headers: { 'x-telegram-bot-api-secret-token': SUPPORT_WEBHOOK_SECRET },
      method: 'POST',
      payload: { update_id: 9001 },
      url: '/v1/webhooks/telegram-bot/telegram-bot-missing'
    });
    const wrongSecret = await app.inject({
      headers: { 'x-telegram-bot-api-secret-token': SALES_WEBHOOK_SECRET },
      method: 'POST',
      payload: { update_id: 9001 },
      url: '/v1/webhooks/telegram-bot/telegram-bot-support'
    });
    const validSupportWebhook = await app.inject({
      headers: { 'x-telegram-bot-api-secret-token': SUPPORT_WEBHOOK_SECRET },
      method: 'POST',
      payload: { update_id: 9001 },
      url: '/v1/webhooks/telegram-bot/telegram-bot-support'
    });

    expect(unknownConnection.statusCode).toBe(401);
    expect(wrongSecret.statusCode).toBe(401);
    expect(unknownConnection.body).toBe(wrongSecret.body);
    expect(validSupportWebhook.statusCode).toBe(204);
    expect(supportNormalize).toHaveBeenCalledOnce();
    expect(supportReceiveEvents).toHaveBeenCalledOnce();
    expect(salesNormalize).not.toHaveBeenCalled();
  });
});

function createFeature(overrides: Partial<TelegramBotFeature> = {}) {
  const connectionId = overrides.connectionId ?? 'telegram-bot-default';
  const readInboundEvents = vi.fn(async (): Promise<InboundEventPage> => ({ events: [] }));
  const sendMessage = vi.fn(async (): Promise<SendMessageResult> => SUCCESSFUL_SEND);
  const normalize = vi.fn((): readonly CanonicalEvent[] => [EVENT]);
  const receiveEvents = vi.fn(async (): Promise<void> => undefined);
  const feature: TelegramBotFeature = {
    connectionId,
    normalize,
    operatorApiToken: OPERATOR_TOKEN,
    readInboundEvents,
    receiveEvents,
    registration: Object.freeze({
      channel: 'telegram_bot',
      connectorId: 'telegram-bot',
      id: connectionId,
      tier: 'OFFICIAL'
    }),
    sendMessage,
    webhookSecret: WEBHOOK_SECRET,
    ...overrides
  };

  return {
    feature,
    normalize,
    readInboundEvents: feature.readInboundEvents,
    receiveEvents,
    sendMessage
  };
}

const encodeCursor = (
  cursor: Readonly<{ beforeSequence: string; snapshotMaxSequence: string }>,
  connectionId = 'telegram-bot-default'
): string =>
  encodeRawCursor({
    beforeSequence: cursor.beforeSequence,
    connectionId,
    orderVersion: 2,
    snapshotMaxSequence: cursor.snapshotMaxSequence
  });

const encodeRawCursor = (cursor: Readonly<Record<string, unknown>>): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

const decodeCursor = (cursor: string): unknown =>
  JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));

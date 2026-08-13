import { createHash } from 'node:crypto';

import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventPage } from '@open-channel-hub/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { ZaloOaFeature } from './zalo-oa-feature.js';
import { fingerprintZaloOaProviderIdentity } from './zalo-oa-provider-identity.js';

const APP_ID = '1234567890123456789';
const OA_ID = '9876543210987654321';
const SALES_OA_ID = '9876543210987654322';
const CONNECTION_ID = 'zalo-oa-support';
const SALES_CONNECTION_ID = 'zalo-oa-sales';
const OPERATOR_TOKEN = 'synthetic_zalo_operator_token_012345678901234567';
const SALES_OPERATOR_TOKEN = 'synthetic_zalo_sales_token_0123456789012345678';
const OA_SECRET = 'synthetic-zalo-oa-secret-key';

const textPayload = (
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  app_id: APP_ID,
  event_name: 'user_send_text',
  message: {
    msg_id: 'zalo-message-101',
    text: 'Xin chào Zalo OA 👋'
  },
  recipient: { id: OA_ID },
  sender: { id: '246845883529197922' },
  timestamp: '1786492800000',
  ...overrides
});

const canonicalEvent = (connectionId = CONNECTION_ID): CanonicalEvent =>
  Object.freeze({
    channel: 'zalo_oa',
    connectionId,
    id: `zalo-oa:${connectionId}:event:zalo-message-101`,
    message: Object.freeze({
      conversationId: '246845883529197922',
      id: 'zalo-message-101',
      senderId: '246845883529197922',
      text: 'Xin chào Zalo OA 👋'
    }),
    occurredAt: '2026-08-12T00:00:00.000Z',
    providerEventId: 'zalo-message-101',
    type: 'message.received'
  });

const toRawJson = (payload: object): string => JSON.stringify(payload);

const sign = (
  rawJson: string,
  options: Readonly<{ appId?: string; oaSecretKey?: string; timestamp?: string }> = {}
): string =>
  createHash('sha256')
    .update(
      `${options.appId ?? APP_ID}${rawJson}${options.timestamp ?? '1786492800000'}${options.oaSecretKey ?? OA_SECRET}`,
      'utf8'
    )
    .digest('hex');

describe('Zalo OA routes', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (app) => app.close()));
  });

  it('does not expose Zalo OA routes when no Zalo OA is configured', async () => {
    const app = await buildApp();
    applications.push(app);

    const webhook = await app.inject({ method: 'POST', url: '/v1/webhooks/zalo-oa' });
    const inboundEvents = await app.inject({ method: 'GET', url: '/v1/zalo-oa/inbound-events' });

    expect(webhook.statusCode).toBe(404);
    expect(inboundEvents.statusCode).toBe(404);
  });

  it('verifies the exact raw JSON signature, persists one canonical text event, and returns 200', async () => {
    const { feature, receiveEvents } = createFeature();
    const app = await buildApp({ zaloOas: [feature] });
    applications.push(app);
    const rawJson = `{"timestamp":"1786492800000", "recipient":{"id":"${OA_ID}"},"message":{"text":"Xin chào Zalo OA 👋","msg_id":"zalo-message-101"},"event_name":"user_send_text","sender":{"id":"246845883529197922"},"app_id":"${APP_ID}"}`;

    const response = await app.inject({
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-zevent-signature': sign(rawJson)
      },
      method: 'POST',
      payload: rawJson,
      url: '/v1/webhooks/zalo-oa'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('');
    expect(receiveEvents).toHaveBeenCalledWith([canonicalEvent()]);
    expect(response.body).not.toContain(rawJson);
  });

  it('rejects a signature made for a reserialized or one-byte-different JSON body before storage', async () => {
    const { feature, receiveEvents, normalize } = createFeature();
    const app = await buildApp({ zaloOas: [feature] });
    applications.push(app);
    const signedRawJson = toRawJson(textPayload());
    const modifiedRawJson = signedRawJson.replace('Xin chào', 'Xin  chào');

    const response = await app.inject({
      headers: {
        'content-type': 'application/json',
        'x-zevent-signature': sign(signedRawJson)
      },
      method: 'POST',
      payload: modifiedRawJson,
      url: '/v1/webhooks/zalo-oa'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(unauthorizedResponse());
    expect(normalize).not.toHaveBeenCalled();
    expect(receiveEvents).not.toHaveBeenCalled();
  });

  it('rejects malformed UTF-8 or JSON before normalizing or storing a provider event', async () => {
    const { feature, normalize, receiveEvents } = createFeature();
    const app = await buildApp({ zaloOas: [feature] });
    applications.push(app);

    const malformedUtf8 = await app.inject({
      headers: { 'content-type': 'application/json', 'x-zevent-signature': '0'.repeat(64) },
      method: 'POST',
      payload: Buffer.from([0xff, 0xfe]),
      url: '/v1/webhooks/zalo-oa'
    });
    const malformedJson = await app.inject({
      headers: { 'content-type': 'application/json', 'x-zevent-signature': '0'.repeat(64) },
      method: 'POST',
      payload: '{"app_id":',
      url: '/v1/webhooks/zalo-oa'
    });

    for (const response of [malformedUtf8, malformedJson]) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual(unauthorizedResponse());
    }
    expect(normalize).not.toHaveBeenCalled();
    expect(receiveEvents).not.toHaveBeenCalled();
  });

  it('makes an unknown App/OA pair and a wrong signature indistinguishable', async () => {
    const { feature, receiveEvents, normalize } = createFeature();
    const app = await buildApp({ zaloOas: [feature] });
    applications.push(app);
    const knownRawJson = toRawJson(textPayload());
    const unknownRawJson = toRawJson(textPayload({ recipient: { id: SALES_OA_ID } }));

    const wrongSignature = await app.inject({
      headers: { 'content-type': 'application/json', 'x-zevent-signature': '0'.repeat(64) },
      method: 'POST',
      payload: knownRawJson,
      url: '/v1/webhooks/zalo-oa'
    });
    const unknownIdentity = await app.inject({
      headers: { 'content-type': 'application/json', 'x-zevent-signature': sign(unknownRawJson) },
      method: 'POST',
      payload: unknownRawJson,
      url: '/v1/webhooks/zalo-oa'
    });

    expect(wrongSignature.statusCode).toBe(401);
    expect(unknownIdentity.statusCode).toBe(401);
    expect(wrongSignature.body).toBe(unknownIdentity.body);
    expect(normalize).not.toHaveBeenCalled();
    expect(receiveEvents).not.toHaveBeenCalled();
  });

  it('acknowledges a signed unsupported event without persisting it', async () => {
    const { feature, normalize, receiveEvents } = createFeature({ normalize: vi.fn(() => []) });
    const app = await buildApp({ zaloOas: [feature] });
    applications.push(app);
    const rawJson = toRawJson(textPayload({ event_name: 'user_send_image' }));

    const response = await app.inject({
      headers: { 'content-type': 'application/json', 'x-zevent-signature': sign(rawJson) },
      method: 'POST',
      payload: rawJson,
      url: '/v1/webhooks/zalo-oa'
    });

    expect(response.statusCode).toBe(200);
    expect(normalize).toHaveBeenCalledOnce();
    expect(receiveEvents).not.toHaveBeenCalled();
  });

  it('returns a generic 500 when durable storage fails so Zalo may retry', async () => {
    const { feature } = createFeature({
      receiveEvents: vi.fn(async (): Promise<void> => {
        throw new Error('Synthetic database connection string must never leave the webhook.');
      })
    });
    const app = await buildApp({ zaloOas: [feature] });
    applications.push(app);
    const rawJson = toRawJson(textPayload());

    const response = await app.inject({
      headers: { 'content-type': 'application/json', 'x-zevent-signature': sign(rawJson) },
      method: 'POST',
      payload: rawJson,
      url: '/v1/webhooks/zalo-oa'
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'internal_error', message: 'An unexpected error occurred.' }
    });
    expect(response.body).not.toContain('connection string');
  });

  it('keeps two OA accounts on one Zalo App isolated with their own configured secrets', async () => {
    const support = createFeature();
    const salesOaSecret = 'synthetic-zalo-sales-oa-secret-key';
    const sales = createFeature({
      connectionId: SALES_CONNECTION_ID,
      oaId: SALES_OA_ID,
      oaSecretKey: salesOaSecret,
      operatorApiToken: SALES_OPERATOR_TOKEN
    });
    const app = await buildApp({ zaloOas: [support.feature, sales.feature] });
    applications.push(app);
    const salesRawJson = toRawJson(textPayload({ recipient: { id: SALES_OA_ID } }));

    const response = await app.inject({
      headers: {
        'content-type': 'application/json',
        'x-zevent-signature': sign(salesRawJson, { oaSecretKey: salesOaSecret })
      },
      method: 'POST',
      payload: salesRawJson,
      url: '/v1/webhooks/zalo-oa'
    });

    expect(response.statusCode).toBe(200);
    expect(support.receiveEvents).not.toHaveBeenCalled();
    expect(sales.receiveEvents).toHaveBeenCalledWith([canonicalEvent(SALES_CONNECTION_ID)]);
  });

  it('requires an account-bound operator bearer before listing Zalo canonical events', async () => {
    const support = createFeature({
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({
        events: [canonicalEvent()],
        nextCursor: { beforeSequence: '4', snapshotMaxSequence: '9' }
      }))
    });
    const sales = createFeature({
      connectionId: SALES_CONNECTION_ID,
      oaId: SALES_OA_ID,
      operatorApiToken: SALES_OPERATOR_TOKEN,
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] }))
    });
    const app = await buildApp({ zaloOas: [support.feature, sales.feature] });
    applications.push(app);

    const unauthorized = await app.inject({
      method: 'GET',
      url: '/v1/zalo-oa/inbound-events?connectionId=zalo-oa-sales'
    });
    const supportPage = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: '/v1/zalo-oa/inbound-events?limit=2'
    });
    const supportCursor = supportPage.json().data.nextCursor as string;
    const crossAccountCursor = await app.inject({
      headers: { authorization: `Bearer ${SALES_OPERATOR_TOKEN}` },
      method: 'GET',
      url: `/v1/zalo-oa/inbound-events?cursor=${supportCursor}`
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(supportPage.statusCode).toBe(200);
    expect(supportPage.json()).toEqual({
      success: true,
      data: { events: [canonicalEvent()], nextCursor: supportCursor }
    });
    expect(support.readInboundEvents).toHaveBeenCalledWith({
      connectionId: CONNECTION_ID,
      pageSize: 2
    });
    expect(crossAccountCursor.statusCode).toBe(400);
    expect(sales.readInboundEvents).not.toHaveBeenCalled();
  });

  it('keeps Fastify standard JSON parsing intact for Telegram when the Zalo raw-body scope is enabled', async () => {
    const zalo = createFeature();
    const telegramWebhookSecret = 'synthetic_telegram_webhook_secret_0123456789';
    const telegramReceiveEvents = vi.fn(async (): Promise<void> => undefined);
    const telegramFeature = Object.freeze({
      connectionId: 'telegram-bot-default',
      normalize: vi.fn(() => []),
      operatorApiToken: 'synthetic_telegram_operator_token_012345678901234567',
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
      receiveEvents: telegramReceiveEvents,
      registration: Object.freeze({
        channel: 'telegram_bot',
        connectorId: 'telegram-bot',
        id: 'telegram-bot-default',
        tier: 'OFFICIAL'
      } satisfies ConnectionRegistration),
      sendMessage: vi.fn(),
      webhookSecret: telegramWebhookSecret
    });
    const app = await buildApp({ telegramBot: telegramFeature, zaloOas: [zalo.feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { 'x-telegram-bot-api-secret-token': telegramWebhookSecret },
      method: 'POST',
      payload: { update_id: 101 },
      url: '/v1/webhooks/telegram-bot'
    });

    expect(response.statusCode).toBe(204);
    expect(telegramFeature.normalize).toHaveBeenCalledWith({ update_id: 101 });
    expect(telegramReceiveEvents).not.toHaveBeenCalled();
  });
});

const createFeature = (
  options: Readonly<{
    connectionId?: string;
    normalize?: ZaloOaFeature['normalize'];
    oaId?: string;
    oaSecretKey?: string;
    operatorApiToken?: string;
    readInboundEvents?: ZaloOaFeature['readInboundEvents'];
    receiveEvents?: ZaloOaFeature['receiveEvents'];
  }> = {}
): Readonly<{
  feature: ZaloOaFeature;
  normalize: ReturnType<typeof vi.fn>;
  readInboundEvents: ReturnType<typeof vi.fn>;
  receiveEvents: ReturnType<typeof vi.fn>;
}> => {
  const connectionId = options.connectionId ?? CONNECTION_ID;
  const oaId = options.oaId ?? OA_ID;
  const normalize = options.normalize ?? vi.fn(() => [canonicalEvent(connectionId)]);
  const readInboundEvents =
    options.readInboundEvents ?? vi.fn(async (): Promise<InboundEventPage> => ({ events: [] }));
  const receiveEvents = options.receiveEvents ?? vi.fn(async (): Promise<void> => undefined);
  const feature: ZaloOaFeature = Object.freeze({
    appId: APP_ID,
    connectionId,
    normalize,
    oaId,
    oaSecretKey: options.oaSecretKey ?? OA_SECRET,
    operatorApiToken: options.operatorApiToken ?? OPERATOR_TOKEN,
    readInboundEvents,
    receiveEvents,
    registration: Object.freeze({
      channel: 'zalo_oa',
      connectorId: 'zalo-oa',
      id: connectionId,
      providerIdentityFingerprint: fingerprintZaloOaProviderIdentity(APP_ID, oaId),
      tier: 'OFFICIAL'
    })
  });

  return Object.freeze({
    feature,
    normalize: normalize as ReturnType<typeof vi.fn>,
    readInboundEvents: readInboundEvents as ReturnType<typeof vi.fn>,
    receiveEvents: receiveEvents as ReturnType<typeof vi.fn>
  });
};

const unauthorizedResponse = (): Readonly<{
  readonly error: Readonly<{ readonly code: string; readonly message: string }>;
  readonly success: false;
}> =>
  Object.freeze({
    error: Object.freeze({ code: 'unauthorized', message: 'The webhook credential is invalid.' }),
    success: false
  });

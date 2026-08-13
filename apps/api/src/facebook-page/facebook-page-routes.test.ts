import { createHash, createHmac } from 'node:crypto';

import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventPage } from '@open-channel-hub/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { ZaloOaFeature } from '../zalo-oa/zalo-oa-feature.js';
import { fingerprintZaloOaProviderIdentity } from '../zalo-oa/zalo-oa-provider-identity.js';
import type { FacebookPageFeature } from './facebook-page-feature.js';
import { fingerprintFacebookPageProviderIdentity } from './facebook-page-provider-identity.js';

const APP_ID = '1234567890123456789';
const OTHER_APP_ID = '1234567890123456790';
const PAGE_ID = '9876543210987654321';
const SALES_PAGE_ID = '9876543210987654322';
const OTHER_PAGE_ID = '9876543210987654323';
const CONNECTION_ID = 'facebook-page-support';
const SALES_CONNECTION_ID = 'facebook-page-sales';
const OPERATOR_TOKEN = 'synthetic_facebook_operator_support_012345678901234567';
const SALES_OPERATOR_TOKEN = 'synthetic_facebook_sales_operator_012345678901234567';
const APP_SECRET = 'synthetic-facebook-app-secret-01234567890123456789';
const VERIFY_TOKEN = 'synthetic-facebook-verify-token-012345678901234567';

interface FacebookWebhookPayload {
  readonly entry: readonly Record<string, unknown>[];
  readonly object: 'page';
}

const textPayload = (
  pageId = PAGE_ID,
  overrides: Readonly<Record<string, unknown>> = {}
): FacebookWebhookPayload =>
  ({
    entry: [
      {
        id: pageId,
        messaging: [
          {
            message: { mid: 'mid.synthetic.101', text: 'Facebook says xin chào 👋' },
            recipient: { id: pageId },
            sender: { id: '123456789012345678901' },
            timestamp: 1786492800000
          }
        ]
      }
    ],
    object: 'page',
    ...overrides
  }) as FacebookWebhookPayload;

const canonicalEvent = (connectionId = CONNECTION_ID): CanonicalEvent =>
  Object.freeze({
    channel: 'facebook_page',
    connectionId,
    id: `facebook-page:${connectionId}:event:mid.synthetic.101`,
    message: Object.freeze({
      conversationId: '123456789012345678901',
      id: 'mid.synthetic.101',
      senderId: '123456789012345678901',
      text: 'Facebook says xin chào 👋'
    }),
    occurredAt: '2026-08-12T00:00:00.000Z',
    providerEventId: 'mid.synthetic.101',
    type: 'message.received'
  });

const sign = (rawBody: string, appSecret = APP_SECRET): string =>
  `sha256=${createHmac('sha256', appSecret).update(Buffer.from(rawBody, 'utf8')).digest('hex')}`;

describe('Facebook Page routes', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (app) => app.close()));
  });

  it('does not expose Facebook Page routes when no Page is configured', async () => {
    const app = await buildApp();
    applications.push(app);

    const webhook = await app.inject({ method: 'POST', url: '/v1/webhooks/facebook-page' });
    const inboundEvents = await app.inject({
      method: 'GET',
      url: '/v1/facebook-page/inbound-events'
    });

    expect(webhook.statusCode).toBe(404);
    expect(inboundEvents.statusCode).toBe(404);
  });

  it('answers Meta verification only for the configured token and returns the untouched challenge', async () => {
    const { feature } = createFeature();
    const app = await buildApp({ facebookPages: [feature] });
    applications.push(app);

    const verified = await app.inject({
      method: 'GET',
      url: `/v1/webhooks/facebook-page?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=one%2Btwo%3Dthree`
    });
    const rejected = await app.inject({
      method: 'GET',
      url: '/v1/webhooks/facebook-page?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge'
    });

    expect(verified.statusCode).toBe(200);
    expect(verified.body).toBe('one+two=three');
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toEqual({
      success: false,
      error: { code: 'forbidden', message: 'The webhook verification credential is invalid.' }
    });
  });

  it('verifies Meta HMAC over exact raw bytes, persists one canonical event, and returns 200', async () => {
    const { feature, receiveEvents } = createFeature();
    const app = await buildApp({ facebookPages: [feature] });
    applications.push(app);
    const rawBody = `{"object":"page","entry":[{"id":"${PAGE_ID}","messaging":[{"sender":{"id":"123456789012345678901"},"recipient":{"id":"${PAGE_ID}"},"timestamp":1786492800000,"message":{"mid":"mid.synthetic.101","text":"Facebook says xin chào 👋"}}]}]}`;

    const response = await app.inject({
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-hub-signature-256': sign(rawBody)
      },
      method: 'POST',
      payload: rawBody,
      url: '/v1/webhooks/facebook-page'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('EVENT_RECEIVED');
    expect(receiveEvents).toHaveBeenCalledWith([canonicalEvent()]);
    expect(response.body).not.toContain(rawBody);
  });

  it('rejects a reserialized or one-byte-different body before normalization or storage', async () => {
    const { feature, normalize, receiveEvents } = createFeature();
    const app = await buildApp({ facebookPages: [feature] });
    applications.push(app);
    const signedRawBody = JSON.stringify(textPayload());
    const modifiedRawBody = signedRawBody.replace('xin chào', 'xin  chào');

    const response = await app.inject({
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(signedRawBody) },
      method: 'POST',
      payload: modifiedRawBody,
      url: '/v1/webhooks/facebook-page'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(unauthorizedResponse());
    expect(normalize).not.toHaveBeenCalled();
    expect(receiveEvents).not.toHaveBeenCalled();
  });

  it('makes malformed, unknown, and cross-App Page batches indistinguishable before storage', async () => {
    const support = createFeature();
    const other = createFeature({
      appId: OTHER_APP_ID,
      appSecret: 'synthetic-facebook-other-app-secret-012345678901234567',
      connectionId: 'facebook-page-other',
      operatorApiToken: 'synthetic_facebook_other_operator_012345678901234567',
      pageId: OTHER_PAGE_ID,
      webhookVerifyToken: 'synthetic-facebook-other-verify-token-012345678901234567'
    });
    const app = await buildApp({ facebookPages: [support.feature, other.feature] });
    applications.push(app);
    const unknownRawBody = JSON.stringify(textPayload('9876543210987654399'));
    const crossAppRawBody = JSON.stringify({
      object: 'page',
      entry: [...textPayload(PAGE_ID).entry, ...textPayload(OTHER_PAGE_ID).entry]
    });

    const responses = await Promise.all([
      app.inject({
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256:invalid' },
        method: 'POST',
        payload: '{"object":',
        url: '/v1/webhooks/facebook-page'
      }),
      app.inject({
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sign(unknownRawBody)
        },
        method: 'POST',
        payload: unknownRawBody,
        url: '/v1/webhooks/facebook-page'
      }),
      app.inject({
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sign(crossAppRawBody)
        },
        method: 'POST',
        payload: crossAppRawBody,
        url: '/v1/webhooks/facebook-page'
      })
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(401);
      expect(response.body).toBe(responses[0]!.body);
    }
    expect(support.normalize).not.toHaveBeenCalled();
    expect(other.normalize).not.toHaveBeenCalled();
    expect(support.receiveEvents).not.toHaveBeenCalled();
    expect(other.receiveEvents).not.toHaveBeenCalled();
  });

  it('routes a signed same-App multi-Page batch to the isolated Page features', async () => {
    const support = createFeature();
    const sales = createFeature({
      connectionId: SALES_CONNECTION_ID,
      operatorApiToken: SALES_OPERATOR_TOKEN,
      pageId: SALES_PAGE_ID
    });
    const app = await buildApp({ facebookPages: [support.feature, sales.feature] });
    applications.push(app);
    const rawBody = JSON.stringify({
      object: 'page',
      entry: [...textPayload(PAGE_ID).entry, ...textPayload(SALES_PAGE_ID).entry]
    });

    const response = await app.inject({
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(rawBody) },
      method: 'POST',
      payload: rawBody,
      url: '/v1/webhooks/facebook-page'
    });

    expect(response.statusCode).toBe(200);
    expect(support.receiveEvents).toHaveBeenCalledWith([canonicalEvent(CONNECTION_ID)]);
    expect(sales.receiveEvents).toHaveBeenCalledWith([canonicalEvent(SALES_CONNECTION_ID)]);
  });

  it('acknowledges signed unsupported provider items but returns a generic 500 when durable storage fails', async () => {
    const unsupported = createFeature({ normalize: vi.fn(() => []) });
    const failing = createFeature({
      receiveEvents: vi.fn(async (): Promise<void> => {
        throw new Error('Synthetic database credential must not leave the webhook.');
      })
    });
    const unsupportedApp = await buildApp({ facebookPages: [unsupported.feature] });
    const failingApp = await buildApp({ facebookPages: [failing.feature] });
    applications.push(unsupportedApp, failingApp);
    const rawBody = JSON.stringify(textPayload());

    const acknowledged = await unsupportedApp.inject({
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(rawBody) },
      method: 'POST',
      payload: rawBody,
      url: '/v1/webhooks/facebook-page'
    });
    const failure = await failingApp.inject({
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(rawBody) },
      method: 'POST',
      payload: rawBody,
      url: '/v1/webhooks/facebook-page'
    });

    expect(acknowledged.statusCode).toBe(200);
    expect(unsupported.receiveEvents).not.toHaveBeenCalled();
    expect(failure.statusCode).toBe(500);
    expect(failure.json()).toEqual({
      success: false,
      error: { code: 'internal_error', message: 'An unexpected error occurred.' }
    });
    expect(failure.body).not.toContain('database credential');
  });

  it('requires a Page-bound operator bearer and rejects a cursor issued for another Page', async () => {
    const support = createFeature({
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({
        events: [canonicalEvent()],
        nextCursor: { beforeSequence: '4', snapshotMaxSequence: '9' }
      }))
    });
    const sales = createFeature({
      connectionId: SALES_CONNECTION_ID,
      operatorApiToken: SALES_OPERATOR_TOKEN,
      pageId: SALES_PAGE_ID
    });
    const app = await buildApp({ facebookPages: [support.feature, sales.feature] });
    applications.push(app);

    const unauthorized = await app.inject({
      method: 'GET',
      url: '/v1/facebook-page/inbound-events?connectionId=facebook-page-sales'
    });
    const supportPage = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: '/v1/facebook-page/inbound-events?limit=2'
    });
    const supportCursor = supportPage.json().data.nextCursor as string;
    const crossAccountCursor = await app.inject({
      headers: { authorization: `Bearer ${SALES_OPERATOR_TOKEN}` },
      method: 'GET',
      url: `/v1/facebook-page/inbound-events?cursor=${supportCursor}`
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(supportPage.statusCode).toBe(200);
    expect(support.readInboundEvents).toHaveBeenCalledWith({
      connectionId: CONNECTION_ID,
      pageSize: 2
    });
    expect(crossAccountCursor.statusCode).toBe(400);
    expect(sales.readInboundEvents).not.toHaveBeenCalled();
  });

  it('keeps Zalo raw JSON and Telegram ordinary JSON parsing intact when Facebook is enabled', async () => {
    const facebook = createFeature({ normalize: vi.fn(() => []) });
    const zaloNormalize = vi.fn(() => []);
    const telegramNormalize = vi.fn(() => []);
    const telegramWebhookSecret = 'synthetic_telegram_webhook_secret_0123456789';
    const zaloRawJson = `{"app_id":"1234567890123456789","event_name":"user_send_image","recipient":{"id":"9876543210987654321"},"timestamp":"1786492800000"}`;
    const zaloFeature: ZaloOaFeature = Object.freeze({
      appId: '1234567890123456789',
      connectionId: 'zalo-oa-parser',
      normalize: zaloNormalize,
      oaId: '9876543210987654321',
      oaSecretKey: 'synthetic-zalo-oa-secret',
      operatorApiToken: 'synthetic_zalo_operator_parser_012345678901234567',
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
      receiveEvents: vi.fn(async (): Promise<void> => undefined),
      registration: Object.freeze({
        channel: 'zalo_oa',
        connectorId: 'zalo-oa',
        id: 'zalo-oa-parser',
        providerIdentityFingerprint: fingerprintZaloOaProviderIdentity(
          '1234567890123456789',
          '9876543210987654321'
        ),
        tier: 'OFFICIAL'
      })
    });
    const telegramFeature = Object.freeze({
      connectionId: 'telegram-bot-parser',
      normalize: telegramNormalize,
      operatorApiToken: 'synthetic_telegram_operator_parser_012345678901234567',
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
      receiveEvents: vi.fn(async (): Promise<void> => undefined),
      registration: Object.freeze({
        channel: 'telegram_bot',
        connectorId: 'telegram-bot',
        id: 'telegram-bot-parser',
        tier: 'OFFICIAL'
      } satisfies ConnectionRegistration),
      sendMessage: vi.fn(),
      webhookSecret: telegramWebhookSecret
    });
    const app = await buildApp({
      facebookPages: [facebook.feature],
      telegramBot: telegramFeature,
      zaloOas: [zaloFeature]
    });
    applications.push(app);
    const zaloSignature = createHash('sha256')
      .update(`1234567890123456789${zaloRawJson}1786492800000synthetic-zalo-oa-secret`, 'utf8')
      .digest('hex');

    const [facebookResponse, zaloResponse, telegramResponse] = await Promise.all([
      app.inject({
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sign(JSON.stringify(textPayload()))
        },
        method: 'POST',
        payload: JSON.stringify(textPayload()),
        url: '/v1/webhooks/facebook-page'
      }),
      app.inject({
        headers: { 'content-type': 'application/json', 'x-zevent-signature': zaloSignature },
        method: 'POST',
        payload: zaloRawJson,
        url: '/v1/webhooks/zalo-oa'
      }),
      app.inject({
        headers: { 'x-telegram-bot-api-secret-token': telegramWebhookSecret },
        method: 'POST',
        payload: { update_id: 123 },
        url: '/v1/webhooks/telegram-bot'
      })
    ]);

    expect(facebookResponse.statusCode).toBe(200);
    expect(zaloResponse.statusCode).toBe(200);
    expect(telegramResponse.statusCode).toBe(204);
    expect(zaloNormalize).toHaveBeenCalledWith(JSON.parse(zaloRawJson));
    expect(telegramNormalize).toHaveBeenCalledWith({ update_id: 123 });
  });
});

const createFeature = (
  options: Readonly<{
    appId?: string;
    appSecret?: string;
    connectionId?: string;
    normalize?: FacebookPageFeature['normalize'];
    operatorApiToken?: string;
    pageId?: string;
    readInboundEvents?: FacebookPageFeature['readInboundEvents'];
    receiveEvents?: FacebookPageFeature['receiveEvents'];
    webhookVerifyToken?: string;
  }> = {}
): Readonly<{
  feature: FacebookPageFeature;
  normalize: ReturnType<typeof vi.fn>;
  readInboundEvents: ReturnType<typeof vi.fn>;
  receiveEvents: ReturnType<typeof vi.fn>;
}> => {
  const connectionId = options.connectionId ?? CONNECTION_ID;
  const appId = options.appId ?? APP_ID;
  const pageId = options.pageId ?? PAGE_ID;
  const normalize = options.normalize ?? vi.fn(() => [canonicalEvent(connectionId)]);
  const readInboundEvents =
    options.readInboundEvents ?? vi.fn(async (): Promise<InboundEventPage> => ({ events: [] }));
  const receiveEvents = options.receiveEvents ?? vi.fn(async (): Promise<void> => undefined);
  const feature: FacebookPageFeature = Object.freeze({
    appId,
    appSecret: options.appSecret ?? APP_SECRET,
    connectionId,
    normalize,
    operatorApiToken: options.operatorApiToken ?? OPERATOR_TOKEN,
    pageId,
    readInboundEvents,
    receiveEvents,
    registration: Object.freeze({
      channel: 'facebook_page',
      connectorId: 'facebook-page',
      id: connectionId,
      providerIdentityFingerprint: fingerprintFacebookPageProviderIdentity(appId, pageId),
      tier: 'OFFICIAL'
    }),
    webhookVerifyToken: options.webhookVerifyToken ?? VERIFY_TOKEN
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

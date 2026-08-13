import { createHmac } from 'node:crypto';

import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventPage } from '@open-channel-hub/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { FacebookPageFeature } from '../facebook-page/facebook-page-feature.js';
import { fingerprintFacebookPageProviderIdentity } from '../facebook-page/facebook-page-provider-identity.js';
import type { WhatsAppBusinessFeature } from './whatsapp-business-feature.js';
import { fingerprintWhatsAppBusinessProviderIdentity } from './whatsapp-business-provider-identity.js';

const APP_ID = '1234567890123456789';
const OTHER_APP_ID = '1234567890123456790';
const WABA_ID = '9876543210987654321';
const OTHER_WABA_ID = '9876543210987654323';
const PHONE_NUMBER_ID = '112233445566778899';
const SALES_PHONE_NUMBER_ID = '112233445566778898';
const CONNECTION_ID = 'whatsapp-business-support';
const SALES_CONNECTION_ID = 'whatsapp-business-sales';
const OPERATOR_TOKEN = 'synthetic_whatsapp_operator_support_012345678901234567';
const SALES_OPERATOR_TOKEN = 'synthetic_whatsapp_sales_operator_012345678901234567';
const APP_SECRET = 'synthetic-whatsapp-app-secret-01234567890123456789';
const VERIFY_TOKEN = 'synthetic-whatsapp-verify-token-012345678901234567';

interface WhatsAppWebhookPayload {
  readonly entry: readonly Record<string, unknown>[];
  readonly object: 'whatsapp_business_account';
}

const textPayload = (
  wabaId = WABA_ID,
  phoneNumberId = PHONE_NUMBER_ID,
  overrides: Readonly<Record<string, unknown>> = {}
): WhatsAppWebhookPayload =>
  ({
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              messages: [
                {
                  from: '15551797781',
                  id: 'wamid.synthetic.101',
                  text: { body: 'WhatsApp says xin chào 👋' },
                  timestamp: '1786492800',
                  type: 'text'
                }
              ],
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: phoneNumberId }
            }
          }
        ],
        id: wabaId
      }
    ],
    object: 'whatsapp_business_account',
    ...overrides
  }) as WhatsAppWebhookPayload;

const canonicalEvent = (connectionId = CONNECTION_ID): CanonicalEvent =>
  Object.freeze({
    channel: 'whatsapp_business',
    connectionId,
    id: `whatsapp-business:${connectionId}:event:wamid.synthetic.101`,
    message: Object.freeze({
      conversationId: '15551797781',
      id: 'wamid.synthetic.101',
      senderId: '15551797781',
      text: 'WhatsApp says xin chào 👋'
    }),
    occurredAt: '2026-08-12T00:00:00.000Z',
    providerEventId: 'wamid.synthetic.101',
    type: 'message.received'
  });

const sign = (rawBody: string, appSecret = APP_SECRET): string =>
  `sha256=${createHmac('sha256', appSecret).update(Buffer.from(rawBody, 'utf8')).digest('hex')}`;

describe('WhatsApp Business routes', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (app) => app.close()));
  });

  it('does not expose WhatsApp Business routes when no business phone is configured', async () => {
    const app = await buildApp();
    applications.push(app);

    const webhook = await app.inject({ method: 'POST', url: '/v1/webhooks/whatsapp-business' });
    const inboundEvents = await app.inject({
      method: 'GET',
      url: '/v1/whatsapp-business/inbound-events'
    });

    expect(webhook.statusCode).toBe(404);
    expect(inboundEvents.statusCode).toBe(404);
  });

  it('answers Meta verification only for the configured token and returns the untouched challenge', async () => {
    const { feature } = createFeature();
    const app = await buildApp({ whatsappBusinesses: [feature] });
    applications.push(app);

    const verified = await app.inject({
      method: 'GET',
      url: `/v1/webhooks/whatsapp-business?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=one%2Btwo%3Dthree`
    });
    const rejected = await app.inject({
      method: 'GET',
      url: '/v1/webhooks/whatsapp-business?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge'
    });

    expect(verified.statusCode).toBe(200);
    expect(verified.body).toBe('one+two=three');
    expect(rejected.statusCode).toBe(403);
  });

  it('verifies Meta HMAC over exact raw bytes, persists one canonical event, and returns 200', async () => {
    const { feature, receiveEvents } = createFeature();
    const app = await buildApp({ whatsappBusinesses: [feature] });
    applications.push(app);
    const rawBody = `{"object":"whatsapp_business_account","entry":[{"id":"${WABA_ID}","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"phone_number_id":"${PHONE_NUMBER_ID}"},"messages":[{"from":"15551797781","id":"wamid.synthetic.101","timestamp":"1786492800","type":"text","text":{"body":"WhatsApp says xin chào 👋"}}]}}]}]}`;

    const response = await app.inject({
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-hub-signature-256': sign(rawBody)
      },
      method: 'POST',
      payload: rawBody,
      url: '/v1/webhooks/whatsapp-business'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('EVENT_RECEIVED');
    expect(receiveEvents).toHaveBeenCalledWith([canonicalEvent()]);
    expect(response.body).not.toContain(rawBody);
  });

  it('rejects reserialized, malformed, unknown, and cross-App WABA batches identically before storage', async () => {
    const support = createFeature();
    const other = createFeature({
      appId: OTHER_APP_ID,
      appSecret: 'synthetic-whatsapp-other-app-secret-012345678901234567',
      connectionId: 'whatsapp-business-other',
      operatorApiToken: 'synthetic_whatsapp_other_operator_012345678901234567',
      phoneNumberId: '112233445566778897',
      wabaId: OTHER_WABA_ID,
      webhookVerifyToken: 'synthetic-whatsapp-other-verify-token-012345678901234567'
    });
    const app = await buildApp({ whatsappBusinesses: [support.feature, other.feature] });
    applications.push(app);
    const signedRawBody = JSON.stringify(textPayload());
    const modifiedRawBody = signedRawBody.replace('xin chào', 'xin  chào');
    const unknownRawBody = JSON.stringify(textPayload('9876543210987654399'));
    const crossAppRawBody = JSON.stringify({
      entry: [...textPayload().entry, ...textPayload(OTHER_WABA_ID, '112233445566778897').entry],
      object: 'whatsapp_business_account'
    });

    const responses = await Promise.all([
      app.inject({
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(signedRawBody) },
        method: 'POST',
        payload: modifiedRawBody,
        url: '/v1/webhooks/whatsapp-business'
      }),
      app.inject({
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256:invalid' },
        method: 'POST',
        payload: '{"object":',
        url: '/v1/webhooks/whatsapp-business'
      }),
      app.inject({
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sign(unknownRawBody)
        },
        method: 'POST',
        payload: unknownRawBody,
        url: '/v1/webhooks/whatsapp-business'
      }),
      app.inject({
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': sign(crossAppRawBody)
        },
        method: 'POST',
        payload: crossAppRawBody,
        url: '/v1/webhooks/whatsapp-business'
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

  it('routes a signed same-App multi-phone batch to isolated business phone features', async () => {
    const support = createFeature();
    const sales = createFeature({
      connectionId: SALES_CONNECTION_ID,
      operatorApiToken: SALES_OPERATOR_TOKEN,
      phoneNumberId: SALES_PHONE_NUMBER_ID
    });
    const app = await buildApp({ whatsappBusinesses: [support.feature, sales.feature] });
    applications.push(app);
    const rawBody = JSON.stringify({
      entry: [...textPayload().entry, ...textPayload(WABA_ID, SALES_PHONE_NUMBER_ID).entry],
      object: 'whatsapp_business_account'
    });

    const response = await app.inject({
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(rawBody) },
      method: 'POST',
      payload: rawBody,
      url: '/v1/webhooks/whatsapp-business'
    });

    expect(response.statusCode).toBe(200);
    expect(support.receiveEvents).toHaveBeenCalledWith([canonicalEvent(CONNECTION_ID)]);
    expect(sales.receiveEvents).toHaveBeenCalledWith([canonicalEvent(SALES_CONNECTION_ID)]);
  });

  it('acknowledges signed unsupported items but returns a generic 500 when durable storage fails', async () => {
    const unsupported = createFeature({ normalize: vi.fn(() => []) });
    const failing = createFeature({
      receiveEvents: vi.fn(async (): Promise<void> => {
        throw new Error('Synthetic database credential must not leave the webhook.');
      })
    });
    const unsupportedApp = await buildApp({ whatsappBusinesses: [unsupported.feature] });
    const failingApp = await buildApp({ whatsappBusinesses: [failing.feature] });
    applications.push(unsupportedApp, failingApp);
    const rawBody = JSON.stringify(textPayload());

    const acknowledged = await unsupportedApp.inject({
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(rawBody) },
      method: 'POST',
      payload: rawBody,
      url: '/v1/webhooks/whatsapp-business'
    });
    const failure = await failingApp.inject({
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(rawBody) },
      method: 'POST',
      payload: rawBody,
      url: '/v1/webhooks/whatsapp-business'
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

  it('requires a phone-bound operator bearer, rejects cross-phone cursors, and keeps Facebook raw parsing intact', async () => {
    const support = createFeature({
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({
        events: [canonicalEvent()],
        nextCursor: { beforeSequence: '4', snapshotMaxSequence: '9' }
      }))
    });
    const sales = createFeature({
      connectionId: SALES_CONNECTION_ID,
      operatorApiToken: SALES_OPERATOR_TOKEN,
      phoneNumberId: SALES_PHONE_NUMBER_ID
    });
    const facebookRawNormalize = vi.fn(() => []);
    const facebookFeature: FacebookPageFeature = Object.freeze({
      appId: APP_ID,
      appSecret: APP_SECRET,
      connectionId: 'facebook-page-parser',
      normalize: facebookRawNormalize,
      operatorApiToken: 'synthetic_facebook_operator_parser_012345678901234567',
      pageId: '9876543210987654333',
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
      receiveEvents: vi.fn(async (): Promise<void> => undefined),
      registration: Object.freeze({
        channel: 'facebook_page',
        connectorId: 'facebook-page',
        id: 'facebook-page-parser',
        providerIdentityFingerprint: fingerprintFacebookPageProviderIdentity(
          APP_ID,
          '9876543210987654333'
        ),
        tier: 'OFFICIAL'
      } satisfies ConnectionRegistration),
      webhookVerifyToken: VERIFY_TOKEN
    });
    const app = await buildApp({
      facebookPages: [facebookFeature],
      whatsappBusinesses: [support.feature, sales.feature]
    });
    applications.push(app);

    const unauthorized = await app.inject({
      method: 'GET',
      url: '/v1/whatsapp-business/inbound-events?connectionId=whatsapp-business-sales'
    });
    const supportPage = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: '/v1/whatsapp-business/inbound-events?limit=2'
    });
    const supportCursor = supportPage.json().data.nextCursor as string;
    const crossAccountCursor = await app.inject({
      headers: { authorization: `Bearer ${SALES_OPERATOR_TOKEN}` },
      method: 'GET',
      url: `/v1/whatsapp-business/inbound-events?cursor=${supportCursor}`
    });
    const facebookRawBody = JSON.stringify({
      entry: [
        {
          id: '9876543210987654333',
          messaging: []
        }
      ],
      object: 'page'
    });
    const facebookResponse = await app.inject({
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': sign(facebookRawBody)
      },
      method: 'POST',
      payload: facebookRawBody,
      url: '/v1/webhooks/facebook-page'
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(supportPage.statusCode).toBe(200);
    expect(support.readInboundEvents).toHaveBeenCalledWith({
      connectionId: CONNECTION_ID,
      pageSize: 2
    });
    expect(crossAccountCursor.statusCode).toBe(400);
    expect(sales.readInboundEvents).not.toHaveBeenCalled();
    expect(facebookResponse.statusCode).toBe(200);
    expect(facebookRawNormalize).toHaveBeenCalledWith(JSON.parse(facebookRawBody));
  });
});

const createFeature = (
  options: Readonly<{
    appId?: string;
    appSecret?: string;
    connectionId?: string;
    normalize?: WhatsAppBusinessFeature['normalize'];
    operatorApiToken?: string;
    phoneNumberId?: string;
    readInboundEvents?: WhatsAppBusinessFeature['readInboundEvents'];
    receiveEvents?: WhatsAppBusinessFeature['receiveEvents'];
    wabaId?: string;
    webhookVerifyToken?: string;
  }> = {}
): Readonly<{
  feature: WhatsAppBusinessFeature;
  normalize: ReturnType<typeof vi.fn>;
  readInboundEvents: ReturnType<typeof vi.fn>;
  receiveEvents: ReturnType<typeof vi.fn>;
}> => {
  const connectionId = options.connectionId ?? CONNECTION_ID;
  const appId = options.appId ?? APP_ID;
  const wabaId = options.wabaId ?? WABA_ID;
  const phoneNumberId = options.phoneNumberId ?? PHONE_NUMBER_ID;
  const normalize = options.normalize ?? vi.fn(() => [canonicalEvent(connectionId)]);
  const readInboundEvents =
    options.readInboundEvents ?? vi.fn(async (): Promise<InboundEventPage> => ({ events: [] }));
  const receiveEvents = options.receiveEvents ?? vi.fn(async (): Promise<void> => undefined);
  const feature: WhatsAppBusinessFeature = Object.freeze({
    appId,
    appSecret: options.appSecret ?? APP_SECRET,
    connectionId,
    normalize,
    operatorApiToken: options.operatorApiToken ?? OPERATOR_TOKEN,
    phoneNumberId,
    readInboundEvents,
    receiveEvents,
    registration: Object.freeze({
      channel: 'whatsapp_business',
      connectorId: 'whatsapp-business',
      id: connectionId,
      providerIdentityFingerprint: fingerprintWhatsAppBusinessProviderIdentity(
        appId,
        wabaId,
        phoneNumberId
      ),
      tier: 'OFFICIAL'
    }),
    wabaId,
    webhookVerifyToken: options.webhookVerifyToken ?? VERIFY_TOKEN
  });

  return Object.freeze({
    feature,
    normalize: normalize as ReturnType<typeof vi.fn>,
    readInboundEvents: readInboundEvents as ReturnType<typeof vi.fn>,
    receiveEvents: receiveEvents as ReturnType<typeof vi.fn>
  });
};

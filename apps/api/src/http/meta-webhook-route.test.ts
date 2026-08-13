import { createHmac } from 'node:crypto';

import type { ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventPage } from '@open-channel-hub/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { FacebookPageFeature } from '../facebook-page/facebook-page-feature.js';
import { fingerprintFacebookPageProviderIdentity } from '../facebook-page/facebook-page-provider-identity.js';
import type { WhatsAppBusinessFeature } from '../whatsapp-business/whatsapp-business-feature.js';
import { fingerprintWhatsAppBusinessProviderIdentity } from '../whatsapp-business/whatsapp-business-provider-identity.js';

const APP_ID = '1234567890123456789';
const APP_SECRET = 'synthetic-meta-app-secret-01234567890123456789';
const VERIFY_TOKEN = 'synthetic-meta-verify-token-012345678901234567';
const FACEBOOK_PAGE_ID = '9876543210987654321';
const WABA_ID = '9876543210987654322';
const PHONE_NUMBER_ID = '112233445566778899';

const sign = (rawBody: string): string =>
  `sha256=${createHmac('sha256', APP_SECRET).update(Buffer.from(rawBody, 'utf8')).digest('hex')}`;

describe('shared Meta webhook route', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (app) => app.close()));
  });

  it('returns the exact challenge and dispatches signed Facebook Page and WhatsApp Business payloads through one callback', async () => {
    const facebookNormalize = vi.fn(() => []);
    const whatsappNormalize = vi.fn(() => []);
    const app = await buildApp({
      facebookPages: [facebookFeature(facebookNormalize)],
      whatsappBusinesses: [whatsappFeature(whatsappNormalize)]
    });
    applications.push(app);
    const facebookRaw = JSON.stringify({
      entry: [{ id: FACEBOOK_PAGE_ID, messaging: [] }],
      object: 'page'
    });
    const whatsappRaw = JSON.stringify({
      entry: [{ id: WABA_ID, changes: [] }],
      object: 'whatsapp_business_account'
    });

    const verification = await app.inject({
      method: 'GET',
      url: `/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=one%2Btwo%3Dthree`
    });
    const [facebookResponse, whatsappResponse, invalidSignature] = await Promise.all([
      app.inject({
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(facebookRaw) },
        method: 'POST',
        payload: facebookRaw,
        url: '/v1/webhooks/meta'
      }),
      app.inject({
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(whatsappRaw) },
        method: 'POST',
        payload: whatsappRaw,
        url: '/v1/webhooks/meta'
      }),
      app.inject({
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(facebookRaw) },
        method: 'POST',
        payload: `${facebookRaw} `,
        url: '/v1/webhooks/meta'
      })
    ]);

    expect(verification.statusCode).toBe(200);
    expect(verification.body).toBe('one+two=three');
    expect(facebookResponse.statusCode).toBe(200);
    expect(whatsappResponse.statusCode).toBe(200);
    expect(invalidSignature.statusCode).toBe(401);
    expect(facebookNormalize).toHaveBeenCalledWith(JSON.parse(facebookRaw));
    expect(whatsappNormalize).toHaveBeenCalledWith(JSON.parse(whatsappRaw));
    expect(facebookNormalize).toHaveBeenCalledTimes(1);
    expect(whatsappNormalize).toHaveBeenCalledTimes(1);
  });
});

const facebookFeature = (normalize: FacebookPageFeature['normalize']): FacebookPageFeature =>
  Object.freeze({
    appId: APP_ID,
    appSecret: APP_SECRET,
    connectionId: 'facebook-page-shared-meta',
    normalize,
    operatorApiToken: 'synthetic_facebook_operator_shared_012345678901234567',
    pageId: FACEBOOK_PAGE_ID,
    readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
    receiveEvents: vi.fn(async (): Promise<void> => undefined),
    registration: Object.freeze({
      channel: 'facebook_page',
      connectorId: 'facebook-page',
      id: 'facebook-page-shared-meta',
      providerIdentityFingerprint: fingerprintFacebookPageProviderIdentity(
        APP_ID,
        FACEBOOK_PAGE_ID
      ),
      tier: 'OFFICIAL'
    } satisfies ConnectionRegistration),
    webhookVerifyToken: VERIFY_TOKEN
  });

const whatsappFeature = (
  normalize: WhatsAppBusinessFeature['normalize']
): WhatsAppBusinessFeature =>
  Object.freeze({
    appId: APP_ID,
    appSecret: APP_SECRET,
    connectionId: 'whatsapp-business-shared-meta',
    normalize,
    operatorApiToken: 'synthetic_whatsapp_operator_shared_012345678901234567',
    phoneNumberId: PHONE_NUMBER_ID,
    readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
    receiveEvents: vi.fn(async (): Promise<void> => undefined),
    registration: Object.freeze({
      channel: 'whatsapp_business',
      connectorId: 'whatsapp-business',
      id: 'whatsapp-business-shared-meta',
      providerIdentityFingerprint: fingerprintWhatsAppBusinessProviderIdentity(
        APP_ID,
        WABA_ID,
        PHONE_NUMBER_ID
      ),
      tier: 'OFFICIAL'
    } satisfies ConnectionRegistration),
    wabaId: WABA_ID,
    webhookVerifyToken: VERIFY_TOKEN
  });

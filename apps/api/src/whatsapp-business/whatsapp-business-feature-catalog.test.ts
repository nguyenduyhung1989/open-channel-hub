import type { InboundEventPage } from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import type { WhatsAppBusinessFeature } from './whatsapp-business-feature.js';
import {
  createWhatsAppBusinessFeatureCatalog,
  WhatsAppBusinessFeatureCatalogError
} from './whatsapp-business-feature-catalog.js';
import { fingerprintWhatsAppBusinessProviderIdentity } from './whatsapp-business-provider-identity.js';

const APP_ID = '1234567890123456789';
const APP_SECRET = 'synthetic-whatsapp-app-secret-01234567890123456789';
const VERIFY_TOKEN = 'synthetic-whatsapp-verify-token-012345678901234567';
const WABA_ID = '9876543210987654321';

describe('createWhatsAppBusinessFeatureCatalog', () => {
  it('resolves business phones under one Meta App by untrusted WABA ID and account-bound bearer', () => {
    const support = createFeature();
    const sales = createFeature({
      connectionId: 'whatsapp-business-sales',
      operatorApiToken: 'synthetic_whatsapp_sales_operator_012345678901234567',
      phoneNumberId: '112233445566778898'
    });
    const catalog = createWhatsAppBusinessFeatureCatalog([support, sales]);

    expect(catalog.findAppByWabaIds([support.wabaId])).toMatchObject({ appId: APP_ID });
    expect(catalog.findAppByWabaIds([support.wabaId])).toMatchObject({
      features: [support, sales]
    });
    expect(catalog.findAppByWabaIds(['9876543210987654399'])).toBeUndefined();
    expect(catalog.findByOperatorAuthorization(`Bearer ${support.operatorApiToken}`)).toBe(support);
    expect(catalog.findByOperatorAuthorization(`Bearer ${sales.operatorApiToken}`)).toBe(sales);
    expect(catalog.matchesWebhookVerifyToken(VERIFY_TOKEN)).toBe(true);
    expect(catalog.matchesWebhookVerifyToken('incorrect-token')).toBe(false);
  });

  it('rejects duplicate phone identities, cross-App token reuse, and WABA-to-App drift', () => {
    const support = createFeature();
    const duplicatePhone = createFeature({
      connectionId: 'whatsapp-business-duplicate',
      operatorApiToken: 'synthetic_whatsapp_duplicate_operator_01234567890123'
    });
    const appSecretDrift = createFeature({
      appSecret: 'synthetic-whatsapp-app-secret-drift-012345678901234567',
      connectionId: 'whatsapp-business-drift',
      operatorApiToken: 'synthetic_whatsapp_drift_operator_012345678901234567',
      phoneNumberId: '112233445566778898'
    });
    const wabaAcrossApps = createFeature({
      appId: '1234567890123456790',
      appSecret: 'synthetic-whatsapp-other-app-secret-012345678901234567',
      connectionId: 'whatsapp-business-other-app',
      operatorApiToken: 'synthetic_whatsapp_other_operator_012345678901234567',
      phoneNumberId: '112233445566778898',
      webhookVerifyToken: 'synthetic-whatsapp-other-verify-token-012345678901234567'
    });

    for (const features of [
      [support, duplicatePhone],
      [support, appSecretDrift],
      [support, wabaAcrossApps]
    ]) {
      expect(() => createWhatsAppBusinessFeatureCatalog(features)).toThrow(
        WhatsAppBusinessFeatureCatalogError
      );
    }
  });

  it('rejects a crafted registration whose fingerprint does not bind App, WABA, and phone', () => {
    const support = createFeature();
    const mismatchedRegistration: WhatsAppBusinessFeature = Object.freeze({
      ...support,
      registration: Object.freeze({
        ...support.registration,
        providerIdentityFingerprint: fingerprintWhatsAppBusinessProviderIdentity(
          APP_ID,
          WABA_ID,
          '112233445566778898'
        )
      })
    });

    expect(() => createWhatsAppBusinessFeatureCatalog([mismatchedRegistration])).toThrow(
      WhatsAppBusinessFeatureCatalogError
    );
  });
});

const createFeature = (
  overrides: Readonly<{
    appId?: string;
    appSecret?: string;
    connectionId?: string;
    operatorApiToken?: string;
    phoneNumberId?: string;
    wabaId?: string;
    webhookVerifyToken?: string;
  }> = {}
): WhatsAppBusinessFeature => {
  const appId = overrides.appId ?? APP_ID;
  const wabaId = overrides.wabaId ?? WABA_ID;
  const phoneNumberId = overrides.phoneNumberId ?? '112233445566778899';
  const connectionId = overrides.connectionId ?? 'whatsapp-business-support';

  return Object.freeze({
    appId,
    appSecret: overrides.appSecret ?? APP_SECRET,
    connectionId,
    normalize: vi.fn(() => []),
    operatorApiToken:
      overrides.operatorApiToken ?? 'synthetic_whatsapp_operator_support_012345678901234567',
    phoneNumberId,
    readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
    receiveEvents: vi.fn(async (): Promise<void> => undefined),
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
    webhookVerifyToken: overrides.webhookVerifyToken ?? VERIFY_TOKEN
  });
};

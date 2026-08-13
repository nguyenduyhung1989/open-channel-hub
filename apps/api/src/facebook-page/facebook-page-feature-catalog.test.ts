import type { InboundEventPage } from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import type { FacebookPageFeature } from './facebook-page-feature.js';
import {
  createFacebookPageFeatureCatalog,
  FacebookPageFeatureCatalogError
} from './facebook-page-feature-catalog.js';
import { fingerprintFacebookPageProviderIdentity } from './facebook-page-provider-identity.js';

const APP_ID = '1234567890123456789';
const APP_SECRET = 'synthetic-facebook-app-secret-01234567890123456789';
const VERIFY_TOKEN = 'synthetic-facebook-verify-token-012345678901234567';

describe('createFacebookPageFeatureCatalog', () => {
  it('resolves Pages under one App by untrusted Page ID and account-bound bearer', () => {
    const support = createFeature();
    const sales = createFeature({
      connectionId: 'facebook-page-sales',
      operatorApiToken: 'synthetic_facebook_sales_operator_012345678901234567',
      pageId: '9876543210987654322'
    });
    const catalog = createFacebookPageFeatureCatalog([support, sales]);

    expect(catalog.findAppByPageIds([support.pageId])).toMatchObject({ appId: APP_ID });
    expect(catalog.findAppByPageIds([support.pageId, sales.pageId])).toMatchObject({
      appId: APP_ID,
      features: [support, sales]
    });
    expect(catalog.findAppByPageIds(['9876543210987654399'])).toBeUndefined();
    expect(catalog.findByOperatorAuthorization(`Bearer ${support.operatorApiToken}`)).toBe(support);
    expect(catalog.findByOperatorAuthorization(`Bearer ${sales.operatorApiToken}`)).toBe(sales);
    expect(catalog.matchesWebhookVerifyToken(VERIFY_TOKEN)).toBe(true);
    expect(catalog.matchesWebhookVerifyToken('incorrect-token')).toBe(false);
  });

  it('rejects duplicate Page identities, cross-App token reuse, and App credential drift', () => {
    const support = createFeature();
    const duplicatePage = createFeature({
      connectionId: 'facebook-page-duplicate',
      operatorApiToken: 'synthetic_facebook_duplicate_operator_01234567890123'
    });
    const appSecretDrift = createFeature({
      appSecret: 'synthetic-facebook-app-secret-drift-012345678901234567',
      connectionId: 'facebook-page-drift',
      operatorApiToken: 'synthetic_facebook_drift_operator_012345678901234567',
      pageId: '9876543210987654322'
    });
    const verifyTokenCollision = createFeature({
      appId: '1234567890123456790',
      connectionId: 'facebook-page-other-app',
      operatorApiToken: 'synthetic_facebook_other_operator_012345678901234567',
      pageId: '9876543210987654333'
    });

    for (const features of [
      [support, duplicatePage],
      [support, appSecretDrift],
      [support, verifyTokenCollision]
    ]) {
      expect(() => createFacebookPageFeatureCatalog(features)).toThrow(
        FacebookPageFeatureCatalogError
      );
    }
  });

  it('rejects a crafted registration whose fingerprint does not bind its App/Page pair', () => {
    const support = createFeature();
    const mismatchedRegistration: FacebookPageFeature = Object.freeze({
      ...support,
      registration: Object.freeze({
        ...support.registration,
        providerIdentityFingerprint: fingerprintFacebookPageProviderIdentity(
          APP_ID,
          '9876543210987654322'
        )
      })
    });

    expect(() => createFacebookPageFeatureCatalog([mismatchedRegistration])).toThrow(
      FacebookPageFeatureCatalogError
    );
  });
});

const createFeature = (
  overrides: Readonly<{
    appId?: string;
    appSecret?: string;
    connectionId?: string;
    operatorApiToken?: string;
    pageId?: string;
    webhookVerifyToken?: string;
  }> = {}
): FacebookPageFeature => {
  const appId = overrides.appId ?? APP_ID;
  const pageId = overrides.pageId ?? '9876543210987654321';
  const connectionId = overrides.connectionId ?? 'facebook-page-support';

  return Object.freeze({
    appId,
    appSecret: overrides.appSecret ?? APP_SECRET,
    connectionId,
    normalize: vi.fn(() => []),
    operatorApiToken:
      overrides.operatorApiToken ?? 'synthetic_facebook_operator_support_012345678901234567',
    pageId,
    readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
    receiveEvents: vi.fn(async (): Promise<void> => undefined),
    registration: Object.freeze({
      channel: 'facebook_page',
      connectorId: 'facebook-page',
      id: connectionId,
      providerIdentityFingerprint: fingerprintFacebookPageProviderIdentity(appId, pageId),
      tier: 'OFFICIAL'
    }),
    webhookVerifyToken: overrides.webhookVerifyToken ?? VERIFY_TOKEN
  });
};

import type { InboundEventPage } from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import type { ZaloOaFeature } from './zalo-oa-feature.js';
import {
  createZaloOaFeatureCatalog,
  ZaloOaFeatureCatalogError
} from './zalo-oa-feature-catalog.js';
import { fingerprintZaloOaProviderIdentity } from './zalo-oa-provider-identity.js';

const APP_ID = '1234567890123456789';
const OA_SECRET = 'synthetic-zalo-oa-secret';

describe('createZaloOaFeatureCatalog', () => {
  it('resolves each OA by its exact App/OA pair and its own operator bearer', () => {
    const support = createFeature();
    const sales = createFeature({
      connectionId: 'zalo-oa-sales',
      oaId: '9876543210987654322',
      operatorApiToken: 'synthetic_zalo_operator_sales_0123456789012345678'
    });
    const catalog = createZaloOaFeatureCatalog([support, sales]);

    expect(catalog.findByWebhookIdentity(APP_ID, support.oaId)).toBe(support);
    expect(catalog.findByWebhookIdentity(APP_ID, sales.oaId)).toBe(sales);
    expect(catalog.findByWebhookIdentity(APP_ID, '9876543210987654399')).toBeUndefined();
    expect(catalog.findByOperatorAuthorization(`Bearer ${support.operatorApiToken}`)).toBe(support);
    expect(catalog.findByOperatorAuthorization(`Bearer ${sales.operatorApiToken}`)).toBe(sales);
  });

  it('allows distinct OA secrets for one App while rejecting ambiguous pair mapping', () => {
    const support = createFeature();
    const sales = createFeature({
      connectionId: 'zalo-oa-sales',
      oaId: '9876543210987654322',
      oaSecretKey: 'synthetic-zalo-oa-sales-secret',
      operatorApiToken: 'zalo-test-sales-aaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    });
    const duplicatePair = createFeature({
      connectionId: 'zalo-oa-duplicate',
      operatorApiToken: 'zalo-test-duplicate-aaaaaaaaaaaaaaaaaaaaaaaa'
    });

    expect(() => createZaloOaFeatureCatalog([support, sales])).not.toThrow();
    expect(() => createZaloOaFeatureCatalog([support, duplicatePair])).toThrow(
      ZaloOaFeatureCatalogError
    );
  });

  it('rejects a crafted registration whose identity fingerprint does not bind its App/OA pair', () => {
    const support = createFeature();
    const mismatchedRegistration: ZaloOaFeature = Object.freeze({
      ...support,
      registration: Object.freeze({
        ...support.registration,
        providerIdentityFingerprint: fingerprintZaloOaProviderIdentity(
          APP_ID,
          '9876543210987654322'
        )
      })
    });

    expect(() => createZaloOaFeatureCatalog([mismatchedRegistration])).toThrow(
      ZaloOaFeatureCatalogError
    );
  });
});

const createFeature = (
  overrides: Readonly<{
    appId?: string;
    connectionId?: string;
    oaId?: string;
    oaSecretKey?: string;
    operatorApiToken?: string;
  }> = {}
): ZaloOaFeature => {
  const connectionId = overrides.connectionId ?? 'zalo-oa-support';

  return Object.freeze({
    appId: overrides.appId ?? APP_ID,
    connectionId,
    normalize: vi.fn(() => []),
    oaId: overrides.oaId ?? '9876543210987654321',
    oaSecretKey: overrides.oaSecretKey ?? OA_SECRET,
    operatorApiToken:
      overrides.operatorApiToken ?? 'synthetic_zalo_operator_support_012345678901234567',
    readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
    receiveEvents: vi.fn(async (): Promise<void> => undefined),
    registration: Object.freeze({
      channel: 'zalo_oa',
      connectorId: 'zalo-oa',
      id: connectionId,
      providerIdentityFingerprint: fingerprintZaloOaProviderIdentity(
        overrides.appId ?? APP_ID,
        overrides.oaId ?? '9876543210987654321'
      ),
      tier: 'OFFICIAL'
    })
  });
};

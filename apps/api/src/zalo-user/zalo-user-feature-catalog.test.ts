import type { InboundEventPage } from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import type { ZaloUserFeature } from './zalo-user-feature.js';
import {
  createZaloUserFeatureCatalog,
  ZaloUserFeatureCatalogError
} from './zalo-user-feature-catalog.js';
import { fingerprintZaloUserProviderIdentity } from './zalo-user-provider-identity.js';

describe('createZaloUserFeatureCatalog', () => {
  it('resolves each bridge and operator bearer without route-selected account IDs', () => {
    const support = createFeature();
    const sales = createFeature({
      accountId: '1234567890123456790',
      bridgeToken: 'synthetic_zalo_user_sales_bridge_token_0123456789012345',
      connectionId: 'zalo-user-sales',
      operatorApiToken: 'synthetic_zalo_user_sales_operator_token_012345678901'
    });
    const catalog = createZaloUserFeatureCatalog([support, sales]);

    expect(catalog.findByBridgeAuthorization(`Bearer ${support.bridgeToken}`)).toBe(support);
    expect(catalog.findByBridgeAuthorization(`Bearer ${sales.bridgeToken}`)).toBe(sales);
    expect(catalog.findByOperatorAuthorization(`Bearer ${support.operatorApiToken}`)).toBe(support);
    expect(catalog.findByOperatorAuthorization(`Bearer ${sales.operatorApiToken}`)).toBe(sales);
    expect(catalog.findByBridgeAuthorization('Bearer not-a-real-bridge-token')).toBeUndefined();
  });

  it('rejects duplicate bridge/account keys and a forged account fingerprint', () => {
    const support = createFeature();
    const duplicateBridge = createFeature({ connectionId: 'zalo-user-duplicate' });
    const crossRoleCollision = createFeature({
      accountId: '1234567890123456790',
      bridgeToken: support.operatorApiToken,
      connectionId: 'zalo-user-cross-role'
    });
    const forged: ZaloUserFeature = Object.freeze({
      ...support,
      registration: Object.freeze({
        ...support.registration,
        providerIdentityFingerprint: fingerprintZaloUserProviderIdentity('1234567890123456790')
      })
    });

    expect(() => createZaloUserFeatureCatalog([support, duplicateBridge])).toThrow(
      ZaloUserFeatureCatalogError
    );
    expect(() => createZaloUserFeatureCatalog([support, crossRoleCollision])).toThrow(
      ZaloUserFeatureCatalogError
    );
    expect(() => createZaloUserFeatureCatalog([forged])).toThrow(ZaloUserFeatureCatalogError);
  });
});

const createFeature = (
  overrides: Readonly<{
    accountId?: string;
    bridgeToken?: string;
    connectionId?: string;
    operatorApiToken?: string;
  }> = {}
): ZaloUserFeature => {
  const accountId = overrides.accountId ?? '1234567890123456789';
  const connectionId = overrides.connectionId ?? 'zalo-user-support';

  return Object.freeze({
    accountId,
    bridgeToken: overrides.bridgeToken ?? 'synthetic_zalo_user_bridge_token_0123456789012345678',
    connectionId,
    normalize: vi.fn(() => []),
    operatorApiToken:
      overrides.operatorApiToken ?? 'synthetic_zalo_user_operator_token_0123456789012345',
    readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
    receiveEvents: vi.fn(async (): Promise<void> => undefined),
    registration: Object.freeze({
      channel: 'zalo_user',
      connectorId: 'zalo-user',
      id: connectionId,
      providerIdentityFingerprint: fingerprintZaloUserProviderIdentity(accountId),
      tier: 'EXPERIMENTAL'
    })
  });
};

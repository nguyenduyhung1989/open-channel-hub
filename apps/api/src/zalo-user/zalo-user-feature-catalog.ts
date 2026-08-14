import { matchesBearerToken } from '../http/secret-match.js';

import type { ZaloUserFeature } from './zalo-user-feature.js';
import { fingerprintZaloUserProviderIdentity } from './zalo-user-provider-identity.js';

const MAX_ZALO_USER_FEATURES = 100;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PRINTABLE_SECRET_PATTERN = /^[!-~]{1,512}$/;
const ZALO_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;

/** A deliberately non-diagnostic failure for invalid private Zalo User wiring. */
export class ZaloUserFeatureCatalogError extends Error {
  public constructor() {
    super('The configured Zalo User bridges are invalid.');
    this.name = 'ZaloUserFeatureCatalogError';
  }
}

export interface ZaloUserFeatureCatalog {
  findByBridgeAuthorization(authorization: string | undefined): ZaloUserFeature | undefined;
  findByOperatorAuthorization(authorization: string | undefined): ZaloUserFeature | undefined;
}

/**
 * Resolves a bridge or operator bearer without exposing a route-selectable
 * internal connection identifier. All catalog keys are frozen at startup.
 */
export const createZaloUserFeatureCatalog = (
  features: readonly ZaloUserFeature[]
): ZaloUserFeatureCatalog => {
  const snapshot = toFeatureSnapshot(features);

  return Object.freeze({
    findByBridgeAuthorization: (authorization: string | undefined): ZaloUserFeature | undefined =>
      findFeatureByBearer(snapshot, authorization, (feature) => feature.bridgeToken),
    findByOperatorAuthorization: (authorization: string | undefined): ZaloUserFeature | undefined =>
      findFeatureByBearer(snapshot, authorization, (feature) => feature.operatorApiToken)
  });
};

const findFeatureByBearer = (
  features: readonly ZaloUserFeature[],
  authorization: string | undefined,
  selectToken: (feature: ZaloUserFeature) => string
): ZaloUserFeature | undefined => {
  let matched: ZaloUserFeature | undefined;

  for (const feature of features) {
    if (matchesBearerToken(authorization, selectToken(feature))) {
      matched = feature;
    }
  }

  return matched;
};

const toFeatureSnapshot = (features: readonly ZaloUserFeature[]): readonly ZaloUserFeature[] => {
  if (
    !Array.isArray(features) ||
    features.length === 0 ||
    features.length > MAX_ZALO_USER_FEATURES
  ) {
    throw new ZaloUserFeatureCatalogError();
  }

  const accountIds = new Set<string>();
  const bridgeTokens = new Set<string>();
  const connectionIds = new Set<string>();
  const operatorTokens = new Set<string>();

  for (const feature of features) {
    if (!isFeature(feature)) {
      throw new ZaloUserFeatureCatalogError();
    }

    if (
      accountIds.has(feature.accountId) ||
      bridgeTokens.has(feature.bridgeToken) ||
      connectionIds.has(feature.connectionId) ||
      operatorTokens.has(feature.operatorApiToken) ||
      operatorTokens.has(feature.bridgeToken) ||
      bridgeTokens.has(feature.operatorApiToken)
    ) {
      throw new ZaloUserFeatureCatalogError();
    }

    accountIds.add(feature.accountId);
    bridgeTokens.add(feature.bridgeToken);
    connectionIds.add(feature.connectionId);
    operatorTokens.add(feature.operatorApiToken);
  }

  return Object.freeze([...features]);
};

const isFeature = (value: unknown): value is ZaloUserFeature =>
  typeof value === 'object' &&
  value !== null &&
  'accountId' in value &&
  'bridgeToken' in value &&
  'connectionId' in value &&
  'operatorApiToken' in value &&
  'readInboundEvents' in value &&
  'receiveEvents' in value &&
  'registration' in value &&
  typeof value.accountId === 'string' &&
  ZALO_IDENTIFIER_PATTERN.test(value.accountId) &&
  typeof value.bridgeToken === 'string' &&
  value.bridgeToken.length >= 32 &&
  PRINTABLE_SECRET_PATTERN.test(value.bridgeToken) &&
  typeof value.connectionId === 'string' &&
  CONNECTION_ID_PATTERN.test(value.connectionId) &&
  value.connectionId !== '.' &&
  value.connectionId !== '..' &&
  typeof value.operatorApiToken === 'string' &&
  value.operatorApiToken.length >= 32 &&
  PRINTABLE_SECRET_PATTERN.test(value.operatorApiToken) &&
  typeof value.readInboundEvents === 'function' &&
  typeof value.receiveEvents === 'function' &&
  isMatchingZaloUserRegistration(value.registration, value.connectionId, value.accountId);

const isMatchingZaloUserRegistration = (
  value: unknown,
  connectionId: string,
  accountId: string
): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  'connectorId' in value &&
  'channel' in value &&
  'providerIdentityFingerprint' in value &&
  'tier' in value &&
  value.id === connectionId &&
  value.connectorId === 'zalo-user' &&
  value.channel === 'zalo_user' &&
  value.providerIdentityFingerprint === fingerprintZaloUserProviderIdentity(accountId) &&
  value.tier === 'EXPERIMENTAL';

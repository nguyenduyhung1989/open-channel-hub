import { matchesBearerToken } from '../http/secret-match.js';

import type { ZaloOaFeature } from './zalo-oa-feature.js';
import { fingerprintZaloOaProviderIdentity } from './zalo-oa-provider-identity.js';

const MAX_ZALO_OA_FEATURES = 100;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ZALO_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;
const PRINTABLE_SECRET_PATTERN = /^[!-~]{1,512}$/;

/** A deliberately non-diagnostic failure for invalid private Zalo OA wiring. */
export class ZaloOaFeatureCatalogError extends Error {
  public constructor() {
    super('The configured Zalo OA connections are invalid.');
    this.name = 'ZaloOaFeatureCatalogError';
  }
}

/**
 * Resolves an OA from the authenticated provider identity or an operator
 * bearer. Neither public route lets the caller choose an internal connection
 * identifier.
 */
export interface ZaloOaFeatureCatalog {
  findByOperatorAuthorization(authorization: string | undefined): ZaloOaFeature | undefined;
  findByWebhookIdentity(appId: string, oaId: string): ZaloOaFeature | undefined;
}

export const createZaloOaFeatureCatalog = (
  features: readonly ZaloOaFeature[]
): ZaloOaFeatureCatalog => {
  const snapshot = toFeatureSnapshot(features);
  const byWebhookIdentity = new Map(
    snapshot.map((feature) => [toWebhookIdentityKey(feature.appId, feature.oaId), feature])
  );

  return Object.freeze({
    findByOperatorAuthorization: (authorization: string | undefined): ZaloOaFeature | undefined => {
      let matchedFeature: ZaloOaFeature | undefined;

      for (const feature of snapshot) {
        if (matchesBearerToken(authorization, feature.operatorApiToken)) {
          matchedFeature = feature;
        }
      }

      return matchedFeature;
    },
    findByWebhookIdentity: (appId: string, oaId: string): ZaloOaFeature | undefined =>
      byWebhookIdentity.get(toWebhookIdentityKey(appId, oaId))
  });
};

const toFeatureSnapshot = (features: readonly ZaloOaFeature[]): readonly ZaloOaFeature[] => {
  if (!Array.isArray(features) || features.length === 0 || features.length > MAX_ZALO_OA_FEATURES) {
    throw new ZaloOaFeatureCatalogError();
  }

  const connectionIds = new Set<string>();
  const operatorTokens = new Set<string>();
  const webhookIdentities = new Set<string>();

  for (const feature of features) {
    if (!isFeature(feature)) {
      throw new ZaloOaFeatureCatalogError();
    }

    const webhookIdentity = toWebhookIdentityKey(feature.appId, feature.oaId);

    if (
      connectionIds.has(feature.connectionId) ||
      operatorTokens.has(feature.operatorApiToken) ||
      webhookIdentities.has(webhookIdentity)
    ) {
      throw new ZaloOaFeatureCatalogError();
    }

    connectionIds.add(feature.connectionId);
    operatorTokens.add(feature.operatorApiToken);
    webhookIdentities.add(webhookIdentity);
  }

  return Object.freeze([...features]);
};

const isFeature = (value: unknown): value is ZaloOaFeature =>
  typeof value === 'object' &&
  value !== null &&
  'appId' in value &&
  'connectionId' in value &&
  'oaId' in value &&
  'oaSecretKey' in value &&
  'operatorApiToken' in value &&
  'registration' in value &&
  typeof value.appId === 'string' &&
  ZALO_IDENTIFIER_PATTERN.test(value.appId) &&
  typeof value.oaId === 'string' &&
  ZALO_IDENTIFIER_PATTERN.test(value.oaId) &&
  typeof value.connectionId === 'string' &&
  CONNECTION_ID_PATTERN.test(value.connectionId) &&
  value.connectionId !== '.' &&
  value.connectionId !== '..' &&
  typeof value.oaSecretKey === 'string' &&
  PRINTABLE_SECRET_PATTERN.test(value.oaSecretKey) &&
  typeof value.operatorApiToken === 'string' &&
  value.operatorApiToken.length >= 32 &&
  value.operatorApiToken.length <= 512 &&
  isMatchingZaloOaRegistration(value.registration, value.connectionId, value.appId, value.oaId);

const isMatchingZaloOaRegistration = (
  value: unknown,
  connectionId: string,
  appId: string,
  oaId: string
): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  'connectorId' in value &&
  'channel' in value &&
  'providerIdentityFingerprint' in value &&
  'tier' in value &&
  value.id === connectionId &&
  value.connectorId === 'zalo-oa' &&
  value.channel === 'zalo_oa' &&
  value.providerIdentityFingerprint === fingerprintZaloOaProviderIdentity(appId, oaId) &&
  value.tier === 'OFFICIAL';

const toWebhookIdentityKey = (appId: string, oaId: string): string => `${appId}\u0000${oaId}`;

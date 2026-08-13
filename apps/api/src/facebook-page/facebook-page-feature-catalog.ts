import { matchesBearerToken, matchesSecret } from '../http/secret-match.js';

import type { FacebookPageFeature } from './facebook-page-feature.js';
import { fingerprintFacebookPageProviderIdentity } from './facebook-page-provider-identity.js';

const MAX_FACEBOOK_PAGE_FEATURES = 100;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const FACEBOOK_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;
const PRINTABLE_SECRET_PATTERN = /^[!-~]{32,512}$/;

/** A deliberately non-diagnostic failure for invalid private Page wiring. */
export class FacebookPageFeatureCatalogError extends Error {
  public constructor() {
    super('The configured Facebook Page connections are invalid.');
    this.name = 'FacebookPageFeatureCatalogError';
  }
}

interface FacebookPageApp {
  readonly appId: string;
  readonly appSecret: string;
  readonly features: readonly FacebookPageFeature[];
  readonly webhookVerifyToken: string;
}

/**
 * Contains all Page and App selection inside the process. Public routes can
 * select a Page only from the signed provider payload or the private operator
 * bearer; neither route accepts an internal connection identifier.
 */
export interface FacebookPageFeatureCatalog {
  findAppByPageIds(pageIds: readonly string[]): FacebookPageApp | undefined;
  findByOperatorAuthorization(authorization: string | undefined): FacebookPageFeature | undefined;
  matchesWebhookVerifyToken(verifyToken: string | undefined): boolean;
}

export const createFacebookPageFeatureCatalog = (
  features: readonly FacebookPageFeature[]
): FacebookPageFeatureCatalog => {
  const snapshot = toFeatureSnapshot(features);
  const byPageId = new Map(snapshot.map((feature) => [feature.pageId, feature]));
  const apps = toApps(snapshot);

  return Object.freeze({
    findAppByPageIds: (pageIds: readonly string[]): FacebookPageApp | undefined => {
      if (
        !Array.isArray(pageIds) ||
        pageIds.length === 0 ||
        pageIds.length > MAX_FACEBOOK_PAGE_FEATURES
      ) {
        return undefined;
      }

      let resolvedApp: FacebookPageApp | undefined;

      for (const pageId of pageIds) {
        const feature = byPageId.get(pageId);

        if (feature === undefined) {
          return undefined;
        }

        const app = apps.get(feature.appId);

        if (app === undefined || (resolvedApp !== undefined && resolvedApp.appId !== app.appId)) {
          return undefined;
        }

        resolvedApp = app;
      }

      return resolvedApp;
    },
    findByOperatorAuthorization: (
      authorization: string | undefined
    ): FacebookPageFeature | undefined => {
      let matchedFeature: FacebookPageFeature | undefined;

      for (const feature of snapshot) {
        if (matchesBearerToken(authorization, feature.operatorApiToken)) {
          matchedFeature = feature;
        }
      }

      return matchedFeature;
    },
    matchesWebhookVerifyToken: (verifyToken: string | undefined): boolean => {
      let matched = false;

      for (const app of apps.values()) {
        if (matchesSecret(verifyToken, app.webhookVerifyToken)) {
          matched = true;
        }
      }

      return matched;
    }
  });
};

const toFeatureSnapshot = (
  features: readonly FacebookPageFeature[]
): readonly FacebookPageFeature[] => {
  if (
    !Array.isArray(features) ||
    features.length === 0 ||
    features.length > MAX_FACEBOOK_PAGE_FEATURES
  ) {
    throw new FacebookPageFeatureCatalogError();
  }

  const connectionIds = new Set<string>();
  const pageIds = new Set<string>();
  const operatorTokens = new Set<string>();
  const credentials = new Map<string, string>();
  const appCredentials = new Map<
    string,
    Readonly<{ appSecret: string; webhookVerifyToken: string }>
  >();

  for (const feature of features) {
    if (!isFeature(feature)) {
      throw new FacebookPageFeatureCatalogError();
    }

    if (
      connectionIds.has(feature.connectionId) ||
      pageIds.has(feature.pageId) ||
      operatorTokens.has(feature.operatorApiToken) ||
      credentials.has(feature.operatorApiToken)
    ) {
      throw new FacebookPageFeatureCatalogError();
    }

    const configuredApp = appCredentials.get(feature.appId);

    if (
      configuredApp !== undefined &&
      (configuredApp.appSecret !== feature.appSecret ||
        configuredApp.webhookVerifyToken !== feature.webhookVerifyToken)
    ) {
      throw new FacebookPageFeatureCatalogError();
    }

    if (configuredApp === undefined) {
      for (const [credential, role] of [
        [feature.appSecret, `app-secret:${feature.appId}`],
        [feature.webhookVerifyToken, `verify-token:${feature.appId}`]
      ] as const) {
        if (credentials.has(credential)) {
          throw new FacebookPageFeatureCatalogError();
        }

        credentials.set(credential, role);
      }

      appCredentials.set(
        feature.appId,
        Object.freeze({
          appSecret: feature.appSecret,
          webhookVerifyToken: feature.webhookVerifyToken
        })
      );
    }

    connectionIds.add(feature.connectionId);
    pageIds.add(feature.pageId);
    operatorTokens.add(feature.operatorApiToken);
    credentials.set(feature.operatorApiToken, `operator-token:${feature.connectionId}`);
  }

  return Object.freeze([...features]);
};

const toApps = (features: readonly FacebookPageFeature[]): ReadonlyMap<string, FacebookPageApp> => {
  const mutableApps = new Map<
    string,
    { appSecret: string; features: FacebookPageFeature[]; webhookVerifyToken: string }
  >();

  for (const feature of features) {
    const current = mutableApps.get(feature.appId);

    if (current === undefined) {
      mutableApps.set(feature.appId, {
        appSecret: feature.appSecret,
        features: [feature],
        webhookVerifyToken: feature.webhookVerifyToken
      });
    } else {
      current.features.push(feature);
    }
  }

  return new Map(
    [...mutableApps.entries()].map(([appId, app]) => [
      appId,
      Object.freeze({
        appId,
        appSecret: app.appSecret,
        features: Object.freeze([...app.features]),
        webhookVerifyToken: app.webhookVerifyToken
      })
    ])
  );
};

const isFeature = (value: unknown): value is FacebookPageFeature =>
  typeof value === 'object' &&
  value !== null &&
  'appId' in value &&
  'appSecret' in value &&
  'connectionId' in value &&
  'operatorApiToken' in value &&
  'pageId' in value &&
  'registration' in value &&
  'webhookVerifyToken' in value &&
  typeof value.appId === 'string' &&
  FACEBOOK_IDENTIFIER_PATTERN.test(value.appId) &&
  typeof value.appSecret === 'string' &&
  PRINTABLE_SECRET_PATTERN.test(value.appSecret) &&
  typeof value.connectionId === 'string' &&
  CONNECTION_ID_PATTERN.test(value.connectionId) &&
  value.connectionId !== '.' &&
  value.connectionId !== '..' &&
  typeof value.operatorApiToken === 'string' &&
  PRINTABLE_SECRET_PATTERN.test(value.operatorApiToken) &&
  typeof value.pageId === 'string' &&
  FACEBOOK_IDENTIFIER_PATTERN.test(value.pageId) &&
  typeof value.webhookVerifyToken === 'string' &&
  PRINTABLE_SECRET_PATTERN.test(value.webhookVerifyToken) &&
  isMatchingFacebookPageRegistration(
    value.registration,
    value.connectionId,
    value.appId,
    value.pageId
  );

const isMatchingFacebookPageRegistration = (
  value: unknown,
  connectionId: string,
  appId: string,
  pageId: string
): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  'connectorId' in value &&
  'channel' in value &&
  'providerIdentityFingerprint' in value &&
  'tier' in value &&
  value.id === connectionId &&
  value.connectorId === 'facebook-page' &&
  value.channel === 'facebook_page' &&
  value.providerIdentityFingerprint === fingerprintFacebookPageProviderIdentity(appId, pageId) &&
  value.tier === 'OFFICIAL';

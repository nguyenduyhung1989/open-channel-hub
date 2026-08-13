import { matchesBearerToken, matchesSecret } from '../http/secret-match.js';

import type { WhatsAppBusinessFeature } from './whatsapp-business-feature.js';
import { fingerprintWhatsAppBusinessProviderIdentity } from './whatsapp-business-provider-identity.js';

const MAX_WHATSAPP_BUSINESS_FEATURES = 100;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const WHATSAPP_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;
const PRINTABLE_SECRET_PATTERN = /^[!-~]{32,512}$/;

/** A deliberately non-diagnostic failure for invalid private WhatsApp wiring. */
export class WhatsAppBusinessFeatureCatalogError extends Error {
  public constructor() {
    super('The configured WhatsApp Business connections are invalid.');
    this.name = 'WhatsAppBusinessFeatureCatalogError';
  }
}

export interface WhatsAppBusinessApp {
  readonly appId: string;
  readonly appSecret: string;
  readonly features: readonly WhatsAppBusinessFeature[];
  readonly webhookVerifyToken: string;
}

/**
 * Keeps WABA and Meta App selection inside the process. Public routes may
 * select only through signed provider identity or an operator bearer; neither
 * accepts an internal connection identifier.
 */
export interface WhatsAppBusinessFeatureCatalog {
  findAppByWabaIds(wabaIds: readonly string[]): WhatsAppBusinessApp | undefined;
  findByOperatorAuthorization(
    authorization: string | undefined
  ): WhatsAppBusinessFeature | undefined;
  matchesWebhookVerifyToken(verifyToken: string | undefined): boolean;
}

export const createWhatsAppBusinessFeatureCatalog = (
  features: readonly WhatsAppBusinessFeature[]
): WhatsAppBusinessFeatureCatalog => {
  const snapshot = toFeatureSnapshot(features);
  const apps = toApps(snapshot);
  const appIdsByWabaId = toAppIdsByWabaId(snapshot);

  return Object.freeze({
    findAppByWabaIds: (wabaIds: readonly string[]): WhatsAppBusinessApp | undefined => {
      if (
        !Array.isArray(wabaIds) ||
        wabaIds.length === 0 ||
        wabaIds.length > MAX_WHATSAPP_BUSINESS_FEATURES
      ) {
        return undefined;
      }

      let resolvedApp: WhatsAppBusinessApp | undefined;

      for (const wabaId of wabaIds) {
        const appId = appIdsByWabaId.get(wabaId);
        const app = appId === undefined ? undefined : apps.get(appId);

        if (app === undefined || (resolvedApp !== undefined && resolvedApp.appId !== app.appId)) {
          return undefined;
        }

        resolvedApp = app;
      }

      return resolvedApp;
    },
    findByOperatorAuthorization: (
      authorization: string | undefined
    ): WhatsAppBusinessFeature | undefined => {
      let matchedFeature: WhatsAppBusinessFeature | undefined;

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
  features: readonly WhatsAppBusinessFeature[]
): readonly WhatsAppBusinessFeature[] => {
  if (
    !Array.isArray(features) ||
    features.length === 0 ||
    features.length > MAX_WHATSAPP_BUSINESS_FEATURES
  ) {
    throw new WhatsAppBusinessFeatureCatalogError();
  }

  const connectionIds = new Set<string>();
  const phoneNumberIds = new Set<string>();
  const operatorTokens = new Set<string>();
  const credentials = new Map<string, string>();
  const appCredentials = new Map<
    string,
    Readonly<{ appSecret: string; webhookVerifyToken: string }>
  >();
  const appIdsByWabaId = new Map<string, string>();

  for (const feature of features) {
    if (!isFeature(feature)) {
      throw new WhatsAppBusinessFeatureCatalogError();
    }

    if (
      connectionIds.has(feature.connectionId) ||
      phoneNumberIds.has(feature.phoneNumberId) ||
      operatorTokens.has(feature.operatorApiToken) ||
      credentials.has(feature.operatorApiToken)
    ) {
      throw new WhatsAppBusinessFeatureCatalogError();
    }

    const configuredApp = appCredentials.get(feature.appId);

    if (
      configuredApp !== undefined &&
      (configuredApp.appSecret !== feature.appSecret ||
        configuredApp.webhookVerifyToken !== feature.webhookVerifyToken)
    ) {
      throw new WhatsAppBusinessFeatureCatalogError();
    }

    if (configuredApp === undefined) {
      for (const [credential, role] of [
        [feature.appSecret, `app-secret:${feature.appId}`],
        [feature.webhookVerifyToken, `verify-token:${feature.appId}`]
      ] as const) {
        if (credentials.has(credential)) {
          throw new WhatsAppBusinessFeatureCatalogError();
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

    const existingWabaAppId = appIdsByWabaId.get(feature.wabaId);

    if (existingWabaAppId !== undefined && existingWabaAppId !== feature.appId) {
      throw new WhatsAppBusinessFeatureCatalogError();
    }

    connectionIds.add(feature.connectionId);
    phoneNumberIds.add(feature.phoneNumberId);
    operatorTokens.add(feature.operatorApiToken);
    credentials.set(feature.operatorApiToken, `operator-token:${feature.connectionId}`);
    appIdsByWabaId.set(feature.wabaId, feature.appId);
  }

  return Object.freeze([...features]);
};

const toAppIdsByWabaId = (
  features: readonly WhatsAppBusinessFeature[]
): ReadonlyMap<string, string> =>
  new Map(features.map((feature) => [feature.wabaId, feature.appId]));

const toApps = (
  features: readonly WhatsAppBusinessFeature[]
): ReadonlyMap<string, WhatsAppBusinessApp> => {
  const mutableApps = new Map<
    string,
    { appSecret: string; features: WhatsAppBusinessFeature[]; webhookVerifyToken: string }
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

const isFeature = (value: unknown): value is WhatsAppBusinessFeature =>
  typeof value === 'object' &&
  value !== null &&
  'appId' in value &&
  'appSecret' in value &&
  'connectionId' in value &&
  'operatorApiToken' in value &&
  'phoneNumberId' in value &&
  'registration' in value &&
  'wabaId' in value &&
  'webhookVerifyToken' in value &&
  typeof value.appId === 'string' &&
  WHATSAPP_IDENTIFIER_PATTERN.test(value.appId) &&
  typeof value.appSecret === 'string' &&
  PRINTABLE_SECRET_PATTERN.test(value.appSecret) &&
  typeof value.connectionId === 'string' &&
  CONNECTION_ID_PATTERN.test(value.connectionId) &&
  value.connectionId !== '.' &&
  value.connectionId !== '..' &&
  typeof value.operatorApiToken === 'string' &&
  PRINTABLE_SECRET_PATTERN.test(value.operatorApiToken) &&
  typeof value.phoneNumberId === 'string' &&
  WHATSAPP_IDENTIFIER_PATTERN.test(value.phoneNumberId) &&
  typeof value.wabaId === 'string' &&
  WHATSAPP_IDENTIFIER_PATTERN.test(value.wabaId) &&
  typeof value.webhookVerifyToken === 'string' &&
  PRINTABLE_SECRET_PATTERN.test(value.webhookVerifyToken) &&
  isMatchingWhatsAppBusinessRegistration(
    value.registration,
    value.connectionId,
    value.appId,
    value.wabaId,
    value.phoneNumberId
  );

const isMatchingWhatsAppBusinessRegistration = (
  value: unknown,
  connectionId: string,
  appId: string,
  wabaId: string,
  phoneNumberId: string
): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  'connectorId' in value &&
  'channel' in value &&
  'providerIdentityFingerprint' in value &&
  'tier' in value &&
  value.id === connectionId &&
  value.connectorId === 'whatsapp-business' &&
  value.channel === 'whatsapp_business' &&
  value.providerIdentityFingerprint ===
    fingerprintWhatsAppBusinessProviderIdentity(appId, wabaId, phoneNumberId) &&
  value.tier === 'OFFICIAL';

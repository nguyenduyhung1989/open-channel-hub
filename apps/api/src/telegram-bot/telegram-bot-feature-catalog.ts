import { matchesBearerToken } from '../http/secret-match.js';
import type { TelegramBotFeature } from './telegram-bot-feature.js';

const MAX_TELEGRAM_BOT_FEATURES = 100;
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/** A deliberately non-diagnostic failure for invalid private connection wiring. */
export class TelegramBotFeatureCatalogError extends Error {
  public constructor() {
    super('The configured Telegram connections are invalid.');
    this.name = 'TelegramBotFeatureCatalogError';
  }
}

/**
 * Keeps account selection inside the process. A caller never supplies a
 * connection identifier for operator APIs: its bearer token selects one
 * configured connection and nothing else.
 */
export interface TelegramBotFeatureCatalog {
  findByConnectionId(connectionId: string): TelegramBotFeature | undefined;
  findByOperatorAuthorization(authorization: string | undefined): TelegramBotFeature | undefined;
}

export interface TelegramBotFeatureCatalogOptions {
  /** Legacy one-Bot routing never interpolates this id into a URL path. */
  readonly allowLegacyDotSegmentConnectionId?: boolean;
}

export const createTelegramBotFeatureCatalog = (
  features: readonly TelegramBotFeature[],
  options: TelegramBotFeatureCatalogOptions = {}
): TelegramBotFeatureCatalog => {
  const snapshot = toFeatureSnapshot(features, options.allowLegacyDotSegmentConnectionId === true);
  const byConnectionId = new Map(snapshot.map((feature) => [feature.connectionId, feature]));

  return Object.freeze({
    findByConnectionId: (connectionId: string): TelegramBotFeature | undefined =>
      byConnectionId.get(connectionId),
    findByOperatorAuthorization: (
      authorization: string | undefined
    ): TelegramBotFeature | undefined => {
      let matchedFeature: TelegramBotFeature | undefined;

      for (const feature of snapshot) {
        if (matchesBearerToken(authorization, feature.operatorApiToken)) {
          matchedFeature = feature;
        }
      }

      return matchedFeature;
    }
  });
};

const toFeatureSnapshot = (
  features: readonly TelegramBotFeature[],
  allowLegacyDotSegmentConnectionId: boolean
): readonly TelegramBotFeature[] => {
  if (
    !Array.isArray(features) ||
    features.length === 0 ||
    features.length > MAX_TELEGRAM_BOT_FEATURES
  ) {
    throw new TelegramBotFeatureCatalogError();
  }

  const connectionIds = new Set<string>();
  const credentials = new Set<string>();

  for (const feature of features) {
    if (
      !isFeature(feature, allowLegacyDotSegmentConnectionId) ||
      connectionIds.has(feature.connectionId) ||
      credentials.has(feature.operatorApiToken) ||
      credentials.has(feature.webhookSecret)
    ) {
      throw new TelegramBotFeatureCatalogError();
    }

    connectionIds.add(feature.connectionId);
    credentials.add(feature.operatorApiToken);
    credentials.add(feature.webhookSecret);
  }

  return Object.freeze([...features]);
};

const isFeature = (
  value: unknown,
  allowLegacyDotSegmentConnectionId: boolean
): value is TelegramBotFeature =>
  typeof value === 'object' &&
  value !== null &&
  'connectionId' in value &&
  'operatorApiToken' in value &&
  'registration' in value &&
  'webhookSecret' in value &&
  typeof value.connectionId === 'string' &&
  isConnectionId(value.connectionId, allowLegacyDotSegmentConnectionId) &&
  typeof value.operatorApiToken === 'string' &&
  value.operatorApiToken.length >= 32 &&
  value.operatorApiToken.length <= 512 &&
  typeof value.webhookSecret === 'string' &&
  /^[A-Za-z0-9_-]{32,256}$/.test(value.webhookSecret) &&
  isMatchingTelegramRegistration(value.registration, value.connectionId);

const isMatchingTelegramRegistration = (value: unknown, connectionId: string): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  'connectorId' in value &&
  'channel' in value &&
  'tier' in value &&
  value.id === connectionId &&
  value.connectorId === 'telegram-bot' &&
  value.channel === 'telegram_bot' &&
  value.tier === 'OFFICIAL';

const isConnectionId = (value: string, allowLegacyDotSegmentConnectionId: boolean): boolean =>
  CONNECTION_ID_PATTERN.test(value) &&
  (allowLegacyDotSegmentConnectionId || (value !== '.' && value !== '..'));

import { matchesBearerToken } from '../http/secret-match.js';
import type { InboxFeature } from './inbox-feature.js';

const MAXIMUM_INBOX_FEATURES = 100;
const MAXIMUM_CONNECTIONS_PER_INBOX = 100;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PRINTABLE_TOKEN_PATTERN = /^[!-~]{32,512}$/;

/** A deliberately non-diagnostic failure for invalid private inbox wiring. */
export class InboxFeatureCatalogError extends Error {
  public constructor() {
    super('The configured inboxes are invalid.');
    this.name = 'InboxFeatureCatalogError';
  }
}

/**
 * Resolves one configured inbox from its own bearer token. The lookup never
 * exposes a caller-controlled connection identifier or principal selection.
 */
export interface InboxFeatureCatalog {
  findByAuthorization(authorization: string | undefined): InboxFeature | undefined;
}

export const createInboxFeatureCatalog = (
  features: readonly InboxFeature[]
): InboxFeatureCatalog => {
  const snapshot = toFeatureSnapshot(features);

  return Object.freeze({
    findByAuthorization: (authorization: string | undefined): InboxFeature | undefined => {
      let matchedFeature: InboxFeature | undefined;

      for (const feature of snapshot) {
        if (matchesBearerToken(authorization, feature.token)) {
          matchedFeature = feature;
        }
      }

      return matchedFeature;
    }
  });
};

const toFeatureSnapshot = (features: readonly InboxFeature[]): readonly InboxFeature[] => {
  if (
    !Array.isArray(features) ||
    features.length === 0 ||
    features.length > MAXIMUM_INBOX_FEATURES
  ) {
    throw new InboxFeatureCatalogError();
  }

  const inboxIds = new Set<string>();
  const tokens = new Set<string>();

  const snapshot = features.map((feature) => {
    if (!isFeature(feature) || inboxIds.has(feature.id) || tokens.has(feature.token)) {
      throw new InboxFeatureCatalogError();
    }

    inboxIds.add(feature.id);
    tokens.add(feature.token);

    return Object.freeze({
      connectionIds: Object.freeze([...feature.connectionIds]),
      createOutboundReplyCommand: feature.createOutboundReplyCommand,
      id: feature.id,
      readInboundEvents: feature.readInboundEvents,
      token: feature.token
    });
  });

  return Object.freeze(snapshot);
};

const isFeature = (value: unknown): value is InboxFeature => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('connectionIds' in value) ||
    !('createOutboundReplyCommand' in value) ||
    !('id' in value) ||
    !('readInboundEvents' in value) ||
    !('token' in value) ||
    !Array.isArray(value.connectionIds) ||
    value.connectionIds.length === 0 ||
    value.connectionIds.length > MAXIMUM_CONNECTIONS_PER_INBOX ||
    typeof value.id !== 'string' ||
    !isIdentifier(value.id) ||
    typeof value.createOutboundReplyCommand !== 'function' ||
    typeof value.readInboundEvents !== 'function' ||
    typeof value.token !== 'string' ||
    !PRINTABLE_TOKEN_PATTERN.test(value.token)
  ) {
    return false;
  }

  const connectionIds = new Set<string>();
  let previousConnectionId: string | undefined;

  for (const connectionId of value.connectionIds) {
    if (
      typeof connectionId !== 'string' ||
      !isIdentifier(connectionId) ||
      connectionIds.has(connectionId) ||
      (previousConnectionId !== undefined && previousConnectionId >= connectionId)
    ) {
      return false;
    }

    connectionIds.add(connectionId);
    previousConnectionId = connectionId;
  }

  return true;
};

const isIdentifier = (value: string): boolean =>
  IDENTIFIER_PATTERN.test(value) && value !== '.' && value !== '..';

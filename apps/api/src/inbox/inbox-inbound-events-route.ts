import { createHash } from 'node:crypto';

import type { CanonicalEvent } from '@open-channel-hub/contracts';
import type { InboundEventPageCursor } from '@open-channel-hub/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { apiFailure, apiSuccess } from '../http/api-response.js';
import type { InboxFeature } from './inbox-feature.js';
import type { InboxFeatureCatalog } from './inbox-feature-catalog.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_CURSOR_LENGTH = 512;
const MAX_POSTGRES_BIGINT = '9223372036854775807';
const CURRENT_ORDER_VERSION = 2;
const scopeHashSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const identifierSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const sequenceSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);
const pageCursorSchema = z
  .object({
    beforeSequence: sequenceSchema,
    inboxId: identifierSchema,
    orderVersion: z.literal(CURRENT_ORDER_VERSION),
    scopeHash: scopeHashSchema,
    snapshotMaxSequence: sequenceSchema
  })
  .strict();
const querySchema = z
  .object({
    cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).optional(),
    limit: z
      .string()
      .regex(/^(?:[1-9][0-9]?|100)$/)
      .optional()
  })
  .strict();

/**
 * Lists canonical inbound events across the immutable connection scope of one
 * configured inbox. Authentication precedes parsing so unauthenticated input
 * cannot be used as a parser or storage oracle.
 */
export const registerInboxInboundEventsRoute = async (
  app: FastifyInstance,
  catalog: InboxFeatureCatalog
): Promise<void> => {
  app.get('/v1/inbox/inbound-events', async (request, reply) => {
    const feature = catalog.findByAuthorization(request.headers.authorization);

    if (feature === undefined) {
      return reply.code(401).send(apiFailure('unauthorized', 'The inbox credential is invalid.'));
    }

    const query = querySchema.safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send(apiFailure('validation_error', 'The request is invalid.'));
    }

    const cursor = decodeCursor(query.data.cursor, feature);

    if (cursor === null) {
      return reply.code(400).send(apiFailure('validation_error', 'The request is invalid.'));
    }

    const page = await feature.readInboundEvents({
      ...(cursor === undefined ? {} : { cursor }),
      pageSize: query.data.limit === undefined ? DEFAULT_PAGE_SIZE : Number(query.data.limit)
    });

    return reply.code(200).send(
      apiSuccess({
        events: page.events.map(toPublicCanonicalEvent),
        ...(page.nextCursor === undefined
          ? {}
          : { nextCursor: encodeCursor(page.nextCursor, feature) })
      })
    );
  });
};

const decodeCursor = (
  value: string | undefined,
  feature: InboxFeature
): InboundEventPageCursor | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  try {
    const encoded = Buffer.from(value, 'base64url');

    if (encoded.toString('base64url') !== value) {
      return null;
    }

    const parsed = pageCursorSchema.safeParse(JSON.parse(encoded.toString('utf8')));
    const expectedScopeHash = scopeHashFor(feature.connectionIds);

    return parsed.success &&
      parsed.data.inboxId === feature.id &&
      parsed.data.scopeHash === expectedScopeHash &&
      isValidCursor(parsed.data)
      ? Object.freeze({
          beforeSequence: parsed.data.beforeSequence,
          snapshotMaxSequence: parsed.data.snapshotMaxSequence
        })
      : null;
  } catch {
    return null;
  }
};

const encodeCursor = (cursor: InboundEventPageCursor, feature: InboxFeature): string => {
  const parsed = pageCursorSchema.safeParse({
    ...cursor,
    inboxId: feature.id,
    orderVersion: CURRENT_ORDER_VERSION,
    scopeHash: scopeHashFor(feature.connectionIds)
  });

  if (!parsed.success || !isValidCursor(parsed.data)) {
    throw new Error('The inbound-event feed reader returned an invalid cursor.');
  }

  return Buffer.from(JSON.stringify(parsed.data), 'utf8').toString('base64url');
};

/**
 * The configuration loader canonicalizes connection identifiers in ascending
 * order. Newlines cannot occur in an identifier, so this is an unambiguous
 * stable representation of the effective connection set.
 */
const scopeHashFor = (connectionIds: readonly string[]): string =>
  createHash('sha256').update(connectionIds.join('\n'), 'utf8').digest('base64url');

const isValidCursor = (cursor: InboundEventPageCursor): boolean =>
  isPositivePostgresBigInt(cursor.beforeSequence) &&
  isPositivePostgresBigInt(cursor.snapshotMaxSequence) &&
  compareDecimalStrings(cursor.beforeSequence, cursor.snapshotMaxSequence) <= 0;

const isPositivePostgresBigInt = (value: string): boolean =>
  value.length < MAX_POSTGRES_BIGINT.length ||
  (value.length === MAX_POSTGRES_BIGINT.length && value <= MAX_POSTGRES_BIGINT);

const compareDecimalStrings = (left: string, right: string): number =>
  left.length === right.length ? left.localeCompare(right) : left.length - right.length;

const toPublicCanonicalEvent = (event: CanonicalEvent): CanonicalEvent =>
  Object.freeze({
    channel: event.channel,
    connectionId: event.connectionId,
    id: event.id,
    message: Object.freeze({
      conversationId: event.message.conversationId,
      id: event.message.id,
      senderId: event.message.senderId,
      text: event.message.text
    }),
    occurredAt: event.occurredAt,
    providerEventId: event.providerEventId,
    type: event.type
  });

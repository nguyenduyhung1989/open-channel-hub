import type { CanonicalEvent } from '@open-channel-hub/contracts';
import type {
  InboundEventListInput,
  InboundEventPage,
  InboundEventPageCursor
} from '@open-channel-hub/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { apiFailure, apiSuccess } from './api-response.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_CURSOR_LENGTH = 512;
const MAX_POSTGRES_BIGINT = '9223372036854775807';
const CURRENT_ORDER_VERSION = 2;
const cursorConnectionIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const sequenceSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);
const pageCursorSchema = z
  .object({
    beforeSequence: sequenceSchema,
    connectionId: cursorConnectionIdSchema,
    orderVersion: z.literal(CURRENT_ORDER_VERSION),
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

export interface AccountBoundInboundEventsFeature {
  readonly connectionId: string;
  readonly readInboundEvents: (input: InboundEventListInput) => Promise<InboundEventPage>;
}

export interface AccountBoundInboundEventsCatalog<
  Feature extends AccountBoundInboundEventsFeature
> {
  findByOperatorAuthorization(authorization: string | undefined): Feature | undefined;
}

/**
 * Lists canonical events only for the connection selected by its operator
 * bearer. The route never accepts a caller-selected connection identifier.
 */
export const registerAccountBoundInboundEventsRoute = async <
  Feature extends AccountBoundInboundEventsFeature
>(
  app: FastifyInstance,
  route: string,
  catalog: AccountBoundInboundEventsCatalog<Feature>
): Promise<void> => {
  app.get(route, async (request, reply) => {
    const feature = catalog.findByOperatorAuthorization(request.headers.authorization);

    if (feature === undefined) {
      return reply
        .code(401)
        .send(apiFailure('unauthorized', 'The operator credential is invalid.'));
    }

    const query = querySchema.safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send(apiFailure('validation_error', 'The request is invalid.'));
    }

    const cursor = decodeCursor(query.data.cursor, feature.connectionId);

    if (cursor === null) {
      return reply.code(400).send(apiFailure('validation_error', 'The request is invalid.'));
    }

    const page = await feature.readInboundEvents({
      connectionId: feature.connectionId,
      ...(cursor === undefined ? {} : { cursor }),
      pageSize: query.data.limit === undefined ? DEFAULT_PAGE_SIZE : Number(query.data.limit)
    });

    return reply.code(200).send(
      apiSuccess({
        events: page.events.map(toPublicCanonicalEvent),
        ...(page.nextCursor === undefined
          ? {}
          : { nextCursor: encodeCursor(page.nextCursor, feature.connectionId) })
      })
    );
  });
};

const decodeCursor = (
  value: string | undefined,
  connectionId: string
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

    return parsed.success && parsed.data.connectionId === connectionId && isValidCursor(parsed.data)
      ? Object.freeze({
          beforeSequence: parsed.data.beforeSequence,
          snapshotMaxSequence: parsed.data.snapshotMaxSequence
        })
      : null;
  } catch {
    return null;
  }
};

const encodeCursor = (cursor: InboundEventPageCursor, connectionId: string): string => {
  const parsed = pageCursorSchema.safeParse({
    ...cursor,
    connectionId,
    orderVersion: CURRENT_ORDER_VERSION
  });

  if (!parsed.success || !isValidCursor(parsed.data)) {
    throw new Error('The inbound-event reader returned an invalid cursor.');
  }

  return Buffer.from(JSON.stringify(parsed.data), 'utf8').toString('base64url');
};

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

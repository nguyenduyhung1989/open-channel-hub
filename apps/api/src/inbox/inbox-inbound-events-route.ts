import type { CanonicalEvent } from '@open-channel-hub/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { apiFailure, apiSuccess } from '../http/api-response.js';
import { decodeInboxCursor, encodeInboxCursor } from './inbox-cursor.js';
import type { InboxFeatureCatalog } from './inbox-feature-catalog.js';

const DEFAULT_PAGE_SIZE = 50;
const querySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
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

    const cursor = decodeInboxCursor(query.data.cursor, feature);

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
          : { nextCursor: encodeInboxCursor(page.nextCursor, feature) })
      })
    );
  });
};

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

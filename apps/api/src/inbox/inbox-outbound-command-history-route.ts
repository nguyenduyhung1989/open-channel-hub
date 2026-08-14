import type { OutboundReplyCommandHistoryEntry } from '@open-channel-hub/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { apiFailure, apiSuccess } from '../http/api-response.js';
import {
  decodeInboxOutboundCommandHistoryCursor,
  encodeInboxOutboundCommandHistoryCursor
} from './inbox-outbound-command-history-cursor.js';
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
 * Lists queued source-bound reply commands across one immutable inbox scope.
 * Authentication deliberately precedes query and cursor parsing so invalid
 * unauthenticated input cannot act as a parser or storage oracle.
 */
export const registerInboxOutboundCommandHistoryRoute = async (
  app: FastifyInstance,
  catalog: InboxFeatureCatalog
): Promise<void> => {
  app.get('/v1/inbox/outbound-commands', async (request, reply) => {
    const feature = catalog.findByAuthorization(request.headers.authorization);

    if (feature === undefined) {
      return reply.code(401).send(apiFailure('unauthorized', 'The inbox credential is invalid.'));
    }

    const query = querySchema.safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send(apiFailure('validation_error', 'The request is invalid.'));
    }

    const cursor = decodeInboxOutboundCommandHistoryCursor(query.data.cursor, feature);

    if (cursor === null) {
      return reply.code(400).send(apiFailure('validation_error', 'The request is invalid.'));
    }

    const page = await feature.readOutboundReplyCommandHistory({
      ...(cursor === undefined ? {} : { cursor }),
      pageSize: query.data.limit === undefined ? DEFAULT_PAGE_SIZE : Number(query.data.limit)
    });

    return reply.code(200).send(
      apiSuccess({
        commands: page.commands.map(toPublicOutboundReplyCommandHistoryEntry),
        ...(page.nextCursor === undefined
          ? {}
          : { nextCursor: encodeInboxOutboundCommandHistoryCursor(page.nextCursor, feature) })
      })
    );
  });
};

const toPublicOutboundReplyCommandHistoryEntry = (
  command: OutboundReplyCommandHistoryEntry
): Readonly<{
  createdAt: string;
  id: string;
  sourceConnectionId: string;
  sourceProviderEventId: string;
  state: 'queued';
  text: string;
}> =>
  Object.freeze({
    createdAt: command.createdAt,
    id: command.id,
    sourceConnectionId: command.sourceConnectionId,
    sourceProviderEventId: command.sourceProviderEventId,
    state: command.state,
    text: command.text
  });

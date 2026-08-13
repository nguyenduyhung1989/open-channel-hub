import type { OutboundReplyCommand } from '@open-channel-hub/domain';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { apiFailure, apiSuccess } from '../http/api-response.js';
import type { InboxFeatureCatalog } from './inbox-feature-catalog.js';

const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PROVIDER_EVENT_ID_PATTERN = /^[!-~]{1,512}$/;
const CLIENT_OPERATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const requestBodySchema = z
  .object({
    clientOperationId: z
      .string()
      .regex(CLIENT_OPERATION_ID_PATTERN)
      .refine((value) => value !== '.' && value !== '..'),
    sourceConnectionId: z
      .string()
      .regex(CONNECTION_ID_PATTERN)
      .refine((value) => value !== '.' && value !== '..'),
    sourceProviderEventId: z.string().regex(PROVIDER_EVENT_ID_PATTERN),
    text: z
      .string()
      .max(2_000)
      .refine((value) => value.trim().length > 0)
  })
  .strict();

/**
 * Records a source-bound reply intent for the inbox selected by its bearer
 * credential. The browser or API caller can never choose a reply target;
 * dispatch remains deliberately outside this phase.
 */
export const registerInboxOutboundCommandsRoute = async (
  app: FastifyInstance,
  catalog: InboxFeatureCatalog
): Promise<void> => {
  app.post<{ Body: unknown }>(
    '/v1/inbox/outbound-commands',
    {
      // onRequest runs before Fastify's content-type/body parsers. Rejecting
      // here prevents unauthenticated bodies from becoming a parser oracle.
      onRequest: async (request, reply) => {
        if (catalog.findByAuthorization(request.headers.authorization) === undefined) {
          return sendUnauthorized(reply);
        }
      }
    },
    async (request, reply) => {
      // Re-resolve from the immutable catalog after the early parser boundary.
      // This defensive check also keeps the route correct if hook behavior is
      // changed by a future Fastify upgrade.
      const feature = catalog.findByAuthorization(request.headers.authorization);

      if (feature === undefined) {
        return sendUnauthorized(reply);
      }

      const body = requestBodySchema.safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send(apiFailure('validation_error', 'The request is invalid.'));
      }

      const result = await feature.createOutboundReplyCommand(
        Object.freeze({
          clientOperationId: body.data.clientOperationId,
          sourceConnectionId: body.data.sourceConnectionId,
          sourceProviderEventId: body.data.sourceProviderEventId,
          // Validate after trimming, but retain the exact operator text for a
          // future dispatch policy and immutable audit record.
          text: body.data.text
        })
      );

      if (result.kind === 'created') {
        return reply.code(201).send(apiSuccess(toPublicCommand(result.command)));
      }

      if (result.kind === 'idempotent_replay') {
        return reply.code(200).send(apiSuccess(toPublicCommand(result.command)));
      }

      if (result.kind === 'source_unavailable') {
        // Missing and out-of-scope sources intentionally have the same reply.
        return reply
          .code(404)
          .send(apiFailure('not_found', 'The requested source event does not exist.'));
      }

      if (result.kind === 'idempotency_conflict') {
        return reply
          .code(409)
          .send(
            apiFailure(
              'idempotency_conflict',
              'The operation identifier conflicts with an existing command.'
            )
          );
      }

      return reply.code(500).send(apiFailure('internal_error', 'An unexpected error occurred.'));
    }
  );
};

const sendUnauthorized = (reply: FastifyReply): FastifyReply =>
  reply.code(401).send(apiFailure('unauthorized', 'The inbox credential is invalid.'));

const toPublicCommand = (command: OutboundReplyCommand): OutboundReplyCommand =>
  Object.freeze({
    createdAt: command.createdAt,
    id: command.id,
    sourceConnectionId: command.sourceConnectionId,
    sourceProviderEventId: command.sourceProviderEventId,
    state: command.state
  });

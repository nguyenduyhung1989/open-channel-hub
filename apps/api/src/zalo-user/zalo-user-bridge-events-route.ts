import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { apiFailure } from '../http/api-response.js';

import type { ZaloUserFeatureCatalog } from './zalo-user-feature-catalog.js';

const CONNECTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const ZALO_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;
const ISO_UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const hasAsciiControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.charCodeAt(0);

    return codePoint <= 0x1f || codePoint === 0x7f;
  });
const providerIdSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value.trim() === value && !hasAsciiControlCharacter(value));
const inboundEventSchema = z
  .object({
    accountId: z.string().regex(ZALO_IDENTIFIER_PATTERN),
    conversationId: providerIdSchema,
    occurredAt: z
      .string()
      .regex(ISO_UTC_MILLISECOND_PATTERN)
      .refine((value) => {
        const occurredAt = new Date(value);

        return !Number.isNaN(occurredAt.getTime()) && occurredAt.toISOString() === value;
      }),
    providerEventId: providerIdSchema,
    senderId: providerIdSchema,
    text: z.string().min(1).max(16_384),
    threadType: z.literal('group')
  })
  .strict();
const paramsSchema = z.object({ connectionId: z.string().regex(CONNECTION_ID_PATTERN) }).strict();

/**
 * Receives the narrow sanitized event envelope from the separate QR bridge.
 * Authentication occurs in `onRequest`, before Fastify starts parsing JSON.
 */
export const registerZaloUserBridgeEventsRoute = async (
  app: FastifyInstance,
  catalog: ZaloUserFeatureCatalog
): Promise<void> => {
  app.post<{ Params: { connectionId: string } }>(
    '/v1/experimental/zalo-user/:connectionId/events',
    {
      onRequest: async (request, reply): Promise<void> => {
        const feature = catalog.findByBridgeAuthorization(request.headers.authorization);
        const params = paramsSchema.safeParse(request.params);

        if (
          !params.success ||
          feature === undefined ||
          feature.connectionId !== params.data.connectionId
        ) {
          await reply
            .code(401)
            .send(apiFailure('unauthorized', 'The bridge credential is invalid.'));
        }
      }
    },
    async (request, reply) => {
      const feature = catalog.findByBridgeAuthorization(request.headers.authorization);
      const params = paramsSchema.safeParse(request.params);

      if (
        !params.success ||
        feature === undefined ||
        feature.connectionId !== params.data.connectionId
      ) {
        return reply
          .code(401)
          .send(apiFailure('unauthorized', 'The bridge credential is invalid.'));
      }

      const event = inboundEventSchema.safeParse(request.body);

      if (!event.success) {
        return reply.code(400).send(apiFailure('validation_error', 'The request is invalid.'));
      }

      const events = feature.normalize(event.data);

      if (events.length !== 1) {
        return reply.code(400).send(apiFailure('validation_error', 'The request is invalid.'));
      }

      await feature.receiveEvents(events);

      return reply.code(204).send();
    }
  );
};

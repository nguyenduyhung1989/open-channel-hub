import { ConnectorProviderError } from '@open-channel-hub/connector-sdk';
import type { SendMessageError } from '@open-channel-hub/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { apiFailure, apiSuccess } from '../http/api-response.js';
import { matchesBearerToken } from '../http/secret-match.js';
import type { TelegramBotFeature } from './telegram-bot-feature.js';

const sendTextBodySchema = z
  .object({
    recipientId: z.string().trim().min(1).max(256),
    text: z.string().min(1).max(4096)
  })
  .strict();

export const registerTelegramBotMessageRoute = async (
  app: FastifyInstance,
  feature: TelegramBotFeature
): Promise<void> => {
  app.post('/v1/telegram-bot/messages', async (request, reply) => {
    if (!matchesBearerToken(request.headers.authorization, feature.operatorApiToken)) {
      return reply
        .code(401)
        .send(apiFailure('unauthorized', 'The operator credential is invalid.'));
    }

    const body = sendTextBodySchema.safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send(apiFailure('validation_error', 'The request is invalid.'));
    }

    try {
      const result = await feature.sendMessage({
        connectionId: feature.connectionId,
        recipientId: body.data.recipientId,
        text: body.data.text
      });

      if (!result.ok) {
        return reply
          .code(statusForSendMessageError(result.error))
          .send(apiFailure(result.error.code, messageForSendMessageError(result.error)));
      }

      return reply.code(200).send(
        apiSuccess({
          acceptedAt: result.receipt.acceptedAt,
          connectionId: result.receipt.connectionId,
          providerMessageId: result.receipt.providerMessageId
        })
      );
    } catch (error) {
      if (error instanceof ConnectorProviderError) {
        return reply
          .code(502)
          .send(
            apiFailure('provider_failure', 'The Telegram provider could not accept the request.')
          );
      }

      throw error;
    }
  });
};

const statusForSendMessageError = (error: SendMessageError): number => {
  switch (error.code) {
    case 'invalid_input':
      return 400;
    case 'connection_mismatch':
      return 409;
    case 'connection_unavailable':
      return 503;
    case 'unsupported_capability':
      return 422;
  }
};

const messageForSendMessageError = (error: SendMessageError): string => {
  switch (error.code) {
    case 'invalid_input':
      return 'The request is invalid.';
    case 'connection_mismatch':
      return 'The configured Telegram connection does not match the request.';
    case 'connection_unavailable':
      return 'The configured Telegram connection is unavailable.';
    case 'unsupported_capability':
      return 'The configured Telegram connection cannot send text messages.';
  }
};

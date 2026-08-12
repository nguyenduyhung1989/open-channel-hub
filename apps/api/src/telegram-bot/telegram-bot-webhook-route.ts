import type { FastifyInstance } from 'fastify';

import { apiFailure } from '../http/api-response.js';
import { matchesSecret } from '../http/secret-match.js';
import type { TelegramBotFeature } from './telegram-bot-feature.js';

export const registerTelegramBotWebhookRoute = async (
  app: FastifyInstance,
  feature: TelegramBotFeature
): Promise<void> => {
  app.post('/v1/webhooks/telegram-bot', async (request, reply) => {
    const header = request.headers['x-telegram-bot-api-secret-token'];
    const secretToken = typeof header === 'string' ? header : undefined;

    if (!matchesSecret(secretToken, feature.webhookSecret)) {
      return reply.code(401).send(apiFailure('unauthorized', 'The webhook credential is invalid.'));
    }

    const events = feature.normalize(request.body);

    if (events.length > 0) {
      await feature.receiveEvents(events);
    }

    return reply.code(204).send();
  });
};

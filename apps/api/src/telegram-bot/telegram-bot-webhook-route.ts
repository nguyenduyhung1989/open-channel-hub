import type { FastifyInstance } from 'fastify';

import { apiFailure } from '../http/api-response.js';
import { matchesSecret } from '../http/secret-match.js';
import type { TelegramBotFeatureCatalog } from './telegram-bot-feature-catalog.js';
import type { TelegramBotFeature } from './telegram-bot-feature.js';

export interface TelegramBotWebhookRouteOptions {
  readonly dynamicRouteEnabled?: boolean;
  readonly legacyConnectionId?: string;
}

export const registerTelegramBotWebhookRoute = async (
  app: FastifyInstance,
  catalog: TelegramBotFeatureCatalog,
  options: TelegramBotWebhookRouteOptions = {}
): Promise<void> => {
  const handleWebhook = async (
    feature: TelegramBotFeature | undefined,
    request: Readonly<{
      body: unknown;
      headers: Readonly<Record<string, string | string[] | undefined>>;
    }>,
    reply: Readonly<{
      code: (statusCode: number) => Readonly<{ send: (payload?: unknown) => unknown }>;
    }>
  ) => {
    const header = request.headers['x-telegram-bot-api-secret-token'];
    const secretToken = typeof header === 'string' ? header : undefined;

    if (feature === undefined || !matchesSecret(secretToken, feature.webhookSecret)) {
      return reply.code(401).send(apiFailure('unauthorized', 'The webhook credential is invalid.'));
    }

    const events = feature.normalize(request.body);

    if (events.length > 0) {
      await feature.receiveEvents(events);
    }

    return reply.code(204).send();
  };

  const legacyConnectionId = options.legacyConnectionId;

  if (legacyConnectionId !== undefined) {
    app.post('/v1/webhooks/telegram-bot', async (request, reply) =>
      handleWebhook(catalog.findByConnectionId(legacyConnectionId), request, reply)
    );
  }
  if (options.dynamicRouteEnabled !== false) {
    app.post<{ Params: { connectionId: string } }>(
      '/v1/webhooks/telegram-bot/:connectionId',
      async (request, reply) =>
        handleWebhook(catalog.findByConnectionId(request.params.connectionId), request, reply)
    );
  }
};

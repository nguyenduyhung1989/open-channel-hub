import helmet from '@fastify/helmet';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';

import { apiFailure } from './http/api-response.js';
import { registerHealthRoute } from './health/health-route.js';
import { registerReadinessRoute, type ReadinessCheck } from './health/readiness-route.js';
import {
  DEFAULT_SOURCE_OFFER_URL,
  registerSourceOfferRoute,
  sourceOfferLinkHeader
} from './source/source-offer.js';
import type { TelegramBotFeature } from './telegram-bot/telegram-bot-feature.js';
import { registerTelegramBotInboundEventsRoute } from './telegram-bot/telegram-bot-inbound-events-route.js';
import { registerTelegramBotMessageRoute } from './telegram-bot/telegram-bot-message-route.js';
import { registerTelegramBotWebhookRoute } from './telegram-bot/telegram-bot-webhook-route.js';

export interface BuildAppOptions {
  readonly readiness?: ReadinessCheck;
  readonly sourceOfferUrl?: string;
  readonly telegramBot?: TelegramBotFeature;
}

export const buildApp = async (options: BuildAppOptions = {}): Promise<FastifyInstance> => {
  const app = Fastify({
    bodyLimit: 1_048_576,
    logger: false,
    trustProxy: false
  });
  const sourceOfferUrl = options.sourceOfferUrl ?? DEFAULT_SOURCE_OFFER_URL;

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"]
      }
    },
    frameguard: { action: 'deny' },
    hsts: false,
    referrerPolicy: { policy: 'no-referrer' }
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.validation !== undefined) {
      return reply.code(400).send(apiFailure('validation_error', 'The request is invalid.'));
    }

    if (isClientRequestError(error)) {
      return reply
        .code(error.statusCode)
        .send(apiFailure('validation_error', 'The request is invalid.'));
    }

    return reply.code(500).send(apiFailure('internal_error', 'An unexpected error occurred.'));
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(apiFailure('not_found', 'The requested resource does not exist.'))
  );

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Link', sourceOfferLinkHeader(sourceOfferUrl));
    return payload;
  });

  await registerHealthRoute(app);
  await registerReadinessRoute(app, options.readiness);
  await registerSourceOfferRoute(app, sourceOfferUrl);

  if (options.telegramBot !== undefined) {
    await registerTelegramBotInboundEventsRoute(app, options.telegramBot);
    await registerTelegramBotMessageRoute(app, options.telegramBot);
    await registerTelegramBotWebhookRoute(app, options.telegramBot);
  }

  return app;
};

const isClientRequestError = (
  error: FastifyError
): error is FastifyError & Readonly<{ statusCode: number }> =>
  typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500;

import helmet from '@fastify/helmet';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';

import { apiFailure } from './http/api-response.js';
import { registerHealthRoute } from './health/health-route.js';

export const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    bodyLimit: 1_048_576,
    logger: false,
    trustProxy: false
  });

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

    return reply.code(500).send(apiFailure('internal_error', 'An unexpected error occurred.'));
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(apiFailure('not_found', 'The requested resource does not exist.'))
  );

  await registerHealthRoute(app);

  return app;
};

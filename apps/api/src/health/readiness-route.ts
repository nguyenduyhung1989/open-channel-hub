import type { FastifyInstance } from 'fastify';

import { apiFailure, apiSuccess } from '../http/api-response.js';

export interface ReadinessCheck {
  check(): Promise<void>;
}

const alwaysReady: ReadinessCheck = Object.freeze({
  check: async (): Promise<void> => undefined
});

/**
 * Readiness includes required dependencies, unlike /health which only proves
 * that this API process is alive.
 */
export const registerReadinessRoute = async (
  app: FastifyInstance,
  readiness: ReadinessCheck = alwaysReady
): Promise<void> => {
  app.get('/ready', async (_request, reply) => {
    try {
      await readiness.check();

      return apiSuccess({ service: 'open-channel-hub', status: 'ready' });
    } catch {
      return reply
        .code(503)
        .send(apiFailure('not_ready', 'The service is not ready to receive requests.'));
    }
  });
};

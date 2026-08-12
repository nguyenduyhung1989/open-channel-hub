import type { FastifyInstance } from 'fastify';

import { apiSuccess } from '../http/api-response.js';

export const registerHealthRoute = async (app: FastifyInstance): Promise<void> => {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['success', 'data'],
            properties: {
              success: { const: true },
              data: {
                type: 'object',
                required: ['service', 'status'],
                properties: {
                  service: { type: 'string' },
                  status: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    async () => apiSuccess({ service: 'open-channel-hub', status: 'ok' })
  );
};

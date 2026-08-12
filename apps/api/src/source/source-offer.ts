import type { FastifyInstance } from 'fastify';

import { apiSuccess } from '../http/api-response.js';

/**
 * Used only for local development and tests. A network-facing production
 * deployment must provide the URL for its exact corresponding source instead.
 */
export const DEFAULT_SOURCE_OFFER_URL = 'https://github.com/nguyenduyhung1989/open-channel-hub';

export const registerSourceOfferRoute = async (
  app: FastifyInstance,
  sourceOfferUrl: string
): Promise<void> => {
  app.get(
    '/source',
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
                required: ['license', 'sourceOfferUrl'],
                properties: {
                  license: { const: 'AGPL-3.0-or-later' },
                  sourceOfferUrl: { type: 'string', format: 'uri' }
                }
              }
            }
          }
        }
      }
    },
    async () =>
      apiSuccess({
        license: 'AGPL-3.0-or-later' as const,
        sourceOfferUrl
      })
  );
};

export const sourceOfferLinkHeader = (sourceOfferUrl: string): string =>
  `<${sourceOfferUrl}>; rel="source"`;

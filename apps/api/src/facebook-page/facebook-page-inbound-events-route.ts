import type { FastifyInstance } from 'fastify';

import { registerAccountBoundInboundEventsRoute } from '../http/account-bound-inbound-events-route.js';

import type { FacebookPageFeatureCatalog } from './facebook-page-feature-catalog.js';

/** Lists canonical events only for the Page selected by its operator bearer. */
export const registerFacebookPageInboundEventsRoute = async (
  app: FastifyInstance,
  catalog: FacebookPageFeatureCatalog
): Promise<void> =>
  registerAccountBoundInboundEventsRoute(app, '/v1/facebook-page/inbound-events', catalog);

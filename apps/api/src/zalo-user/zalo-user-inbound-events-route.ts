import type { FastifyInstance } from 'fastify';

import { registerAccountBoundInboundEventsRoute } from '../http/account-bound-inbound-events-route.js';

import type { ZaloUserFeatureCatalog } from './zalo-user-feature-catalog.js';

/** Lists canonical events only for the experimental bridge selected by its operator bearer. */
export const registerZaloUserInboundEventsRoute = async (
  app: FastifyInstance,
  catalog: ZaloUserFeatureCatalog
): Promise<void> =>
  registerAccountBoundInboundEventsRoute(app, '/v1/zalo-user/inbound-events', catalog);

import type { FastifyInstance } from 'fastify';

import { registerAccountBoundInboundEventsRoute } from '../http/account-bound-inbound-events-route.js';

import type { ZaloOaFeatureCatalog } from './zalo-oa-feature-catalog.js';

/** Lists canonical events only for the OA selected by its operator bearer. */
export const registerZaloOaInboundEventsRoute = async (
  app: FastifyInstance,
  catalog: ZaloOaFeatureCatalog
): Promise<void> =>
  registerAccountBoundInboundEventsRoute(app, '/v1/zalo-oa/inbound-events', catalog);

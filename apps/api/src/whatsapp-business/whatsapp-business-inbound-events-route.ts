import type { FastifyInstance } from 'fastify';

import { registerAccountBoundInboundEventsRoute } from '../http/account-bound-inbound-events-route.js';

import type { WhatsAppBusinessFeatureCatalog } from './whatsapp-business-feature-catalog.js';

/** Lists canonical events only for the business phone selected by its bearer. */
export const registerWhatsAppBusinessInboundEventsRoute = async (
  app: FastifyInstance,
  catalog: WhatsAppBusinessFeatureCatalog
): Promise<void> =>
  registerAccountBoundInboundEventsRoute(app, '/v1/whatsapp-business/inbound-events', catalog);

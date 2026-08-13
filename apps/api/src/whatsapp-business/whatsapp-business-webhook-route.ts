import { toWhatsAppBusinessWebhookWabaIds } from '@open-channel-hub/connector-whatsapp-business';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { apiFailure } from '../http/api-response.js';
import { matchesMetaHubWebhookSignature } from '../http/meta-hub-signature.js';
import { parseRawJson, toRawUtf8Json } from '../http/raw-json.js';

import type { WhatsAppBusinessFeatureCatalog } from './whatsapp-business-feature-catalog.js';

const verificationQuerySchema = z
  .object({
    'hub.challenge': z.string().min(1).max(1_024),
    'hub.mode': z.literal('subscribe'),
    'hub.verify_token': z.string().min(1).max(512)
  })
  .strict();

/**
 * Registers one child Fastify scope so WhatsApp Business alone receives raw
 * JSON bytes for Meta HMAC validation. Other provider routes retain their
 * independent parsers.
 */
export const registerWhatsAppBusinessWebhookRoute = async (
  app: FastifyInstance,
  catalog: WhatsAppBusinessFeatureCatalog
): Promise<void> => {
  app.register((webhookApp, _options, done) => {
    webhookApp.removeContentTypeParser('application/json');
    webhookApp.addContentTypeParser(
      /^application\/json(?:;|$)/i,
      { parseAs: 'buffer' },
      (_request, rawBody: Buffer, parseDone) => parseDone(null, rawBody)
    );

    webhookApp.get('/v1/webhooks/whatsapp-business', async (request, reply) => {
      const query = verificationQuerySchema.safeParse(request.query);

      if (!query.success || !catalog.matchesWebhookVerifyToken(query.data['hub.verify_token'])) {
        return reply
          .code(403)
          .send(apiFailure('forbidden', 'The webhook verification credential is invalid.'));
      }

      return reply.code(200).type('text/plain; charset=utf-8').send(query.data['hub.challenge']);
    });

    webhookApp.post<{ Body: Buffer }>('/v1/webhooks/whatsapp-business', async (request, reply) => {
      const rawJson = toRawUtf8Json(request.body);
      const rawEvent = rawJson === undefined ? undefined : parseRawJson(rawJson);
      const wabaIds = toWhatsAppBusinessWebhookWabaIds(rawEvent);
      const providerApp = catalog.findAppByWabaIds(wabaIds);
      const header = request.headers['x-hub-signature-256'];
      const signature = typeof header === 'string' ? header : undefined;

      if (
        rawEvent === undefined ||
        providerApp === undefined ||
        !matchesMetaHubWebhookSignature({
          appSecret: providerApp.appSecret,
          rawBody: request.body,
          signature
        })
      ) {
        return reply
          .code(401)
          .send(apiFailure('unauthorized', 'The webhook credential is invalid.'));
      }

      for (const feature of providerApp.features) {
        const events = feature.normalize(rawEvent);

        if (events.length > 0) {
          await feature.receiveEvents(events);
        }
      }

      return reply.code(200).type('text/plain; charset=utf-8').send('EVENT_RECEIVED');
    });

    done();
  });
};

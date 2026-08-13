import { toFacebookPageWebhookPageIds } from '@open-channel-hub/connector-facebook-page';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { apiFailure } from '../http/api-response.js';

import type { FacebookPageFeatureCatalog } from './facebook-page-feature-catalog.js';
import { matchesFacebookPageWebhookSignature } from './facebook-page-signature.js';

const verificationQuerySchema = z
  .object({
    'hub.challenge': z.string().min(1).max(1_024),
    'hub.mode': z.literal('subscribe'),
    'hub.verify_token': z.string().min(1).max(512)
  })
  .strict();

/**
 * Registers one child Fastify scope so Meta Page webhooks alone receive raw
 * JSON bytes for HMAC validation. Telegram and Zalo retain their independent
 * parser scopes and every ordinary API route continues to receive parsed JSON.
 */
export const registerFacebookPageWebhookRoute = async (
  app: FastifyInstance,
  catalog: FacebookPageFeatureCatalog
): Promise<void> => {
  app.register((webhookApp, _options, done) => {
    webhookApp.removeContentTypeParser('application/json');
    webhookApp.addContentTypeParser(
      /^application\/json(?:;|$)/i,
      { parseAs: 'buffer' },
      (_request, rawBody: Buffer, parseDone) => parseDone(null, rawBody)
    );

    webhookApp.get('/v1/webhooks/facebook-page', async (request, reply) => {
      const query = verificationQuerySchema.safeParse(request.query);

      if (!query.success || !catalog.matchesWebhookVerifyToken(query.data['hub.verify_token'])) {
        return reply
          .code(403)
          .send(apiFailure('forbidden', 'The webhook verification credential is invalid.'));
      }

      return reply.code(200).type('text/plain; charset=utf-8').send(query.data['hub.challenge']);
    });

    webhookApp.post<{ Body: Buffer }>('/v1/webhooks/facebook-page', async (request, reply) => {
      const rawJson = toRawUtf8Json(request.body);
      const rawEvent = rawJson === undefined ? undefined : parseJson(rawJson);
      const pageIds = toFacebookPageWebhookPageIds(rawEvent);
      const providerApp = catalog.findAppByPageIds(pageIds);
      const header = request.headers['x-hub-signature-256'];
      const signature = typeof header === 'string' ? header : undefined;

      if (
        rawEvent === undefined ||
        providerApp === undefined ||
        !matchesFacebookPageWebhookSignature({
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

const toRawUtf8Json = (value: unknown): string | undefined => {
  if (!Buffer.isBuffer(value)) {
    return undefined;
  }

  const decoded = value.toString('utf8');

  return Buffer.from(decoded, 'utf8').equals(value) ? decoded : undefined;
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

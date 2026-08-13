import { toFacebookPageWebhookPageIds } from '@open-channel-hub/connector-facebook-page';
import { toWhatsAppBusinessWebhookWabaIds } from '@open-channel-hub/connector-whatsapp-business';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { apiFailure } from './api-response.js';
import { matchesMetaHubWebhookSignature } from './meta-hub-signature.js';
import { parseRawJson, toRawUtf8Json } from './raw-json.js';
import type {
  FacebookPageApp,
  FacebookPageFeatureCatalog
} from '../facebook-page/facebook-page-feature-catalog.js';
import type {
  WhatsAppBusinessApp,
  WhatsAppBusinessFeatureCatalog
} from '../whatsapp-business/whatsapp-business-feature-catalog.js';

const verificationQuerySchema = z
  .object({
    'hub.challenge': z.string().min(1).max(1_024),
    'hub.mode': z.literal('subscribe'),
    'hub.verify_token': z.string().min(1).max(512)
  })
  .strict();

export interface MetaWebhookRouteOptions {
  readonly facebookPages?: FacebookPageFeatureCatalog;
  readonly whatsappBusinesses?: WhatsAppBusinessFeatureCatalog;
}

type MetaWebhookApp = FacebookPageApp | WhatsAppBusinessApp;

/**
 * Receives Meta products that intentionally share one App and therefore one
 * callback URL. It first selects exactly one configured Meta App by the
 * untrusted provider envelope, verifies the raw-body HMAC once, then lets the
 * selected product features filter their own account identities.
 */
export const registerMetaWebhookRoute = async (
  app: FastifyInstance,
  options: MetaWebhookRouteOptions
): Promise<void> => {
  if (options.facebookPages === undefined && options.whatsappBusinesses === undefined) {
    return;
  }

  app.register((webhookApp, _options, done) => {
    webhookApp.removeContentTypeParser('application/json');
    webhookApp.addContentTypeParser(
      /^application\/json(?:;|$)/i,
      { parseAs: 'buffer' },
      (_request, rawBody: Buffer, parseDone) => parseDone(null, rawBody)
    );

    webhookApp.get('/v1/webhooks/meta', async (request, reply) => {
      const query = verificationQuerySchema.safeParse(request.query);

      if (!query.success || !matchesVerificationToken(options, query.data['hub.verify_token'])) {
        return reply
          .code(403)
          .send(apiFailure('forbidden', 'The webhook verification credential is invalid.'));
      }

      return reply.code(200).type('text/plain; charset=utf-8').send(query.data['hub.challenge']);
    });

    webhookApp.post<{ Body: Buffer }>('/v1/webhooks/meta', async (request, reply) => {
      const rawJson = toRawUtf8Json(request.body);
      const rawEvent = rawJson === undefined ? undefined : parseRawJson(rawJson);
      const selectedApp = rawEvent === undefined ? undefined : selectMetaApp(options, rawEvent);
      const header = request.headers['x-hub-signature-256'];
      const signature = typeof header === 'string' ? header : undefined;

      if (
        selectedApp === undefined ||
        !matchesMetaHubWebhookSignature({
          appSecret: selectedApp.appSecret,
          rawBody: request.body,
          signature
        })
      ) {
        return reply
          .code(401)
          .send(apiFailure('unauthorized', 'The webhook credential is invalid.'));
      }

      for (const feature of selectedApp.features) {
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

const matchesVerificationToken = (
  options: MetaWebhookRouteOptions,
  verifyToken: string
): boolean => {
  const facebookMatch = options.facebookPages?.matchesWebhookVerifyToken(verifyToken) ?? false;
  const whatsappMatch = options.whatsappBusinesses?.matchesWebhookVerifyToken(verifyToken) ?? false;

  return facebookMatch || whatsappMatch;
};

const selectMetaApp = (
  options: MetaWebhookRouteOptions,
  rawEvent: unknown
): MetaWebhookApp | undefined => {
  const facebookApp = options.facebookPages?.findAppByPageIds(
    toFacebookPageWebhookPageIds(rawEvent)
  );
  const whatsappApp = options.whatsappBusinesses?.findAppByWabaIds(
    toWhatsAppBusinessWebhookWabaIds(rawEvent)
  );

  return facebookApp !== undefined && whatsappApp === undefined
    ? facebookApp
    : whatsappApp !== undefined && facebookApp === undefined
      ? whatsappApp
      : undefined;
};

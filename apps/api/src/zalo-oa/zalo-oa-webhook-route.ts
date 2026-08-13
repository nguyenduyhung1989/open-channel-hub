import { toZaloOaWebhookIdentity } from '@open-channel-hub/connector-zalo-oa';
import type { FastifyInstance } from 'fastify';

import { apiFailure } from '../http/api-response.js';
import { parseRawJson, toRawUtf8Json } from '../http/raw-json.js';

import type { ZaloOaFeatureCatalog } from './zalo-oa-feature-catalog.js';
import { matchesZaloOaWebhookSignature } from './zalo-oa-signature.js';

/**
 * Registers a child Fastify scope so only Zalo OA's fixed webhook receives the
 * raw JSON Buffer needed by its signature scheme. Telegram and every other
 * JSON route retain Fastify's ordinary protected JSON parser.
 */
export const registerZaloOaWebhookRoute = async (
  app: FastifyInstance,
  catalog: ZaloOaFeatureCatalog
): Promise<void> => {
  app.register((webhookApp, _options, done) => {
    webhookApp.removeContentTypeParser('application/json');
    webhookApp.addContentTypeParser(
      /^application\/json(?:;|$)/i,
      { parseAs: 'buffer' },
      (_request, rawBody: Buffer, parseDone) => parseDone(null, rawBody)
    );

    webhookApp.post<{ Body: Buffer }>('/v1/webhooks/zalo-oa', async (request, reply) => {
      const rawJson = toRawUtf8Json(request.body);
      const rawEvent = rawJson === undefined ? undefined : parseRawJson(rawJson);
      const identity = toZaloOaWebhookIdentity(rawEvent);
      const feature =
        identity === undefined
          ? undefined
          : catalog.findByWebhookIdentity(identity.appId, identity.oaId);
      const header = request.headers['x-zevent-signature'];
      const signature = typeof header === 'string' ? header : undefined;

      if (
        rawJson === undefined ||
        identity === undefined ||
        feature === undefined ||
        !matchesZaloOaWebhookSignature({
          appId: identity.appId,
          oaSecretKey: feature.oaSecretKey,
          rawJson,
          signature,
          timestamp: identity.timestamp
        })
      ) {
        return reply
          .code(401)
          .send(apiFailure('unauthorized', 'The webhook credential is invalid.'));
      }

      const events = feature.normalize(rawEvent);

      if (events.length > 0) {
        await feature.receiveEvents(events);
      }

      return reply.code(200).send();
    });

    done();
  });
};

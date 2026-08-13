import { buildApp } from './app.js';
import { EnvironmentConfigurationError, parseEnvironment } from './config/environment.js';
import { loadRuntimeConnections } from './connections/load-runtime-connections.js';
import { createFacebookPageFeature } from './facebook-page/create-facebook-page-feature.js';
import { toFacebookPageConnectionConfigurations } from './facebook-page/facebook-page-connection-configurations.js';
import { createRuntimeInboxFeatures } from './inbox/create-runtime-inbox-features.js';
import type { InboxFeature } from './inbox/inbox-feature.js';
import { createTelegramBotFeature } from './telegram-bot/create-telegram-bot-feature.js';
import {
  loadTelegramBotConnectionConfigurations,
  toTelegramBotConnectionConfigurations
} from './telegram-bot/telegram-bot-connection-configurations.js';
import { createZaloOaFeature } from './zalo-oa/create-zalo-oa-feature.js';
import { toZaloOaConnectionConfigurations } from './zalo-oa/zalo-oa-connection-configurations.js';
import { createWhatsAppBusinessFeature } from './whatsapp-business/create-whatsapp-business-feature.js';
import { toWhatsAppBusinessConnectionConfigurations } from './whatsapp-business/whatsapp-business-connection-configurations.js';
import { createPostgresDatabase } from '@open-channel-hub/storage-postgres';

const environment = parseEnvironment(process.env);
const postgres =
  environment.postgres === undefined
    ? undefined
    : await createPostgresDatabase(environment.postgres);

try {
  if (postgres !== undefined) {
    await postgres.checkReadiness();
  }

  let telegramBot: Awaited<ReturnType<typeof createTelegramBotFeature>> | undefined;
  let telegramBots: readonly Awaited<ReturnType<typeof createTelegramBotFeature>>[] | undefined;
  let zaloOas: readonly Awaited<ReturnType<typeof createZaloOaFeature>>[] | undefined;
  let facebookPages: readonly Awaited<ReturnType<typeof createFacebookPageFeature>>[] | undefined;
  let whatsappBusinesses:
    readonly Awaited<ReturnType<typeof createWhatsAppBusinessFeature>>[] | undefined;
  let inboxes: readonly InboxFeature[] | undefined;

  if (environment.connectorRuntime.enabled) {
    const inboundEventReader = postgres?.inboundEventReader;
    const inboundEventStore = postgres?.inboundEventStore;
    const connectionRegistry = postgres?.connectionRegistry;

    if (
      inboundEventReader === undefined ||
      inboundEventStore === undefined ||
      connectionRegistry === undefined
    ) {
      throw new EnvironmentConfigurationError();
    }

    const configuredConnectionConfiguration = await loadRuntimeConnections(
      environment.connectorRuntime
    );
    const configuredConnections = configuredConnectionConfiguration?.connections;
    const configuredInboxes = configuredConnectionConfiguration?.inboxes;
    const telegramConnections =
      configuredConnections === undefined
        ? await loadTelegramBotConnectionConfigurations(environment.connectorRuntime)
        : toTelegramBotConnectionConfigurations(configuredConnections);
    const zaloOaConnections =
      configuredConnections === undefined
        ? Object.freeze([])
        : toZaloOaConnectionConfigurations(configuredConnections);
    const facebookPageConnections =
      configuredConnections === undefined
        ? Object.freeze([])
        : toFacebookPageConnectionConfigurations(configuredConnections);
    const whatsappBusinessConnections =
      configuredConnections === undefined
        ? Object.freeze([])
        : toWhatsAppBusinessConnectionConfigurations(configuredConnections);
    const [telegramFeatures, zaloOaFeatures, facebookPageFeatures, whatsappBusinessFeatures] =
      await Promise.all([
        Promise.all(
          telegramConnections.map(async (connection) =>
            createTelegramBotFeature(connection, {
              readInboundEvents: async (input) => inboundEventReader.list(input),
              receiveEvents: async (events) => {
                await inboundEventStore.append(events);
              }
            })
          )
        ),
        Promise.all(
          zaloOaConnections.map(async (connection) =>
            createZaloOaFeature(connection, {
              readInboundEvents: async (input) => inboundEventReader.list(input),
              receiveEvents: async (events) => {
                await inboundEventStore.append(events);
              }
            })
          )
        ),
        Promise.all(
          facebookPageConnections.map(async (connection) =>
            createFacebookPageFeature(connection, {
              readInboundEvents: async (input) => inboundEventReader.list(input),
              receiveEvents: async (events) => {
                await inboundEventStore.append(events);
              }
            })
          )
        ),
        Promise.all(
          whatsappBusinessConnections.map(async (connection) =>
            createWhatsAppBusinessFeature(connection, {
              readInboundEvents: async (input) => inboundEventReader.list(input),
              receiveEvents: async (events) => {
                await inboundEventStore.append(events);
              }
            })
          )
        )
      ]);

    await connectionRegistry.ensureRegistered([
      ...telegramFeatures.map((feature) => feature.registration),
      ...zaloOaFeatures.map((feature) => feature.registration),
      ...facebookPageFeatures.map((feature) => feature.registration),
      ...whatsappBusinessFeatures.map((feature) => feature.registration)
    ]);

    if (configuredConnections !== undefined) {
      if (telegramFeatures.length > 0) {
        telegramBots = Object.freeze(telegramFeatures);
      }

      if (zaloOaFeatures.length > 0) {
        zaloOas = Object.freeze(zaloOaFeatures);
      }

      if (facebookPageFeatures.length > 0) {
        facebookPages = Object.freeze(facebookPageFeatures);
      }

      if (whatsappBusinessFeatures.length > 0) {
        whatsappBusinesses = Object.freeze(whatsappBusinessFeatures);
      }

      if (configuredInboxes !== undefined) {
        const inboundEventFeedReader = postgres?.inboundEventFeedReader;

        if (inboundEventFeedReader === undefined) {
          throw new EnvironmentConfigurationError();
        }

        inboxes = createRuntimeInboxFeatures(configuredInboxes, inboundEventFeedReader);
      }
    } else {
      const feature = telegramFeatures[0];

      if (feature === undefined) {
        throw new EnvironmentConfigurationError();
      }

      telegramBot = feature;
    }
  }
  const app = await buildApp({
    ...(postgres === undefined
      ? {}
      : {
          readiness: Object.freeze({
            check: async (): Promise<void> => postgres.checkReadiness()
          })
        }),
    sourceOfferUrl: environment.sourceOfferUrl,
    ...(telegramBot === undefined ? {} : { telegramBot }),
    ...(telegramBots === undefined ? {} : { telegramBots }),
    ...(zaloOas === undefined ? {} : { zaloOas }),
    ...(facebookPages === undefined ? {} : { facebookPages }),
    ...(inboxes === undefined ? {} : { inboxes }),
    ...(whatsappBusinesses === undefined ? {} : { whatsappBusinesses })
  });

  if (postgres !== undefined) {
    app.addHook('onClose', async (): Promise<void> => postgres.close());
  }

  const close = async (): Promise<void> => {
    await app.close();
  };

  process.once('SIGINT', () => {
    void close();
  });
  process.once('SIGTERM', () => {
    void close();
  });

  await app.listen({ host: environment.HOST, port: environment.PORT });
} catch (error) {
  await postgres?.close();
  throw error;
}

import { buildApp } from './app.js';
import { EnvironmentConfigurationError, parseEnvironment } from './config/environment.js';
import { createTelegramBotFeature } from './telegram-bot/create-telegram-bot-feature.js';
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

  if (environment.telegramBot.enabled) {
    const inboundEventReader = postgres?.inboundEventReader;
    const inboundEventStore = postgres?.inboundEventStore;

    if (inboundEventReader === undefined || inboundEventStore === undefined) {
      throw new EnvironmentConfigurationError();
    }

    telegramBot = await createTelegramBotFeature(environment.telegramBot, {
      readInboundEvents: async (input) => inboundEventReader.list(input),
      receiveEvents: async (events) => {
        await inboundEventStore.append(events);
      }
    });
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
    ...(telegramBot === undefined ? {} : { telegramBot })
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

import { buildApp } from './app.js';
import { parseEnvironment } from './config/environment.js';
import { createTelegramBotFeature } from './telegram-bot/create-telegram-bot-feature.js';

const environment = parseEnvironment(process.env);
const telegramBot = environment.telegramBot.enabled
  ? await createTelegramBotFeature(environment.telegramBot)
  : undefined;
const app = await buildApp({
  sourceOfferUrl: environment.sourceOfferUrl,
  ...(telegramBot === undefined ? {} : { telegramBot })
});

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

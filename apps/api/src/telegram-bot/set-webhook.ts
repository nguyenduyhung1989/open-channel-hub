import { TelegramHttpBotGateway } from '@open-channel-hub/connector-telegram';

import { parseEnvironment } from '../config/environment.js';

const environment = parseEnvironment(process.env);

if (!environment.telegramBot.enabled || environment.telegramBot.webhookUrl === undefined) {
  process.stderr.write(
    'Telegram webhook setup requires TELEGRAM_BOT_ENABLED=true and TELEGRAM_WEBHOOK_URL=https://... .\n'
  );
  process.exitCode = 1;
} else {
  try {
    const gateway = new TelegramHttpBotGateway({
      botToken: environment.telegramBot.botToken,
      connectionId: environment.telegramBot.connectionId
    });

    await gateway.setWebhook({
      secretToken: environment.telegramBot.webhookSecret,
      url: new URL(environment.telegramBot.webhookUrl)
    });
    process.stdout.write('Telegram webhook configuration was accepted.\n');
  } catch {
    process.stderr.write('Telegram webhook configuration failed. Check the documented setup.\n');
    process.exitCode = 1;
  }
}

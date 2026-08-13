import { TelegramHttpBotGateway } from '@open-channel-hub/connector-telegram';

import { parseEnvironment } from '../config/environment.js';
import { loadTelegramBotConnectionConfigurations } from './telegram-bot-connection-configurations.js';

try {
  const environment = parseEnvironment(process.env);
  const connections = await loadTelegramBotConnectionConfigurations(environment.telegramBot);
  const webhookConnections = connections.filter(
    (connection): connection is typeof connection & Readonly<{ webhookUrl: string }> =>
      connection.webhookUrl !== undefined
  );

  if (webhookConnections.length === 0) {
    throw new Error('No Telegram webhook URL is configured.');
  }

  for (const connection of webhookConnections) {
    const gateway = new TelegramHttpBotGateway({
      botToken: connection.botToken,
      connectionId: connection.connectionId
    });

    await gateway.setWebhook({
      secretToken: connection.webhookSecret,
      url: new URL(connection.webhookUrl)
    });
  }

  process.stdout.write('Telegram webhook configuration was accepted.\n');
} catch {
  process.stderr.write('Telegram webhook configuration failed. Check the documented setup.\n');
  process.exitCode = 1;
}

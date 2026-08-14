import type {
  CanonicalEvent,
  ConnectionState,
  ConnectorCapability,
  ConnectorManifest,
  ProviderCommand,
  ProviderReceipt
} from '@open-channel-hub/contracts';
import { ConnectorProviderError, type ConnectorAdapter } from '@open-channel-hub/connector-sdk';

import { TelegramBotCommandRejectedError } from './telegram-bot-command-rejected-error.js';
import { toTelegramTextUpdate, type TelegramBotGateway } from './telegram-types.js';

const TELEGRAM_BOT_CHANNEL = 'telegram_bot' as const;
const TEXT_SEND_CAPABILITY = 'message.send.text' as const;

const telegramCapabilities = toCapabilitySnapshot([
  { id: 'message.receive.text' },
  { id: TEXT_SEND_CAPABILITY }
]);

const telegramManifest: ConnectorManifest = {
  capabilities: telegramCapabilities,
  channel: TELEGRAM_BOT_CHANNEL,
  displayName: 'Telegram Bot',
  id: 'telegram-bot',
  tier: 'OFFICIAL'
};

export interface TelegramBotConnectorOptions {
  readonly capabilities?: readonly ConnectorCapability[];
  readonly connectionId: string;
  readonly gateway: TelegramBotGateway;
}

/**
 * Official Telegram Bot API adapter. Credential storage and HTTP transport stay
 * outside this package behind TelegramBotGateway, so this adapter cannot leak
 * tokens or attempt unofficial automation.
 */
export class TelegramBotConnectorAdapter implements ConnectorAdapter {
  readonly #capabilities: readonly ConnectorCapability[];
  readonly #connectionId: string;
  readonly #gateway: TelegramBotGateway;
  #status: ConnectionState['status'] = 'connected';

  constructor(options: TelegramBotConnectorOptions) {
    this.#capabilities =
      options.capabilities === undefined
        ? telegramCapabilities
        : toCapabilitySnapshot(options.capabilities);
    this.#connectionId = options.connectionId;
    this.#gateway = options.gateway;
  }

  manifest(): ConnectorManifest {
    return telegramManifest;
  }

  async connect(): Promise<ConnectionState> {
    this.#status = 'connected';
    return this.connectionState();
  }

  async disconnect(): Promise<ConnectionState> {
    this.#status = 'disconnected';
    return this.connectionState();
  }

  async health(): Promise<ConnectionState> {
    return this.connectionState();
  }

  capabilities(): readonly ConnectorCapability[] {
    return this.#capabilities;
  }

  async execute(command: ProviderCommand): Promise<ProviderReceipt> {
    this.assertCommandCanExecute(command);

    try {
      return await this.#gateway.sendMessage({
        chatId: command.recipientId,
        text: command.text
      });
    } catch (cause) {
      if (cause instanceof ConnectorProviderError) {
        throw cause;
      }

      throw new ConnectorProviderError({
        cause,
        channel: TELEGRAM_BOT_CHANNEL,
        operation: 'telegram.sendMessage'
      });
    }
  }

  normalize(rawEvent: unknown): readonly CanonicalEvent[] {
    const update = toTelegramTextUpdate(rawEvent);

    if (update?.message === undefined) {
      return [];
    }

    const { message } = update;

    return [
      {
        channel: TELEGRAM_BOT_CHANNEL,
        connectionId: this.#connectionId,
        id: `telegram:event:${update.update_id}`,
        message: {
          conversationId: String(message.chat.id),
          id: String(message.message_id),
          senderId: String(message.from?.id ?? message.chat.id),
          text: message.text
        },
        occurredAt: new Date(message.date * 1000).toISOString(),
        providerEventId: String(update.update_id),
        telegramChatType: message.chat.type,
        type: 'message.received'
      }
    ];
  }

  private connectionState(): ConnectionState {
    return {
      capabilities: this.#capabilities,
      channel: TELEGRAM_BOT_CHANNEL,
      connectorId: telegramManifest.id,
      id: this.#connectionId,
      status: this.#status
    };
  }

  private assertCommandCanExecute(command: ProviderCommand): void {
    if (command.connectionId !== this.#connectionId) {
      throw new TelegramBotCommandRejectedError({
        code: 'connection_mismatch',
        configuredConnectionId: this.#connectionId,
        requestedConnectionId: command.connectionId
      });
    }

    if (this.#status !== 'connected') {
      throw new TelegramBotCommandRejectedError({
        code: 'connection_unavailable',
        connectionId: this.#connectionId
      });
    }

    if (!this.#capabilities.some((capability) => capability.id === TEXT_SEND_CAPABILITY)) {
      throw new TelegramBotCommandRejectedError({
        capability: TEXT_SEND_CAPABILITY,
        code: 'unsupported_capability'
      });
    }
  }
}

function toCapabilitySnapshot(
  capabilities: readonly ConnectorCapability[]
): readonly ConnectorCapability[] {
  return Object.freeze(capabilities.map((capability) => Object.freeze({ id: capability.id })));
}

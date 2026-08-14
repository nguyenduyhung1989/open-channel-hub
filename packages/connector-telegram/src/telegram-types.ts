import {
  TELEGRAM_CHAT_TYPES,
  type ProviderReceipt,
  type TelegramChatType
} from '@open-channel-hub/contracts';

/**
 * The only provider port this first vertical slice needs. Implementations own
 * the HTTP client and keep credentials private from connector callers.
 */
export interface TelegramBotGateway {
  sendMessage(input: TelegramSendTextMessage): Promise<ProviderReceipt>;
}

export interface TelegramSendTextMessage {
  readonly chatId: number | string;
  readonly text: string;
}

interface TelegramChat {
  readonly id: number;
  readonly type: TelegramChatType;
}

interface TelegramUser {
  readonly id: number;
  readonly is_bot: boolean;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
}

export interface TelegramTextMessage {
  readonly chat: TelegramChat;
  readonly date: number;
  readonly from?: TelegramUser;
  readonly message_id: number;
  readonly text: string;
}

export interface TelegramUpdate {
  readonly update_id: number;
  readonly message?: TelegramTextMessage;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const MAX_JAVASCRIPT_DATE_SECONDS = Math.floor(8_640_000_000_000_000 / 1_000);

/**
 * Telegram sends many update kinds. This narrow boundary accepts only ordinary
 * text messages and deliberately ignores the rest of the update surface.
 */
export const toTelegramTextUpdate = (value: unknown): TelegramUpdate | undefined => {
  if (!isRecord(value) || !isSafeInteger(value.update_id) || !isRecord(value.message)) {
    return undefined;
  }

  const { message } = value;

  if (
    !isSafeInteger(message.message_id) ||
    !isUnixTimestampSeconds(message.date) ||
    typeof message.text !== 'string' ||
    !isRecord(message.chat) ||
    !isSafeInteger(message.chat.id) ||
    !isTelegramChatType(message.chat.type)
  ) {
    return undefined;
  }

  const from = toTelegramUser(message.from);

  return {
    update_id: value.update_id,
    message: {
      chat: {
        id: message.chat.id,
        type: message.chat.type
      },
      date: message.date,
      ...(from === undefined ? {} : { from }),
      message_id: message.message_id,
      text: message.text
    }
  };
};

const toTelegramUser = (value: unknown): TelegramUser | undefined => {
  if (
    !isRecord(value) ||
    !isSafeInteger(value.id) ||
    typeof value.is_bot !== 'boolean' ||
    typeof value.first_name !== 'string'
  ) {
    return undefined;
  }

  return {
    first_name: value.first_name,
    id: value.id,
    is_bot: value.is_bot,
    ...(typeof value.last_name === 'string' ? { last_name: value.last_name } : {}),
    ...(typeof value.username === 'string' ? { username: value.username } : {})
  };
};

const isSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

const isUnixTimestampSeconds = (value: unknown): value is number =>
  isSafeInteger(value) && value >= 0 && value <= MAX_JAVASCRIPT_DATE_SECONDS;

const isTelegramChatType = (value: unknown): value is TelegramChatType =>
  typeof value === 'string' && (TELEGRAM_CHAT_TYPES as readonly string[]).includes(value);

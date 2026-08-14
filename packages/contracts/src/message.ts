import type { Channel } from './connector.js';

/**
 * The only Telegram chat kinds that the official Bot API can attach to an
 * ordinary message. This is internal durable eligibility evidence; HTTP
 * readers deliberately do not serialize it to operators or browsers.
 */
export const TELEGRAM_CHAT_TYPES = Object.freeze([
  'private',
  'group',
  'supergroup',
  'channel'
] as const);

export type TelegramChatType = (typeof TELEGRAM_CHAT_TYPES)[number];

/** The only provider command supported by the Phase 0 core. */
export interface SendTextProviderCommand {
  readonly type: 'message.send.text';
  readonly connectionId: string;
  readonly recipientId: string;
  readonly text: string;
}

export type ProviderCommand = SendTextProviderCommand;

/** A deliberately small provider acknowledgement with no raw provider payload. */
export interface ProviderReceipt {
  readonly connectionId: string;
  readonly providerMessageId: string;
  readonly acceptedAt: string;
}

/**
 * The minimum canonical inbound event. Connector adapters normalize provider webhooks
 * or polling updates into this form before application code sees them.
 */
export interface CanonicalEvent {
  readonly id: string;
  readonly providerEventId: string;
  readonly type: 'message.received';
  readonly connectionId: string;
  readonly channel: Channel;
  readonly occurredAt: string;
  /**
   * Present only for normalized Telegram Bot inbound events. It records the
   * provider-supplied source chat kind for server-side reply eligibility and
   * is intentionally absent from public event projections.
   */
  readonly telegramChatType?: TelegramChatType;
  readonly message: Readonly<{
    id: string;
    senderId: string;
    conversationId: string;
    text: string;
  }>;
}

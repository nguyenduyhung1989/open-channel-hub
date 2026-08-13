/**
 * The narrow subset of an official Zalo OA webhook that Phase 3a accepts.
 * Unknown provider fields are intentionally ignored so additive provider
 * changes do not make a valid text event fail closed at this boundary.
 */
export interface ZaloOaTextEvent {
  readonly appId: string;
  readonly messageId: string;
  readonly oaId: string;
  readonly senderId: string;
  readonly text: string;
  readonly timestamp: string;
}

/**
 * The provider fields that select one configured Zalo App and Official Account
 * before an ingress decides whether it supports a particular event type.
 */
export interface ZaloOaWebhookIdentity {
  readonly appId: string;
  readonly oaId: string;
  readonly timestamp: string;
}

const USER_SEND_TEXT_EVENT_NAME = 'user_send_text';
const MAX_PROVIDER_ID_LENGTH = 512;
const MAX_JAVASCRIPT_DATE_MILLISECONDS = '8640000000000000';
const UNIX_MILLISECONDS_PATTERN = /^\d{1,16}$/;
const ZALO_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;

/**
 * Strictly extracts the provider identity carried by any Zalo OA webhook.
 * Signature verification stays with the HTTP ingress that owns the original
 * raw request bytes. A valid but unsupported event can therefore be safely
 * identified and acknowledged without attempting message normalization.
 */
export const toZaloOaWebhookIdentity = (value: unknown): ZaloOaWebhookIdentity | undefined => {
  try {
    if (!isRecord(value)) {
      return undefined;
    }

    const appId = toZaloIdentifier(value.app_id);
    const recipient = isRecord(value.recipient) ? value.recipient : undefined;
    const oaId = recipient === undefined ? undefined : toZaloIdentifier(recipient.id);
    const timestamp = toUnixMilliseconds(value.timestamp);

    if (appId === undefined || oaId === undefined || timestamp === undefined) {
      return undefined;
    }

    return Object.freeze({ appId, oaId, timestamp });
  } catch {
    // Webhook data is untrusted. An unusual object must be ignored rather than
    // turn a provider retry into an application exception.
    return undefined;
  }
};

/**
 * Parses only Zalo OA's user_send_text webhook shape. This reuses the identity
 * boundary, then accepts the message-only fields needed for a canonical event.
 */
export const toZaloOaTextEvent = (value: unknown): ZaloOaTextEvent | undefined => {
  try {
    if (!isRecord(value) || value.event_name !== USER_SEND_TEXT_EVENT_NAME) {
      return undefined;
    }

    const identity = toZaloOaWebhookIdentity(value);
    const sender = isRecord(value.sender) ? value.sender : undefined;
    const message = isRecord(value.message) ? value.message : undefined;
    const senderId = sender === undefined ? undefined : toProviderId(sender.id);
    const messageId = message === undefined ? undefined : toProviderId(message.msg_id);
    const text = message === undefined ? undefined : toText(message.text);

    if (
      identity === undefined ||
      senderId === undefined ||
      messageId === undefined ||
      text === undefined
    ) {
      return undefined;
    }

    return Object.freeze({ ...identity, messageId, senderId, text });
  } catch {
    // Webhook data is untrusted. An unusual object must be ignored rather than
    // turn a provider retry into an application exception.
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toProviderId = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_PROVIDER_ID_LENGTH &&
  value.trim() === value
    ? value
    : undefined;

const toZaloIdentifier = (value: unknown): string | undefined =>
  typeof value === 'string' && ZALO_IDENTIFIER_PATTERN.test(value) ? value : undefined;

const toText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toUnixMilliseconds = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !UNIX_MILLISECONDS_PATTERN.test(value)) {
    return undefined;
  }

  if (
    value.length === MAX_JAVASCRIPT_DATE_MILLISECONDS.length &&
    value > MAX_JAVASCRIPT_DATE_MILLISECONDS
  ) {
    return undefined;
  }

  return value;
};

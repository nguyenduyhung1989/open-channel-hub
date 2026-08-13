/**
 * The narrow inbound text shape extracted from one official WhatsApp Business
 * Cloud API webhook item. The webhook carries WABA and phone-number identity,
 * but not the Meta App ID; HTTP ingress binds the selected WABA to its
 * configured App before it calls this adapter.
 */
export interface WhatsAppBusinessTextEvent {
  readonly messageId: string;
  readonly phoneNumberId: string;
  readonly senderId: string;
  readonly text: string;
  readonly timestamp: string;
  readonly wabaId: string;
}

const WHATSAPP_BUSINESS_ACCOUNT_OBJECT = 'whatsapp_business_account';
const MESSAGES_FIELD = 'messages';
const WHATSAPP_MESSAGING_PRODUCT = 'whatsapp';
const TEXT_MESSAGE_TYPE = 'text';
const MAX_JAVASCRIPT_DATE_SECONDS = '8640000000000';
const MAX_PROVIDER_ID_LENGTH = 512;
const UNIX_SECONDS_PATTERN = /^\d{1,13}$/;
const WHATSAPP_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;
const EMPTY_WABA_IDS: readonly string[] = Object.freeze([]);
const EMPTY_TEXT_EVENTS: readonly WhatsAppBusinessTextEvent[] = Object.freeze([]);

/**
 * Extracts unique WABA IDs from a complete untrusted WhatsApp webhook body.
 * The HTTP ingress uses this before HMAC validation to select candidate App
 * secrets. Candidate selection fails closed: one malformed entry invalidates
 * the batch so an ingress cannot validate only a convenient untrusted subset.
 */
export const toWhatsAppBusinessWebhookWabaIds = (value: unknown): readonly string[] => {
  try {
    if (!isRecord(value) || read(value, 'object') !== WHATSAPP_BUSINESS_ACCOUNT_OBJECT) {
      return EMPTY_WABA_IDS;
    }

    const entries = read(value, 'entry');

    if (!Array.isArray(entries)) {
      return EMPTY_WABA_IDS;
    }

    const wabaIds = new Set<string>();

    for (const entry of entries) {
      if (!isRecord(entry)) {
        return EMPTY_WABA_IDS;
      }

      const wabaId = toWhatsAppIdentifier(read(entry, 'id'));

      if (wabaId === undefined) {
        return EMPTY_WABA_IDS;
      }

      wabaIds.add(wabaId);
    }

    return wabaIds.size === 0 ? EMPTY_WABA_IDS : Object.freeze([...wabaIds]);
  } catch {
    // The body is untrusted. A throwing accessor must not turn verification
    // into an application exception or select a partial candidate set.
    return EMPTY_WABA_IDS;
  }
};

/**
 * Parses only incoming text messages from a full WhatsApp Business Cloud API
 * webhook. Statuses, non-message changes, non-text messages, and malformed
 * items are ignored. The adapter still binds WABA and phone-number identity to
 * its configured connection before it creates a canonical event.
 */
export const toWhatsAppBusinessTextEvents = (
  value: unknown
): readonly WhatsAppBusinessTextEvent[] => {
  try {
    if (!isRecord(value) || read(value, 'object') !== WHATSAPP_BUSINESS_ACCOUNT_OBJECT) {
      return EMPTY_TEXT_EVENTS;
    }

    const entries = read(value, 'entry');

    if (!Array.isArray(entries)) {
      return EMPTY_TEXT_EVENTS;
    }

    const textEvents: WhatsAppBusinessTextEvent[] = [];

    for (const entry of entries) {
      appendEntryTextEvents(entry, textEvents);
    }

    return textEvents.length === 0 ? EMPTY_TEXT_EVENTS : Object.freeze(textEvents);
  } catch {
    // Fail closed rather than turn unusual provider data into a retryable 5xx.
    return EMPTY_TEXT_EVENTS;
  }
};

const appendEntryTextEvents = (entry: unknown, textEvents: WhatsAppBusinessTextEvent[]): void => {
  try {
    if (!isRecord(entry)) {
      return;
    }

    const wabaId = toWhatsAppIdentifier(read(entry, 'id'));
    const changes = read(entry, 'changes');

    if (wabaId === undefined || !Array.isArray(changes)) {
      return;
    }

    for (const change of changes) {
      appendChangeTextEvents(change, wabaId, textEvents);
    }
  } catch {
    // Ignore one malformed WABA entry while preserving independent valid ones.
  }
};

const appendChangeTextEvents = (
  change: unknown,
  wabaId: string,
  textEvents: WhatsAppBusinessTextEvent[]
): void => {
  try {
    if (!isRecord(change) || read(change, 'field') !== MESSAGES_FIELD) {
      return;
    }

    const value = readRecord(change, 'value');

    if (value === undefined || read(value, 'messaging_product') !== WHATSAPP_MESSAGING_PRODUCT) {
      return;
    }

    const metadata = readRecord(value, 'metadata');
    const messages = read(value, 'messages');
    const phoneNumberId =
      metadata === undefined ? undefined : toWhatsAppIdentifier(read(metadata, 'phone_number_id'));

    if (phoneNumberId === undefined || !Array.isArray(messages)) {
      return;
    }

    for (const message of messages) {
      const textEvent = toWhatsAppBusinessTextEvent(message, wabaId, phoneNumberId);

      if (textEvent !== undefined) {
        textEvents.push(textEvent);
      }
    }
  } catch {
    // Ignore one malformed change while preserving independent valid changes.
  }
};

const toWhatsAppBusinessTextEvent = (
  value: unknown,
  wabaId: string,
  phoneNumberId: string
): WhatsAppBusinessTextEvent | undefined => {
  try {
    if (!isRecord(value) || read(value, 'type') !== TEXT_MESSAGE_TYPE) {
      return undefined;
    }

    const text = readRecord(value, 'text');
    const senderId = toProviderId(read(value, 'from'));
    const messageId = toProviderId(read(value, 'id'));
    const timestamp = toUnixSeconds(read(value, 'timestamp'));
    const body = text === undefined ? undefined : toText(read(text, 'body'));

    if (
      senderId === undefined ||
      messageId === undefined ||
      timestamp === undefined ||
      body === undefined
    ) {
      return undefined;
    }

    return Object.freeze({
      messageId,
      phoneNumberId,
      senderId,
      text: body,
      timestamp,
      wabaId
    });
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const read = (value: Record<string, unknown>, property: string): unknown => value[property];

const readRecord = (
  value: Record<string, unknown>,
  property: string
): Record<string, unknown> | undefined => {
  const candidate = read(value, property);
  return isRecord(candidate) ? candidate : undefined;
};

const toWhatsAppIdentifier = (value: unknown): string | undefined =>
  typeof value === 'string' && WHATSAPP_IDENTIFIER_PATTERN.test(value) ? value : undefined;

const toProviderId = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_PROVIDER_ID_LENGTH &&
  value.trim() === value
    ? value
    : undefined;

const toText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toUnixSeconds = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !UNIX_SECONDS_PATTERN.test(value)) {
    return undefined;
  }

  if (value.length === MAX_JAVASCRIPT_DATE_SECONDS.length && value > MAX_JAVASCRIPT_DATE_SECONDS) {
    return undefined;
  }

  return value;
};

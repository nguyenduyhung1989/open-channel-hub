/**
 * The narrow inbound text shape extracted from one Facebook Page messaging
 * item. Facebook does not include an App ID in this webhook envelope; the
 * HTTP ingress binds the selected Page to its configured App before calling
 * the adapter.
 */
export interface FacebookPageTextEvent {
  readonly messageId: string;
  readonly pageId: string;
  readonly senderId: string;
  readonly text: string;
  readonly timestamp: number;
}

const FACEBOOK_PAGE_OBJECT = 'page';
const MAX_JAVASCRIPT_DATE_MILLISECONDS = 8_640_000_000_000_000;
const MAX_PROVIDER_ID_LENGTH = 512;
const FACEBOOK_IDENTIFIER_PATTERN = /^[0-9]{1,32}$/;
const EMPTY_PAGE_IDS: readonly string[] = Object.freeze([]);
const EMPTY_TEXT_EVENTS: readonly FacebookPageTextEvent[] = Object.freeze([]);

/**
 * Extracts the unique Page IDs from a complete untrusted Page webhook body.
 * This is intentionally narrower than event normalization: an HTTP ingress
 * can use these IDs to find candidate HMAC secrets before examining messages.
 * Candidate selection fails closed: one malformed entry or Page ID invalidates
 * the full batch, so an ingress never verifies only a convenient subset of an
 * untrusted multi-Page request. It never lets hostile getters escape.
 */
export const toFacebookPageWebhookPageIds = (value: unknown): readonly string[] => {
  try {
    if (!isRecord(value) || read(value, 'object') !== FACEBOOK_PAGE_OBJECT) {
      return EMPTY_PAGE_IDS;
    }

    const entries = read(value, 'entry');

    if (!Array.isArray(entries)) {
      return EMPTY_PAGE_IDS;
    }

    const pageIds = new Set<string>();

    for (const entry of entries) {
      if (!isRecord(entry)) {
        return EMPTY_PAGE_IDS;
      }

      const pageId = toFacebookIdentifier(read(entry, 'id'));

      if (pageId === undefined) {
        return EMPTY_PAGE_IDS;
      }

      pageIds.add(pageId);
    }

    return pageIds.size === 0 ? EMPTY_PAGE_IDS : Object.freeze([...pageIds]);
  } catch {
    // The body is untrusted. A revoked proxy or throwing array getter must not
    // turn webhook verification into an application exception.
    return EMPTY_PAGE_IDS;
  }
};

/**
 * Parses only user-originated text messages from a full Facebook Page webhook
 * envelope. Delivery, read, postback, attachment-only, echo, and malformed
 * items are ignored. Each extracted item has matching entry and recipient
 * Page IDs; the adapter still binds that Page to its configured connection.
 */
export const toFacebookPageTextEvents = (value: unknown): readonly FacebookPageTextEvent[] => {
  try {
    if (!isRecord(value) || read(value, 'object') !== FACEBOOK_PAGE_OBJECT) {
      return EMPTY_TEXT_EVENTS;
    }

    const entries = read(value, 'entry');

    if (!Array.isArray(entries)) {
      return EMPTY_TEXT_EVENTS;
    }

    const textEvents: FacebookPageTextEvent[] = [];

    for (const entry of entries) {
      appendEntryTextEvents(entry, textEvents);
    }

    return textEvents.length === 0 ? EMPTY_TEXT_EVENTS : Object.freeze(textEvents);
  } catch {
    // Webhook data is untrusted. Fail closed rather than trigger a provider
    // retry from an unusual object or accessor.
    return EMPTY_TEXT_EVENTS;
  }
};

const appendEntryTextEvents = (entry: unknown, textEvents: FacebookPageTextEvent[]): void => {
  try {
    if (!isRecord(entry)) {
      return;
    }

    const pageId = toFacebookIdentifier(read(entry, 'id'));
    const messaging = read(entry, 'messaging');

    if (pageId === undefined || !Array.isArray(messaging)) {
      return;
    }

    for (const item of messaging) {
      const textEvent = toFacebookPageTextEvent(item, pageId);

      if (textEvent !== undefined) {
        textEvents.push(textEvent);
      }
    }
  } catch {
    // Ignore one broken entry so a well-formed independent Page entry in the
    // same webhook batch can still be handled.
  }
};

const toFacebookPageTextEvent = (
  value: unknown,
  pageId: string
): FacebookPageTextEvent | undefined => {
  try {
    if (!isRecord(value)) {
      return undefined;
    }

    const recipient = readRecord(value, 'recipient');
    const sender = readRecord(value, 'sender');
    const message = readRecord(value, 'message');

    if (recipient === undefined || sender === undefined || message === undefined) {
      return undefined;
    }

    const recipientId = toFacebookIdentifier(read(recipient, 'id'));
    const senderId = toProviderId(read(sender, 'id'));
    const messageId = toProviderId(read(message, 'mid'));
    const text = toText(read(message, 'text'));
    const timestamp = toUnixMilliseconds(read(value, 'timestamp'));

    if (
      recipientId !== pageId ||
      senderId === undefined ||
      messageId === undefined ||
      text === undefined ||
      timestamp === undefined ||
      read(message, 'is_echo') === true
    ) {
      return undefined;
    }

    return Object.freeze({ messageId, pageId, senderId, text, timestamp });
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

const toFacebookIdentifier = (value: unknown): string | undefined =>
  typeof value === 'string' && FACEBOOK_IDENTIFIER_PATTERN.test(value) ? value : undefined;

const toProviderId = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_PROVIDER_ID_LENGTH &&
  value.trim() === value
    ? value
    : undefined;

const toText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toUnixMilliseconds = (value: unknown): number | undefined =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= MAX_JAVASCRIPT_DATE_MILLISECONDS
    ? value
    : undefined;

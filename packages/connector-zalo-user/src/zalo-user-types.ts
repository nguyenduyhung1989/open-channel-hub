import { ZALO_USER_THREAD_TYPES, type ZaloUserThreadType } from '@open-channel-hub/contracts';

const MAXIMUM_PROVIDER_ID_LENGTH = 512;
const MAXIMUM_TEXT_LENGTH = 16_384;
const ZALO_ACCOUNT_ID_PATTERN = /^[0-9]{1,32}$/;
const ISO_UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const hasAsciiControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.charCodeAt(0);

    return codePoint <= 0x1f || codePoint === 0x7f;
  });

/**
 * Sanitized, bridge-to-hub payload. The bridge must not forward cookies,
 * IMEI, user agents, raw Zalo Web objects, or attachment URLs.
 */
export interface ZaloUserInboundTextEvent {
  readonly accountId: string;
  readonly conversationId: string;
  readonly occurredAt: string;
  readonly providerEventId: string;
  readonly senderId: string;
  readonly text: string;
  readonly threadType: ZaloUserThreadType;
}

/**
 * Parses only the deliberately small sanitized event contract. Unknown input
 * is ignored: provider objects and HTTP bodies are untrusted at this edge.
 */
export const toZaloUserInboundTextEvent = (
  value: unknown
): ZaloUserInboundTextEvent | undefined => {
  try {
    if (!isRecord(value)) {
      return undefined;
    }

    const accountId = toAccountId(value.accountId);
    const conversationId = toProviderId(value.conversationId);
    const occurredAt = toCanonicalOccurredAt(value.occurredAt);
    const providerEventId = toProviderId(value.providerEventId);
    const senderId = toProviderId(value.senderId);
    const text = toText(value.text);
    const threadType = toThreadType(value.threadType);

    if (
      accountId === undefined ||
      conversationId === undefined ||
      occurredAt === undefined ||
      providerEventId === undefined ||
      senderId === undefined ||
      text === undefined ||
      threadType === undefined
    ) {
      return undefined;
    }

    return Object.freeze({
      accountId,
      conversationId,
      occurredAt,
      providerEventId,
      senderId,
      text,
      threadType
    });
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toAccountId = (value: unknown): string | undefined =>
  typeof value === 'string' && ZALO_ACCOUNT_ID_PATTERN.test(value) ? value : undefined;

const toProviderId = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAXIMUM_PROVIDER_ID_LENGTH &&
  value.trim() === value &&
  !hasAsciiControlCharacter(value)
    ? value
    : undefined;

const toCanonicalOccurredAt = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !ISO_UTC_MILLISECOND_PATTERN.test(value)) {
    return undefined;
  }

  const occurredAt = new Date(value);

  return !Number.isNaN(occurredAt.getTime()) && occurredAt.toISOString() === value
    ? value
    : undefined;
};

const toText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= MAXIMUM_TEXT_LENGTH
    ? value
    : undefined;

const toThreadType = (value: unknown): ZaloUserThreadType | undefined =>
  typeof value === 'string' && (ZALO_USER_THREAD_TYPES as readonly string[]).includes(value)
    ? (value as ZaloUserThreadType)
    : undefined;

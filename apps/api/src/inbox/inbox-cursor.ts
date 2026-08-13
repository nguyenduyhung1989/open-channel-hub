import { createHash } from 'node:crypto';

import type { InboundEventPageCursor } from '@open-channel-hub/domain';
import { z } from 'zod';

const CURRENT_ORDER_VERSION = 2;
const MAX_POSTGRES_BIGINT = '9223372036854775807';
const MAX_CURSOR_LENGTH = 512;
const scopeHashSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const identifierSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const sequenceSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);
const pageCursorSchema = z
  .object({
    beforeSequence: sequenceSchema,
    inboxId: identifierSchema,
    orderVersion: z.literal(CURRENT_ORDER_VERSION),
    scopeHash: scopeHashSchema,
    snapshotMaxSequence: sequenceSchema
  })
  .strict();

/** The server-selected information that binds an opaque inbox page cursor. */
export interface InboxCursorScope {
  readonly connectionIds: readonly string[];
  readonly id: string;
}

/** Decodes a current cursor only when it belongs to the exact configured scope. */
export const decodeInboxCursor = (
  value: string | undefined,
  scope: InboxCursorScope
): InboundEventPageCursor | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  try {
    const encoded = Buffer.from(value, 'base64url');

    if (encoded.toString('base64url') !== value) {
      return null;
    }

    const parsed = pageCursorSchema.safeParse(JSON.parse(encoded.toString('utf8')));

    return parsed.success &&
      parsed.data.inboxId === scope.id &&
      parsed.data.scopeHash === scopeHashFor(scope.connectionIds) &&
      isValidCursor(parsed.data)
      ? Object.freeze({
          beforeSequence: parsed.data.beforeSequence,
          snapshotMaxSequence: parsed.data.snapshotMaxSequence
        })
      : null;
  } catch {
    return null;
  }
};

/** Encodes the only cursor version supported by the current durable ledger order. */
export const encodeInboxCursor = (
  cursor: InboundEventPageCursor,
  scope: InboxCursorScope
): string => {
  const parsed = pageCursorSchema.safeParse({
    ...cursor,
    inboxId: scope.id,
    orderVersion: CURRENT_ORDER_VERSION,
    scopeHash: scopeHashFor(scope.connectionIds)
  });

  if (!parsed.success || !isValidCursor(parsed.data)) {
    throw new Error('The inbox reader returned an invalid cursor.');
  }

  return Buffer.from(JSON.stringify(parsed.data), 'utf8').toString('base64url');
};

/**
 * The configuration loader canonicalizes connection identifiers in ascending
 * order. Newlines cannot occur in an identifier, so this is an unambiguous
 * stable representation of the effective connection set.
 */
const scopeHashFor = (connectionIds: readonly string[]): string =>
  createHash('sha256').update(connectionIds.join('\n'), 'utf8').digest('base64url');

const isValidCursor = (cursor: InboundEventPageCursor): boolean =>
  isPositivePostgresBigInt(cursor.beforeSequence) &&
  isPositivePostgresBigInt(cursor.snapshotMaxSequence) &&
  compareDecimalStrings(cursor.beforeSequence, cursor.snapshotMaxSequence) <= 0;

const isPositivePostgresBigInt = (value: string): boolean =>
  value.length < MAX_POSTGRES_BIGINT.length ||
  (value.length === MAX_POSTGRES_BIGINT.length && value <= MAX_POSTGRES_BIGINT);

const compareDecimalStrings = (left: string, right: string): number =>
  left.length === right.length ? left.localeCompare(right) : left.length - right.length;

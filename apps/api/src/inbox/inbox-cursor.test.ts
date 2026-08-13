import { describe, expect, it } from 'vitest';

import { decodeInboxCursor, encodeInboxCursor } from './inbox-cursor.js';

const SUPPORT_SCOPE = Object.freeze({
  connectionIds: Object.freeze(['facebook-page-support', 'telegram-bot-support']),
  id: 'support'
});

describe('inbox cursor codec', () => {
  it('round-trips a versioned cursor for its configured inbox scope', () => {
    const encoded = encodeInboxCursor(
      { beforeSequence: '8', snapshotMaxSequence: '12' },
      SUPPORT_SCOPE
    );

    expect(decodeInboxCursor(encoded, SUPPORT_SCOPE)).toEqual({
      beforeSequence: '8',
      snapshotMaxSequence: '12'
    });
  });

  it('rejects an unversioned cursor and a cursor from another inbox scope', () => {
    const versionedForSupport = encodeInboxCursor(
      { beforeSequence: '8', snapshotMaxSequence: '12' },
      SUPPORT_SCOPE
    );
    const unversioned = Buffer.from(
      JSON.stringify({
        beforeSequence: '8',
        inboxId: 'support',
        scopeHash: 'EHPpCW9Op4f5q3RcTtR5o4F2JuOtbV3pF94QvD9UNW0',
        snapshotMaxSequence: '12'
      }),
      'utf8'
    ).toString('base64url');

    expect(
      decodeInboxCursor(
        versionedForSupport,
        Object.freeze({ connectionIds: Object.freeze(['telegram-bot-sales']), id: 'sales' })
      )
    ).toBeNull();
    expect(decodeInboxCursor(unversioned, SUPPORT_SCOPE)).toBeNull();
  });

  it('refuses to encode a cursor that cannot safely represent PostgreSQL bigint ordering', () => {
    expect(() =>
      encodeInboxCursor({ beforeSequence: '13', snapshotMaxSequence: '12' }, SUPPORT_SCOPE)
    ).toThrow('invalid cursor');
  });
});

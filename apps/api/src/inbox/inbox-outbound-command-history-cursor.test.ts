import { describe, expect, it } from 'vitest';

import {
  decodeInboxOutboundCommandHistoryCursor,
  encodeInboxOutboundCommandHistoryCursor
} from './inbox-outbound-command-history-cursor.js';

const SUPPORT_SCOPE = Object.freeze({
  connectionIds: Object.freeze(['facebook-page-support', 'telegram-bot-support']),
  id: 'support'
});

describe('inbox outbound-command history cursor codec', () => {
  it('round-trips a version-1 cursor for the immutable inbox scope', () => {
    const encoded = encodeInboxOutboundCommandHistoryCursor(
      { beforeSequence: '8', snapshotMaxSequence: '12' },
      SUPPORT_SCOPE
    );

    expect(decodeInboxOutboundCommandHistoryCursor(encoded, SUPPORT_SCOPE)).toEqual({
      beforeSequence: '8',
      snapshotMaxSequence: '12'
    });
  });

  it('rejects unversioned, old-version, and foreign-scope cursors', () => {
    const versionedForSupport = encodeInboxOutboundCommandHistoryCursor(
      { beforeSequence: '8', snapshotMaxSequence: '12' },
      SUPPORT_SCOPE
    );
    const unversioned = encodeCursor({
      beforeSequence: '8',
      inboxId: 'support',
      scopeHash: 'EHPpCW9Op4f5q3RcTtR5o4F2JuOtbV3pF94QvD9UNW0',
      snapshotMaxSequence: '12'
    });
    const oldVersion = encodeCursor({
      beforeSequence: '8',
      inboxId: 'support',
      orderVersion: 2,
      scopeHash: 'EHPpCW9Op4f5q3RcTtR5o4F2JuOtbV3pF94QvD9UNW0',
      snapshotMaxSequence: '12'
    });

    expect(
      decodeInboxOutboundCommandHistoryCursor(
        versionedForSupport,
        Object.freeze({ connectionIds: Object.freeze(['telegram-bot-sales']), id: 'sales' })
      )
    ).toBeNull();
    expect(decodeInboxOutboundCommandHistoryCursor(unversioned, SUPPORT_SCOPE)).toBeNull();
    expect(decodeInboxOutboundCommandHistoryCursor(oldVersion, SUPPORT_SCOPE)).toBeNull();
  });

  it('refuses cursor positions that cannot safely represent PostgreSQL bigint ordering', () => {
    expect(() =>
      encodeInboxOutboundCommandHistoryCursor(
        { beforeSequence: '13', snapshotMaxSequence: '12' },
        SUPPORT_SCOPE
      )
    ).toThrow('invalid cursor');
  });
});

const encodeCursor = (value: object): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

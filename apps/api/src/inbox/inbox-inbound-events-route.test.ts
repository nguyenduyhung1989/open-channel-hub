import { createHash } from 'node:crypto';

import type { CanonicalEvent } from '@open-channel-hub/contracts';
import type {
  CreateOutboundReplyCommandResult,
  InboundEventPage,
  OutboundReplyCommandHistoryPage
} from '@open-channel-hub/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { InboxFeature } from './inbox-feature.js';

const SUPPORT_TOKEN = 'synthetic_inbox_support_token_01234567890123456789';
const SALES_TOKEN = 'synthetic_inbox_sales_token_01234567890123456789012';
const SUPPORT_CONNECTION_IDS = Object.freeze(['facebook-page-support', 'telegram-bot-support']);
const SALES_CONNECTION_IDS = Object.freeze(['telegram-bot-sales']);

const canonicalEvent = (connectionId = SUPPORT_CONNECTION_IDS[0]!): CanonicalEvent =>
  Object.freeze({
    channel: connectionId.startsWith('facebook') ? 'facebook_page' : 'telegram_bot',
    connectionId,
    id: `${connectionId}:event:synthetic-101`,
    message: Object.freeze({
      conversationId: 'synthetic-conversation-101',
      id: 'synthetic-message-101',
      senderId: 'synthetic-sender-101',
      text: 'Synthetic inbox message'
    }),
    occurredAt: '2026-08-13T00:00:00.000Z',
    providerEventId: 'synthetic-provider-event-101',
    type: 'message.received'
  });

describe('Inbox inbound-events route', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (app) => app.close()));
  });

  it('does not expose an inbox endpoint when no configured inbox exists', async () => {
    const app = await buildApp();
    applications.push(app);

    const response = await app.inject({ method: 'GET', url: '/v1/inbox/inbound-events' });

    expect(response.statusCode).toBe(404);
  });

  it('authenticates before query and cursor parsing', async () => {
    const { feature, readInboundEvents } = createFeature();
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);

    const response = await app.inject({
      method: 'GET',
      url: `/v1/inbox/inbound-events?cursor=${'a'.repeat(513)}&connectionId=telegram-bot-sales`
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'unauthorized', message: 'The inbox credential is invalid.' }
    });
    expect(readInboundEvents).not.toHaveBeenCalled();
  });

  it('returns only canonical events and asks the scoped feature for a page without a caller scope', async () => {
    const { feature, readInboundEvents } = createFeature({
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({
        events: [canonicalEvent(), canonicalEvent(SUPPORT_CONNECTION_IDS[1])],
        nextCursor: Object.freeze({ beforeSequence: '8', snapshotMaxSequence: '12' })
      }))
    });
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);

    const firstPage = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
      method: 'GET',
      url: '/v1/inbox/inbound-events?limit=2'
    });

    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.json()).toEqual({
      success: true,
      data: {
        events: [canonicalEvent(), canonicalEvent(SUPPORT_CONNECTION_IDS[1])],
        nextCursor: expect.any(String)
      }
    });
    expect(readInboundEvents).toHaveBeenCalledWith({ pageSize: 2 });

    const cursor = firstPage.json().data.nextCursor as string;
    expect(decodeCursor(cursor)).toEqual({
      beforeSequence: '8',
      inboxId: 'support',
      orderVersion: 2,
      scopeHash: scopeHashFor(SUPPORT_CONNECTION_IDS),
      snapshotMaxSequence: '12'
    });

    const continuation = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
      method: 'GET',
      url: `/v1/inbox/inbound-events?cursor=${cursor}`
    });

    expect(continuation.statusCode).toBe(200);
    expect(readInboundEvents).toHaveBeenLastCalledWith({
      cursor: { beforeSequence: '8', snapshotMaxSequence: '12' },
      pageSize: 50
    });
  });

  it('does not project internal Telegram chat evidence through the aggregate inbox API', async () => {
    const telegramEvent = Object.freeze({
      ...canonicalEvent(SUPPORT_CONNECTION_IDS[1]),
      telegramChatType: 'private' as const
    });
    const { feature } = createFeature({
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [telegramEvent] }))
    });
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
      method: 'GET',
      url: '/v1/inbox/inbound-events'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: { events: [canonicalEvent(SUPPORT_CONNECTION_IDS[1])] }
    });
    expect(response.body).not.toContain('telegramChatType');
  });

  it('rejects a cursor issued to another inbox, a changed scope, and an unversioned shape', async () => {
    const support = createFeature({
      readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({
        events: [],
        nextCursor: { beforeSequence: '4', snapshotMaxSequence: '9' }
      }))
    });
    const sales = createFeature({
      connectionIds: SALES_CONNECTION_IDS,
      id: 'sales',
      token: SALES_TOKEN
    });
    const app = await buildApp({ inboxes: [support.feature, sales.feature] });
    applications.push(app);

    const supportResponse = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
      method: 'GET',
      url: '/v1/inbox/inbound-events'
    });
    const supportCursor = supportResponse.json().data.nextCursor as string;
    const scopeChangedCursor = encodeCursor({
      beforeSequence: '4',
      inboxId: 'sales',
      orderVersion: 2,
      scopeHash: scopeHashFor(SUPPORT_CONNECTION_IDS),
      snapshotMaxSequence: '9'
    });
    const unversionedCursor = encodeCursor({
      beforeSequence: '4',
      inboxId: 'support',
      scopeHash: scopeHashFor(SUPPORT_CONNECTION_IDS),
      snapshotMaxSequence: '9'
    });

    const [crossInbox, scopeChanged, unversioned] = await Promise.all([
      app.inject({
        headers: { authorization: `Bearer ${SALES_TOKEN}` },
        method: 'GET',
        url: `/v1/inbox/inbound-events?cursor=${supportCursor}`
      }),
      app.inject({
        headers: { authorization: `Bearer ${SALES_TOKEN}` },
        method: 'GET',
        url: `/v1/inbox/inbound-events?cursor=${scopeChangedCursor}`
      }),
      app.inject({
        headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
        method: 'GET',
        url: `/v1/inbox/inbound-events?cursor=${unversionedCursor}`
      })
    ]);

    for (const response of [crossInbox, scopeChanged, unversioned]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        success: false,
        error: { code: 'validation_error', message: 'The request is invalid.' }
      });
    }
    expect(sales.readInboundEvents).not.toHaveBeenCalled();
    expect(support.readInboundEvents).toHaveBeenCalledOnce();
  });

  it('rejects malformed caller input and returns a generic 500 for reader failures', async () => {
    const failingRead = vi.fn(async (): Promise<InboundEventPage> => {
      throw new Error('Synthetic database credential must not leave the inbox API.');
    });
    const { feature, readInboundEvents } = createFeature({ readInboundEvents: failingRead });
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);

    for (const url of [
      '/v1/inbox/inbound-events?limit=101',
      '/v1/inbox/inbound-events?connectionId=telegram-bot-sales',
      '/v1/inbox/inbound-events?cursor=not-a-cursor%40'
    ]) {
      const response = await app.inject({
        headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
        method: 'GET',
        url
      });

      expect(response.statusCode).toBe(400);
    }
    expect(readInboundEvents).not.toHaveBeenCalled();

    const failure = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
      method: 'GET',
      url: '/v1/inbox/inbound-events'
    });

    expect(failure.statusCode).toBe(500);
    expect(failure.json()).toEqual({
      success: false,
      error: { code: 'internal_error', message: 'An unexpected error occurred.' }
    });
    expect(failure.body).not.toContain('database credential');
  });
});

const createFeature = (
  overrides: Readonly<Partial<InboxFeature>> = {}
): Readonly<{
  feature: InboxFeature;
  readInboundEvents: ReturnType<typeof vi.fn>;
}> => {
  const readInboundEvents =
    overrides.readInboundEvents ?? vi.fn(async (): Promise<InboundEventPage> => ({ events: [] }));
  const feature = Object.freeze({
    connectionIds: SUPPORT_CONNECTION_IDS,
    createDashboardReplyIntentCapability: vi.fn(() =>
      Object.freeze({
        recordReplyIntent: async (): Promise<CreateOutboundReplyCommandResult> =>
          Object.freeze({ kind: 'source_unavailable' })
      })
    ),
    createOutboundReplyCommand: vi.fn(async (): Promise<CreateOutboundReplyCommandResult> =>
      Object.freeze({ kind: 'source_unavailable' })
    ),
    id: 'support',
    readInboundEvents,
    readOutboundReplyCommandHistory: vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => ({
      commands: []
    })),
    token: SUPPORT_TOKEN,
    ...overrides
  });

  return Object.freeze({
    feature,
    readInboundEvents: readInboundEvents as ReturnType<typeof vi.fn>
  });
};

const scopeHashFor = (connectionIds: readonly string[]): string =>
  createHash('sha256').update(connectionIds.join('\n'), 'utf8').digest('base64url');

const decodeCursor = (value: string): unknown =>
  JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

const encodeCursor = (value: object): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

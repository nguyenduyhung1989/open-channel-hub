import { createHash } from 'node:crypto';

import type {
  CreateOutboundReplyCommandResult,
  InboundEventPage,
  OutboundReplyCommandHistoryEntry,
  OutboundReplyCommandHistoryPage
} from '@open-channel-hub/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { InboxFeature } from './inbox-feature.js';

const SUPPORT_TOKEN = 'synthetic_inbox_support_token_01234567890123456789';
const SALES_TOKEN = 'synthetic_inbox_sales_token_01234567890123456789012';
const SUPPORT_CONNECTION_IDS = Object.freeze(['facebook-page-support', 'telegram-bot-support']);
const SALES_CONNECTION_IDS = Object.freeze(['telegram-bot-sales']);

describe('Inbox outbound-command history route', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (app) => app.close()));
  });

  it('does not expose the command-history endpoint when no configured inbox exists', async () => {
    const app = await buildApp();
    applications.push(app);

    const response = await app.inject({ method: 'GET', url: '/v1/inbox/outbound-commands' });

    expect(response.statusCode).toBe(404);
  });

  it('authenticates before query and cursor parsing', async () => {
    const { feature, readOutboundReplyCommandHistory } = createFeature();
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);

    const response = await app.inject({
      method: 'GET',
      url: `/v1/inbox/outbound-commands?cursor=${'a'.repeat(513)}&connectionId=telegram-bot-sales`
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'unauthorized', message: 'The inbox credential is invalid.' }
    });
    expect(readOutboundReplyCommandHistory).not.toHaveBeenCalled();
  });

  it('returns only queued public command history from its immutable inbox scope', async () => {
    const commandWithPrivateFields = Object.freeze({
      ...command(),
      clientOperationId: 'synthetic-private-client-operation',
      raw: 'synthetic-private-raw-payload',
      replyTargetId: 'synthetic-private-reply-target',
      sourceChannel: 'telegram_bot',
      sourceMessageId: 'synthetic-private-source-message'
    }) as OutboundReplyCommandHistoryEntry;
    const { feature, readOutboundReplyCommandHistory } = createFeature({
      readOutboundReplyCommandHistory: vi.fn(
        async (): Promise<OutboundReplyCommandHistoryPage> => ({
          commands: [commandWithPrivateFields],
          nextCursor: { beforeSequence: '8', snapshotMaxSequence: '12' }
        })
      )
    });
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);

    const firstPage = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
      method: 'GET',
      url: '/v1/inbox/outbound-commands?limit=2'
    });

    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.json()).toEqual({
      success: true,
      data: {
        commands: [command()],
        nextCursor: expect.any(String)
      }
    });
    expect(readOutboundReplyCommandHistory).toHaveBeenCalledWith({ pageSize: 2 });
    expect(firstPage.body).not.toContain('clientOperationId');
    expect(firstPage.body).not.toContain('raw');
    expect(firstPage.body).not.toContain('replyTargetId');
    expect(firstPage.body).not.toContain('sourceChannel');
    expect(firstPage.body).not.toContain('sourceMessageId');
    expect(firstPage.body).not.toContain('synthetic-private-client-operation');
    expect(firstPage.body).not.toContain('synthetic-private-raw-payload');
    expect(firstPage.body).not.toContain('synthetic-private-reply-target');
    expect(firstPage.body).not.toContain('synthetic-private-source-message');
    expect(firstPage.body).not.toContain(SUPPORT_TOKEN);

    const cursor = firstPage.json().data.nextCursor as string;
    expect(decodeCursor(cursor)).toEqual({
      beforeSequence: '8',
      inboxId: 'support',
      orderVersion: 1,
      scopeHash: scopeHashFor(SUPPORT_CONNECTION_IDS),
      snapshotMaxSequence: '12'
    });

    const continuation = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
      method: 'GET',
      url: `/v1/inbox/outbound-commands?cursor=${cursor}`
    });

    expect(continuation.statusCode).toBe(200);
    expect(readOutboundReplyCommandHistory).toHaveBeenLastCalledWith({
      cursor: { beforeSequence: '8', snapshotMaxSequence: '12' },
      pageSize: 50
    });
  });

  it('rejects cursors from another inbox, a changed scope, and an old order version', async () => {
    const support = createFeature({
      readOutboundReplyCommandHistory: vi.fn(
        async (): Promise<OutboundReplyCommandHistoryPage> => ({
          commands: [],
          nextCursor: { beforeSequence: '4', snapshotMaxSequence: '9' }
        })
      )
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
      url: '/v1/inbox/outbound-commands'
    });
    const supportCursor = supportResponse.json().data.nextCursor as string;
    const scopeChangedCursor = encodeCursor({
      beforeSequence: '4',
      inboxId: 'sales',
      orderVersion: 1,
      scopeHash: scopeHashFor(SUPPORT_CONNECTION_IDS),
      snapshotMaxSequence: '9'
    });
    const oldOrderVersionCursor = encodeCursor({
      beforeSequence: '4',
      inboxId: 'support',
      orderVersion: 2,
      scopeHash: scopeHashFor(SUPPORT_CONNECTION_IDS),
      snapshotMaxSequence: '9'
    });

    const [crossInbox, scopeChanged, oldOrderVersion] = await Promise.all([
      app.inject({
        headers: { authorization: `Bearer ${SALES_TOKEN}` },
        method: 'GET',
        url: `/v1/inbox/outbound-commands?cursor=${supportCursor}`
      }),
      app.inject({
        headers: { authorization: `Bearer ${SALES_TOKEN}` },
        method: 'GET',
        url: `/v1/inbox/outbound-commands?cursor=${scopeChangedCursor}`
      }),
      app.inject({
        headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
        method: 'GET',
        url: `/v1/inbox/outbound-commands?cursor=${oldOrderVersionCursor}`
      })
    ]);

    for (const response of [crossInbox, scopeChanged, oldOrderVersion]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        success: false,
        error: { code: 'validation_error', message: 'The request is invalid.' }
      });
    }
    expect(sales.readOutboundReplyCommandHistory).not.toHaveBeenCalled();
    expect(support.readOutboundReplyCommandHistory).toHaveBeenCalledOnce();
  });

  it('uses the default page size, accepts the bounds, and rejects caller-controlled scope', async () => {
    const { feature, readOutboundReplyCommandHistory } = createFeature();
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);

    for (const [url, pageSize] of [
      ['/v1/inbox/outbound-commands', 50],
      ['/v1/inbox/outbound-commands?limit=1', 1],
      ['/v1/inbox/outbound-commands?limit=100', 100]
    ] as const) {
      const response = await app.inject({
        headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
        method: 'GET',
        url
      });

      expect(response.statusCode).toBe(200);
      expect(readOutboundReplyCommandHistory).toHaveBeenLastCalledWith({ pageSize });
    }

    for (const url of [
      '/v1/inbox/outbound-commands?limit=0',
      '/v1/inbox/outbound-commands?limit=101',
      '/v1/inbox/outbound-commands?connectionId=telegram-bot-sales',
      '/v1/inbox/outbound-commands?cursor=not-a-cursor%40'
    ]) {
      const response = await app.inject({
        headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
        method: 'GET',
        url
      });

      expect(response.statusCode).toBe(400);
    }
    expect(readOutboundReplyCommandHistory).toHaveBeenCalledTimes(3);
  });

  it('returns a generic failure when the history reader fails', async () => {
    const { feature } = createFeature({
      readOutboundReplyCommandHistory: vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => {
        throw new Error('Synthetic database credential must not leave the inbox API.');
      })
    });
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
      method: 'GET',
      url: '/v1/inbox/outbound-commands'
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'internal_error', message: 'An unexpected error occurred.' }
    });
    expect(response.body).not.toContain('database credential');
  });
});

const command = (): OutboundReplyCommandHistoryEntry =>
  Object.freeze({
    createdAt: '2026-08-13T00:00:00.000Z',
    id: '42',
    sourceConnectionId: 'telegram-bot-support',
    sourceProviderEventId: '9001',
    state: 'queued',
    text: 'Synthetic queued operator reply'
  });

const createFeature = (
  overrides: Readonly<Partial<InboxFeature>> = {}
): Readonly<{
  feature: InboxFeature;
  readOutboundReplyCommandHistory: ReturnType<typeof vi.fn>;
}> => {
  const readOutboundReplyCommandHistory =
    overrides.readOutboundReplyCommandHistory ??
    vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => ({ commands: [] }));
  const feature: InboxFeature = Object.freeze({
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
    readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
    readOutboundReplyCommandHistory,
    token: SUPPORT_TOKEN,
    ...overrides
  });

  return Object.freeze({
    feature,
    readOutboundReplyCommandHistory: readOutboundReplyCommandHistory as ReturnType<typeof vi.fn>
  });
};

const scopeHashFor = (connectionIds: readonly string[]): string =>
  createHash('sha256').update(connectionIds.join('\n'), 'utf8').digest('base64url');

const decodeCursor = (value: string): unknown =>
  JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

const encodeCursor = (value: object): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

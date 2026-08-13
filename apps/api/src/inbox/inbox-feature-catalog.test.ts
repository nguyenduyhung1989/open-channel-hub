import type {
  CreateOutboundReplyCommandResult,
  InboundEventPage,
  OutboundReplyCommandHistoryPage
} from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import type { InboxFeature } from './inbox-feature.js';
import { createInboxFeatureCatalog, InboxFeatureCatalogError } from './inbox-feature-catalog.js';

const SUPPORT_TOKEN = 'synthetic_inbox_support_token_01234567890123456789';
const SALES_TOKEN = 'synthetic_inbox_sales_token_01234567890123456789012';

describe('createInboxFeatureCatalog', () => {
  it('resolves exactly the immutable inbox selected by its bearer credential', () => {
    const support = createFeature({
      connectionIds: ['facebook-page-support', 'telegram-bot-support'],
      id: 'support'
    });
    const sales = createFeature({
      connectionIds: ['telegram-bot-sales'],
      id: 'sales',
      token: SALES_TOKEN
    });
    const catalog = createInboxFeatureCatalog([support, sales]);

    const selectedSupport = catalog.findByAuthorization(`Bearer ${SUPPORT_TOKEN}`);
    const selectedSales = catalog.findByAuthorization(`Bearer ${SALES_TOKEN}`);

    expect(selectedSupport).toMatchObject({
      connectionIds: ['facebook-page-support', 'telegram-bot-support'],
      id: 'support',
      token: SUPPORT_TOKEN
    });
    expect(selectedSupport?.readInboundEvents).toBe(support.readInboundEvents);
    expect(selectedSupport?.createOutboundReplyCommand).toBe(support.createOutboundReplyCommand);
    expect(selectedSupport?.readOutboundReplyCommandHistory).toBe(
      support.readOutboundReplyCommandHistory
    );
    expect(selectedSales).toMatchObject({
      connectionIds: ['telegram-bot-sales'],
      id: 'sales',
      token: SALES_TOKEN
    });
    expect(Object.isFrozen(selectedSupport)).toBe(true);
    expect(Object.isFrozen(selectedSupport?.connectionIds)).toBe(true);
    expect(catalog.findByAuthorization('Bearer wrong')).toBeUndefined();
    expect(catalog.findByAuthorization(undefined)).toBeUndefined();
  });

  it('rejects duplicate private credentials and malformed mutable scopes', () => {
    const support = createFeature({
      connectionIds: ['facebook-page-support', 'telegram-bot-support'],
      id: 'support'
    });

    const invalidFeatureSets: readonly unknown[] = [
      [],
      [
        support,
        createFeature({ connectionIds: ['telegram-bot-sales'], id: 'support', token: SALES_TOKEN })
      ],
      [
        support,
        createFeature({
          connectionIds: ['telegram-bot-sales'],
          id: 'sales',
          token: SUPPORT_TOKEN
        })
      ],
      [
        createFeature({
          connectionIds: ['telegram-bot-support', 'facebook-page-support'],
          id: 'support'
        })
      ],
      [
        createFeature({
          connectionIds: ['telegram-bot-support', 'telegram-bot-support'],
          id: 'support'
        })
      ],
      [
        Object.freeze({
          connectionIds: Object.freeze(['telegram-bot-support']),
          id: 'support',
          readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
          token: 'short'
        })
      ]
    ];

    for (const features of invalidFeatureSets) {
      expect(() => createInboxFeatureCatalog(features as readonly InboxFeature[])).toThrow(
        InboxFeatureCatalogError
      );
    }
  });
});

const createFeature = (overrides: Readonly<Partial<InboxFeature>> = {}): InboxFeature =>
  Object.freeze({
    connectionIds: Object.freeze(['telegram-bot-support']),
    createOutboundReplyCommand: vi.fn(async (): Promise<CreateOutboundReplyCommandResult> =>
      Object.freeze({ kind: 'source_unavailable' })
    ),
    id: 'support',
    readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
    readOutboundReplyCommandHistory: vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => ({
      commands: []
    })),
    token: SUPPORT_TOKEN,
    ...overrides
  });

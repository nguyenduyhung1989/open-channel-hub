import type {
  InboundEventFeedReader,
  InboundEventPage,
  OutboundReplyCommandStore
} from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import type { RuntimeInbox } from '../connections/runtime-connection-configuration.js';
import { createRuntimeInboxFeatures } from './create-runtime-inbox-features.js';

const RUNTIME_INBOX: RuntimeInbox = Object.freeze({
  connectionIds: Object.freeze(['facebook-page-support', 'telegram-bot-support']),
  id: 'support',
  token: 'synthetic_inbox_support_token_01234567890123456789'
});

describe('createRuntimeInboxFeatures', () => {
  it('binds the immutable configured scope into its reader and command closures', async () => {
    const list = vi.fn(async (): Promise<InboundEventPage> => ({ events: [] }));
    const reader: InboundEventFeedReader = Object.freeze({ list });
    const create = vi.fn(async () =>
      Object.freeze({
        command: Object.freeze({
          createdAt: '2026-08-13T00:00:00.000Z',
          id: '42',
          sourceConnectionId: 'telegram-bot-support',
          sourceProviderEventId: '9001',
          state: 'queued' as const
        }),
        kind: 'created' as const
      })
    );
    const commandStore: OutboundReplyCommandStore = Object.freeze({ create });
    const features = createRuntimeInboxFeatures([RUNTIME_INBOX], reader, commandStore);
    const feature = features[0];

    expect(feature).toBeDefined();
    expect(feature).toMatchObject({
      connectionIds: RUNTIME_INBOX.connectionIds,
      id: RUNTIME_INBOX.id,
      token: RUNTIME_INBOX.token
    });
    expect(Object.isFrozen(features)).toBe(true);
    expect(Object.isFrozen(feature)).toBe(true);
    expect(Object.isFrozen(feature?.connectionIds)).toBe(true);

    await feature?.readInboundEvents({
      cursor: { beforeSequence: '2', snapshotMaxSequence: '5' },
      pageSize: 25
    });

    expect(list).toHaveBeenCalledWith({
      connectionIds: RUNTIME_INBOX.connectionIds,
      cursor: { beforeSequence: '2', snapshotMaxSequence: '5' },
      pageSize: 25
    });

    await feature?.createOutboundReplyCommand({
      clientOperationId: 'operator-command-20260813-0001',
      sourceConnectionId: 'telegram-bot-support',
      sourceProviderEventId: '9001',
      text: '  Preserve the operator text exactly.  '
    });

    expect(create).toHaveBeenCalledWith({
      allowedConnectionIds: RUNTIME_INBOX.connectionIds,
      clientOperationId: 'operator-command-20260813-0001',
      sourceConnectionId: 'telegram-bot-support',
      sourceProviderEventId: '9001',
      text: '  Preserve the operator text exactly.  '
    });
  });
});

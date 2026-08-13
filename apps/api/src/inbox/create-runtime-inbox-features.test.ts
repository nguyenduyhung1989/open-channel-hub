import type { InboundEventFeedReader, InboundEventPage } from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import type { RuntimeInbox } from '../connections/runtime-connection-configuration.js';
import { createRuntimeInboxFeatures } from './create-runtime-inbox-features.js';

const RUNTIME_INBOX: RuntimeInbox = Object.freeze({
  connectionIds: Object.freeze(['facebook-page-support', 'telegram-bot-support']),
  id: 'support',
  token: 'synthetic_inbox_support_token_01234567890123456789'
});

describe('createRuntimeInboxFeatures', () => {
  it('binds the immutable configured scope into the reader closure', async () => {
    const list = vi.fn(async (): Promise<InboundEventPage> => ({ events: [] }));
    const reader: InboundEventFeedReader = Object.freeze({ list });
    const features = createRuntimeInboxFeatures([RUNTIME_INBOX], reader);
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
  });
});

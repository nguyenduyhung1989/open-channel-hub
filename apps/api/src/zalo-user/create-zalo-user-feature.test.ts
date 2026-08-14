import type { CanonicalEvent } from '@open-channel-hub/contracts';
import type { InboundEventPage } from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import { createZaloUserFeature } from './create-zalo-user-feature.js';
import { fingerprintZaloUserProviderIdentity } from './zalo-user-provider-identity.js';

const ACCOUNT_ID = '1234567890123456789';
const CONNECTION_ID = 'zalo-user-support';

describe('createZaloUserFeature', () => {
  it('registers an experimental Zalo User group bridge and rejects cross-connection events', async () => {
    const receiveEvents = vi.fn(async (): Promise<void> => undefined);
    const feature = await createZaloUserFeature(
      {
        accountId: ACCOUNT_ID,
        bridgeToken: 'synthetic_zalo_user_bridge_token_0123456789012345678',
        connectionId: CONNECTION_ID,
        operatorApiToken: 'synthetic_zalo_user_operator_token_0123456789012345'
      },
      {
        readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
        receiveEvents
      }
    );
    const validRawEvent = {
      accountId: ACCOUNT_ID,
      conversationId: '146845883529197922',
      occurredAt: '2026-08-14T10:00:00.000Z',
      providerEventId: 'message-101',
      senderId: '246845883529197923',
      text: 'Synthetic Zalo User group text',
      threadType: 'group' as const
    };

    expect(feature.registration).toEqual({
      channel: 'zalo_user',
      connectorId: 'zalo-user',
      id: CONNECTION_ID,
      providerIdentityFingerprint: fingerprintZaloUserProviderIdentity(ACCOUNT_ID),
      tier: 'EXPERIMENTAL'
    });
    expect(feature.normalize(validRawEvent)).toEqual([
      {
        channel: 'zalo_user',
        connectionId: CONNECTION_ID,
        id: 'zalo-user:zalo-user-support:event:message-101',
        message: {
          conversationId: '146845883529197922',
          id: 'message-101',
          senderId: '246845883529197923',
          text: 'Synthetic Zalo User group text'
        },
        occurredAt: '2026-08-14T10:00:00.000Z',
        providerEventId: 'message-101',
        type: 'message.received',
        zaloUserThreadType: 'group'
      }
    ]);

    await feature.receiveEvents(feature.normalize(validRawEvent));
    expect(receiveEvents).toHaveBeenCalledOnce();

    const invalidEvent: CanonicalEvent = Object.freeze({
      ...feature.normalize(validRawEvent)[0]!,
      connectionId: 'different-connection'
    });

    await expect(feature.receiveEvents([invalidEvent])).rejects.toThrow(
      'Zalo User inbound events do not match their configured connection.'
    );

    await expect(feature.receiveEvents([])).rejects.toThrow(
      'Zalo User inbound events do not match their configured connection.'
    );
  });
});

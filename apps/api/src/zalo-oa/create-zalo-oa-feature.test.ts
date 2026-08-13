import type { CanonicalEvent } from '@open-channel-hub/contracts';
import type { InboundEventPage } from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import { createZaloOaFeature } from './create-zalo-oa-feature.js';
import { fingerprintZaloOaProviderIdentity } from './zalo-oa-provider-identity.js';

const CONNECTION_ID = 'zalo-oa-support';
const APP_ID = '1234567890123456789';
const OA_ID = '9876543210987654321';

describe('createZaloOaFeature', () => {
  it('registers an official receive-only Zalo OA and rejects cross-connection canonical events', async () => {
    const receiveEvents = vi.fn(async (): Promise<void> => undefined);
    const feature = await createZaloOaFeature(
      {
        appId: APP_ID,
        connectionId: CONNECTION_ID,
        oaId: OA_ID,
        oaSecretKey: 'synthetic-zalo-oa-secret',
        operatorApiToken: 'synthetic_zalo_operator_support_012345678901234567'
      },
      {
        readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
        receiveEvents
      }
    );
    const validRawEvent = {
      app_id: APP_ID,
      event_name: 'user_send_text',
      message: { msg_id: 'message-101', text: 'Synthetic Zalo text' },
      recipient: { id: OA_ID },
      sender: { id: '246845883529197922' },
      timestamp: '1786492800000'
    };

    expect(feature.registration).toEqual({
      channel: 'zalo_oa',
      connectorId: 'zalo-oa',
      id: CONNECTION_ID,
      providerIdentityFingerprint: fingerprintZaloOaProviderIdentity(APP_ID, OA_ID),
      tier: 'OFFICIAL'
    });
    expect(feature.normalize(validRawEvent)).toEqual([
      {
        channel: 'zalo_oa',
        connectionId: CONNECTION_ID,
        id: 'zalo-oa:zalo-oa-support:event:message-101',
        message: {
          conversationId: '246845883529197922',
          id: 'message-101',
          senderId: '246845883529197922',
          text: 'Synthetic Zalo text'
        },
        occurredAt: '2026-08-12T00:00:00.000Z',
        providerEventId: 'message-101',
        type: 'message.received'
      }
    ]);

    await feature.receiveEvents(feature.normalize(validRawEvent));
    expect(receiveEvents).toHaveBeenCalledOnce();

    const invalidEvent: CanonicalEvent = Object.freeze({
      ...feature.normalize(validRawEvent)[0]!,
      connectionId: 'different-connection'
    });

    await expect(feature.receiveEvents([invalidEvent])).rejects.toThrow(
      'Zalo OA inbound events do not match their configured connection.'
    );
  });
});

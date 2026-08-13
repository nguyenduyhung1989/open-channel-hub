import type { CanonicalEvent } from '@open-channel-hub/contracts';
import type { InboundEventPage } from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import { createFacebookPageFeature } from './create-facebook-page-feature.js';
import { fingerprintFacebookPageProviderIdentity } from './facebook-page-provider-identity.js';

const CONNECTION_ID = 'facebook-page-support';
const APP_ID = '1234567890123456789';
const PAGE_ID = '9876543210987654321';

describe('createFacebookPageFeature', () => {
  it('registers an official receive-only Page and rejects cross-connection canonical events', async () => {
    const receiveEvents = vi.fn(async (): Promise<void> => undefined);
    const feature = await createFacebookPageFeature(
      {
        appId: APP_ID,
        appSecret: 'synthetic-facebook-app-secret-01234567890123456789',
        connectionId: CONNECTION_ID,
        operatorApiToken: 'synthetic_facebook_operator_support_012345678901234567',
        pageId: PAGE_ID,
        webhookVerifyToken: 'synthetic-facebook-verify-token-012345678901234567'
      },
      {
        readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
        receiveEvents
      }
    );
    const validRawEvent = {
      object: 'page',
      entry: [
        {
          id: PAGE_ID,
          messaging: [
            {
              message: { mid: 'mid.synthetic.101', text: 'Synthetic Facebook Page text' },
              recipient: { id: PAGE_ID },
              sender: { id: '123456789012345678901' },
              timestamp: 1786492800000
            }
          ]
        }
      ]
    };

    expect(feature.registration).toEqual({
      channel: 'facebook_page',
      connectorId: 'facebook-page',
      id: CONNECTION_ID,
      providerIdentityFingerprint: fingerprintFacebookPageProviderIdentity(APP_ID, PAGE_ID),
      tier: 'OFFICIAL'
    });
    expect(feature.normalize(validRawEvent)).toEqual([
      {
        channel: 'facebook_page',
        connectionId: CONNECTION_ID,
        id: 'facebook-page:facebook-page-support:event:mid.synthetic.101',
        message: {
          conversationId: '123456789012345678901',
          id: 'mid.synthetic.101',
          senderId: '123456789012345678901',
          text: 'Synthetic Facebook Page text'
        },
        occurredAt: '2026-08-12T00:00:00.000Z',
        providerEventId: 'mid.synthetic.101',
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
      'Facebook Page inbound events do not match their configured connection.'
    );
  });
});

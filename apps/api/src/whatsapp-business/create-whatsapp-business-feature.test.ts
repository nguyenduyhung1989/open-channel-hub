import type { CanonicalEvent } from '@open-channel-hub/contracts';
import type { InboundEventPage } from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import { createWhatsAppBusinessFeature } from './create-whatsapp-business-feature.js';
import { fingerprintWhatsAppBusinessProviderIdentity } from './whatsapp-business-provider-identity.js';

const CONNECTION_ID = 'whatsapp-business-support';
const APP_ID = '1234567890123456789';
const WABA_ID = '9876543210987654321';
const PHONE_NUMBER_ID = '112233445566778899';

describe('createWhatsAppBusinessFeature', () => {
  it('registers an official receive-only business phone and rejects cross-connection canonical events', async () => {
    const receiveEvents = vi.fn(async (): Promise<void> => undefined);
    const feature = await createWhatsAppBusinessFeature(
      {
        appId: APP_ID,
        appSecret: 'synthetic-whatsapp-app-secret-01234567890123456789',
        connectionId: CONNECTION_ID,
        operatorApiToken: 'synthetic_whatsapp_operator_support_012345678901234567',
        phoneNumberId: PHONE_NUMBER_ID,
        wabaId: WABA_ID,
        webhookVerifyToken: 'synthetic-whatsapp-verify-token-012345678901234567'
      },
      {
        readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
        receiveEvents
      }
    );
    const validRawEvent = {
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messages: [
                  {
                    from: '15551797781',
                    id: 'wamid.synthetic.101',
                    text: { body: 'Synthetic WhatsApp Business text' },
                    timestamp: '1786492800',
                    type: 'text'
                  }
                ],
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: PHONE_NUMBER_ID }
              }
            }
          ],
          id: WABA_ID
        }
      ],
      object: 'whatsapp_business_account'
    };

    expect(feature.registration).toEqual({
      channel: 'whatsapp_business',
      connectorId: 'whatsapp-business',
      id: CONNECTION_ID,
      providerIdentityFingerprint: fingerprintWhatsAppBusinessProviderIdentity(
        APP_ID,
        WABA_ID,
        PHONE_NUMBER_ID
      ),
      tier: 'OFFICIAL'
    });
    expect(feature.normalize(validRawEvent)).toEqual([
      {
        channel: 'whatsapp_business',
        connectionId: CONNECTION_ID,
        id: 'whatsapp-business:whatsapp-business-support:event:wamid.synthetic.101',
        message: {
          conversationId: '15551797781',
          id: 'wamid.synthetic.101',
          senderId: '15551797781',
          text: 'Synthetic WhatsApp Business text'
        },
        occurredAt: '2026-08-12T00:00:00.000Z',
        providerEventId: 'wamid.synthetic.101',
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
      'WhatsApp Business inbound events do not match their configured connection.'
    );
  });
});

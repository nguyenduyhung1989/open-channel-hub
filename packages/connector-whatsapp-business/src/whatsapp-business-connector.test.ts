import { describe, expect, it } from 'vitest';

import {
  toWhatsAppBusinessTextEvents,
  toWhatsAppBusinessWebhookWabaIds,
  WhatsAppBusinessCommandRejectedError,
  WhatsAppBusinessConnectorAdapter,
  WhatsAppBusinessConnectorConfigurationError
} from './index.js';

const APP_ID = '1234567890123456789';
const CONNECTION_ID = 'whatsapp_support';
const WABA_ID = '987654321098765432';
const OTHER_WABA_ID = '987654321098765433';
const PHONE_NUMBER_ID = '112233445566778899';
const OTHER_PHONE_NUMBER_ID = '112233445566778898';
const TIMESTAMP = '1786492800';

const textMessage = (
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  from: '15551797781',
  id: 'wamid.HBgLMTU1NTE3OTc3ODFVAgASGBQzQTFCMjNENDU2Nzg5MDEyMzQ1Njc4OTAB',
  text: { body: 'Chào Hưng 👋' },
  timestamp: TIMESTAMP,
  type: 'text',
  ...overrides
});

const messagesChange = (
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  field: 'messages',
  value: {
    messaging_product: 'whatsapp',
    metadata: { phone_number_id: PHONE_NUMBER_ID },
    messages: [textMessage()]
  },
  ...overrides
});

const whatsappEntry = (
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  changes: [messagesChange()],
  id: WABA_ID,
  ...overrides
});

const webhook = (entries: readonly unknown[] = [whatsappEntry()]): Record<string, unknown> => ({
  entry: entries,
  object: 'whatsapp_business_account'
});

const createAdapter = (): WhatsAppBusinessConnectorAdapter =>
  new WhatsAppBusinessConnectorAdapter({
    appId: APP_ID,
    connectionId: CONNECTION_ID,
    phoneNumberId: PHONE_NUMBER_ID,
    wabaId: WABA_ID
  });

describe('WhatsAppBusinessConnectorAdapter', () => {
  it('declares the official WhatsApp Business inbound-text-only surface', () => {
    const adapter = createAdapter();

    expect(adapter.manifest()).toEqual({
      capabilities: [{ id: 'message.receive.text' }],
      channel: 'whatsapp_business',
      displayName: 'WhatsApp Business',
      id: 'whatsapp-business',
      tier: 'OFFICIAL'
    });
    expect(adapter.capabilities()).toEqual([{ id: 'message.receive.text' }]);
  });

  it('normalizes a complete Cloud API text webhook into one canonical event', () => {
    const adapter = createAdapter();

    expect(adapter.normalize(webhook())).toEqual([
      {
        channel: 'whatsapp_business',
        connectionId: CONNECTION_ID,
        id: 'whatsapp-business:whatsapp_support:event:wamid.HBgLMTU1NTE3OTc3ODFVAgASGBQzQTFCMjNENDU2Nzg5MDEyMzQ1Njc4OTAB',
        message: {
          conversationId: '15551797781',
          id: 'wamid.HBgLMTU1NTE3OTc3ODFVAgASGBQzQTFCMjNENDU2Nzg5MDEyMzQ1Njc4OTAB',
          senderId: '15551797781',
          text: 'Chào Hưng 👋'
        },
        occurredAt: '2026-08-12T00:00:00.000Z',
        providerEventId: 'wamid.HBgLMTU1NTE3OTc3ODFVAgASGBQzQTFCMjNENDU2Nzg5MDEyMzQ1Njc4OTAB',
        type: 'message.received'
      }
    ]);
  });

  it('extracts unique valid WABA IDs so ingress can select HMAC candidates', () => {
    const wabaIds = toWhatsAppBusinessWebhookWabaIds(
      webhook([
        whatsappEntry(),
        whatsappEntry({ changes: [], id: OTHER_WABA_ID }),
        whatsappEntry({ changes: [], id: WABA_ID }),
        { id: WABA_ID }
      ])
    );

    expect(wabaIds).toEqual([WABA_ID, OTHER_WABA_ID]);
    expect(Object.isFrozen(wabaIds)).toBe(true);
  });

  it('fails closed while selecting webhook candidates when any entry is malformed', () => {
    expect(
      toWhatsAppBusinessWebhookWabaIds(
        webhook([whatsappEntry(), whatsappEntry({ id: 'waba_not_decimal' })])
      )
    ).toEqual([]);
    expect(toWhatsAppBusinessWebhookWabaIds(webhook([whatsappEntry(), {}]))).toEqual([]);
    expect(toWhatsAppBusinessWebhookWabaIds(webhook([whatsappEntry(), null]))).toEqual([]);
  });

  it('accepts only its configured WABA and phone number across a webhook batch', () => {
    const adapter = createAdapter();

    expect(
      adapter.normalize(
        webhook([
          whatsappEntry({
            changes: [
              messagesChange({
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: OTHER_PHONE_NUMBER_ID },
                  messages: [textMessage({ id: 'wamid.other-phone' })]
                }
              })
            ]
          }),
          whatsappEntry({
            changes: [
              messagesChange({
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: PHONE_NUMBER_ID },
                  messages: [
                    textMessage(),
                    textMessage({ id: 'wamid.second', text: { body: 'Tin thứ hai.' } })
                  ]
                }
              })
            ]
          }),
          whatsappEntry({
            changes: [
              messagesChange({
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: PHONE_NUMBER_ID },
                  messages: [textMessage({ id: 'wamid.other-waba' })]
                }
              })
            ],
            id: OTHER_WABA_ID
          })
        ])
      )
    ).toEqual([
      expect.objectContaining({
        id: 'whatsapp-business:whatsapp_support:event:wamid.HBgLMTU1NTE3OTc3ODFVAgASGBQzQTFCMjNENDU2Nzg5MDEyMzQ1Njc4OTAB',
        providerEventId: 'wamid.HBgLMTU1NTE3OTc3ODFVAgASGBQzQTFCMjNENDU2Nzg5MDEyMzQ1Njc4OTAB'
      }),
      expect.objectContaining({
        id: 'whatsapp-business:whatsapp_support:event:wamid.second',
        message: expect.objectContaining({ text: 'Tin thứ hai.' }),
        providerEventId: 'wamid.second'
      })
    ]);
  });

  it('ignores non-text, non-message, and wrong-product webhook items', () => {
    const adapter = createAdapter();

    expect(
      adapter.normalize(
        webhook([
          whatsappEntry({
            changes: [
              messagesChange({
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: PHONE_NUMBER_ID },
                  messages: [
                    textMessage({ id: 'wamid.image', image: { id: 'media' }, type: 'image' }),
                    textMessage({ id: 'wamid.no-text', text: undefined }),
                    textMessage({ id: 'wamid.false-text', type: 'TEXT' })
                  ]
                }
              }),
              messagesChange({
                field: 'statuses',
                value: { messaging_product: 'whatsapp', statuses: [] }
              }),
              messagesChange({
                value: {
                  messaging_product: 'not_whatsapp',
                  metadata: { phone_number_id: PHONE_NUMBER_ID },
                  messages: [textMessage({ id: 'wamid.wrong-product' })]
                }
              })
            ]
          })
        ])
      )
    ).toEqual([]);
  });

  it.each([
    null,
    [],
    {},
    { entry: [whatsappEntry()], object: 'page' },
    { entry: {}, object: 'whatsapp_business_account' },
    webhook([whatsappEntry({ id: 'waba_123' })]),
    webhook([
      whatsappEntry({
        changes: [messagesChange({ value: { messaging_product: 'whatsapp', metadata: [] } })]
      })
    ]),
    webhook([
      whatsappEntry({
        changes: [
          messagesChange({
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              messages: [textMessage({ from: '' })]
            }
          })
        ]
      })
    ]),
    webhook([
      whatsappEntry({
        changes: [
          messagesChange({
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              messages: [textMessage({ id: '', text: { body: 'Tin nhắn' } })]
            }
          })
        ]
      })
    ])
  ])('ignores malformed or out-of-scope webhook input without throwing: %j', (rawWebhook) => {
    const adapter = createAdapter();

    expect(() => adapter.normalize(rawWebhook)).not.toThrow();
    expect(adapter.normalize(rawWebhook)).toEqual([]);
    expect(toWhatsAppBusinessTextEvents(rawWebhook)).toEqual([]);
  });

  it.each(['-1', '1.5', 'not-a-timestamp', 1_786_492_800, '8640000000001'])(
    'rejects invalid Unix-second timestamps: %j',
    (timestamp) => {
      const rawWebhook = webhook([
        whatsappEntry({
          changes: [
            messagesChange({
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: PHONE_NUMBER_ID },
                messages: [textMessage({ timestamp })]
              }
            })
          ]
        })
      ]);

      expect(createAdapter().normalize(rawWebhook)).toEqual([]);
      expect(toWhatsAppBusinessTextEvents(rawWebhook)).toEqual([]);
    }
  );

  it('accepts Unix epoch zero and the greatest valid JavaScript Date timestamp', () => {
    const adapter = createAdapter();

    expect(
      adapter.normalize(
        webhook([
          whatsappEntry({
            changes: [
              messagesChange({
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: PHONE_NUMBER_ID },
                  messages: [textMessage({ timestamp: '0' })]
                }
              })
            ]
          })
        ])
      )[0]?.occurredAt
    ).toBe('1970-01-01T00:00:00.000Z');
    expect(
      adapter.normalize(
        webhook([
          whatsappEntry({
            changes: [
              messagesChange({
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: PHONE_NUMBER_ID },
                  messages: [textMessage({ timestamp: '8640000000000' })]
                }
              })
            ]
          })
        ])
      )[0]?.occurredAt
    ).toBe('+275760-09-13T00:00:00.000Z');
  });

  it('fails closed when untrusted webhook accessors throw', () => {
    const throwingEntryWebhook = Object.defineProperty({}, 'entry', {
      get: (): never => {
        throw new Error('Synthetic entry getter must not escape.');
      }
    });
    const throwingMessage = Object.defineProperty(
      {
        from: '15551797781',
        id: 'wamid.throwing',
        text: { body: 'Tin nhắn' },
        timestamp: TIMESTAMP,
        type: 'text'
      },
      'text',
      {
        get: (): never => {
          throw new Error('Synthetic text getter must not escape.');
        }
      }
    );
    const rawWebhook = webhook([
      whatsappEntry({
        changes: [
          messagesChange({
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              messages: [throwingMessage]
            }
          })
        ]
      })
    ]);

    Object.defineProperty(throwingEntryWebhook, 'object', {
      value: 'whatsapp_business_account'
    });

    expect(() => toWhatsAppBusinessWebhookWabaIds(throwingEntryWebhook)).not.toThrow();
    expect(toWhatsAppBusinessWebhookWabaIds(throwingEntryWebhook)).toEqual([]);
    expect(() => toWhatsAppBusinessTextEvents(rawWebhook)).not.toThrow();
    expect(toWhatsAppBusinessTextEvents(rawWebhook)).toEqual([]);
    expect(createAdapter().normalize(rawWebhook)).toEqual([]);
  });

  it('keeps canonical event IDs connection-scoped when two connections share a phone number', () => {
    const support = createAdapter();
    const sales = new WhatsAppBusinessConnectorAdapter({
      appId: APP_ID,
      connectionId: 'whatsapp_sales',
      phoneNumberId: PHONE_NUMBER_ID,
      wabaId: WABA_ID
    });

    const supportEvent = support.normalize(webhook())[0];
    const salesEvent = sales.normalize(webhook())[0];

    expect(supportEvent?.id).toBe(
      'whatsapp-business:whatsapp_support:event:wamid.HBgLMTU1NTE3OTc3ODFVAgASGBQzQTFCMjNENDU2Nzg5MDEyMzQ1Njc4OTAB'
    );
    expect(salesEvent?.id).toBe(
      'whatsapp-business:whatsapp_sales:event:wamid.HBgLMTU1NTE3OTc3ODFVAgASGBQzQTFCMjNENDU2Nzg5MDEyMzQ1Njc4OTAB'
    );
    expect(supportEvent?.id).not.toBe(salesEvent?.id);
  });

  it('rejects invalid configured App, WABA, and phone identifiers without reflecting them', () => {
    const error = (() => {
      try {
        new WhatsAppBusinessConnectorAdapter({
          appId: 'app_123',
          connectionId: CONNECTION_ID,
          phoneNumberId: PHONE_NUMBER_ID,
          wabaId: WABA_ID
        });
      } catch (thrown) {
        return thrown;
      }

      throw new Error('Expected invalid configuration to fail.');
    })();

    expect(error).toBeInstanceOf(WhatsAppBusinessConnectorConfigurationError);
    expect(error instanceof Error ? error.message : '').not.toContain(CONNECTION_ID);
    expect(
      () =>
        new WhatsAppBusinessConnectorAdapter({
          appId: APP_ID,
          connectionId: '.',
          phoneNumberId: PHONE_NUMBER_ID,
          wabaId: WABA_ID
        })
    ).toThrow(WhatsAppBusinessConnectorConfigurationError);
    expect(
      () =>
        new WhatsAppBusinessConnectorAdapter({
          appId: APP_ID,
          connectionId: CONNECTION_ID,
          phoneNumberId: 'phone_123',
          wabaId: WABA_ID
        })
    ).toThrow(WhatsAppBusinessConnectorConfigurationError);
    expect(
      () =>
        new WhatsAppBusinessConnectorAdapter({
          appId: APP_ID,
          connectionId: CONNECTION_ID,
          phoneNumberId: PHONE_NUMBER_ID,
          wabaId: 'waba_123'
        })
    ).toThrow(WhatsAppBusinessConnectorConfigurationError);
  });

  it('turns an unusual configuration getter into the same safe error', () => {
    const options = Object.defineProperty(
      {
        connectionId: CONNECTION_ID,
        phoneNumberId: PHONE_NUMBER_ID,
        wabaId: WABA_ID
      },
      'appId',
      {
        get: (): never => {
          throw new Error('Synthetic configuration detail that must not escape.');
        }
      }
    );

    const error = (() => {
      try {
        new WhatsAppBusinessConnectorAdapter(
          options as unknown as ConstructorParameters<typeof WhatsAppBusinessConnectorAdapter>[0]
        );
      } catch (thrown) {
        return thrown;
      }

      throw new Error('Expected invalid configuration to fail.');
    })();

    expect(error).toBeInstanceOf(WhatsAppBusinessConnectorConfigurationError);
    expect(error instanceof Error ? error.message : '').not.toContain(
      'Synthetic configuration detail'
    );
  });

  it('exposes only a stable receive capability through connection lifecycle states', async () => {
    const adapter = createAdapter();

    await expect(adapter.health()).resolves.toEqual({
      capabilities: [{ id: 'message.receive.text' }],
      channel: 'whatsapp_business',
      connectorId: 'whatsapp-business',
      id: CONNECTION_ID,
      status: 'connected'
    });
    await expect(adapter.disconnect()).resolves.toMatchObject({ status: 'disconnected' });
    await expect(adapter.connect()).resolves.toMatchObject({ status: 'connected' });
  });

  it('rejects every outbound command before any provider action exists', async () => {
    const adapter = createAdapter();

    const error = await adapter
      .execute({
        connectionId: CONNECTION_ID,
        recipientId: '15551797781',
        text: 'Không được gửi ở lát này.',
        type: 'message.send.text'
      })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(WhatsAppBusinessCommandRejectedError);
    expect(error).toMatchObject({
      code: 'unsupported_capability',
      rejection: {
        capability: 'message.send.text',
        code: 'unsupported_capability'
      }
    });
  });
});

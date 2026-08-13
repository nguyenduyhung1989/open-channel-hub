import { describe, expect, it } from 'vitest';

import {
  FacebookPageCommandRejectedError,
  FacebookPageConnectorAdapter,
  FacebookPageConnectorConfigurationError,
  toFacebookPageTextEvents,
  toFacebookPageWebhookPageIds
} from './index.js';

const APP_ID = '1234567890123456789';
const CONNECTION_ID = 'facebook_support';
const PAGE_ID = '987654321098765432';
const OTHER_PAGE_ID = '987654321098765433';
const TIMESTAMP = 1_786_492_800_000;

const textMessaging = (
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  message: {
    mid: 'mid.abc-123',
    text: 'Chào Hưng 👋'
  },
  recipient: {
    id: PAGE_ID
  },
  sender: {
    id: 'user_123'
  },
  timestamp: TIMESTAMP,
  ...overrides
});

const pageEntry = (overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> => ({
  id: PAGE_ID,
  messaging: [textMessaging()],
  ...overrides
});

const webhook = (entries: readonly unknown[] = [pageEntry()]): Record<string, unknown> => ({
  entry: entries,
  object: 'page'
});

const createAdapter = (): FacebookPageConnectorAdapter =>
  new FacebookPageConnectorAdapter({
    appId: APP_ID,
    connectionId: CONNECTION_ID,
    pageId: PAGE_ID
  });

describe('FacebookPageConnectorAdapter', () => {
  it('declares the official Facebook Page inbound-text-only surface', () => {
    const adapter = createAdapter();

    expect(adapter.manifest()).toEqual({
      capabilities: [{ id: 'message.receive.text' }],
      channel: 'facebook_page',
      displayName: 'Facebook Page',
      id: 'facebook-page',
      tier: 'OFFICIAL'
    });
    expect(adapter.capabilities()).toEqual([{ id: 'message.receive.text' }]);
  });

  it('normalizes a complete Page webhook envelope into one canonical text event', () => {
    const adapter = createAdapter();

    expect(adapter.normalize(webhook())).toEqual([
      {
        channel: 'facebook_page',
        connectionId: CONNECTION_ID,
        id: 'facebook-page:facebook_support:event:mid.abc-123',
        message: {
          conversationId: 'user_123',
          id: 'mid.abc-123',
          senderId: 'user_123',
          text: 'Chào Hưng 👋'
        },
        occurredAt: '2026-08-12T00:00:00.000Z',
        providerEventId: 'mid.abc-123',
        type: 'message.received'
      }
    ]);
  });

  it('extracts unique valid Page IDs for a route to select HMAC candidates', () => {
    const rawWebhook = webhook([
      pageEntry(),
      pageEntry({ id: OTHER_PAGE_ID, messaging: [] }),
      pageEntry({ id: PAGE_ID, messaging: [] }),
      { id: PAGE_ID }
    ]);

    const pageIds = toFacebookPageWebhookPageIds(rawWebhook);

    expect(pageIds).toEqual([PAGE_ID, OTHER_PAGE_ID]);
    expect(Object.isFrozen(pageIds)).toBe(true);
  });

  it('fails closed during HMAC candidate selection for any malformed entry', () => {
    expect(
      toFacebookPageWebhookPageIds(
        webhook([pageEntry(), pageEntry({ id: 'not-a-page-id', messaging: [] })])
      )
    ).toEqual([]);
    expect(toFacebookPageWebhookPageIds(webhook([pageEntry(), {}]))).toEqual([]);
    expect(toFacebookPageWebhookPageIds(webhook([pageEntry(), null]))).toEqual([]);
  });

  it('handles a batch and emits only text from its configured Page', () => {
    const adapter = createAdapter();
    const rawWebhook = webhook([
      pageEntry({
        id: OTHER_PAGE_ID,
        messaging: [
          textMessaging({
            message: { mid: 'mid.other-page', text: 'Không thuộc Page này.' },
            recipient: { id: OTHER_PAGE_ID }
          })
        ]
      }),
      pageEntry({
        messaging: [
          textMessaging(),
          textMessaging({ message: { mid: 'mid.second', text: 'Tin thứ hai.' } }),
          { delivery: { mids: ['mid.delivery'] }, recipient: { id: PAGE_ID } }
        ]
      })
    ]);

    expect(adapter.normalize(rawWebhook)).toEqual([
      expect.objectContaining({
        id: 'facebook-page:facebook_support:event:mid.abc-123',
        providerEventId: 'mid.abc-123'
      }),
      expect.objectContaining({
        id: 'facebook-page:facebook_support:event:mid.second',
        message: expect.objectContaining({ text: 'Tin thứ hai.' }),
        providerEventId: 'mid.second'
      })
    ]);
  });

  it('requires the entry and recipient Page IDs to match its configured Page', () => {
    const adapter = createAdapter();

    expect(
      adapter.normalize(
        webhook([
          pageEntry({
            messaging: [textMessaging({ recipient: { id: OTHER_PAGE_ID } })]
          }),
          pageEntry({
            id: OTHER_PAGE_ID,
            messaging: [
              textMessaging({
                recipient: { id: OTHER_PAGE_ID }
              })
            ]
          })
        ])
      )
    ).toEqual([]);
  });

  it('ignores echoes and unsupported Page webhook items', () => {
    const adapter = createAdapter();

    expect(
      adapter.normalize(
        webhook([
          pageEntry({
            messaging: [
              textMessaging({
                message: {
                  is_echo: true,
                  mid: 'mid.echo',
                  text: 'Bản sao của Page.'
                }
              }),
              {
                postback: { payload: 'ignored' },
                recipient: { id: PAGE_ID },
                sender: { id: 'user' }
              },
              textMessaging({ message: { attachments: [], mid: 'mid.attachment-only' } }),
              textMessaging({
                message: { mid: 'mid.false-echo', text: 'Tin của người dùng.', is_echo: false }
              })
            ]
          })
        ])
      )
    ).toEqual([
      expect.objectContaining({
        id: 'facebook-page:facebook_support:event:mid.false-echo',
        providerEventId: 'mid.false-echo'
      })
    ]);
  });

  it.each([
    null,
    [],
    {},
    { object: 'instagram', entry: [pageEntry()] },
    { object: 'page', entry: {} },
    webhook([pageEntry({ id: 'page_123' })]),
    webhook([pageEntry({ messaging: [textMessaging({ sender: { id: '' } })] })]),
    webhook([
      pageEntry({ messaging: [textMessaging({ message: { mid: '', text: 'Tin nhắn' } })] })
    ]),
    webhook([pageEntry({ messaging: [textMessaging({ message: { mid: 'mid', text: 42 } })] })])
  ])('ignores malformed or out-of-scope webhook input without throwing: %j', (rawWebhook) => {
    const adapter = createAdapter();

    expect(() => adapter.normalize(rawWebhook)).not.toThrow();
    expect(adapter.normalize(rawWebhook)).toEqual([]);
    expect(toFacebookPageTextEvents(rawWebhook)).toEqual([]);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1786492800000', 8_640_000_000_000_001])(
    'rejects invalid Unix-millisecond timestamps: %j',
    (timestamp) => {
      const adapter = createAdapter();
      const rawWebhook = webhook([pageEntry({ messaging: [textMessaging({ timestamp })] })]);

      expect(adapter.normalize(rawWebhook)).toEqual([]);
      expect(toFacebookPageTextEvents(rawWebhook)).toEqual([]);
    }
  );

  it('accepts Unix epoch zero and the greatest valid JavaScript date timestamp', () => {
    const adapter = createAdapter();

    expect(
      adapter.normalize(webhook([pageEntry({ messaging: [textMessaging({ timestamp: 0 })] })]))[0]
        ?.occurredAt
    ).toBe('1970-01-01T00:00:00.000Z');
    expect(
      adapter.normalize(
        webhook([pageEntry({ messaging: [textMessaging({ timestamp: 8_640_000_000_000_000 })] })])
      )[0]?.occurredAt
    ).toBe('+275760-09-13T00:00:00.000Z');
  });

  it('fails closed when raw webhook accessors throw', () => {
    const throwingEntryWebhook = Object.defineProperty({}, 'entry', {
      get: (): never => {
        throw new Error('Synthetic entry getter must not escape.');
      }
    });
    const throwingMessage = Object.defineProperty(
      {
        message: { text: 'Tin nhắn' },
        recipient: { id: PAGE_ID },
        sender: { id: 'user_123' },
        timestamp: TIMESTAMP
      },
      'message',
      {
        get: (): never => {
          throw new Error('Synthetic message getter must not escape.');
        }
      }
    );
    const rawWebhook = webhook([pageEntry({ messaging: [throwingMessage] })]);

    Object.defineProperty(throwingEntryWebhook, 'object', { value: 'page' });

    expect(() => toFacebookPageWebhookPageIds(throwingEntryWebhook)).not.toThrow();
    expect(toFacebookPageWebhookPageIds(throwingEntryWebhook)).toEqual([]);
    expect(() => toFacebookPageTextEvents(rawWebhook)).not.toThrow();
    expect(toFacebookPageTextEvents(rawWebhook)).toEqual([]);
    expect(createAdapter().normalize(rawWebhook)).toEqual([]);
  });

  it('rejects invalid configured App and Page identifiers without reflecting them', () => {
    const error = (() => {
      try {
        new FacebookPageConnectorAdapter({
          appId: 'app_123',
          connectionId: CONNECTION_ID,
          pageId: PAGE_ID
        });
      } catch (thrown) {
        return thrown;
      }

      throw new Error('Expected invalid configuration to fail.');
    })();

    expect(error).toBeInstanceOf(FacebookPageConnectorConfigurationError);
    expect(error instanceof Error ? error.message : '').not.toContain(CONNECTION_ID);
    expect(
      () =>
        new FacebookPageConnectorAdapter({
          appId: APP_ID,
          connectionId: '.',
          pageId: PAGE_ID
        })
    ).toThrow(FacebookPageConnectorConfigurationError);
    expect(
      () =>
        new FacebookPageConnectorAdapter({
          appId: APP_ID,
          connectionId: CONNECTION_ID,
          pageId: 'page_123'
        })
    ).toThrow(FacebookPageConnectorConfigurationError);
  });

  it('turns an unusual configuration getter into the same safe error', () => {
    const options = Object.defineProperty(
      {
        connectionId: CONNECTION_ID,
        pageId: PAGE_ID
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
        new FacebookPageConnectorAdapter(
          options as unknown as ConstructorParameters<typeof FacebookPageConnectorAdapter>[0]
        );
      } catch (thrown) {
        return thrown;
      }

      throw new Error('Expected invalid configuration to fail.');
    })();

    expect(error).toBeInstanceOf(FacebookPageConnectorConfigurationError);
    expect(error instanceof Error ? error.message : '').not.toContain(
      'Synthetic configuration detail'
    );
  });

  it('exposes only a stable receive capability through connection lifecycle states', async () => {
    const adapter = createAdapter();

    await expect(adapter.health()).resolves.toEqual({
      capabilities: [{ id: 'message.receive.text' }],
      channel: 'facebook_page',
      connectorId: 'facebook-page',
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
        recipientId: 'user_123',
        text: 'Không được gửi ở lát này.',
        type: 'message.send.text'
      })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(FacebookPageCommandRejectedError);
    expect(error).toMatchObject({
      code: 'unsupported_capability',
      rejection: {
        capability: 'message.send.text',
        code: 'unsupported_capability'
      }
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  ZaloOaCommandRejectedError,
  ZaloOaConnectorAdapter,
  ZaloOaConnectorConfigurationError,
  toZaloOaTextEvent,
  toZaloOaWebhookIdentity
} from './index.js';

const APP_ID = '1234567890123456789';
const CONNECTION_ID = 'zalo_support';
const OA_ID = '987654321098765432';
const TIMESTAMP = '1786492800000';

const textEvent = (): Record<string, unknown> => ({
  app_id: APP_ID,
  event_name: 'user_send_text',
  message: {
    msg_id: 'message_abc-123',
    text: 'Chào Hưng 👋'
  },
  recipient: {
    id: OA_ID
  },
  sender: {
    id: 'user_123'
  },
  timestamp: TIMESTAMP
});

const createAdapter = (): ZaloOaConnectorAdapter =>
  new ZaloOaConnectorAdapter({
    appId: APP_ID,
    connectionId: CONNECTION_ID,
    oaId: OA_ID
  });

describe('ZaloOaConnectorAdapter', () => {
  it('declares the official Zalo OA inbound-text-only surface', () => {
    const adapter = createAdapter();

    expect(adapter.manifest()).toEqual({
      capabilities: [{ id: 'message.receive.text' }],
      channel: 'zalo_oa',
      displayName: 'Zalo Official Account',
      id: 'zalo-oa',
      tier: 'OFFICIAL'
    });
    expect(adapter.capabilities()).toEqual([{ id: 'message.receive.text' }]);
  });

  it('normalizes a signed-route-selected user_send_text event into one canonical event', () => {
    const adapter = createAdapter();

    expect(adapter.normalize(textEvent())).toEqual([
      {
        channel: 'zalo_oa',
        connectionId: CONNECTION_ID,
        id: 'zalo-oa:zalo_support:event:message_abc-123',
        message: {
          conversationId: 'user_123',
          id: 'message_abc-123',
          senderId: 'user_123',
          text: 'Chào Hưng 👋'
        },
        occurredAt: '2026-08-12T00:00:00.000Z',
        providerEventId: 'message_abc-123',
        type: 'message.received'
      }
    ]);
  });

  it('keeps the provider identity fields available to the route selector without retaining raw input', () => {
    const event = {
      ...textEvent(),
      ignored_provider_extension: { nested: true }
    };

    expect(toZaloOaTextEvent(event)).toEqual({
      appId: APP_ID,
      messageId: 'message_abc-123',
      oaId: OA_ID,
      senderId: 'user_123',
      text: 'Chào Hưng 👋',
      timestamp: TIMESTAMP
    });
  });

  it('extracts strict identity from an unsupported event before message normalization', () => {
    const imageEvent = {
      app_id: APP_ID,
      event_name: 'user_send_image',
      recipient: { id: OA_ID },
      timestamp: TIMESTAMP
    };

    const identity = toZaloOaWebhookIdentity(imageEvent);

    expect(identity).toEqual({ appId: APP_ID, oaId: OA_ID, timestamp: TIMESTAMP });
    expect(Object.isFrozen(identity)).toBe(true);
    expect(toZaloOaTextEvent(imageEvent)).toBeUndefined();
  });

  it.each([
    null,
    [],
    {},
    { app_id: 'app_123', recipient: { id: OA_ID }, timestamp: TIMESTAMP },
    { app_id: APP_ID, recipient: { id: 'oa_123' }, timestamp: TIMESTAMP },
    { app_id: APP_ID, recipient: [], timestamp: TIMESTAMP },
    { app_id: APP_ID, recipient: { id: OA_ID }, timestamp: 1_786_492_800_000 },
    { app_id: APP_ID, recipient: { id: OA_ID }, timestamp: '8640000000000001' }
  ])('rejects malformed webhook identity without throwing: %j', (rawEvent) => {
    expect(() => toZaloOaWebhookIdentity(rawEvent)).not.toThrow();
    expect(toZaloOaWebhookIdentity(rawEvent)).toBeUndefined();
  });

  it('does not normalize a correctly shaped event for a different Zalo App or OA', () => {
    const adapter = createAdapter();

    expect(adapter.normalize({ ...textEvent(), app_id: '1234567890123456790' })).toEqual([]);
    expect(
      adapter.normalize({
        ...textEvent(),
        recipient: { id: '987654321098765433' }
      })
    ).toEqual([]);
  });

  it('uses the opaque connection identifier in canonical IDs to avoid cross-account collisions', () => {
    const support = createAdapter();
    const sales = new ZaloOaConnectorAdapter({
      appId: APP_ID,
      connectionId: 'zalo_sales',
      oaId: OA_ID
    });

    const supportEvent = support.normalize(textEvent())[0];
    const salesEvent = sales.normalize(textEvent())[0];

    expect(supportEvent?.id).toBe('zalo-oa:zalo_support:event:message_abc-123');
    expect(salesEvent?.id).toBe('zalo-oa:zalo_sales:event:message_abc-123');
    expect(supportEvent?.id).not.toBe(salesEvent?.id);
  });

  it('rejects a blank configured identifier without reflecting it in the error', () => {
    const error = (() => {
      try {
        new ZaloOaConnectorAdapter({
          appId: '',
          connectionId: CONNECTION_ID,
          oaId: OA_ID
        });
      } catch (thrown) {
        return thrown;
      }

      throw new Error('Expected invalid configuration to fail.');
    })();

    expect(error).toBeInstanceOf(ZaloOaConnectorConfigurationError);
    expect(error instanceof Error ? error.message : '').not.toContain(CONNECTION_ID);
  });

  it.each([
    { appId: 'app_123', connectionId: CONNECTION_ID, oaId: OA_ID },
    { appId: APP_ID, connectionId: '.', oaId: OA_ID },
    { appId: APP_ID, connectionId: CONNECTION_ID, oaId: 'oa_123' }
  ])('rejects identifier shapes outside the runtime configuration invariant', (options) => {
    expect(() => new ZaloOaConnectorAdapter(options)).toThrow(ZaloOaConnectorConfigurationError);
  });

  it('turns an unusual configuration getter into the same safe error', () => {
    const options = Object.defineProperty(
      {
        connectionId: CONNECTION_ID,
        oaId: OA_ID
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
        new ZaloOaConnectorAdapter(
          options as unknown as ConstructorParameters<typeof ZaloOaConnectorAdapter>[0]
        );
      } catch (thrown) {
        return thrown;
      }

      throw new Error('Expected invalid configuration to fail.');
    })();

    expect(error).toBeInstanceOf(ZaloOaConnectorConfigurationError);
    expect(error instanceof Error ? error.message : '').not.toContain(
      'Synthetic configuration detail'
    );
  });

  it.each([
    null,
    [],
    {},
    { ...textEvent(), event_name: 'user_send_image' },
    { ...textEvent(), app_id: '' },
    { ...textEvent(), app_id: 'app_123' },
    { ...textEvent(), recipient: { id: '' } },
    { ...textEvent(), recipient: { id: 'oa_123' } },
    { ...textEvent(), sender: { id: '' } },
    { ...textEvent(), sender: { id: ' user_123' } },
    { ...textEvent(), message: { msg_id: '', text: 'Tin nhắn' } },
    { ...textEvent(), message: { msg_id: 'message_abc-123', text: 42 } },
    { ...textEvent(), timestamp: 1_786_492_800_000 },
    { ...textEvent(), timestamp: 'not-a-timestamp' },
    { ...textEvent(), timestamp: '8640000000000001' }
  ])('ignores malformed or out-of-scope webhook input without throwing: %j', (rawEvent) => {
    const adapter = createAdapter();

    expect(() => adapter.normalize(rawEvent)).not.toThrow();
    expect(adapter.normalize(rawEvent)).toEqual([]);
    expect(toZaloOaTextEvent(rawEvent)).toBeUndefined();
  });

  it('fails closed when an unusual untrusted object throws during property access', () => {
    const rawEvent = Object.defineProperty({}, 'event_name', {
      get: (): never => {
        throw new Error('Synthetic unexpected getter.');
      }
    });
    const adapter = createAdapter();

    expect(() => adapter.normalize(rawEvent)).not.toThrow();
    expect(adapter.normalize(rawEvent)).toEqual([]);
    expect(toZaloOaTextEvent(rawEvent)).toBeUndefined();
    expect(toZaloOaWebhookIdentity(rawEvent)).toBeUndefined();
  });

  it('fails closed when an identity field getter throws during account selection', () => {
    const rawEvent = Object.defineProperty({}, 'app_id', {
      get: (): never => {
        throw new Error('Synthetic identity getter.');
      }
    });

    expect(() => toZaloOaWebhookIdentity(rawEvent)).not.toThrow();
    expect(toZaloOaWebhookIdentity(rawEvent)).toBeUndefined();
  });

  it('exposes only a stable receive capability through connection lifecycle states', async () => {
    const adapter = createAdapter();

    await expect(adapter.health()).resolves.toEqual({
      capabilities: [{ id: 'message.receive.text' }],
      channel: 'zalo_oa',
      connectorId: 'zalo-oa',
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
        text: 'Không được gửi ở Phase 3a.',
        type: 'message.send.text'
      })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ZaloOaCommandRejectedError);
    expect(error).toMatchObject({
      code: 'unsupported_capability',
      rejection: {
        capability: 'message.send.text',
        code: 'unsupported_capability'
      }
    });
  });
});

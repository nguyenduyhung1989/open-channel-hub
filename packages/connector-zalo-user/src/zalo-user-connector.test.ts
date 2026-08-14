import { describe, expect, it } from 'vitest';

import {
  ZaloUserCommandRejectedError,
  ZaloUserConnectorAdapter,
  ZaloUserConnectorConfigurationError,
  toZaloUserInboundTextEvent
} from './index.js';

const ACCOUNT_ID = '1234567890123456789';
const CONNECTION_ID = 'zalo-user-support';
const OCCURRED_AT = '2026-08-14T10:00:00.000Z';

const inboundTextEvent = (): Record<string, unknown> => ({
  accountId: ACCOUNT_ID,
  conversationId: '246845883529197922',
  occurredAt: OCCURRED_AT,
  providerEventId: 'zalo-user-message-101',
  senderId: '246845883529197922',
  text: 'Chào từ Zalo User 👋',
  threadType: 'user'
});

const createAdapter = (): ZaloUserConnectorAdapter =>
  new ZaloUserConnectorAdapter({
    accountId: ACCOUNT_ID,
    connectionId: CONNECTION_ID
  });

describe('ZaloUserConnectorAdapter', () => {
  it('declares only the experimental inbound-text capability', () => {
    const adapter = createAdapter();

    expect(adapter.manifest()).toEqual({
      capabilities: [{ id: 'message.receive.text' }],
      channel: 'zalo_user',
      displayName: 'Zalo User (experimental)',
      id: 'zalo-user',
      tier: 'EXPERIMENTAL'
    });
    expect(adapter.capabilities()).toEqual([{ id: 'message.receive.text' }]);
  });

  it('normalizes one sanitized direct-text bridge event into a canonical event', () => {
    const adapter = createAdapter();

    expect(adapter.normalize(inboundTextEvent())).toEqual([
      {
        channel: 'zalo_user',
        connectionId: CONNECTION_ID,
        id: 'zalo-user:zalo-user-support:event:zalo-user-message-101',
        message: {
          conversationId: '246845883529197922',
          id: 'zalo-user-message-101',
          senderId: '246845883529197922',
          text: 'Chào từ Zalo User 👋'
        },
        occurredAt: OCCURRED_AT,
        providerEventId: 'zalo-user-message-101',
        type: 'message.received',
        zaloUserThreadType: 'user'
      }
    ]);
  });

  it('normalizes a sanitized group-text bridge event and retains its thread kind', () => {
    const adapter = createAdapter();

    expect(
      adapter.normalize({
        ...inboundTextEvent(),
        conversationId: '146845883529197922',
        providerEventId: 'zalo-user-group-message-202',
        senderId: '246845883529197923',
        threadType: 'group'
      })
    ).toEqual([
      {
        channel: 'zalo_user',
        connectionId: CONNECTION_ID,
        id: 'zalo-user:zalo-user-support:event:zalo-user-group-message-202',
        message: {
          conversationId: '146845883529197922',
          id: 'zalo-user-group-message-202',
          senderId: '246845883529197923',
          text: 'Chào từ Zalo User 👋'
        },
        occurredAt: OCCURRED_AT,
        providerEventId: 'zalo-user-group-message-202',
        type: 'message.received',
        zaloUserThreadType: 'group'
      }
    ]);
  });

  it('retains only the safe bridge fields and ignores provider extensions', () => {
    expect(
      toZaloUserInboundTextEvent({
        ...inboundTextEvent(),
        cookie: 'must-not-survive',
        imei: 'must-not-survive',
        raw: { provider: 'must-not-survive' }
      })
    ).toEqual(inboundTextEvent());
  });

  it('does not normalize an event claimed for another personal account', () => {
    const adapter = createAdapter();

    expect(adapter.normalize({ ...inboundTextEvent(), accountId: '1234567890123456790' })).toEqual(
      []
    );
  });

  it('uses the opaque connection identifier in canonical IDs to prevent account collisions', () => {
    const support = createAdapter();
    const sales = new ZaloUserConnectorAdapter({
      accountId: ACCOUNT_ID,
      connectionId: 'zalo-user-sales'
    });

    expect(support.normalize(inboundTextEvent())[0]?.id).toBe(
      'zalo-user:zalo-user-support:event:zalo-user-message-101'
    );
    expect(sales.normalize(inboundTextEvent())[0]?.id).toBe(
      'zalo-user:zalo-user-sales:event:zalo-user-message-101'
    );
  });

  it.each([
    null,
    [],
    {},
    { ...inboundTextEvent(), accountId: 'account_123' },
    { ...inboundTextEvent(), conversationId: '' },
    { ...inboundTextEvent(), conversationId: ' user_123' },
    { ...inboundTextEvent(), providerEventId: '' },
    { ...inboundTextEvent(), senderId: 42 },
    { ...inboundTextEvent(), occurredAt: '2026-08-14' },
    { ...inboundTextEvent(), occurredAt: '2026-08-14T10:00:00.000+00:00' },
    { ...inboundTextEvent(), text: 42 },
    { ...inboundTextEvent(), text: 'x'.repeat(16_385) },
    { ...inboundTextEvent(), threadType: 'channel' }
  ])('ignores malformed bridge data without throwing: %j', (rawEvent) => {
    const adapter = createAdapter();

    expect(() => adapter.normalize(rawEvent)).not.toThrow();
    expect(adapter.normalize(rawEvent)).toEqual([]);
    expect(toZaloUserInboundTextEvent(rawEvent)).toBeUndefined();
  });

  it('fails closed when a getter throws while parsing bridge input', () => {
    const event = Object.defineProperty({}, 'accountId', {
      get: (): never => {
        throw new Error('Synthetic bridge getter failure.');
      }
    });

    expect(() => toZaloUserInboundTextEvent(event)).not.toThrow();
    expect(toZaloUserInboundTextEvent(event)).toBeUndefined();
  });

  it.each([
    { accountId: 'account_123', connectionId: CONNECTION_ID },
    { accountId: ACCOUNT_ID, connectionId: '.' },
    { accountId: ACCOUNT_ID, connectionId: 'zalo user support' }
  ])('rejects configuration outside the runtime invariant', (options) => {
    expect(() => new ZaloUserConnectorAdapter(options)).toThrow(
      ZaloUserConnectorConfigurationError
    );
  });

  it('exposes only receive capability through the connection lifecycle', async () => {
    const adapter = createAdapter();

    await expect(adapter.health()).resolves.toEqual({
      capabilities: [{ id: 'message.receive.text' }],
      channel: 'zalo_user',
      connectorId: 'zalo-user',
      id: CONNECTION_ID,
      status: 'connected'
    });
    await expect(adapter.disconnect()).resolves.toMatchObject({ status: 'disconnected' });
    await expect(adapter.connect()).resolves.toMatchObject({ status: 'connected' });
  });

  it('rejects every outbound command before a personal-account send path exists', async () => {
    const adapter = createAdapter();

    const error = await adapter
      .execute({
        connectionId: CONNECTION_ID,
        recipientId: '246845883529197922',
        text: 'Không được gửi từ connector thử nghiệm.',
        type: 'message.send.text'
      })
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ZaloUserCommandRejectedError);
    expect(error).toMatchObject({
      code: 'unsupported_capability',
      rejection: { capability: 'message.send.text', code: 'unsupported_capability' }
    });
  });
});

import type { ZaloUserInboundTextEvent } from '@open-channel-hub/connector-zalo-user';
import { describe, expect, it, vi } from 'vitest';

import { createZaloUserHubDelivery, ZaloUserHubDeliveryError } from './zalo-user-hub-delivery.js';

const BRIDGE_TOKEN = 'synthetic_zalo_user_bridge_token_0123456789012345678';
const EVENT: ZaloUserInboundTextEvent = Object.freeze({
  accountId: '1234567890123456789',
  conversationId: '146845883529197922',
  occurredAt: '2026-08-14T10:00:00.000Z',
  providerEventId: 'zalo-user-group-message-101',
  senderId: '246845883529197923',
  text: 'Tin nhắn nhóm tổng hợp',
  threadType: 'group'
});

describe('createZaloUserHubDelivery', () => {
  it('posts the narrow event one time to its immutable bridge endpoint', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async (): Promise<Response> => new Response(null, { status: 204 })
    );
    const deliver = createZaloUserHubDelivery({
      bridgeToken: BRIDGE_TOKEN,
      connectionId: 'zalo-user-support',
      fetchImplementation,
      hubBaseUrl: 'https://hub.example.test'
    });

    await deliver(EVENT);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://hub.example.test/v1/experimental/zalo-user/zalo-user-support/events',
      expect.objectContaining({
        body: JSON.stringify(EVENT),
        headers: {
          authorization: `Bearer ${BRIDGE_TOKEN}`,
          'content-type': 'application/json'
        },
        method: 'POST',
        signal: expect.any(AbortSignal)
      })
    );
  });

  it.each([
    async (): Promise<Response> => new Response(null, { status: 500 }),
    async (): Promise<Response> => {
      throw new Error('Synthetic network failure.');
    }
  ])('does not retry an unavailable or ambiguous Hub response', async (fetchImplementation) => {
    const fetchSpy = vi.fn<typeof fetch>(fetchImplementation);
    const deliver = createZaloUserHubDelivery({
      bridgeToken: BRIDGE_TOKEN,
      connectionId: 'zalo-user-support',
      fetchImplementation: fetchSpy,
      hubBaseUrl: 'https://hub.example.test'
    });

    const error = await deliver(EVENT).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ZaloUserHubDeliveryError);
    expect(error).not.toMatchObject({ message: expect.stringContaining(BRIDGE_TOKEN) });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it.each([
    { connectionId: '..' },
    { bridgeToken: 'short' },
    { hubBaseUrl: 'https://hub.example.test/not-root' },
    { hubBaseUrl: 'https://user:password@hub.example.test/' }
  ])('rejects an unsafe delivery boundary before a request exists: %j', (override) => {
    expect(() =>
      createZaloUserHubDelivery({
        bridgeToken: BRIDGE_TOKEN,
        connectionId: 'zalo-user-support',
        hubBaseUrl: 'https://hub.example.test/',
        ...override
      })
    ).toThrow(ZaloUserHubDeliveryError);
  });
});

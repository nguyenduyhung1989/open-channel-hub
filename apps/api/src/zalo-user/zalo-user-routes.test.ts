import type { CanonicalEvent, ConnectionRegistration } from '@open-channel-hub/contracts';
import type { InboundEventPage } from '@open-channel-hub/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { ZaloUserFeature } from './zalo-user-feature.js';
import { fingerprintZaloUserProviderIdentity } from './zalo-user-provider-identity.js';

const ACCOUNT_ID = '1234567890123456789';
const CONNECTION_ID = 'zalo-user-support';
const SALES_ACCOUNT_ID = '1234567890123456790';
const SALES_CONNECTION_ID = 'zalo-user-sales';
const BRIDGE_TOKEN = 'synthetic_zalo_user_bridge_token_0123456789012345678';
const SALES_BRIDGE_TOKEN = 'synthetic_zalo_user_sales_bridge_token_0123456789012345';
const OPERATOR_TOKEN = 'synthetic_zalo_user_operator_token_0123456789012345';
const SALES_OPERATOR_TOKEN = 'synthetic_zalo_user_sales_operator_token_012345678901';

const bridgePayload = (
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> => ({
  accountId: ACCOUNT_ID,
  conversationId: '146845883529197922',
  occurredAt: '2026-08-14T10:00:00.000Z',
  providerEventId: 'zalo-user-message-101',
  senderId: '246845883529197923',
  text: 'Synthetic group message',
  threadType: 'group',
  ...overrides
});

const canonicalEvent = (connectionId = CONNECTION_ID): CanonicalEvent =>
  Object.freeze({
    channel: 'zalo_user',
    connectionId,
    id: `zalo-user:${connectionId}:event:zalo-user-message-101`,
    message: Object.freeze({
      conversationId: '146845883529197922',
      id: 'zalo-user-message-101',
      senderId: '246845883529197923',
      text: 'Synthetic group message'
    }),
    occurredAt: '2026-08-14T10:00:00.000Z',
    providerEventId: 'zalo-user-message-101',
    type: 'message.received',
    zaloUserThreadType: 'group'
  });

describe('Zalo User bridge routes', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (app) => app.close()));
  });

  it('does not expose Zalo User routes unless an experimental bridge is configured', async () => {
    const app = await buildApp();
    applications.push(app);

    const [inbound, bridge] = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/zalo-user/inbound-events' }),
      app.inject({
        method: 'POST',
        payload: bridgePayload(),
        url: `/v1/experimental/zalo-user/${CONNECTION_ID}/events`
      })
    ]);

    expect(inbound.statusCode).toBe(404);
    expect(bridge.statusCode).toBe(404);
  });

  it('authenticates the bridge before parsing malformed JSON or invoking the feature', async () => {
    const { feature, normalize, receiveEvents } = createFeature();
    const app = await buildApp({ zaloUsers: [feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      payload: '{"accountId":',
      url: `/v1/experimental/zalo-user/${CONNECTION_ID}/events`
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(unauthorizedResponse());
    expect(normalize).not.toHaveBeenCalled();
    expect(receiveEvents).not.toHaveBeenCalled();
  });

  it('persists a sanitized group event only after the matching bridge bearer succeeds', async () => {
    const { feature, normalize, receiveEvents } = createFeature();
    const app = await buildApp({ zaloUsers: [feature] });
    applications.push(app);
    const payload = bridgePayload();

    const response = await app.inject({
      headers: {
        authorization: `Bearer ${BRIDGE_TOKEN}`,
        'content-type': 'application/json'
      },
      method: 'POST',
      payload,
      url: `/v1/experimental/zalo-user/${CONNECTION_ID}/events`
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(normalize).toHaveBeenCalledWith(payload);
    expect(receiveEvents).toHaveBeenCalledWith([canonicalEvent()]);
    expect(response.body).not.toContain(BRIDGE_TOKEN);
  });

  it('rejects a syntactically valid bridge envelope that does not normalize for its bound account', async () => {
    const normalize = vi.fn(() => []);
    const { feature, receiveEvents } = createFeature({ normalize });
    const app = await buildApp({ zaloUsers: [feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${BRIDGE_TOKEN}` },
      method: 'POST',
      payload: bridgePayload(),
      url: `/v1/experimental/zalo-user/${CONNECTION_ID}/events`
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(validationResponse());
    expect(normalize).toHaveBeenCalledWith(bridgePayload());
    expect(receiveEvents).not.toHaveBeenCalled();
  });

  it('rejects a bridge attempting another configured connection before body validation', async () => {
    const support = createFeature();
    const sales = createFeature({
      accountId: SALES_ACCOUNT_ID,
      bridgeToken: SALES_BRIDGE_TOKEN,
      connectionId: SALES_CONNECTION_ID,
      operatorApiToken: SALES_OPERATOR_TOKEN
    });
    const app = await buildApp({ zaloUsers: [support.feature, sales.feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${BRIDGE_TOKEN}`, 'content-type': 'application/json' },
      method: 'POST',
      payload: bridgePayload({ accountId: SALES_ACCOUNT_ID }),
      url: `/v1/experimental/zalo-user/${SALES_CONNECTION_ID}/events`
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(unauthorizedResponse());
    expect(support.normalize).not.toHaveBeenCalled();
    expect(sales.normalize).not.toHaveBeenCalled();
  });

  it('rejects an authenticated malformed bridge envelope without touching storage', async () => {
    const { feature, normalize, receiveEvents } = createFeature();
    const app = await buildApp({ zaloUsers: [feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${BRIDGE_TOKEN}` },
      method: 'POST',
      payload: { ...bridgePayload(), threadType: 'channel' },
      url: `/v1/experimental/zalo-user/${CONNECTION_ID}/events`
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(validationResponse());
    expect(normalize).not.toHaveBeenCalled();
    expect(receiveEvents).not.toHaveBeenCalled();
  });

  it('keeps personal-thread events outside the group-only experimental bridge scope', async () => {
    const { feature, normalize, receiveEvents } = createFeature();
    const app = await buildApp({ zaloUsers: [feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${BRIDGE_TOKEN}` },
      method: 'POST',
      payload: bridgePayload({ threadType: 'user' }),
      url: `/v1/experimental/zalo-user/${CONNECTION_ID}/events`
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(validationResponse());
    expect(normalize).not.toHaveBeenCalled();
    expect(receiveEvents).not.toHaveBeenCalled();
  });

  it('returns a generic 500 after a durable storage failure so the bridge can stop and surface it', async () => {
    const { feature } = createFeature({
      receiveEvents: vi.fn(async (): Promise<void> => {
        throw new Error('Synthetic PostgreSQL token detail must never leave the bridge route.');
      })
    });
    const app = await buildApp({ zaloUsers: [feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${BRIDGE_TOKEN}` },
      method: 'POST',
      payload: bridgePayload(),
      url: `/v1/experimental/zalo-user/${CONNECTION_ID}/events`
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'internal_error', message: 'An unexpected error occurred.' }
    });
    expect(response.body).not.toContain('PostgreSQL token');
  });

  it('lets only the selected operator read a public canonical page and strips internal thread evidence', async () => {
    const readInboundEvents = vi.fn(async (): Promise<InboundEventPage> => ({
      events: [canonicalEvent()],
      nextCursor: { beforeSequence: '4', snapshotMaxSequence: '9' }
    }));
    const { feature } = createFeature({ readInboundEvents });
    const app = await buildApp({ zaloUsers: [feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${OPERATOR_TOKEN}` },
      method: 'GET',
      url: '/v1/zalo-user/inbound-events?limit=2'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: {
        events: [
          {
            channel: 'zalo_user',
            connectionId: CONNECTION_ID,
            id: `zalo-user:${CONNECTION_ID}:event:zalo-user-message-101`,
            message: {
              conversationId: '146845883529197922',
              id: 'zalo-user-message-101',
              senderId: '246845883529197923',
              text: 'Synthetic group message'
            },
            occurredAt: '2026-08-14T10:00:00.000Z',
            providerEventId: 'zalo-user-message-101',
            type: 'message.received'
          }
        ],
        nextCursor: expect.any(String)
      }
    });
    expect(response.body).not.toContain('zaloUserThreadType');
    expect(readInboundEvents).toHaveBeenCalledWith({
      connectionId: CONNECTION_ID,
      pageSize: 2
    });
  });
});

const createFeature = (
  options: Readonly<{
    accountId?: string;
    bridgeToken?: string;
    connectionId?: string;
    normalize?: ZaloUserFeature['normalize'];
    operatorApiToken?: string;
    readInboundEvents?: ZaloUserFeature['readInboundEvents'];
    receiveEvents?: ZaloUserFeature['receiveEvents'];
  }> = {}
): Readonly<{
  feature: ZaloUserFeature;
  normalize: ReturnType<typeof vi.fn>;
  receiveEvents: ReturnType<typeof vi.fn>;
}> => {
  const accountId = options.accountId ?? ACCOUNT_ID;
  const connectionId = options.connectionId ?? CONNECTION_ID;
  const normalize = options.normalize ?? vi.fn(() => [canonicalEvent(connectionId)]);
  const receiveEvents = options.receiveEvents ?? vi.fn(async (): Promise<void> => undefined);
  const feature: ZaloUserFeature = Object.freeze({
    accountId,
    bridgeToken: options.bridgeToken ?? BRIDGE_TOKEN,
    connectionId,
    normalize,
    operatorApiToken: options.operatorApiToken ?? OPERATOR_TOKEN,
    readInboundEvents:
      options.readInboundEvents ?? vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
    receiveEvents,
    registration: Object.freeze({
      channel: 'zalo_user',
      connectorId: 'zalo-user',
      id: connectionId,
      providerIdentityFingerprint: fingerprintZaloUserProviderIdentity(accountId),
      tier: 'EXPERIMENTAL'
    } satisfies ConnectionRegistration)
  });

  return Object.freeze({
    feature,
    normalize: normalize as ReturnType<typeof vi.fn>,
    receiveEvents: receiveEvents as ReturnType<typeof vi.fn>
  });
};

const unauthorizedResponse = () => ({
  success: false,
  error: { code: 'unauthorized', message: 'The bridge credential is invalid.' }
});

const validationResponse = () => ({
  success: false,
  error: { code: 'validation_error', message: 'The request is invalid.' }
});

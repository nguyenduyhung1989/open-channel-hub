import type {
  CreateOutboundReplyCommandResult,
  InboundEventPage,
  OutboundReplyCommand,
  OutboundReplyCommandHistoryPage
} from '@open-channel-hub/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { InboxFeature } from './inbox-feature.js';

const SUPPORT_TOKEN = 'synthetic_inbox_support_token_01234567890123456789';
const SALES_TOKEN = 'synthetic_inbox_sales_token_01234567890123456789012';
const SUPPORT_CONNECTION_IDS = Object.freeze(['facebook-page-support', 'telegram-bot-support']);

describe('Inbox outbound-commands route', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (app) => app.close()));
  });

  it('does not expose the command endpoint when no configured inbox exists', async () => {
    const app = await buildApp();
    applications.push(app);

    const response = await app.inject({ method: 'POST', url: '/v1/inbox/outbound-commands' });

    expect(response.statusCode).toBe(404);
  });

  it('authenticates before Fastify parses an invalid JSON body', async () => {
    const { createOutboundReplyCommand, feature } = createFeature();
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      payload: '{not valid json',
      url: '/v1/inbox/outbound-commands'
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'unauthorized', message: 'The inbox credential is invalid.' }
    });
    expect(createOutboundReplyCommand).not.toHaveBeenCalled();
  });

  it('records an exact source-bound intent and returns only safe queued metadata', async () => {
    const { createOutboundReplyCommand, feature } = createFeature({
      createOutboundReplyCommand: vi.fn(async (): Promise<CreateOutboundReplyCommandResult> =>
        Object.freeze({ command: command(), kind: 'created' })
      )
    });
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
      method: 'POST',
      payload: {
        clientOperationId: 'operator-reply-20260813-0001',
        sourceConnectionId: 'telegram-bot-support',
        sourceProviderEventId: '9001',
        text: '  Preserve this operator text exactly.  '
      },
      url: '/v1/inbox/outbound-commands'
    });

    expect(response.statusCode).toBe(201);
    expect(createOutboundReplyCommand).toHaveBeenCalledWith({
      clientOperationId: 'operator-reply-20260813-0001',
      sourceConnectionId: 'telegram-bot-support',
      sourceProviderEventId: '9001',
      text: '  Preserve this operator text exactly.  '
    });
    expect(response.json()).toEqual({
      success: true,
      data: command()
    });
    expect(response.body).not.toContain('operator text exactly');
    expect(response.body).not.toContain(SUPPORT_TOKEN);
    expect(response.body).not.toContain('dashboardPrincipalId');
    expect(response.body).not.toContain('"authorization"');
    expect(response.body).not.toContain('replyTargetId');
  });

  it('uses 200 only for an idempotent replay and 409 for a conflicting operation key', async () => {
    const outcomes: CreateOutboundReplyCommandResult[] = [
      Object.freeze({ command: command(), kind: 'idempotent_replay' }),
      Object.freeze({ kind: 'idempotency_conflict' })
    ];
    const { feature } = createFeature({
      createOutboundReplyCommand: vi.fn(async (): Promise<CreateOutboundReplyCommandResult> => {
        const outcome = outcomes.shift();

        if (outcome === undefined) {
          throw new Error('The test configured too few command outcomes.');
        }

        return outcome;
      })
    });
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);
    const payload = {
      clientOperationId: 'operator-reply-20260813-0001',
      sourceConnectionId: 'telegram-bot-support',
      sourceProviderEventId: '9001',
      text: 'The original reply text.'
    };

    const replay = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
      method: 'POST',
      payload,
      url: '/v1/inbox/outbound-commands'
    });
    const conflict = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
      method: 'POST',
      payload: { ...payload, text: 'A different reply text.' },
      url: '/v1/inbox/outbound-commands'
    });

    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({ success: true, data: command() });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({
      success: false,
      error: {
        code: 'idempotency_conflict',
        message: 'The operation identifier conflicts with an existing command.'
      }
    });
  });

  it('makes a missing or out-of-scope source indistinguishable', async () => {
    const support = createFeature();
    const sales = createFeature({
      connectionIds: Object.freeze(['telegram-bot-sales']),
      id: 'sales',
      token: SALES_TOKEN
    });
    const app = await buildApp({ inboxes: [support.feature, sales.feature] });
    applications.push(app);

    const payload = {
      clientOperationId: 'operator-reply-20260813-0002',
      sourceConnectionId: 'telegram-bot-sales',
      sourceProviderEventId: '9001',
      text: 'Reply only if the source exists.'
    };
    const [outsideScope, missing] = await Promise.all([
      app.inject({
        headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
        method: 'POST',
        payload,
        url: '/v1/inbox/outbound-commands'
      }),
      app.inject({
        headers: { authorization: `Bearer ${SALES_TOKEN}` },
        method: 'POST',
        payload: { ...payload, sourceProviderEventId: 'missing-9001' },
        url: '/v1/inbox/outbound-commands'
      })
    ]);

    const expected = {
      success: false,
      error: { code: 'not_found', message: 'The requested source event does not exist.' }
    };
    expect(outsideScope.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(outsideScope.json()).toEqual(expected);
    expect(missing.json()).toEqual(expected);
    expect(support.createOutboundReplyCommand).toHaveBeenCalledWith(payload);
    expect(sales.createOutboundReplyCommand).toHaveBeenCalledWith({
      ...payload,
      sourceProviderEventId: 'missing-9001'
    });
  });

  it('rejects malformed bodies without calling the inbox capability', async () => {
    const { createOutboundReplyCommand, feature } = createFeature();
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);
    const valid = {
      clientOperationId: 'operator-reply-20260813-0003',
      sourceConnectionId: 'telegram-bot-support',
      sourceProviderEventId: '9001',
      text: 'A valid reply.'
    };

    for (const payload of [
      { ...valid, clientOperationId: '..' },
      { ...valid, sourceConnectionId: '.' },
      { ...valid, sourceProviderEventId: ' contains-space' },
      { ...valid, text: '   ' },
      { ...valid, text: 'x'.repeat(2_001) },
      { ...valid, recipientId: 'caller-selected-target' },
      {
        ...valid,
        allowedConnectionIds: ['telegram-bot-sales'],
        authorization: {
          dashboardPrincipalId: 'sales-agent',
          inboxId: 'sales',
          kind: 'dashboard_principal'
        },
        inboxId: 'sales'
      }
    ]) {
      const response = await app.inject({
        headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
        method: 'POST',
        payload,
        url: '/v1/inbox/outbound-commands'
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        success: false,
        error: { code: 'validation_error', message: 'The request is invalid.' }
      });
    }

    expect(createOutboundReplyCommand).not.toHaveBeenCalled();
  });

  it('turns an unexpected command-store failure into a generic 500 response', async () => {
    const { feature } = createFeature({
      createOutboundReplyCommand: vi.fn(async (): Promise<CreateOutboundReplyCommandResult> => {
        throw new Error('Synthetic database password must not reach the operator.');
      })
    });
    const app = await buildApp({ inboxes: [feature] });
    applications.push(app);

    const response = await app.inject({
      headers: { authorization: `Bearer ${SUPPORT_TOKEN}` },
      method: 'POST',
      payload: {
        clientOperationId: 'operator-reply-20260813-0004',
        sourceConnectionId: 'telegram-bot-support',
        sourceProviderEventId: '9001',
        text: 'A valid reply.'
      },
      url: '/v1/inbox/outbound-commands'
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      success: false,
      error: { code: 'internal_error', message: 'An unexpected error occurred.' }
    });
    expect(response.body).not.toContain('database password');
  });
});

const command = (): OutboundReplyCommand =>
  Object.freeze({
    createdAt: '2026-08-13T00:00:00.000Z',
    id: '42',
    sourceConnectionId: 'telegram-bot-support',
    sourceProviderEventId: '9001',
    state: 'queued'
  });

const createFeature = (
  overrides: Readonly<Partial<InboxFeature>> = {}
): Readonly<{
  createOutboundReplyCommand: ReturnType<typeof vi.fn>;
  feature: InboxFeature;
}> => {
  const createOutboundReplyCommand =
    overrides.createOutboundReplyCommand ??
    vi.fn(async (): Promise<CreateOutboundReplyCommandResult> =>
      Object.freeze({ kind: 'source_unavailable' })
    );
  const feature: InboxFeature = Object.freeze({
    connectionIds: SUPPORT_CONNECTION_IDS,
    createDashboardReplyIntentCapability: vi.fn(() =>
      Object.freeze({ recordReplyIntent: createOutboundReplyCommand })
    ),
    createOutboundReplyCommand,
    id: 'support',
    readInboundEvents: vi.fn(async (): Promise<InboundEventPage> => ({ events: [] })),
    readOutboundReplyCommandHistory: vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => ({
      commands: []
    })),
    token: SUPPORT_TOKEN,
    ...overrides,
    createDashboardTelegramDeliveryAuthorizationCapability:
      overrides.createDashboardTelegramDeliveryAuthorizationCapability ??
      vi.fn(() =>
        Object.freeze({
          recordTelegramDeliveryAuthorization: async () =>
            Object.freeze({ kind: 'command_unavailable' } as const)
        })
      )
  });

  return Object.freeze({
    createOutboundReplyCommand: createOutboundReplyCommand as ReturnType<typeof vi.fn>,
    feature
  });
};

import type {
  CreateOutboundReplyCommandResult,
  DashboardSessionStore,
  InboundEventPage,
  OutboundReplyCommandHistoryPage
} from '@open-channel-hub/domain';
import { describe, expect, it, vi } from 'vitest';

import type { RuntimeDashboard } from '../connections/runtime-connection-configuration.js';
import type { InboxFeature } from '../inbox/inbox-feature.js';
import {
  createRuntimeDashboardFeature,
  RuntimeDashboardFeatureError
} from './create-runtime-dashboard-feature.js';

const SUPPORT_TOKEN = 'synthetic_inbox_support_token_01234567890123456789';
const SALES_TOKEN = 'synthetic_inbox_sales_token_01234567890123456789012';

describe('runtime dashboard feature', () => {
  it('keeps the inbox bearer out of the server-rendering capability graph', async () => {
    const supportRead = vi.fn(async (): Promise<InboundEventPage> => ({ events: [] }));
    const supportHistoryRead = vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => ({
      commands: []
    }));
    const supportReplyIntent = vi.fn(async (): Promise<CreateOutboundReplyCommandResult> =>
      Object.freeze({ kind: 'source_unavailable' })
    );
    const supportDashboardCapability = vi.fn(() =>
      Object.freeze({ recordReplyIntent: supportReplyIntent })
    );
    const dashboard = createRuntimeDashboardFeature(
      runtimeDashboard({ supportReplyIntentInboxIds: ['support-inbox'] }),
      [
        inbox(
          'support-inbox',
          SUPPORT_TOKEN,
          supportRead,
          supportHistoryRead,
          supportReplyIntent,
          supportDashboardCapability
        ),
        inbox('sales-inbox', SALES_TOKEN)
      ],
      sessionStore()
    );

    const principal = dashboard.findPrincipal('support-agent');
    const supportInbox = dashboard.findInbox('support-agent', 'support-inbox');
    const replyIntentInbox = dashboard.findReplyIntentInbox('support-agent', 'support-inbox');

    expect(principal).toEqual({
      id: 'support-agent',
      inboxIds: ['sales-inbox', 'support-inbox'],
      passwordHash:
        '$argon2id$v=19$m=19456,p=1,t=2$c3ludGhldGljLXNhbHQ$W+RmllYNYY+qahTKzQkGOeAD0Lv1oPXOFLTM1cAY150',
      replyIntentInboxIds: ['support-inbox'],
      telegramDeliveryAuthorizationInboxIds: []
    });
    expect(supportInbox).toEqual({
      connectionIds: ['telegram-bot-support'],
      id: 'support-inbox',
      readInboundEvents: supportRead,
      readOutboundReplyCommandHistory: supportHistoryRead
    });
    expect(JSON.stringify(supportInbox)).not.toContain(SUPPORT_TOKEN);
    expect(JSON.stringify(dashboard.listInboxes('support-agent'))).not.toContain(SUPPORT_TOKEN);
    expect(supportInbox).not.toHaveProperty('createOutboundReplyCommand');
    expect(supportInbox).not.toHaveProperty('token');
    expect(replyIntentInbox).toEqual({
      id: 'support-inbox',
      recordReplyIntent: expect.any(Function)
    });
    expect(JSON.stringify(replyIntentInbox)).not.toContain(SUPPORT_TOKEN);
    expect(replyIntentInbox).not.toHaveProperty('connectionIds');
    expect(replyIntentInbox).not.toHaveProperty('createDashboardReplyIntentCapability');
    expect(replyIntentInbox).not.toHaveProperty('createOutboundReplyCommand');
    expect(replyIntentInbox).not.toHaveProperty('readInboundEvents');
    expect(replyIntentInbox).not.toHaveProperty('readOutboundReplyCommandHistory');
    expect(replyIntentInbox).not.toHaveProperty('token');
    expect(dashboard.findInbox('sales-agent', 'support-inbox')).toBeUndefined();
    expect(dashboard.findReplyIntentInbox('support-agent', 'sales-inbox')).toBeUndefined();
    expect(dashboard.findReplyIntentInbox('sales-agent', 'support-inbox')).toBeUndefined();
    expect(dashboard.listInboxes('unknown')).toEqual([]);

    await replyIntentInbox?.recordReplyIntent({
      clientOperationId: 'cf30a1d2-b7f2-4b55-afd5-1e1f6a5ef6de',
      sourceConnectionId: 'telegram-bot-support',
      sourceProviderEventId: 'synthetic-event-101',
      text: 'Synthetic reply intent'
    });

    expect(supportDashboardCapability).toHaveBeenCalledOnce();
    expect(supportDashboardCapability).toHaveBeenCalledWith('support-agent');
    expect(supportReplyIntent).toHaveBeenCalledWith({
      clientOperationId: 'cf30a1d2-b7f2-4b55-afd5-1e1f6a5ef6de',
      sourceConnectionId: 'telegram-bot-support',
      sourceProviderEventId: 'synthetic-event-101',
      text: 'Synthetic reply intent'
    });

    const readOnlyCapabilityFactory = vi.fn(() =>
      Object.freeze({
        recordReplyIntent: async (): Promise<CreateOutboundReplyCommandResult> =>
          Object.freeze({ kind: 'source_unavailable' })
      })
    );
    const readOnlyDashboard = createRuntimeDashboardFeature(
      runtimeDashboard(),
      [
        inbox(
          'support-inbox',
          SUPPORT_TOKEN,
          undefined,
          undefined,
          undefined,
          readOnlyCapabilityFactory
        ),
        inbox('sales-inbox', SALES_TOKEN)
      ],
      sessionStore()
    );

    expect(
      readOnlyDashboard.findReplyIntentInbox('support-agent', 'support-inbox')
    ).toBeUndefined();
    expect(readOnlyCapabilityFactory).not.toHaveBeenCalled();
  });

  it('creates a separate Telegram delivery-authorization capability only for its configured principal inbox scope', async () => {
    const recordTelegramDeliveryAuthorization = vi.fn(async () =>
      Object.freeze({ kind: 'command_unavailable' } as const)
    );
    const telegramDeliveryAuthorizationCapabilityFactory = vi.fn(() =>
      Object.freeze({ recordTelegramDeliveryAuthorization })
    );
    const dashboard = createRuntimeDashboardFeature(
      runtimeDashboard({ supportTelegramDeliveryAuthorizationInboxIds: ['support-inbox'] }),
      [
        inbox(
          'support-inbox',
          SUPPORT_TOKEN,
          undefined,
          undefined,
          undefined,
          undefined,
          telegramDeliveryAuthorizationCapabilityFactory
        ),
        inbox('sales-inbox', SALES_TOKEN)
      ],
      sessionStore()
    );

    const authorizationInbox = dashboard.findTelegramDeliveryAuthorizationInbox(
      'support-agent',
      'support-inbox'
    );

    expect(dashboard.findReplyIntentInbox('support-agent', 'support-inbox')).toBeUndefined();
    expect(authorizationInbox).toEqual({
      id: 'support-inbox',
      recordTelegramDeliveryAuthorization: expect.any(Function)
    });
    expect(authorizationInbox).not.toHaveProperty('connectionIds');
    expect(authorizationInbox).not.toHaveProperty('readInboundEvents');
    expect(authorizationInbox).not.toHaveProperty('createOutboundReplyCommand');
    expect(authorizationInbox).not.toHaveProperty(
      'createDashboardTelegramDeliveryAuthorizationCapability'
    );
    expect(JSON.stringify(authorizationInbox)).not.toContain(SUPPORT_TOKEN);
    expect(
      dashboard.findTelegramDeliveryAuthorizationInbox('support-agent', 'sales-inbox')
    ).toBeUndefined();
    expect(
      dashboard.findTelegramDeliveryAuthorizationInbox('sales-agent', 'support-inbox')
    ).toBeUndefined();

    await authorizationInbox?.recordTelegramDeliveryAuthorization({ commandId: '44' });

    expect(telegramDeliveryAuthorizationCapabilityFactory).toHaveBeenCalledOnce();
    expect(telegramDeliveryAuthorizationCapabilityFactory).toHaveBeenCalledWith('support-agent');
    expect(recordTelegramDeliveryAuthorization).toHaveBeenCalledWith({ commandId: '44' });
  });

  it('refuses a direct composition graph with duplicated or unavailable inboxes', () => {
    expect(() =>
      createRuntimeDashboardFeature(
        runtimeDashboard(),
        [inbox('support-inbox', SUPPORT_TOKEN), inbox('support-inbox', SALES_TOKEN)],
        sessionStore()
      )
    ).toThrow(RuntimeDashboardFeatureError);

    const sourceDashboard = runtimeDashboard();
    const invalidDashboard: RuntimeDashboard = {
      ...sourceDashboard,
      principals: [
        { ...sourceDashboard.principals[0]!, inboxIds: ['missing-inbox'] },
        sourceDashboard.principals[1]!
      ]
    };

    expect(() =>
      createRuntimeDashboardFeature(
        invalidDashboard,
        [inbox('support-inbox', SUPPORT_TOKEN)],
        sessionStore()
      )
    ).toThrow(RuntimeDashboardFeatureError);
  });
});

const runtimeDashboard = (
  options: Readonly<{
    supportReplyIntentInboxIds?: readonly string[];
    supportTelegramDeliveryAuthorizationInboxIds?: readonly string[];
  }> = {}
): RuntimeDashboard => ({
  principals: [
    {
      id: 'support-agent',
      inboxIds: ['sales-inbox', 'support-inbox'],
      passwordHash:
        '$argon2id$v=19$m=19456,p=1,t=2$c3ludGhldGljLXNhbHQ$W+RmllYNYY+qahTKzQkGOeAD0Lv1oPXOFLTM1cAY150',
      replyIntentInboxIds: options.supportReplyIntentInboxIds ?? [],
      telegramDeliveryAuthorizationInboxIds:
        options.supportTelegramDeliveryAuthorizationInboxIds ?? []
    },
    {
      id: 'sales-agent',
      inboxIds: ['sales-inbox'],
      passwordHash:
        '$argon2id$v=19$m=19456,p=1,t=2$c2FsZXMtc2FsdA$W+RmllYNYY+qahTKzQkGOeAD0Lv1oPXOFLTM1cAY150',
      replyIntentInboxIds: [],
      telegramDeliveryAuthorizationInboxIds: []
    }
  ],
  publicOrigin: 'https://dashboard.example.test',
  sessionCookieSigningKeys: ['synthetic_dashboard_signing_key_current_01234567890'],
  sessionIdPepper: 'synthetic_dashboard_session_pepper_012345678901234'
});

const inbox = (
  id: string,
  token: string,
  readInboundEvents: InboxFeature['readInboundEvents'] = async (): Promise<InboundEventPage> => ({
    events: []
  }),
  readOutboundReplyCommandHistory: InboxFeature['readOutboundReplyCommandHistory'] = async (): Promise<OutboundReplyCommandHistoryPage> => ({
    commands: []
  }),
  createOutboundReplyCommand: InboxFeature['createOutboundReplyCommand'] = async (): Promise<CreateOutboundReplyCommandResult> =>
    Object.freeze({ kind: 'source_unavailable' }),
  createDashboardReplyIntentCapability: InboxFeature['createDashboardReplyIntentCapability'] = () =>
    Object.freeze({ recordReplyIntent: createOutboundReplyCommand }),
  createDashboardTelegramDeliveryAuthorizationCapability: InboxFeature['createDashboardTelegramDeliveryAuthorizationCapability'] = () =>
    Object.freeze({
      recordTelegramDeliveryAuthorization: async () =>
        Object.freeze({ kind: 'command_unavailable' } as const)
    })
): InboxFeature =>
  Object.freeze({
    connectionIds: Object.freeze(['telegram-bot-support']),
    createDashboardReplyIntentCapability,
    createDashboardTelegramDeliveryAuthorizationCapability,
    createOutboundReplyCommand,
    id,
    readInboundEvents,
    readOutboundReplyCommandHistory,
    token
  });

const sessionStore = (): DashboardSessionStore =>
  Object.freeze({
    create: async () => {
      throw new Error('not used in this composition test');
    },
    readActive: async () => undefined,
    revoke: async () => undefined,
    touchActive: async () => undefined
  });

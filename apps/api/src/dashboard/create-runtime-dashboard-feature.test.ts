import type { DashboardSessionStore, InboundEventPage } from '@open-channel-hub/domain';
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
    const dashboard = createRuntimeDashboardFeature(
      runtimeDashboard(),
      [inbox('support-inbox', SUPPORT_TOKEN, supportRead), inbox('sales-inbox', SALES_TOKEN)],
      sessionStore()
    );

    const principal = dashboard.findPrincipal('support-agent');
    const supportInbox = dashboard.findInbox('support-agent', 'support-inbox');

    expect(principal).toEqual({
      id: 'support-agent',
      inboxIds: ['sales-inbox', 'support-inbox'],
      passwordHash:
        '$argon2id$v=19$m=19456,p=1,t=2$c3ludGhldGljLXNhbHQ$W+RmllYNYY+qahTKzQkGOeAD0Lv1oPXOFLTM1cAY150'
    });
    expect(supportInbox).toEqual({
      connectionIds: ['telegram-bot-support'],
      id: 'support-inbox',
      readInboundEvents: supportRead
    });
    expect(JSON.stringify(supportInbox)).not.toContain(SUPPORT_TOKEN);
    expect(JSON.stringify(dashboard.listInboxes('support-agent'))).not.toContain(SUPPORT_TOKEN);
    expect(dashboard.findInbox('sales-agent', 'support-inbox')).toBeUndefined();
    expect(dashboard.listInboxes('unknown')).toEqual([]);
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

const runtimeDashboard = (): RuntimeDashboard => ({
  principals: [
    {
      id: 'support-agent',
      inboxIds: ['sales-inbox', 'support-inbox'],
      passwordHash:
        '$argon2id$v=19$m=19456,p=1,t=2$c3ludGhldGljLXNhbHQ$W+RmllYNYY+qahTKzQkGOeAD0Lv1oPXOFLTM1cAY150'
    },
    {
      id: 'sales-agent',
      inboxIds: ['sales-inbox'],
      passwordHash:
        '$argon2id$v=19$m=19456,p=1,t=2$c2FsZXMtc2FsdA$W+RmllYNYY+qahTKzQkGOeAD0Lv1oPXOFLTM1cAY150'
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
  })
): InboxFeature =>
  Object.freeze({
    connectionIds: Object.freeze(['telegram-bot-support']),
    id,
    readInboundEvents,
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

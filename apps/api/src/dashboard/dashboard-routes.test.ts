import argon2 from 'argon2';
import type {
  CreateOutboundReplyCommandResult,
  CreateOutboundTelegramDeliveryAuthorizationResult,
  DashboardGoogleIdentityStore,
  DashboardSession,
  DashboardSessionCreateInput,
  DashboardSessionReadInput,
  DashboardSessionRevokeInput,
  DashboardSessionStore,
  DashboardSessionTouchInput,
  InboundEventPage,
  OutboundReplyCommandHistoryEntry,
  OutboundReplyCommandHistoryPage
} from '@open-channel-hub/domain';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import { buildApp } from '../app.js';
import type {
  DashboardFeature,
  DashboardGoogleAuthentication,
  DashboardInbox,
  DashboardPrincipal,
  DashboardReplyIntentInput,
  DashboardReplyIntentInbox,
  DashboardTelegramDeliveryAuthorizationInbox
} from './dashboard-feature.js';

const PUBLIC_ORIGIN = 'https://dashboard.example.test';
const SUPPORT_INBOX_TOKEN = 'synthetic_inbox_support_token_01234567890123456789';
const SALES_INBOX_TOKEN = 'synthetic_inbox_sales_token_01234567890123456789012';
const SUPPORT_CONNECTION_IDS = Object.freeze(['telegram-bot-support']);
type ReplyIntentRecord = Mock<DashboardReplyIntentInbox['recordReplyIntent']>;
type TelegramDeliveryAuthorizationRecord = Mock<
  DashboardTelegramDeliveryAuthorizationInbox['recordTelegramDeliveryAuthorization']
>;

describe('dashboard routes', () => {
  const applications: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (app) => app.close()));
  });

  it('keeps the dashboard absent unless a server-side feature is configured', async () => {
    const app = await buildApp();
    applications.push(app);

    const response = await app.inject({ method: 'GET', url: '/operator/login' });

    expect(response.statusCode).toBe(404);
  });

  it('uses a one-time signed PKCE transaction before issuing a dashboard session for a linked Google identity', async () => {
    const googleExchange = vi.fn(async () =>
      Object.freeze({ subject: 'synthetic-google-subject-101' })
    );
    const subjectHmac = vi.fn(() => 'a'.repeat(64));
    const findPrincipalId = vi.fn(async () => 'support-agent');
    const googleIdentityStore: DashboardGoogleIdentityStore = Object.freeze({
      bind: vi.fn(async () => Object.freeze({ kind: 'created' as const })),
      findPrincipalId
    });
    const googleAuthentication: DashboardGoogleAuthentication = Object.freeze({
      client: Object.freeze({
        createAuthorizationUrl: ({ state }: Readonly<{ state: string }>) =>
          `https://accounts.example.test/authorize?state=${encodeURIComponent(state)}`,
        exchangeAuthorizationCode: googleExchange,
        subjectHmac
      }),
      identityStore: googleIdentityStore
    });
    const harness = await createHarness({ googleAuthentication });
    applications.push(harness.app);

    const login = await harness.app.inject({ method: 'GET', url: '/operator/login' });

    expect(login.statusCode).toBe(200);
    expect(login.body).toContain('Đăng nhập bằng Google');
    expect(login.body).not.toContain('synthetic-google-subject-101');

    const start = await harness.app.inject({ method: 'GET', url: '/operator/auth/google/login' });
    const transactionCookie = cookieFrom(start, '__Host-och_dashboard_google_oauth');
    const state = new URL(
      start.headers.location ?? 'https://invalid.example.test'
    ).searchParams.get('state');

    expect(start.statusCode).toBe(302);
    expect(start.headers['cache-control']).toBe('no-store');
    expect(transactionCookie).toContain('HttpOnly');
    expect(transactionCookie).toContain('Secure');
    expect(transactionCookie).toContain('SameSite=Lax');
    expect(transactionCookie).not.toContain('synthetic-google-subject-101');
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const callback = await harness.app.inject({
      headers: { cookie: cookiePair(transactionCookie) },
      method: 'GET',
      url: `/operator/auth/google/callback?code=synthetic-google-code&state=${state}`
    });

    expect(callback.statusCode).toBe(303);
    expect(callback.headers.location).toBe('/operator');
    const callbackCookies = cookieHeaderValues(callback).join('\n');
    expect(callbackCookies).toContain('__Host-och_dashboard_session=');
    expect(callbackCookies).toContain('SameSite=Lax');
    expect(callbackCookies).toContain('__Host-och_dashboard_google_oauth=;');
    expect(googleExchange).toHaveBeenCalledWith({
      code: 'synthetic-google-code',
      codeVerifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      nonce: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)
    });
    expect(subjectHmac).toHaveBeenCalledWith('synthetic-google-subject-101');
    expect(findPrincipalId).toHaveBeenCalledWith({
      subjectHmac: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(JSON.stringify(findPrincipalId.mock.calls)).not.toContain(
      'synthetic-google-subject-101'
    );

    const replay = await harness.app.inject({
      headers: { cookie: cookiePair(transactionCookie) },
      method: 'GET',
      url: `/operator/auth/google/callback?code=synthetic-google-code&state=${state}`
    });

    expect(replay.statusCode).toBe(303);
    expect(replay.headers.location).toBe('/operator/login?error=invalid');
    expect(googleExchange).toHaveBeenCalledOnce();
  });

  it('does not create a dashboard account or session for an unlinked verified Google identity', async () => {
    const googleAuthentication: DashboardGoogleAuthentication = Object.freeze({
      client: Object.freeze({
        createAuthorizationUrl: ({ state }: Readonly<{ state: string }>) =>
          `https://accounts.example.test/authorize?state=${encodeURIComponent(state)}`,
        exchangeAuthorizationCode: async () =>
          Object.freeze({ subject: 'unlinked-google-subject' }),
        subjectHmac: () => 'b'.repeat(64)
      }),
      identityStore: Object.freeze({
        bind: vi.fn(async () => Object.freeze({ kind: 'created' as const })),
        findPrincipalId: vi.fn(async () => undefined)
      })
    });
    const harness = await createHarness({ googleAuthentication });
    applications.push(harness.app);

    const start = await harness.app.inject({ method: 'GET', url: '/operator/auth/google/login' });
    const transactionCookie = cookieFrom(start, '__Host-och_dashboard_google_oauth');
    const state = new URL(
      start.headers.location ?? 'https://invalid.example.test'
    ).searchParams.get('state');

    const callback = await harness.app.inject({
      headers: { cookie: cookiePair(transactionCookie) },
      method: 'GET',
      url: `/operator/auth/google/callback?code=synthetic-google-code&state=${state}`
    });

    expect(callback.statusCode).toBe(303);
    expect(callback.headers.location).toBe('/operator/login?error=invalid');
    expect(cookieHeaderValues(callback).join('\n')).not.toContain('__Host-och_dashboard_session=');
  });

  it('links Google only from an active same-principal dashboard session with origin and CSRF checks', async () => {
    const googleExchange = vi.fn(async () =>
      Object.freeze({ subject: 'synthetic-google-subject-link' })
    );
    const bind = vi.fn(async () => Object.freeze({ kind: 'created' as const }));
    const googleAuthentication: DashboardGoogleAuthentication = Object.freeze({
      client: Object.freeze({
        createAuthorizationUrl: ({ state }: Readonly<{ state: string }>) =>
          `https://accounts.example.test/authorize?state=${encodeURIComponent(state)}`,
        exchangeAuthorizationCode: googleExchange,
        subjectHmac: () => 'c'.repeat(64)
      }),
      identityStore: Object.freeze({ bind, findPrincipalId: vi.fn(async () => undefined) })
    });
    const harness = await createHarness({ googleAuthentication });
    applications.push(harness.app);
    const sessionCookie = await loginAndGetSessionCookie(harness.app);
    const page = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator'
    });
    const csrf = hiddenCsrf(page.body);

    expect(page.body).toContain('action="/operator/auth/google/link"');

    const originFailure = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: 'https://attacker.example.test'
      },
      method: 'POST',
      payload: new URLSearchParams({ csrf }).toString(),
      url: '/operator/auth/google/link'
    });
    expect(originFailure.statusCode).toBe(403);

    const start = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: new URLSearchParams({ csrf }).toString(),
      url: '/operator/auth/google/link'
    });
    const transactionCookie = cookieFrom(start, '__Host-och_dashboard_google_oauth');
    const state = new URL(
      start.headers.location ?? 'https://invalid.example.test'
    ).searchParams.get('state');

    expect(start.statusCode).toBe(302);
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const callback = await harness.app.inject({
      headers: { cookie: `${cookiePair(sessionCookie)}; ${cookiePair(transactionCookie)}` },
      method: 'GET',
      url: `/operator/auth/google/callback?code=synthetic-google-code&state=${state}`
    });

    expect(callback.statusCode).toBe(303);
    expect(callback.headers.location).toBe('/operator');
    expect(bind).toHaveBeenCalledWith({
      principalId: 'support-agent',
      subjectHmac: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(googleExchange).toHaveBeenCalledOnce();
  });

  it('renders only escaped safe queued-command history through the signed dashboard session', async () => {
    const historyRead = vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => ({
      commands: [
        unsafeHistoryEntry({
          text: '<script>synthetic history xss must remain text</script>\nsecond line'
        })
      ],
      nextCursor: Object.freeze({ beforeSequence: '8', snapshotMaxSequence: '12' })
    }));
    const harness = await createHarness({ historyRead });
    applications.push(harness.app);

    const unauthenticated = await harness.app.inject({
      method: 'GET',
      url: '/operator/outbound-commands?cursor=not-a-cursor%40&connectionId=telegram-bot-sales'
    });

    expect(unauthenticated.statusCode).toBe(303);
    expect(unauthenticated.headers.location).toBe('/operator/login');
    expect(historyRead).not.toHaveBeenCalled();

    const sessionCookie = await loginAndGetSessionCookie(harness.app);

    const response = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator/outbound-commands'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toContain(
      '&lt;script&gt;synthetic history xss must remain text&lt;/script&gt;'
    );
    expect(response.body).not.toContain('<script>');
    expect(response.body).toContain('ĐÃ GHI, CHƯA GỬI');
    expect(response.body).toContain('LUỒNG VẬN HÀNH');
    expect(response.body).toContain('Gửi nhà cung cấp');
    expect(response.body).toContain('Chưa bật — không có bộ tự gửi hoặc gửi lại');
    expect(response.body).toContain('KẾT NỐI TRONG PHẠM VI');
    expect(response.body).toContain('Xem tin nhắn đến');
    expect(response.body).not.toContain(SUPPORT_INBOX_TOKEN);
    expect(response.body).not.toContain(SALES_INBOX_TOKEN);
    expect(response.body).not.toContain('synthetic-private-reply-target');
    expect(response.body).not.toContain('synthetic-private-source-message');
    expect(response.body).not.toContain('synthetic-private-source-channel');
    expect(response.body).not.toContain('synthetic-private-client-operation');
    expect(response.body).not.toContain('synthetic-provider-event-should-not-render');
    expect(response.body).not.toContain('name="text"');
    expect(response.body).not.toContain('name="clientOperationId"');
    expect(response.body).not.toContain('action="/operator/outbound-commands"');
    expect(historyRead).toHaveBeenCalledWith({ pageSize: 50 });

    const nextCursor = nextCursorFrom(response.body);
    const continuation = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: `/operator/outbound-commands?cursor=${nextCursor}`
    });

    expect(continuation.statusCode).toBe(200);
    expect(historyRead).toHaveBeenLastCalledWith({
      cursor: { beforeSequence: '8', snapshotMaxSequence: '12' },
      pageSize: 50
    });

    const malformed = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator/outbound-commands?cursor=not-a-cursor%40'
    });

    expect(malformed.statusCode).toBe(400);
    expect(historyRead).toHaveBeenCalledTimes(2);

    const callerSelectedScope = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator/outbound-commands?connectionId=telegram-bot-sales'
    });

    expect(callerSelectedScope.statusCode).toBe(400);
    expect(historyRead).toHaveBeenCalledTimes(2);
  });

  it('hides queued-history storage failures behind the generic dashboard page', async () => {
    const historyRead = vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => {
      throw new Error('synthetic durable history failure');
    });
    const harness = await createHarness({ historyRead });
    applications.push(harness.app);
    const sessionCookie = await loginAndGetSessionCookie(harness.app);

    const response = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator/outbound-commands'
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('Yêu cầu không thể xử lý an toàn.');
    expect(response.body).not.toContain('synthetic durable history failure');
    expect(historyRead).toHaveBeenCalledWith({ pageSize: 50 });
  });

  it('renders bounded delivery and authorization evidence without leaking provider details', async () => {
    const historyRead = vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => ({
      commands: [
        unsafeHistoryEntry({ deliveryEvidenceStatus: 'not_attempted' }),
        unsafeHistoryEntry({ deliveryEvidenceStatus: 'outcome_unknown' }),
        unsafeHistoryEntry({
          authorizationRecorded: true,
          deliveryEvidenceStatus: 'provider_accepted',
          telegramDeliveryAuthorizationRecorded: true,
          telegramPrivateReplyEligibilityRecorded: true
        }),
        unsafeHistoryEntry({ deliveryEvidenceStatus: 'provider_rejected' })
      ]
    }));
    const harness = await createHarness({ historyRead });
    applications.push(harness.app);
    const sessionCookie = await loginAndGetSessionCookie(harness.app);

    const response = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator/outbound-commands'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Chưa có lần thử nào được ghi');
    expect(response.body).toContain('Đã có lần thử, chưa có kết quả chắc chắn');
    expect(response.body).toContain('Nhà cung cấp đã nhận yêu cầu');
    expect(response.body).toContain('Nhà cung cấp đã từ chối yêu cầu');
    expect(response.body).toContain('Nguồn quyền đã ghi');
    expect(response.body).toContain('Nguồn Telegram riêng đã xác minh');
    expect(response.body).toContain('Chấp thuận Telegram đã ghi');
    expect(response.body).toContain('Chưa có tin nào được gọi là đã giao hoặc đã đọc.');
    expect(response.body).not.toContain('synthetic-private-reply-target');
    expect(response.body).not.toContain('synthetic-private-source-message');
    expect(response.body).not.toContain('synthetic-provider-message-id');
    expect(response.body).not.toContain('synthetic-bot-identity-fingerprint');
  });

  it('renders and records only a server-eligible Telegram delivery authorization fact', async () => {
    const historyRead = vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => ({
      commands: [unsafeHistoryEntry({ telegramDeliveryAuthorizationEligible: true })]
    }));
    const telegramDeliveryAuthorizationRecord = vi.fn<
      DashboardTelegramDeliveryAuthorizationInbox['recordTelegramDeliveryAuthorization']
    >(async (): Promise<CreateOutboundTelegramDeliveryAuthorizationResult> =>
      Object.freeze({
        authorization: Object.freeze({
          authorizedAt: '2026-08-14T00:00:00.000Z',
          commandId: '42',
          dashboardPrincipalId: 'support-agent',
          inboxId: 'support-inbox'
        }),
        kind: 'created' as const
      })
    );
    const harness = await createHarness({
      historyRead,
      telegramDeliveryAuthorizationInboxIds: ['support-inbox'],
      telegramDeliveryAuthorizationRecord
    });
    applications.push(harness.app);
    const sessionCookie = await loginAndGetSessionCookie(harness.app);

    const history = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator/outbound-commands'
    });

    expect(history.statusCode).toBe(200);
    expect(history.headers['cache-control']).toBe('no-store');
    expect(history.body).toContain('action="/operator/telegram-delivery-authorizations"');
    expect(history.body).toContain('Ghi chấp thuận Telegram');
    expect(history.body).toContain('Thao tác này chưa gửi tin.');
    expect(history.body).not.toContain(SUPPORT_INBOX_TOKEN);
    expect(history.body).not.toContain('synthetic-private-reply-target');
    expect(history.body).not.toContain('synthetic-private-source-message');
    expect(history.body).not.toContain('synthetic-private-source-channel');
    expect(history.body).not.toContain('synthetic-private-client-operation');
    expect(history.body).not.toContain('synthetic-bot-identity-fingerprint');
    expect(history.body).not.toContain('name="recipientId"');
    expect(history.body).not.toContain('name="text"');
    expect(history.body).not.toContain('name="attempt"');
    expect(history.body).not.toContain('name="send"');
    expect(history.body).not.toContain('name="retry"');

    const form = telegramDeliveryAuthorizationFormFrom(history.body);

    expect(form).toEqual({
      commandId: '42',
      csrf: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      inbox: 'support-inbox'
    });

    const response = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: telegramDeliveryAuthorizationPayload(form),
      url: '/operator/telegram-delivery-authorizations'
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/operator/outbound-commands?inbox=support-inbox');
    expect(telegramDeliveryAuthorizationRecord).toHaveBeenCalledWith({ commandId: '42' });
    expect(Object.keys(telegramDeliveryAuthorizationRecord.mock.calls[0]?.[0] ?? {})).toEqual([
      'commandId'
    ]);
    expect(JSON.stringify(telegramDeliveryAuthorizationRecord.mock.calls)).not.toContain(
      'synthetic-private-reply-target'
    );
  });

  it('keeps Telegram delivery authorization unavailable or malformed requests away from its recorder', async () => {
    const eligibleHistory = vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => ({
      commands: [unsafeHistoryEntry({ telegramDeliveryAuthorizationEligible: true })]
    }));
    const unavailableHarness = await createHarness({
      historyRead: eligibleHistory,
      telegramDeliveryAuthorizationInboxIds: ['support-inbox']
    });
    const readOnlyHarness = await createHarness({ historyRead: eligibleHistory });
    const conflictHarness = await createHarness({
      historyRead: eligibleHistory,
      telegramDeliveryAuthorizationInboxIds: ['support-inbox'],
      telegramDeliveryAuthorizationRecord: vi.fn(
        async (): Promise<CreateOutboundTelegramDeliveryAuthorizationResult> =>
          Object.freeze({ kind: 'authorization_conflict' })
      )
    });
    applications.push(unavailableHarness.app, readOnlyHarness.app, conflictHarness.app);

    const sessionCookie = await loginAndGetSessionCookie(unavailableHarness.app);
    const history = await unavailableHarness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator/outbound-commands'
    });
    const form = telegramDeliveryAuthorizationFormFrom(history.body);
    const payload = telegramDeliveryAuthorizationPayload(form);

    const originFailure = await unavailableHarness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: 'https://attacker.example.test'
      },
      method: 'POST',
      payload,
      url: '/operator/telegram-delivery-authorizations'
    });
    const csrfFailure = await unavailableHarness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: telegramDeliveryAuthorizationPayload({
        ...form,
        csrf: Buffer.alloc(32, 3).toString('base64url')
      }),
      url: '/operator/telegram-delivery-authorizations'
    });
    const malformed = await unavailableHarness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: `${payload}&recipientId=forbidden`,
      url: '/operator/telegram-delivery-authorizations'
    });
    const outOfRangeCommandId = await unavailableHarness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: telegramDeliveryAuthorizationPayload({
        ...form,
        commandId: '9223372036854775808'
      }),
      url: '/operator/telegram-delivery-authorizations'
    });
    expect(outOfRangeCommandId.statusCode).toBe(400);
    expect(unavailableHarness.telegramDeliveryAuthorizationRecord).not.toHaveBeenCalled();
    const unavailable = await unavailableHarness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload,
      url: '/operator/telegram-delivery-authorizations'
    });

    const readOnlySession = await loginAndGetSessionCookie(readOnlyHarness.app);
    const readOnlyPage = await readOnlyHarness.app.inject({
      headers: { cookie: cookiePair(readOnlySession) },
      method: 'GET',
      url: '/operator/outbound-commands'
    });
    const readOnly = await readOnlyHarness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(readOnlySession),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: telegramDeliveryAuthorizationPayload({
        ...form,
        csrf: hiddenCsrf(readOnlyPage.body)
      }),
      url: '/operator/telegram-delivery-authorizations'
    });

    const conflict = await submitRenderedTelegramDeliveryAuthorization(conflictHarness.app);

    expect(originFailure.statusCode).toBe(403);
    expect(csrfFailure.statusCode).toBe(403);
    expect(malformed.statusCode).toBe(400);
    expect(outOfRangeCommandId.statusCode).toBe(400);
    expect(unavailable.statusCode).toBe(404);
    expect(readOnly.statusCode).toBe(404);
    expect(conflict.statusCode).toBe(409);
    expect(unavailableHarness.telegramDeliveryAuthorizationRecord).toHaveBeenCalledOnce();
    expect(readOnlyHarness.telegramDeliveryAuthorizationRecord).not.toHaveBeenCalled();

    for (const response of [
      originFailure,
      csrfFailure,
      malformed,
      outOfRangeCommandId,
      unavailable,
      readOnly,
      conflict
    ]) {
      expect(response.body).toContain('Yêu cầu không thể xử lý an toàn.');
      expect(response.body).not.toContain('synthetic-private-reply-target');
    }

    const ineligibleHarness = await createHarness({
      historyRead: vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => ({
        commands: [unsafeHistoryEntry({ telegramDeliveryAuthorizationEligible: false })]
      })),
      telegramDeliveryAuthorizationInboxIds: ['support-inbox']
    });
    applications.push(ineligibleHarness.app);
    const ineligibleSession = await loginAndGetSessionCookie(ineligibleHarness.app);
    const ineligibleHistory = await ineligibleHarness.app.inject({
      headers: { cookie: cookiePair(ineligibleSession) },
      method: 'GET',
      url: '/operator/outbound-commands'
    });

    expect(ineligibleHistory.body).not.toContain(
      'action="/operator/telegram-delivery-authorizations"'
    );
  });

  it('uses signed secure HttpOnly cookies, server-only inbox reads, and escaped HTML', async () => {
    const supportRead = vi.fn(async (): Promise<InboundEventPage> => ({
      events: [
        canonicalEvent({
          message: '<script>synthetic xss must remain text</script>\nsecond line'
        })
      ],
      nextCursor: Object.freeze({ beforeSequence: '8', snapshotMaxSequence: '12' })
    }));
    const harness = await createHarness({ supportRead });
    applications.push(harness.app);

    const login = await harness.app.inject({ method: 'GET', url: '/operator/login' });
    const loginCookie = cookieFrom(login, '__Host-och_dashboard_login_csrf');
    const loginCsrf = hiddenCsrf(login.body);

    expect(login.statusCode).toBe(200);
    expect(login.headers['cache-control']).toBe('no-store');
    expect(login.headers['content-security-policy']).toContain("form-action 'self'");
    expect(loginCookie).toContain('HttpOnly');
    expect(loginCookie).toContain('Secure');
    expect(loginCookie).toContain('SameSite=Strict');
    expect(loginCookie).toContain('Path=/');
    expect(loginCookie).not.toContain('Domain=');

    const session = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(loginCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: new URLSearchParams({
        csrf: loginCsrf,
        password: 'synthetic dashboard password',
        principal: 'support-agent'
      }).toString(),
      url: '/operator/session'
    });
    const sessionCookie = cookieFrom(session, '__Host-och_dashboard_session');

    expect(session.statusCode).toBe(303);
    expect(session.headers.location).toBe('/operator');
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('Secure');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(sessionCookie).toContain('Path=/');
    expect(sessionCookie).not.toContain(SUPPORT_INBOX_TOKEN);
    expect(harness.store.create).toHaveBeenCalledOnce();
    expect(JSON.stringify(harness.store.create.mock.calls)).not.toContain(
      'synthetic dashboard password'
    );

    const dashboard = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator'
    });

    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.headers['cache-control']).toBe('no-store');
    expect(dashboard.body).toContain('&lt;script&gt;synthetic xss must remain text&lt;/script&gt;');
    expect(dashboard.body).not.toContain('<script>');
    expect(dashboard.body).not.toContain(SUPPORT_INBOX_TOKEN);
    expect(dashboard.body).not.toContain(SALES_INBOX_TOKEN);
    expect(dashboard.body).not.toContain('Authorization');
    expect(dashboard.body).toContain('LUỒNG VẬN HÀNH');
    expect(dashboard.body).toContain('Tin đến');
    expect(dashboard.body).toContain('KẾT NỐI TRONG PHẠM VI');
    expect(supportRead).toHaveBeenCalledWith({ pageSize: 50 });

    const nextCursor = nextCursorFrom(dashboard.body);
    const continuation = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: `/operator?cursor=${nextCursor}`
    });

    expect(continuation.statusCode).toBe(200);
    expect(supportRead).toHaveBeenLastCalledWith({
      cursor: { beforeSequence: '8', snapshotMaxSequence: '12' },
      pageSize: 50
    });
  });

  it('rejects CSRF/origin failures before session creation and hides unauthorized inboxes', async () => {
    const supportRead = vi.fn(async (): Promise<InboundEventPage> => ({ events: [] }));
    const harness = await createHarness({ supportRead });
    applications.push(harness.app);

    const login = await harness.app.inject({ method: 'GET', url: '/operator/login' });
    const loginCookie = cookieFrom(login, '__Host-och_dashboard_login_csrf');
    const loginCsrf = hiddenCsrf(login.body);

    const originFailure = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(loginCookie),
        origin: 'https://attacker.example.test'
      },
      method: 'POST',
      payload: new URLSearchParams({
        csrf: loginCsrf,
        password: 'synthetic dashboard password',
        principal: 'support-agent'
      }).toString(),
      url: '/operator/session'
    });

    expect(originFailure.statusCode).toBe(403);
    expect(harness.store.create).not.toHaveBeenCalled();

    const sessionCookie = await loginAndGetSessionCookie(harness.app);
    const hiddenInbox = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator?inbox=sales-inbox'
    });

    expect(hiddenInbox.statusCode).toBe(404);
    expect(hiddenInbox.body).not.toContain('sales-inbox');
    expect(supportRead).not.toHaveBeenCalled();

    const hiddenHistory = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator/outbound-commands?inbox=sales-inbox'
    });

    expect(hiddenHistory.statusCode).toBe(404);
    expect(hiddenHistory.body).not.toContain('sales-inbox');
    expect(harness.historyRead).not.toHaveBeenCalled();
  });

  it('fails fast before Argon2 when a concurrent login burst exceeds the verifier cap', async () => {
    const harness = await createHarness();
    applications.push(harness.app);
    const forms = await Promise.all(
      Array.from({ length: 3 }, async () => {
        const login = await harness.app.inject({ method: 'GET', url: '/operator/login' });

        return Object.freeze({
          cookie: cookiePair(cookieFrom(login, '__Host-och_dashboard_login_csrf')),
          csrf: hiddenCsrf(login.body)
        });
      })
    );

    const responses = await Promise.all(
      forms.map(async (form) =>
        harness.app.inject({
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            cookie: form.cookie,
            origin: PUBLIC_ORIGIN
          },
          method: 'POST',
          payload: new URLSearchParams({
            csrf: form.csrf,
            password: 'wrong synthetic dashboard password',
            principal: 'support-agent'
          }).toString(),
          url: '/operator/session'
        })
      )
    );

    expect(responses.map((response) => response.statusCode).sort()).toEqual([401, 401, 429]);
    expect(harness.store.create).not.toHaveBeenCalled();
  });

  it('requires a matching CSRF form value to revoke a durable session', async () => {
    const harness = await createHarness();
    applications.push(harness.app);
    const sessionCookie = await loginAndGetSessionCookie(harness.app);
    const dashboard = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator'
    });
    const csrf = hiddenCsrf(dashboard.body);

    const rejected = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: new URLSearchParams({ csrf: Buffer.alloc(32, 4).toString('base64url') }).toString(),
      url: '/operator/logout'
    });

    expect(rejected.statusCode).toBe(303);
    expect(harness.store.revoke).not.toHaveBeenCalled();

    const logout = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: new URLSearchParams({ csrf }).toString(),
      url: '/operator/logout'
    });

    expect(logout.statusCode).toBe(303);
    expect(logout.headers.location).toBe('/operator/login');
    expect(harness.store.revoke).toHaveBeenCalledOnce();

    const afterLogout = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator'
    });

    expect(afterLogout.statusCode).toBe(303);
    expect(afterLogout.headers.location).toBe('/operator/login');
  });

  it('rejects a tampered signed session cookie before invoking the durable store', async () => {
    const harness = await createHarness();
    applications.push(harness.app);
    const sessionCookie = await loginAndGetSessionCookie(harness.app);
    const tamperedCookie = `${cookiePair(sessionCookie)}x`;

    const response = await harness.app.inject({
      headers: { cookie: tamperedCookie },
      method: 'GET',
      url: '/operator'
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/operator/login');
    expect(harness.store.touchActive).not.toHaveBeenCalled();
  });

  it('keeps inbound pages read-only by default and renders only event-bound writable forms', async () => {
    const supportRead = vi.fn(async (): Promise<InboundEventPage> => ({
      events: [
        canonicalEvent({
          conversationId: 'synthetic-private-reply-target',
          providerEventId:
            'synthetic-&quot;><script>source xss must remain attribute text</script>',
          senderId: 'synthetic-private-reply-target'
        })
      ]
    }));
    const readOnlyHarness = await createHarness({ supportRead });
    applications.push(readOnlyHarness.app);
    const readOnlySessionCookie = await loginAndGetSessionCookie(readOnlyHarness.app);

    const readOnlyPage = await readOnlyHarness.app.inject({
      headers: { cookie: cookiePair(readOnlySessionCookie) },
      method: 'GET',
      url: '/operator'
    });

    expect(readOnlyPage.statusCode).toBe(200);
    expect(readOnlyPage.body).not.toContain('action="/operator/reply-intents"');
    expect(readOnlyPage.body).not.toContain('name="clientOperationId"');
    expect(readOnlyPage.body).not.toContain('name="text"');

    const readOnlyWriteAttempt = await readOnlyHarness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(readOnlySessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: new URLSearchParams({
        clientOperationId: 'a12904ec-0d47-4d5f-98bb-352720f9d0d5',
        csrf: hiddenCsrf(readOnlyPage.body),
        inbox: 'support-inbox',
        sourceConnectionId: 'telegram-bot-support',
        sourceProviderEventId: 'synthetic-provider-event-101',
        text: 'A forged read-only dashboard write.'
      }).toString(),
      url: '/operator/reply-intents'
    });

    expect(readOnlyWriteAttempt.statusCode).toBe(404);
    expect(readOnlyHarness.replyIntentRecord).not.toHaveBeenCalled();

    const writableHarness = await createHarness({
      replyIntentInboxIds: ['support-inbox'],
      supportRead
    });
    applications.push(writableHarness.app);
    const writableSessionCookie = await loginAndGetSessionCookie(writableHarness.app);
    const writablePage = await writableHarness.app.inject({
      headers: { cookie: cookiePair(writableSessionCookie) },
      method: 'GET',
      url: '/operator'
    });

    expect(writablePage.statusCode).toBe(200);
    expect(writablePage.headers['cache-control']).toBe('no-store');
    expect(writablePage.body).toContain('action="/operator/reply-intents"');
    expect(writablePage.body).toContain('telegram_bot');
    expect(writablePage.body).toContain('2026-08-13T00:00:00.000Z');
    expect(writablePage.body).toContain('Synthetic dashboard message');
    expect(writablePage.body).toContain('<dt>Kết nối</dt><dd>telegram-bot-support</dd>');
    expect(writablePage.body).toContain('name="sourceConnectionId" value="telegram-bot-support"');
    expect(writablePage.body).toContain(
      'value="synthetic-&amp;quot;&gt;&lt;script&gt;source xss must remain attribute text&lt;/script&gt;"'
    );
    expect(writablePage.body).not.toContain('<script>');
    expect(writablePage.body).not.toContain('synthetic-private-reply-target');
    expect(writablePage.body).not.toContain('Hội thoại');
    expect(writablePage.body).not.toContain('Người gửi');
    expect(writablePage.body).not.toContain('name="recipientId"');
    expect(writablePage.body).not.toContain('name="dashboardPrincipalId"');
    expect(writablePage.body).not.toContain('name="authorization"');
    expect(writablePage.body).not.toContain('name="channel"');
    expect(writablePage.body).not.toContain('name="sourceMessageId"');
    expect(writablePage.body).not.toContain('name="attempt"');
    expect(writablePage.body).not.toContain('name="send"');
    expect(writablePage.body).not.toContain('name="retry"');
    expect(writablePage.body).not.toContain('name="cancel"');

    const firstForm = replyIntentFormFrom(writablePage.body);

    expect(firstForm.clientOperationId).toMatch(UUID_V4_PATTERN);
    expect(firstForm.sourceConnectionId).toBe('telegram-bot-support');
    expect(writablePage.body).toContain(
      '<textarea maxlength="2000" name="text" required rows="4"></textarea>'
    );

    const secondPage = await writableHarness.app.inject({
      headers: { cookie: cookiePair(writableSessionCookie) },
      method: 'GET',
      url: '/operator'
    });

    expect(replyIntentFormFrom(secondPage.body).clientOperationId).not.toBe(
      firstForm.clientOperationId
    );

    const history = await writableHarness.app.inject({
      headers: { cookie: cookiePair(writableSessionCookie) },
      method: 'GET',
      url: '/operator/outbound-commands'
    });

    expect(history.statusCode).toBe(200);
    expect(history.body).not.toContain('action="/operator/reply-intents"');
  });

  it('records exactly the source-bound form fields then redirects to durable history', async () => {
    const supportRead = vi.fn(async (): Promise<InboundEventPage> => ({
      events: [canonicalEvent()]
    }));
    const replyIntentRecord = vi.fn(
      async (input: DashboardReplyIntentInput): Promise<CreateOutboundReplyCommandResult> => {
        void input;

        return Object.freeze({
          command: Object.freeze({
            createdAt: '2026-08-13T00:00:00.000Z',
            id: '44',
            sourceConnectionId: 'telegram-bot-support',
            sourceProviderEventId: 'synthetic-provider-event-101',
            state: 'queued' as const
          }),
          kind: 'created' as const
        });
      }
    );
    const harness = await createHarness({
      replyIntentInboxIds: ['support-inbox'],
      replyIntentRecord,
      supportRead
    });
    applications.push(harness.app);
    const sessionCookie = await loginAndGetSessionCookie(harness.app);
    const page = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator'
    });
    const form = replyIntentFormFrom(page.body);
    const text = 'đ'.repeat(2_000);
    const payload = replyIntentPayload(form, text);

    expect(Buffer.byteLength(payload, 'utf8')).toBeGreaterThan(4_096);
    expect(Buffer.byteLength(payload, 'utf8')).toBeLessThan(32 * 1_024);

    const response = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload,
      url: '/operator/reply-intents'
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.location).toBe('/operator/outbound-commands?inbox=support-inbox');
    expect(response.body).not.toContain(text);
    expect(replyIntentRecord).toHaveBeenCalledWith({
      clientOperationId: form.clientOperationId,
      sourceConnectionId: 'telegram-bot-support',
      sourceProviderEventId: 'synthetic-provider-event-101',
      text
    });
    expect(Object.keys(replyIntentRecord.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      'clientOperationId',
      'sourceConnectionId',
      'sourceProviderEventId',
      'text'
    ]);
    expect(JSON.stringify(replyIntentRecord.mock.calls)).not.toContain('replyTargetId');
    expect(JSON.stringify(replyIntentRecord.mock.calls)).not.toContain('recipientId');

    const history = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator/outbound-commands?inbox=support-inbox'
    });

    expect(history.statusCode).toBe(200);
    expect(history.body).not.toContain('action="/operator/reply-intents"');

    const forgedNotice = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator/outbound-commands?inbox=support-inbox&notice=recorded'
    });

    expect(forgedNotice.statusCode).toBe(400);
    expect(forgedNotice.body).not.toContain('Ý định trả lời đã được ghi nhận;');
  });

  it('rejects reply-intent origin, authentication, CSRF, malformed, and out-of-scope requests before recording', async () => {
    const supportRead = vi.fn(async (): Promise<InboundEventPage> => ({
      events: [canonicalEvent()]
    }));
    const harness = await createHarness({
      replyIntentInboxIds: ['support-inbox'],
      supportRead
    });
    applications.push(harness.app);
    const sessionCookie = await loginAndGetSessionCookie(harness.app);
    const page = await harness.app.inject({
      headers: { cookie: cookiePair(sessionCookie) },
      method: 'GET',
      url: '/operator'
    });
    const form = replyIntentFormFrom(page.body);
    const text = 'synthetic text must never be echoed';
    const payload = replyIntentPayload(form, text);
    const readsBeforeOriginFailure = harness.store.readActive.mock.calls.length;

    const originFailure = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: 'https://attacker.example.test'
      },
      method: 'POST',
      payload,
      url: '/operator/reply-intents'
    });

    expect(originFailure.statusCode).toBe(403);
    expect(harness.store.readActive.mock.calls.length).toBe(readsBeforeOriginFailure);

    const unauthenticated = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload,
      url: '/operator/reply-intents'
    });
    const csrfFailure = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: replyIntentPayload(
        { ...form, csrf: Buffer.alloc(32, 5).toString('base64url') },
        text
      ),
      url: '/operator/reply-intents'
    });
    const malformed = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: `${payload}&recipientId=forbidden`,
      url: '/operator/reply-intents'
    });
    const forgedPrincipal = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: `${payload}&dashboardPrincipalId=sales-agent`,
      url: '/operator/reply-intents'
    });
    const forgedAuthorization = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: `${payload}&authorization=dashboard_principal`,
      url: '/operator/reply-intents'
    });
    const duplicate = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: `${payload}&sourceConnectionId=telegram-bot-support`,
      url: '/operator/reply-intents'
    });
    const oversized = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: replyIntentPayload(form, 'x'.repeat(32 * 1_024)),
      url: '/operator/reply-intents'
    });
    const outOfScope = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(sessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: replyIntentPayload({ ...form, inbox: 'sales-inbox' }, text),
      url: '/operator/reply-intents'
    });

    expect(unauthenticated.statusCode).toBe(303);
    expect(unauthenticated.headers.location).toBe('/operator/login?error=invalid');
    expect(unauthenticated.headers['set-cookie']).toContain('__Host-och_dashboard_session=;');
    expect(csrfFailure.statusCode).toBe(403);
    expect(malformed.statusCode).toBe(400);
    expect(forgedPrincipal.statusCode).toBe(400);
    expect(forgedAuthorization.statusCode).toBe(400);
    expect(duplicate.statusCode).toBe(400);
    expect(oversized.statusCode).toBe(413);
    expect(oversized.headers['cache-control']).toBe('no-store');
    expect(outOfScope.statusCode).toBe(404);

    for (const response of [
      originFailure,
      csrfFailure,
      malformed,
      forgedPrincipal,
      forgedAuthorization,
      duplicate,
      outOfScope
    ]) {
      expect(response.body).toContain('Yêu cầu không thể xử lý an toàn.');
      expect(response.body).not.toContain(text);
    }

    expect(oversized.body).toContain('"code":"validation_error"');
    expect(oversized.body).not.toContain(text);

    expect(unauthenticated.body).not.toContain(text);

    expect(harness.replyIntentRecord).not.toHaveBeenCalled();
  });

  it('handles idempotent, source-unavailable, conflict, and storage-failure reply results without leaking text', async () => {
    const supportRead = vi.fn(async (): Promise<InboundEventPage> => ({
      events: [canonicalEvent()]
    }));
    const idempotentHarness = await createHarness({
      replyIntentInboxIds: ['support-inbox'],
      replyIntentRecord: vi.fn(async (): Promise<CreateOutboundReplyCommandResult> =>
        Object.freeze({
          command: Object.freeze({
            createdAt: '2026-08-13T00:00:00.000Z',
            id: '45',
            sourceConnectionId: 'telegram-bot-support',
            sourceProviderEventId: 'synthetic-provider-event-101',
            state: 'queued' as const
          }),
          kind: 'idempotent_replay' as const
        })
      ),
      supportRead
    });
    const sourceUnavailableHarness = await createHarness({
      replyIntentInboxIds: ['support-inbox'],
      replyIntentRecord: vi.fn(async (): Promise<CreateOutboundReplyCommandResult> =>
        Object.freeze({ kind: 'source_unavailable' })
      ),
      supportRead
    });
    const conflictHarness = await createHarness({
      replyIntentInboxIds: ['support-inbox'],
      replyIntentRecord: vi.fn(async (): Promise<CreateOutboundReplyCommandResult> =>
        Object.freeze({ kind: 'idempotency_conflict' })
      ),
      supportRead
    });
    const failingHarness = await createHarness({
      replyIntentInboxIds: ['support-inbox'],
      replyIntentRecord: vi.fn(async (): Promise<CreateOutboundReplyCommandResult> => {
        throw new Error('synthetic durable reply failure');
      }),
      supportRead
    });
    applications.push(
      idempotentHarness.app,
      sourceUnavailableHarness.app,
      conflictHarness.app,
      failingHarness.app
    );

    const idempotent = await submitRenderedReplyIntent(idempotentHarness.app);
    const sourceUnavailable = await submitRenderedReplyIntent(sourceUnavailableHarness.app);
    const conflict = await submitRenderedReplyIntent(conflictHarness.app);
    const failing = await submitRenderedReplyIntent(failingHarness.app);

    expect(idempotent.statusCode).toBe(303);
    expect(idempotent.headers.location).toBe('/operator/outbound-commands?inbox=support-inbox');
    expect(sourceUnavailable.statusCode).toBe(404);
    expect(conflict.statusCode).toBe(409);
    expect(failing.statusCode).toBe(500);

    for (const response of [sourceUnavailable, conflict, failing]) {
      expect(response.body).toContain('Yêu cầu không thể xử lý an toàn.');
      expect(response.body).not.toContain('synthetic text must never be echoed');
      expect(response.body).not.toContain('synthetic durable reply failure');
    }
  });

  it('caps reply-intent writes across two sessions for the same principal before the recorder', async () => {
    const supportRead = vi.fn(async (): Promise<InboundEventPage> => ({
      events: [canonicalEvent()]
    }));
    const harness = await createHarness({
      replyIntentInboxIds: ['support-inbox'],
      supportRead
    });
    applications.push(harness.app);
    const firstSessionCookie = await loginAndGetSessionCookie(harness.app);
    const secondSessionCookie = await loginAndGetSessionCookie(harness.app);
    const firstForm = replyIntentFormFrom(
      (
        await harness.app.inject({
          headers: { cookie: cookiePair(firstSessionCookie) },
          method: 'GET',
          url: '/operator'
        })
      ).body
    );
    const secondForm = replyIntentFormFrom(
      (
        await harness.app.inject({
          headers: { cookie: cookiePair(secondSessionCookie) },
          method: 'GET',
          url: '/operator'
        })
      ).body
    );

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const sessionCookie = attempt < 10 ? firstSessionCookie : secondSessionCookie;
      const form = attempt < 10 ? firstForm : secondForm;
      const response = await harness.app.inject({
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: cookiePair(sessionCookie),
          origin: PUBLIC_ORIGIN
        },
        method: 'POST',
        payload: replyIntentPayload(form, 'synthetic throttled reply'),
        url: '/operator/reply-intents'
      });

      expect(response.statusCode).toBe(303);
    }

    const limited = await harness.app.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(secondSessionCookie),
        origin: PUBLIC_ORIGIN
      },
      method: 'POST',
      payload: replyIntentPayload(secondForm, 'synthetic throttled reply'),
      url: '/operator/reply-intents'
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.body).toContain('Yêu cầu không thể xử lý an toàn.');
    expect(harness.replyIntentRecord).toHaveBeenCalledTimes(20);
  });
});

const createHarness = async (
  options: Readonly<{
    googleAuthentication?: DashboardGoogleAuthentication;
    historyRead?: ReturnType<typeof vi.fn>;
    replyIntentInboxIds?: readonly string[];
    replyIntentRecord?: ReplyIntentRecord;
    telegramDeliveryAuthorizationInboxIds?: readonly string[];
    telegramDeliveryAuthorizationRecord?: TelegramDeliveryAuthorizationRecord;
    supportRead?: ReturnType<typeof vi.fn>;
  }> = {}
): Promise<
  Readonly<{
    app: Awaited<ReturnType<typeof buildApp>>;
    historyRead: ReturnType<typeof vi.fn>;
    replyIntentRecord: ReplyIntentRecord;
    telegramDeliveryAuthorizationRecord: TelegramDeliveryAuthorizationRecord;
    store: ReturnType<typeof createSessionStore>;
  }>
> => {
  const passwordHash = await argon2.hash('synthetic dashboard password', {
    memoryCost: 19456,
    parallelism: 1,
    timeCost: 2,
    type: argon2.argon2id
  });
  const supportRead =
    options.supportRead ?? vi.fn(async (): Promise<InboundEventPage> => ({ events: [] }));
  const historyRead =
    options.historyRead ??
    vi.fn(async (): Promise<OutboundReplyCommandHistoryPage> => ({ commands: [] }));
  const replyIntentRecord =
    options.replyIntentRecord ??
    vi.fn<DashboardReplyIntentInbox['recordReplyIntent']>(
      async (input: DashboardReplyIntentInput): Promise<CreateOutboundReplyCommandResult> => {
        void input;

        return Object.freeze({
          command: Object.freeze({
            createdAt: '2026-08-13T00:00:00.000Z',
            id: '43',
            sourceConnectionId: 'telegram-bot-support',
            sourceProviderEventId: 'synthetic-provider-event-101',
            state: 'queued' as const
          }),
          kind: 'created' as const
        });
      }
    );
  const store = createSessionStore();
  const telegramDeliveryAuthorizationRecord =
    options.telegramDeliveryAuthorizationRecord ??
    vi.fn<DashboardTelegramDeliveryAuthorizationInbox['recordTelegramDeliveryAuthorization']>(
      async (): Promise<CreateOutboundTelegramDeliveryAuthorizationResult> =>
        Object.freeze({ kind: 'command_unavailable' })
    );
  const supportInbox = inbox(
    'support-inbox',
    SUPPORT_CONNECTION_IDS,
    supportRead as DashboardInbox['readInboundEvents'],
    historyRead as DashboardInbox['readOutboundReplyCommandHistory']
  );
  const principal: DashboardPrincipal = Object.freeze({
    id: 'support-agent',
    inboxIds: Object.freeze(['support-inbox']),
    passwordHash,
    replyIntentInboxIds: Object.freeze([...(options.replyIntentInboxIds ?? [])]),
    telegramDeliveryAuthorizationInboxIds: Object.freeze([
      ...(options.telegramDeliveryAuthorizationInboxIds ?? [])
    ])
  });
  const replyIntentInbox: DashboardReplyIntentInbox = Object.freeze({
    id: supportInbox.id,
    recordReplyIntent: replyIntentRecord
  });
  const telegramDeliveryAuthorizationInbox: DashboardTelegramDeliveryAuthorizationInbox =
    Object.freeze({
      id: supportInbox.id,
      recordTelegramDeliveryAuthorization: telegramDeliveryAuthorizationRecord
    });
  const feature: DashboardFeature = Object.freeze({
    findInbox: (principalId: string, inboxId: string): DashboardInbox | undefined =>
      principalId === principal.id && inboxId === supportInbox.id ? supportInbox : undefined,
    findReplyIntentInbox: (
      principalId: string,
      inboxId: string
    ): DashboardReplyIntentInbox | undefined =>
      principalId === principal.id &&
      principal.replyIntentInboxIds.includes(inboxId) &&
      inboxId === replyIntentInbox.id
        ? replyIntentInbox
        : undefined,
    findTelegramDeliveryAuthorizationInbox: (
      principalId: string,
      inboxId: string
    ): DashboardTelegramDeliveryAuthorizationInbox | undefined =>
      principalId === principal.id &&
      principal.telegramDeliveryAuthorizationInboxIds.includes(inboxId) &&
      inboxId === telegramDeliveryAuthorizationInbox.id
        ? telegramDeliveryAuthorizationInbox
        : undefined,
    findPrincipal: (principalId: string): DashboardPrincipal | undefined =>
      principalId === principal.id ? principal : undefined,
    listInboxes: (principalId: string): readonly DashboardInbox[] =>
      principalId === principal.id ? Object.freeze([supportInbox]) : Object.freeze([]),
    ...(options.googleAuthentication === undefined
      ? {}
      : { googleAuthentication: options.googleAuthentication }),
    publicOrigin: PUBLIC_ORIGIN,
    sessionCookieSigningKeys: Object.freeze([
      'synthetic_dashboard_cookie_signing_key_current_012345678'
    ]),
    sessionIdPepper: 'synthetic_dashboard_session_id_pepper_012345678901234',
    sessionStore: store
  });

  return Object.freeze({
    app: await buildApp({ dashboard: feature }),
    historyRead,
    replyIntentRecord,
    telegramDeliveryAuthorizationRecord,
    store
  });
};

const inbox = (
  id: string,
  connectionIds: readonly string[],
  readInboundEvents: DashboardInbox['readInboundEvents'],
  readOutboundReplyCommandHistory: DashboardInbox['readOutboundReplyCommandHistory']
): DashboardInbox =>
  Object.freeze({ connectionIds, id, readInboundEvents, readOutboundReplyCommandHistory });

const createSessionStore = (): DashboardSessionStore &
  Readonly<
    Record<'create' | 'readActive' | 'revoke' | 'touchActive', ReturnType<typeof vi.fn>>
  > => {
  const sessions = new Map<string, DashboardSession>();
  const create = vi.fn(async (input: DashboardSessionCreateInput): Promise<DashboardSession> => {
    const session = Object.freeze({ ...input });
    sessions.set(session.sessionTokenHmac, session);
    return session;
  });
  const readActive = vi.fn(
    async (input: DashboardSessionReadInput): Promise<DashboardSession | undefined> => {
      const session = sessions.get(input.sessionTokenHmac);

      return session === undefined || session.revokedAt !== undefined ? undefined : session;
    }
  );
  const revoke = vi.fn(async (input: DashboardSessionRevokeInput): Promise<void> => {
    const session = sessions.get(input.sessionTokenHmac);

    if (session !== undefined) {
      sessions.set(
        input.sessionTokenHmac,
        Object.freeze({ ...session, revokedAt: input.revokedAt })
      );
    }
  });
  const touchActive = vi.fn(
    async (input: DashboardSessionTouchInput): Promise<DashboardSession | undefined> => {
      const session = sessions.get(input.sessionTokenHmac);

      if (session === undefined || session.revokedAt !== undefined) {
        return undefined;
      }

      const renewed = Object.freeze({
        ...session,
        idleExpiresAt: input.idleExpiresAt,
        lastSeenAt: input.touchedAt
      });
      sessions.set(input.sessionTokenHmac, renewed);
      return renewed;
    }
  );

  return Object.freeze({ create, readActive, revoke, touchActive });
};

const loginAndGetSessionCookie = async (
  app: Awaited<ReturnType<typeof buildApp>>
): Promise<string> => {
  const login = await app.inject({ method: 'GET', url: '/operator/login' });
  const loginCookie = cookieFrom(login, '__Host-och_dashboard_login_csrf');
  const response = await app.inject({
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookiePair(loginCookie),
      origin: PUBLIC_ORIGIN
    },
    method: 'POST',
    payload: new URLSearchParams({
      csrf: hiddenCsrf(login.body),
      password: 'synthetic dashboard password',
      principal: 'support-agent'
    }).toString(),
    url: '/operator/session'
  });

  expect(response.statusCode).toBe(303);
  return cookieFrom(response, '__Host-och_dashboard_session');
};

const canonicalEvent = (
  overrides: Readonly<{
    conversationId?: string;
    message?: string;
    providerEventId?: string;
    senderId?: string;
  }> = {}
) =>
  Object.freeze({
    channel: 'telegram_bot' as const,
    connectionId: 'telegram-bot-support',
    id: 'telegram-bot-support:event:synthetic-101',
    message: Object.freeze({
      conversationId: overrides.conversationId ?? 'synthetic-conversation-101',
      id: 'synthetic-message-101',
      senderId: overrides.senderId ?? 'synthetic-sender-101',
      text: overrides.message ?? 'Synthetic dashboard message'
    }),
    occurredAt: '2026-08-13T00:00:00.000Z',
    providerEventId: overrides.providerEventId ?? 'synthetic-provider-event-101',
    type: 'message.received' as const
  });

/** Deliberately adds forbidden fields to prove the HTML renderer ignores them. */
const unsafeHistoryEntry = (
  overrides: Readonly<
    Partial<
      Pick<
        OutboundReplyCommandHistoryEntry,
        | 'authorizationRecorded'
        | 'deliveryEvidenceStatus'
        | 'telegramDeliveryAuthorizationEligible'
        | 'telegramDeliveryAuthorizationRecorded'
        | 'telegramPrivateReplyEligibilityRecorded'
        | 'text'
      >
    >
  > = {}
): OutboundReplyCommandHistoryEntry =>
  Object.freeze({
    botIdentityFingerprint: 'synthetic-bot-identity-fingerprint',
    clientOperationId: 'synthetic-private-client-operation',
    createdAt: '2026-08-13T00:00:00.000Z',
    authorizationRecorded: overrides.authorizationRecorded ?? false,
    deliveryEvidenceStatus: overrides.deliveryEvidenceStatus ?? 'not_attempted',
    id: '42',
    replyTargetId: 'synthetic-private-reply-target',
    providerMessageId: 'synthetic-provider-message-id',
    sourceChannel: 'synthetic-private-source-channel',
    sourceConnectionId: 'telegram-bot-support',
    sourceMessageId: 'synthetic-private-source-message',
    sourceProviderEventId: 'synthetic-provider-event-should-not-render',
    state: 'queued' as const,
    telegramDeliveryAuthorizationRecorded: overrides.telegramDeliveryAuthorizationRecorded ?? false,
    telegramDeliveryAuthorizationEligible: overrides.telegramDeliveryAuthorizationEligible ?? false,
    telegramPrivateReplyEligibilityRecorded:
      overrides.telegramPrivateReplyEligibilityRecorded ?? false,
    text: overrides.text ?? 'Synthetic queued dashboard history'
  }) as unknown as OutboundReplyCommandHistoryEntry;

const cookieFrom = (
  response: Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['inject']>>,
  name: string
): string => {
  const values = cookieHeaderValues(response);
  const cookie = values.find((value) => value.startsWith(`${name}=`));

  if (cookie === undefined) {
    throw new Error(`Missing synthetic ${name} cookie.`);
  }

  return cookie;
};

const cookieHeaderValues = (
  response: Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['inject']>>
): readonly string[] => {
  const header = response.headers['set-cookie'];

  return header === undefined ? [] : Array.isArray(header) ? header : [header];
};

const cookiePair = (cookie: string): string => cookie.split(';', 1)[0] ?? '';

const hiddenCsrf = (html: string): string => {
  const match = html.match(/name="csrf" value="([A-Za-z0-9_-]{43})"/);

  if (match?.[1] === undefined) {
    throw new Error('Missing synthetic CSRF token.');
  }

  return match[1];
};

const nextCursorFrom = (html: string): string => {
  const match = html.match(/cursor=([A-Za-z0-9_-]+)/);

  if (match?.[1] === undefined) {
    throw new Error('Missing synthetic next cursor.');
  }

  return match[1];
};

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ReplyIntentForm {
  readonly clientOperationId: string;
  readonly csrf: string;
  readonly inbox: string;
  readonly sourceConnectionId: string;
  readonly sourceProviderEventId: string;
}

const replyIntentFormFrom = (html: string): ReplyIntentForm => {
  const form = html.match(
    /<form action="\/operator\/reply-intents" method="post" class="reply-intent-form">([\s\S]*?)<\/form>/
  )?.[1];

  if (form === undefined) {
    throw new Error('Missing synthetic reply-intent form.');
  }

  return Object.freeze({
    clientOperationId: hiddenInputValue(form, 'clientOperationId'),
    csrf: hiddenInputValue(form, 'csrf'),
    inbox: hiddenInputValue(form, 'inbox'),
    sourceConnectionId: hiddenInputValue(form, 'sourceConnectionId'),
    sourceProviderEventId: hiddenInputValue(form, 'sourceProviderEventId')
  });
};

const hiddenInputValue = (form: string, name: string): string => {
  const value = form.match(new RegExp(`<input type="hidden" name="${name}" value="([^"]+)">`))?.[1];

  if (value === undefined) {
    throw new Error(`Missing synthetic ${name} field.`);
  }

  return value;
};

const replyIntentPayload = (form: ReplyIntentForm, text: string): string =>
  new URLSearchParams({
    clientOperationId: form.clientOperationId,
    csrf: form.csrf,
    inbox: form.inbox,
    sourceConnectionId: form.sourceConnectionId,
    sourceProviderEventId: form.sourceProviderEventId,
    text
  }).toString();

interface TelegramDeliveryAuthorizationForm {
  readonly commandId: string;
  readonly csrf: string;
  readonly inbox: string;
}

const telegramDeliveryAuthorizationFormFrom = (html: string): TelegramDeliveryAuthorizationForm => {
  const form = html.match(
    /<form action="\/operator\/telegram-delivery-authorizations" method="post" class="reply-intent-form">([\s\S]*?)<\/form>/
  )?.[1];

  if (form === undefined) {
    throw new Error('Missing synthetic Telegram delivery-authorization form.');
  }

  return Object.freeze({
    commandId: hiddenInputValue(form, 'commandId'),
    csrf: hiddenInputValue(form, 'csrf'),
    inbox: hiddenInputValue(form, 'inbox')
  });
};

const telegramDeliveryAuthorizationPayload = (form: TelegramDeliveryAuthorizationForm): string =>
  new URLSearchParams({
    commandId: form.commandId,
    csrf: form.csrf,
    inbox: form.inbox
  }).toString();

const submitRenderedReplyIntent = async (
  app: Awaited<ReturnType<typeof buildApp>>
): Promise<Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['inject']>>> => {
  const sessionCookie = await loginAndGetSessionCookie(app);
  const page = await app.inject({
    headers: { cookie: cookiePair(sessionCookie) },
    method: 'GET',
    url: '/operator'
  });
  const form = replyIntentFormFrom(page.body);

  return app.inject({
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookiePair(sessionCookie),
      origin: PUBLIC_ORIGIN
    },
    method: 'POST',
    payload: replyIntentPayload(form, 'synthetic text must never be echoed'),
    url: '/operator/reply-intents'
  });
};

const submitRenderedTelegramDeliveryAuthorization = async (
  app: Awaited<ReturnType<typeof buildApp>>
): Promise<Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['inject']>>> => {
  const sessionCookie = await loginAndGetSessionCookie(app);
  const page = await app.inject({
    headers: { cookie: cookiePair(sessionCookie) },
    method: 'GET',
    url: '/operator/outbound-commands'
  });
  const form = telegramDeliveryAuthorizationFormFrom(page.body);

  return app.inject({
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookiePair(sessionCookie),
      origin: PUBLIC_ORIGIN
    },
    method: 'POST',
    payload: telegramDeliveryAuthorizationPayload(form),
    url: '/operator/telegram-delivery-authorizations'
  });
};

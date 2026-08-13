import argon2 from 'argon2';
import type {
  DashboardSession,
  DashboardSessionCreateInput,
  DashboardSessionReadInput,
  DashboardSessionRevokeInput,
  DashboardSessionStore,
  DashboardSessionTouchInput,
  InboundEventPage
} from '@open-channel-hub/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../app.js';
import type { DashboardFeature, DashboardInbox, DashboardPrincipal } from './dashboard-feature.js';

const PUBLIC_ORIGIN = 'https://dashboard.example.test';
const SUPPORT_INBOX_TOKEN = 'synthetic_inbox_support_token_01234567890123456789';
const SALES_INBOX_TOKEN = 'synthetic_inbox_sales_token_01234567890123456789012';
const SUPPORT_CONNECTION_IDS = Object.freeze(['telegram-bot-support']);

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
    expect(sessionCookie).toContain('SameSite=Strict');
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
});

const createHarness = async (
  options: Readonly<{
    supportRead?: ReturnType<typeof vi.fn>;
  }> = {}
): Promise<
  Readonly<{
    app: Awaited<ReturnType<typeof buildApp>>;
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
  const store = createSessionStore();
  const supportInbox = inbox(
    'support-inbox',
    SUPPORT_CONNECTION_IDS,
    supportRead as DashboardInbox['readInboundEvents']
  );
  const principal: DashboardPrincipal = Object.freeze({
    id: 'support-agent',
    inboxIds: Object.freeze(['support-inbox']),
    passwordHash
  });
  const feature: DashboardFeature = Object.freeze({
    findInbox: (principalId: string, inboxId: string): DashboardInbox | undefined =>
      principalId === principal.id && inboxId === supportInbox.id ? supportInbox : undefined,
    findPrincipal: (principalId: string): DashboardPrincipal | undefined =>
      principalId === principal.id ? principal : undefined,
    listInboxes: (principalId: string): readonly DashboardInbox[] =>
      principalId === principal.id ? Object.freeze([supportInbox]) : Object.freeze([]),
    publicOrigin: PUBLIC_ORIGIN,
    sessionCookieSigningKeys: Object.freeze([
      'synthetic_dashboard_cookie_signing_key_current_012345678'
    ]),
    sessionIdPepper: 'synthetic_dashboard_session_id_pepper_012345678901234',
    sessionStore: store
  });

  return Object.freeze({ app: await buildApp({ dashboard: feature }), store });
};

const inbox = (
  id: string,
  connectionIds: readonly string[],
  readInboundEvents: DashboardInbox['readInboundEvents']
): DashboardInbox => Object.freeze({ connectionIds, id, readInboundEvents });

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

const canonicalEvent = (overrides: Readonly<{ message?: string }> = {}) =>
  Object.freeze({
    channel: 'telegram_bot' as const,
    connectionId: 'telegram-bot-support',
    id: 'telegram-bot-support:event:synthetic-101',
    message: Object.freeze({
      conversationId: 'synthetic-conversation-101',
      id: 'synthetic-message-101',
      senderId: 'synthetic-sender-101',
      text: overrides.message ?? 'Synthetic dashboard message'
    }),
    occurredAt: '2026-08-13T00:00:00.000Z',
    providerEventId: 'synthetic-provider-event-101',
    type: 'message.received' as const
  });

const cookieFrom = (
  response: Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['inject']>>,
  name: string
): string => {
  const header = response.headers['set-cookie'];
  const values = header === undefined ? [] : Array.isArray(header) ? header : [header];
  const cookie = values.find((value) => value.startsWith(`${name}=`));

  if (cookie === undefined) {
    throw new Error(`Missing synthetic ${name} cookie.`);
  }

  return cookie;
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

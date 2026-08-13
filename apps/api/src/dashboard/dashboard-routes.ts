import type { DashboardSession } from '@open-channel-hub/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { matchesSecret } from '../http/secret-match.js';
import { decodeInboxCursor, encodeInboxCursor } from '../inbox/inbox-cursor.js';
import { createDashboardLoginThrottle, verifyDashboardPassword } from './dashboard-auth.js';
import type { DashboardFeature } from './dashboard-feature.js';
import { renderDashboardLoginPage, renderDashboardPage } from './dashboard-html.js';
import {
  createDashboardSessionManager,
  type DashboardSessionManager
} from './dashboard-session-manager.js';
import { dashboardStyle } from './dashboard-style.js';

const DASHBOARD_LOGIN_CSRF_COOKIE = '__Host-och_dashboard_login_csrf';
const DASHBOARD_SESSION_COOKIE = '__Host-och_dashboard_session';
const DEFAULT_PAGE_SIZE = 50;
const FORM_BODY_LIMIT = 4_096;
const MAX_CURSOR_LENGTH = 512;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const loginQuerySchema = z.object({ error: z.enum(['invalid', 'throttled']).optional() }).strict();
const operatorQuerySchema = z
  .object({
    cursor: z.string().min(1).max(MAX_CURSOR_LENGTH).optional(),
    inbox: z.string().regex(IDENTIFIER_PATTERN).optional()
  })
  .strict();
const loginFormSchema = z
  .object({
    csrf: z.string().regex(OPAQUE_TOKEN_PATTERN),
    password: z.string().min(1).max(512),
    principal: z.string().regex(IDENTIFIER_PATTERN)
  })
  .strict();
const logoutFormSchema = z.object({ csrf: z.string().regex(OPAQUE_TOKEN_PATTERN) }).strict();

const signedCookieOptions = Object.freeze({
  httpOnly: true,
  path: '/',
  sameSite: 'strict' as const,
  secure: true,
  signed: true
});
const clearCookieOptions = Object.freeze({
  httpOnly: true,
  path: '/',
  sameSite: 'strict' as const,
  secure: true
});

interface AuthenticatedDashboardSession {
  readonly csrfToken: string;
  readonly session: DashboardSession;
  readonly sessionCookieValue: string;
}

/**
 * Registers the only browser-visible surface: server-rendered HTML, a signed
 * HttpOnly session cookie, native forms, and no browser bearer/API access.
 */
export const registerDashboardRoutes = async (
  app: FastifyInstance,
  feature: DashboardFeature
): Promise<void> => {
  const manager = createDashboardSessionManager(feature.sessionStore, feature.sessionIdPepper);
  const throttle = createDashboardLoginThrottle();

  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { bodyLimit: FORM_BODY_LIMIT, parseAs: 'string' },
    (_request, body: string, done) => done(null, body)
  );

  app.get('/operator/assets/dashboard.css', async (_request, reply) =>
    reply
      .header('Cache-Control', 'public, max-age=86400')
      .type('text/css; charset=utf-8')
      .send(dashboardStyle)
  );

  app.get('/operator/login', async (request, reply) => {
    const query = loginQuerySchema.safeParse(request.query);

    return sendLoginPage(reply, manager, query.success ? query.data.error : undefined);
  });

  app.post<{ Body: string }>('/operator/session', async (request, reply) => {
    if (!hasExpectedOrigin(request, feature.publicOrigin)) {
      return sendLoginPage(reply.code(403), manager, 'invalid');
    }

    const form = parseForm(request.body, loginFormSchema);
    const loginCsrfToken = readSignedCookie(request, DASHBOARD_LOGIN_CSRF_COOKIE);

    if (
      form === undefined ||
      loginCsrfToken === undefined ||
      !matchesSecret(form.csrf, loginCsrfToken)
    ) {
      clearLoginCsrfCookie(reply);
      return sendLoginPage(reply.code(403), manager, 'invalid');
    }

    const verification = throttle.reserveVerification();

    if (verification === undefined) {
      clearLoginCsrfCookie(reply);
      return sendLoginPage(reply.code(429), manager, 'throttled');
    }

    const principal = feature.findPrincipal(form.principal);
    let passwordMatches = false;

    try {
      passwordMatches = await verifyDashboardPassword(principal, form.password);
    } finally {
      verification.complete(passwordMatches && principal !== undefined);
    }

    if (!passwordMatches || principal === undefined) {
      clearLoginCsrfCookie(reply);
      return sendLoginPage(reply.code(401), manager, 'invalid');
    }

    const issued = await manager.createSession(principal.id);
    clearLoginCsrfCookie(reply);
    reply.setCookie(
      DASHBOARD_SESSION_COOKIE,
      `${issued.sessionToken}.${issued.csrfToken}`,
      signedCookieOptions
    );

    return redirectDashboard(reply, '/operator');
  });

  app.post<{ Body: string }>('/operator/logout', async (request, reply) => {
    if (!hasExpectedOrigin(request, feature.publicOrigin)) {
      return sendLoginPage(reply.code(403), manager, 'invalid');
    }

    const form = parseForm(request.body, logoutFormSchema);
    const authenticated = await readDashboardSession(request, manager);

    if (
      form === undefined ||
      authenticated === undefined ||
      !matchesSecret(form.csrf, authenticated.csrfToken) ||
      !manager.matchesCsrf(authenticated.session, form.csrf)
    ) {
      clearSessionCookie(reply);
      return redirectDashboard(reply, '/operator/login?error=invalid');
    }

    await manager.revokeSession(sessionTokenFromCookie(authenticated.sessionCookieValue));
    clearSessionCookie(reply);
    return redirectDashboard(reply, '/operator/login');
  });

  app.get('/operator', async (request, reply) => {
    let authenticated: AuthenticatedDashboardSession | undefined;

    try {
      authenticated = await touchDashboardSession(request, reply, manager);
    } catch {
      return sendDashboardFailure(reply.code(500));
    }

    if (authenticated === undefined) {
      clearSessionCookie(reply);
      return redirectDashboard(reply, '/operator/login');
    }

    const query = operatorQuerySchema.safeParse(request.query);

    if (!query.success) {
      return sendDashboardFailure(reply.code(400));
    }

    const availableInboxes = feature.listInboxes(authenticated.session.principalId);
    const selectedInboxId = query.data.inbox ?? availableInboxes[0]?.id;
    const selectedInbox =
      selectedInboxId === undefined
        ? undefined
        : feature.findInbox(authenticated.session.principalId, selectedInboxId);

    if (selectedInboxId === undefined || selectedInbox === undefined) {
      return sendDashboardFailure(reply.code(404));
    }

    const cursor = decodeInboxCursor(query.data.cursor, selectedInbox);

    if (cursor === null) {
      return sendDashboardFailure(reply.code(400));
    }

    try {
      const page = await selectedInbox.readInboundEvents({
        ...(cursor === undefined ? {} : { cursor }),
        pageSize: DEFAULT_PAGE_SIZE
      });

      return sendDashboardHtml(
        reply,
        renderDashboardPage({
          csrfToken: authenticated.csrfToken,
          events: page.events,
          inboxes: availableInboxes,
          ...(page.nextCursor === undefined
            ? {}
            : { nextCursor: encodeInboxCursor(page.nextCursor, selectedInbox) }),
          principalId: authenticated.session.principalId,
          selectedInboxId
        })
      );
    } catch {
      return sendDashboardFailure(reply.code(500));
    }
  });
};

const sendLoginPage = (
  reply: FastifyReply,
  manager: DashboardSessionManager,
  message: 'invalid' | 'throttled' | undefined
): FastifyReply => {
  const csrfToken = manager.createLoginCsrfToken();

  reply.setCookie(DASHBOARD_LOGIN_CSRF_COOKIE, csrfToken, signedCookieOptions);
  return sendDashboardHtml(
    reply,
    renderDashboardLoginPage({ csrfToken, ...(message === undefined ? {} : { message }) })
  );
};

const sendDashboardHtml = (reply: FastifyReply, body: string): FastifyReply =>
  reply.header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(body);

const sendDashboardFailure = (reply: FastifyReply): FastifyReply =>
  sendDashboardHtml(
    reply,
    '<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Open Channel Hub</title></head><body><p>Yêu cầu không thể xử lý an toàn.</p></body></html>'
  );

const redirectDashboard = (reply: FastifyReply, location: string): FastifyReply =>
  reply.header('Cache-Control', 'no-store').redirect(location, 303);

const clearLoginCsrfCookie = (reply: FastifyReply): void => {
  reply.clearCookie(DASHBOARD_LOGIN_CSRF_COOKIE, clearCookieOptions);
};

const clearSessionCookie = (reply: FastifyReply): void => {
  reply.clearCookie(DASHBOARD_SESSION_COOKIE, clearCookieOptions);
};

const hasExpectedOrigin = (request: FastifyRequest, publicOrigin: string): boolean =>
  typeof request.headers.origin === 'string' && request.headers.origin === publicOrigin;

const readSignedCookie = (request: FastifyRequest, name: string): string | undefined => {
  const signedValue = request.cookies[name];

  if (signedValue === undefined) {
    return undefined;
  }

  const unsigned = request.unsignCookie(signedValue);

  return unsigned.valid ? unsigned.value : undefined;
};

const readDashboardSession = async (
  request: FastifyRequest,
  manager: DashboardSessionManager
): Promise<AuthenticatedDashboardSession | undefined> => {
  const sessionCookieValue = readSignedCookie(request, DASHBOARD_SESSION_COOKIE);

  if (sessionCookieValue === undefined) {
    return undefined;
  }

  const decoded = decodeDashboardSessionCookie(sessionCookieValue);

  if (decoded === undefined) {
    return undefined;
  }

  const session = await manager.readActiveSession(decoded.sessionToken);

  return session === undefined || !manager.matchesCsrf(session, decoded.csrfToken)
    ? undefined
    : Object.freeze({
        csrfToken: decoded.csrfToken,
        session,
        sessionCookieValue
      });
};

const touchDashboardSession = async (
  request: FastifyRequest,
  reply: FastifyReply,
  manager: DashboardSessionManager
): Promise<AuthenticatedDashboardSession | undefined> => {
  const sessionCookieValue = readSignedCookie(request, DASHBOARD_SESSION_COOKIE);

  if (sessionCookieValue === undefined) {
    return undefined;
  }

  const decoded = decodeDashboardSessionCookie(sessionCookieValue);

  if (decoded === undefined) {
    return undefined;
  }

  const session = await manager.touchActiveSession(decoded.sessionToken);

  if (session === undefined || !manager.matchesCsrf(session, decoded.csrfToken)) {
    return undefined;
  }

  const shouldRenewCookie = shouldRenewSignedCookie(request, DASHBOARD_SESSION_COOKIE);

  if (shouldRenewCookie) {
    reply.setCookie(DASHBOARD_SESSION_COOKIE, sessionCookieValue, signedCookieOptions);
  }

  return Object.freeze({
    csrfToken: decoded.csrfToken,
    session,
    sessionCookieValue
  });
};

const shouldRenewSignedCookie = (request: FastifyRequest, name: string): boolean => {
  const signedValue = request.cookies[name];

  return signedValue === undefined ? false : request.unsignCookie(signedValue).renew;
};

const decodeDashboardSessionCookie = (
  value: string
): Readonly<{ csrfToken: string; sessionToken: string }> | undefined => {
  const parts = value.split('.');
  const sessionToken = parts[0];
  const csrfToken = parts[1];

  if (
    parts.length !== 2 ||
    sessionToken === undefined ||
    csrfToken === undefined ||
    !OPAQUE_TOKEN_PATTERN.test(sessionToken) ||
    !OPAQUE_TOKEN_PATTERN.test(csrfToken)
  ) {
    return undefined;
  }

  return Object.freeze({ csrfToken, sessionToken });
};

const sessionTokenFromCookie = (value: string): string | undefined =>
  decodeDashboardSessionCookie(value)?.sessionToken;

const parseForm = <Output>(body: unknown, schema: z.ZodType<Output>): Output | undefined => {
  if (typeof body !== 'string') {
    return undefined;
  }

  const params = new URLSearchParams(body);
  const keys = new Set<string>();
  const object: Record<string, string> = {};

  for (const [key, value] of params) {
    if (keys.has(key)) {
      return undefined;
    }

    keys.add(key);
    object[key] = value;
  }

  const parsed = schema.safeParse(object);

  return parsed.success ? parsed.data : undefined;
};

import type { DashboardSession } from '@open-channel-hub/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { matchesSecret } from '../http/secret-match.js';
import { decodeInboxCursor, encodeInboxCursor } from '../inbox/inbox-cursor.js';
import {
  decodeInboxOutboundCommandHistoryCursor,
  encodeInboxOutboundCommandHistoryCursor
} from '../inbox/inbox-outbound-command-history-cursor.js';
import { createDashboardLoginThrottle, verifyDashboardPassword } from './dashboard-auth.js';
import type { DashboardFeature, DashboardInbox } from './dashboard-feature.js';
import {
  renderDashboardLoginPage,
  renderDashboardOutboundCommandHistoryPage,
  renderDashboardPage
} from './dashboard-html.js';
import {
  createDashboardSessionManager,
  type DashboardSessionManager
} from './dashboard-session-manager.js';
import {
  createDashboardGoogleOAuthTransactionManager,
  type DashboardGoogleOAuthTransactionManager
} from './dashboard-google-oauth.js';
import { createDashboardReplyIntentThrottle } from './dashboard-reply-intent-throttle.js';
import { dashboardStyle } from './dashboard-style.js';

const DASHBOARD_LOGIN_CSRF_COOKIE = '__Host-och_dashboard_login_csrf';
const DASHBOARD_GOOGLE_OAUTH_TRANSACTION_COOKIE = '__Host-och_dashboard_google_oauth';
const DASHBOARD_SESSION_COOKIE = '__Host-och_dashboard_session';
const DEFAULT_PAGE_SIZE = 50;
const FORM_BODY_LIMIT = 32 * 1_024;
const MAX_CURSOR_LENGTH = 512;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PROVIDER_EVENT_ID_PATTERN = /^[!-~]{1,512}$/;
const POSTGRES_BIGINT_PATTERN = /^[1-9][0-9]{0,18}$/;
const MAX_POSTGRES_BIGINT = '9223372036854775807';
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
const replyIntentFormSchema = z
  .object({
    clientOperationId: z.string().regex(UUID_V4_PATTERN),
    csrf: z.string().regex(OPAQUE_TOKEN_PATTERN),
    inbox: z
      .string()
      .regex(IDENTIFIER_PATTERN)
      .refine((value) => value !== '.' && value !== '..'),
    sourceConnectionId: z
      .string()
      .regex(IDENTIFIER_PATTERN)
      .refine((value) => value !== '.' && value !== '..'),
    sourceProviderEventId: z.string().regex(PROVIDER_EVENT_ID_PATTERN),
    text: z
      .string()
      .max(2_000)
      .refine((value) => value.trim().length > 0)
  })
  .strict();
const telegramDeliveryAuthorizationFormSchema = z
  .object({
    commandId: z
      .string()
      .regex(POSTGRES_BIGINT_PATTERN)
      .refine(
        (value) =>
          value.length < MAX_POSTGRES_BIGINT.length ||
          (value.length === MAX_POSTGRES_BIGINT.length && value <= MAX_POSTGRES_BIGINT)
      ),
    csrf: z.string().regex(OPAQUE_TOKEN_PATTERN),
    inbox: z
      .string()
      .regex(IDENTIFIER_PATTERN)
      .refine((value) => value !== '.' && value !== '..')
  })
  .strict();

const signedLoginCsrfCookieOptions = Object.freeze({
  httpOnly: true,
  path: '/',
  sameSite: 'strict' as const,
  secure: true,
  signed: true
});
const signedSessionCookieOptions = Object.freeze({
  httpOnly: true,
  path: '/',
  sameSite: 'lax' as const,
  secure: true,
  signed: true
});
const signedGoogleTransactionCookieOptions = Object.freeze({
  httpOnly: true,
  maxAge: 10 * 60,
  path: '/',
  sameSite: 'lax' as const,
  secure: true,
  signed: true
});
const clearLoginCsrfCookieOptions = Object.freeze({
  httpOnly: true,
  path: '/',
  sameSite: 'strict' as const,
  secure: true
});
const clearSessionCookieOptions = Object.freeze({
  httpOnly: true,
  path: '/',
  sameSite: 'lax' as const,
  secure: true
});

interface AuthenticatedDashboardSession {
  readonly csrfToken: string;
  readonly session: DashboardSession;
  readonly sessionCookieValue: string;
}

interface ResolvedDashboardPageRequest {
  readonly authenticated: AuthenticatedDashboardSession;
  readonly availableInboxes: readonly DashboardInbox[];
  readonly requestedCursor?: string;
  readonly selectedInbox: DashboardInbox;
  readonly selectedInboxId: string;
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
  const replyIntentThrottle = createDashboardReplyIntentThrottle();
  const googleAuthentication = feature.googleAuthentication;
  const googleTransactions =
    googleAuthentication === undefined ? undefined : createDashboardGoogleOAuthTransactionManager();

  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { bodyLimit: FORM_BODY_LIMIT, parseAs: 'string' },
    (_request, body: string, done) => done(null, body)
  );

  // Fastify can reject an oversized form before the route handler reaches
  // sendDashboardFailure. Keep every operator HTML/form response non-cacheable
  // even along that parser-error path, while leaving the stylesheet cacheable.
  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.raw.url?.split('?', 1)[0];

    if (
      path !== '/operator/assets/dashboard.css' &&
      (path === '/operator' || path?.startsWith('/operator/') === true)
    ) {
      reply.header('Cache-Control', 'no-store');
    }

    return payload;
  });

  app.get('/operator/assets/dashboard.css', async (_request, reply) =>
    reply
      .header('Cache-Control', 'public, max-age=86400')
      .type('text/css; charset=utf-8')
      .send(dashboardStyle)
  );

  app.get('/operator/login', async (request, reply) => {
    const query = loginQuerySchema.safeParse(request.query);

    return sendLoginPage(
      reply,
      manager,
      query.success ? query.data.error : undefined,
      googleAuthentication !== undefined
    );
  });

  app.post<{ Body: string }>('/operator/session', async (request, reply) => {
    if (!hasExpectedOrigin(request, feature.publicOrigin)) {
      return sendLoginPage(reply.code(403), manager, 'invalid', googleAuthentication !== undefined);
    }

    const form = parseForm(request.body, loginFormSchema);
    const loginCsrfToken = readSignedCookie(request, DASHBOARD_LOGIN_CSRF_COOKIE);

    if (
      form === undefined ||
      loginCsrfToken === undefined ||
      !matchesSecret(form.csrf, loginCsrfToken)
    ) {
      clearLoginCsrfCookie(reply);
      return sendLoginPage(reply.code(403), manager, 'invalid', googleAuthentication !== undefined);
    }

    const verification = throttle.reserveVerification();

    if (verification === undefined) {
      clearLoginCsrfCookie(reply);
      return sendLoginPage(
        reply.code(429),
        manager,
        'throttled',
        googleAuthentication !== undefined
      );
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
      return sendLoginPage(reply.code(401), manager, 'invalid', googleAuthentication !== undefined);
    }

    const issued = await manager.createSession(principal.id);
    clearLoginCsrfCookie(reply);
    reply.setCookie(
      DASHBOARD_SESSION_COOKIE,
      `${issued.sessionToken}.${issued.csrfToken}`,
      signedSessionCookieOptions
    );

    return redirectDashboard(reply, '/operator');
  });

  if (googleAuthentication !== undefined && googleTransactions !== undefined) {
    app.get('/operator/auth/google/login', async (_request, reply) =>
      startGoogleAuthorization(reply, feature, googleTransactions, Object.freeze({ mode: 'login' }))
    );

    app.post<{ Body: string }>('/operator/auth/google/link', async (request, reply) => {
      if (!hasExpectedOrigin(request, feature.publicOrigin)) {
        return sendDashboardFailure(reply.code(403));
      }

      const form = parseForm(request.body, logoutFormSchema);
      let authenticated: AuthenticatedDashboardSession | undefined;

      try {
        authenticated = await readDashboardSession(request, manager);
      } catch {
        return sendDashboardFailure(reply.code(500));
      }

      if (
        form === undefined ||
        authenticated === undefined ||
        !matchesSecret(form.csrf, authenticated.csrfToken) ||
        !manager.matchesCsrf(authenticated.session, form.csrf)
      ) {
        clearSessionCookie(reply);
        return redirectDashboard(reply, '/operator/login?error=invalid');
      }

      return startGoogleAuthorization(
        reply,
        feature,
        googleTransactions,
        Object.freeze({ mode: 'link', principalId: authenticated.session.principalId })
      );
    });

    app.get('/operator/auth/google/callback', async (request, reply) => {
      const callback = parseGoogleCallback(request.query);
      const transactionId = readSignedCookie(request, DASHBOARD_GOOGLE_OAUTH_TRANSACTION_COOKIE);
      clearGoogleTransactionCookie(reply);

      if (callback === undefined || transactionId === undefined) {
        return redirectDashboard(reply, '/operator/login?error=invalid');
      }

      const transaction = googleTransactions.consume({
        id: transactionId,
        state: callback.state
      });

      if (transaction === undefined) {
        return redirectDashboard(reply, '/operator/login?error=invalid');
      }

      if (transaction.mode === 'link') {
        let authenticated: AuthenticatedDashboardSession | undefined;

        try {
          authenticated = await touchDashboardSession(request, reply, manager);
        } catch {
          return sendDashboardFailure(reply.code(500));
        }

        if (
          authenticated === undefined ||
          transaction.principalId === undefined ||
          authenticated.session.principalId !== transaction.principalId
        ) {
          clearSessionCookie(reply);
          return redirectDashboard(reply, '/operator/login?error=invalid');
        }
      }

      let identity: Awaited<
        ReturnType<typeof googleAuthentication.client.exchangeAuthorizationCode>
      >;

      try {
        identity = await googleAuthentication.client.exchangeAuthorizationCode({
          code: callback.code,
          codeVerifier: transaction.codeVerifier,
          nonce: transaction.nonce
        });
      } catch {
        return redirectDashboard(reply, '/operator/login?error=invalid');
      }

      if (identity === undefined) {
        return redirectDashboard(reply, '/operator/login?error=invalid');
      }

      let subjectHmac: string;

      try {
        subjectHmac = googleAuthentication.client.subjectHmac(identity.subject);
      } catch {
        return redirectDashboard(reply, '/operator/login?error=invalid');
      }

      if (transaction.mode === 'login') {
        try {
          const principalId = await googleAuthentication.identityStore.findPrincipalId({
            subjectHmac
          });

          if (principalId === undefined || feature.findPrincipal(principalId) === undefined) {
            return redirectDashboard(reply, '/operator/login?error=invalid');
          }

          const issued = await manager.createSession(principalId);
          reply.setCookie(
            DASHBOARD_SESSION_COOKIE,
            `${issued.sessionToken}.${issued.csrfToken}`,
            signedSessionCookieOptions
          );
          return redirectDashboard(reply, '/operator');
        } catch {
          return sendDashboardFailure(reply.code(500));
        }
      }

      if (transaction.principalId === undefined) {
        return redirectDashboard(reply, '/operator/login?error=invalid');
      }

      try {
        const result = await googleAuthentication.identityStore.bind({
          principalId: transaction.principalId,
          subjectHmac
        });

        if (result.kind === 'created' || result.kind === 'idempotent_replay') {
          return redirectDashboard(reply, '/operator');
        }

        return sendDashboardFailure(reply.code(409));
      } catch {
        return sendDashboardFailure(reply.code(500));
      }
    });
  }

  app.post<{ Body: string }>('/operator/logout', async (request, reply) => {
    if (!hasExpectedOrigin(request, feature.publicOrigin)) {
      return sendLoginPage(reply.code(403), manager, 'invalid', googleAuthentication !== undefined);
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

  app.post<{ Body: string }>('/operator/reply-intents', async (request, reply) => {
    if (!hasExpectedOrigin(request, feature.publicOrigin)) {
      return sendDashboardFailure(reply.code(403));
    }

    const form = parseForm(request.body, replyIntentFormSchema);

    if (form === undefined) {
      return sendDashboardFailure(reply.code(400));
    }

    let authenticated: AuthenticatedDashboardSession | undefined;

    try {
      authenticated = await readDashboardSession(request, manager);
    } catch {
      return sendDashboardFailure(reply.code(500));
    }

    if (authenticated === undefined) {
      clearSessionCookie(reply);
      return redirectDashboard(reply, '/operator/login?error=invalid');
    }

    if (
      !matchesSecret(form.csrf, authenticated.csrfToken) ||
      !manager.matchesCsrf(authenticated.session, form.csrf)
    ) {
      return sendDashboardFailure(reply.code(403));
    }

    const replyIntentInbox = feature.findReplyIntentInbox(
      authenticated.session.principalId,
      form.inbox
    );

    if (replyIntentInbox === undefined) {
      return sendDashboardFailure(reply.code(404));
    }

    if (!replyIntentThrottle.reserve(authenticated.session.principalId)) {
      return sendDashboardFailure(reply.code(429));
    }

    try {
      const result = await replyIntentInbox.recordReplyIntent(
        Object.freeze({
          clientOperationId: form.clientOperationId,
          sourceConnectionId: form.sourceConnectionId,
          sourceProviderEventId: form.sourceProviderEventId,
          text: form.text
        })
      );

      if (result.kind === 'created' || result.kind === 'idempotent_replay') {
        return redirectDashboard(
          reply,
          `/operator/outbound-commands?inbox=${encodeURIComponent(form.inbox)}`
        );
      }

      if (result.kind === 'idempotency_conflict') {
        return sendDashboardFailure(reply.code(409));
      }

      return sendDashboardFailure(reply.code(404));
    } catch {
      return sendDashboardFailure(reply.code(500));
    }
  });

  app.post<{ Body: string }>(
    '/operator/telegram-delivery-authorizations',
    async (request, reply) => {
      if (!hasExpectedOrigin(request, feature.publicOrigin)) {
        return sendDashboardFailure(reply.code(403));
      }

      const form = parseForm(request.body, telegramDeliveryAuthorizationFormSchema);

      if (form === undefined) {
        return sendDashboardFailure(reply.code(400));
      }

      let authenticated: AuthenticatedDashboardSession | undefined;

      try {
        authenticated = await readDashboardSession(request, manager);
      } catch {
        return sendDashboardFailure(reply.code(500));
      }

      if (authenticated === undefined) {
        clearSessionCookie(reply);
        return redirectDashboard(reply, '/operator/login?error=invalid');
      }

      if (
        !matchesSecret(form.csrf, authenticated.csrfToken) ||
        !manager.matchesCsrf(authenticated.session, form.csrf)
      ) {
        return sendDashboardFailure(reply.code(403));
      }

      const authorizationInbox = feature.findTelegramDeliveryAuthorizationInbox(
        authenticated.session.principalId,
        form.inbox
      );

      if (authorizationInbox === undefined) {
        return sendDashboardFailure(reply.code(404));
      }

      if (!replyIntentThrottle.reserve(authenticated.session.principalId)) {
        return sendDashboardFailure(reply.code(429));
      }

      try {
        const result = await authorizationInbox.recordTelegramDeliveryAuthorization(
          Object.freeze({ commandId: form.commandId })
        );

        if (result.kind === 'created' || result.kind === 'idempotent_replay') {
          return redirectDashboard(
            reply,
            `/operator/outbound-commands?inbox=${encodeURIComponent(form.inbox)}`
          );
        }

        if (result.kind === 'authorization_conflict') {
          return sendDashboardFailure(reply.code(409));
        }

        return sendDashboardFailure(reply.code(404));
      } catch {
        return sendDashboardFailure(reply.code(500));
      }
    }
  );

  app.get('/operator', async (request, reply) => {
    const context = await resolveDashboardPageRequest(request, reply, manager, feature);

    if (context === undefined) {
      return;
    }

    const cursor = decodeInboxCursor(context.requestedCursor, context.selectedInbox);

    if (cursor === null) {
      return sendDashboardFailure(reply.code(400));
    }

    try {
      const page = await context.selectedInbox.readInboundEvents({
        ...(cursor === undefined ? {} : { cursor }),
        pageSize: DEFAULT_PAGE_SIZE
      });

      return sendDashboardHtml(
        reply,
        renderDashboardPage({
          connectionIds: context.selectedInbox.connectionIds,
          csrfToken: context.authenticated.csrfToken,
          events: page.events,
          googleAuthenticationEnabled: googleAuthentication !== undefined,
          inboxes: context.availableInboxes,
          ...(page.nextCursor === undefined
            ? {}
            : { nextCursor: encodeInboxCursor(page.nextCursor, context.selectedInbox) }),
          principalId: context.authenticated.session.principalId,
          replyIntentEnabled:
            feature
              .findPrincipal(context.authenticated.session.principalId)
              ?.replyIntentInboxIds.includes(context.selectedInboxId) ?? false,
          selectedInboxId: context.selectedInboxId
        })
      );
    } catch {
      return sendDashboardFailure(reply.code(500));
    }
  });

  app.get('/operator/outbound-commands', async (request, reply) => {
    const context = await resolveDashboardPageRequest(request, reply, manager, feature);

    if (context === undefined) {
      return;
    }

    const cursor = decodeInboxOutboundCommandHistoryCursor(
      context.requestedCursor,
      context.selectedInbox
    );

    if (cursor === null) {
      return sendDashboardFailure(reply.code(400));
    }

    try {
      const page = await context.selectedInbox.readOutboundReplyCommandHistory({
        ...(cursor === undefined ? {} : { cursor }),
        pageSize: DEFAULT_PAGE_SIZE
      });

      return sendDashboardHtml(
        reply,
        renderDashboardOutboundCommandHistoryPage({
          commands: page.commands,
          connectionIds: context.selectedInbox.connectionIds,
          csrfToken: context.authenticated.csrfToken,
          googleAuthenticationEnabled: googleAuthentication !== undefined,
          inboxes: context.availableInboxes,
          ...(page.nextCursor === undefined
            ? {}
            : {
                nextCursor: encodeInboxOutboundCommandHistoryCursor(
                  page.nextCursor,
                  context.selectedInbox
                )
              }),
          principalId: context.authenticated.session.principalId,
          selectedInboxId: context.selectedInboxId,
          telegramDeliveryAuthorizationEnabled:
            feature
              .findPrincipal(context.authenticated.session.principalId)
              ?.telegramDeliveryAuthorizationInboxIds.includes(context.selectedInboxId) ?? false
        })
      );
    } catch {
      return sendDashboardFailure(reply.code(500));
    }
  });
};

const resolveDashboardPageRequest = async (
  request: FastifyRequest,
  reply: FastifyReply,
  manager: DashboardSessionManager,
  feature: DashboardFeature
): Promise<ResolvedDashboardPageRequest | undefined> => {
  let authenticated: AuthenticatedDashboardSession | undefined;

  try {
    authenticated = await touchDashboardSession(request, reply, manager);
  } catch {
    sendDashboardFailure(reply.code(500));
    return undefined;
  }

  if (authenticated === undefined) {
    clearSessionCookie(reply);
    redirectDashboard(reply, '/operator/login');
    return undefined;
  }

  const query = operatorQuerySchema.safeParse(request.query);

  if (!query.success) {
    sendDashboardFailure(reply.code(400));
    return undefined;
  }

  const availableInboxes = feature.listInboxes(authenticated.session.principalId);
  const selectedInboxId = query.data.inbox ?? availableInboxes[0]?.id;
  const selectedInbox =
    selectedInboxId === undefined
      ? undefined
      : feature.findInbox(authenticated.session.principalId, selectedInboxId);

  if (selectedInboxId === undefined || selectedInbox === undefined) {
    sendDashboardFailure(reply.code(404));
    return undefined;
  }

  return Object.freeze({
    authenticated,
    availableInboxes,
    ...(query.data.cursor === undefined ? {} : { requestedCursor: query.data.cursor }),
    selectedInbox,
    selectedInboxId
  });
};

const sendLoginPage = (
  reply: FastifyReply,
  manager: DashboardSessionManager,
  message: 'invalid' | 'throttled' | undefined,
  googleAuthenticationEnabled: boolean
): FastifyReply => {
  const csrfToken = manager.createLoginCsrfToken();

  reply.setCookie(DASHBOARD_LOGIN_CSRF_COOKIE, csrfToken, signedLoginCsrfCookieOptions);
  return sendDashboardHtml(
    reply,
    renderDashboardLoginPage({
      csrfToken,
      googleAuthenticationEnabled,
      ...(message === undefined ? {} : { message })
    })
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
  reply.clearCookie(DASHBOARD_LOGIN_CSRF_COOKIE, clearLoginCsrfCookieOptions);
};

const clearSessionCookie = (reply: FastifyReply): void => {
  reply.clearCookie(DASHBOARD_SESSION_COOKIE, clearSessionCookieOptions);
};

const clearGoogleTransactionCookie = (reply: FastifyReply): void => {
  reply.clearCookie(DASHBOARD_GOOGLE_OAUTH_TRANSACTION_COOKIE, clearSessionCookieOptions);
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
    reply.setCookie(DASHBOARD_SESSION_COOKIE, sessionCookieValue, signedSessionCookieOptions);
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

const startGoogleAuthorization = (
  reply: FastifyReply,
  feature: DashboardFeature,
  transactions: DashboardGoogleOAuthTransactionManager,
  input: Readonly<{ mode: 'login' | 'link'; principalId?: string }>
): FastifyReply => {
  const googleAuthentication = feature.googleAuthentication;

  if (googleAuthentication === undefined) {
    return sendDashboardFailure(reply.code(404));
  }

  try {
    const transaction = transactions.create(input);
    const location = googleAuthentication.client.createAuthorizationUrl({
      codeChallenge: transaction.codeChallenge,
      nonce: transaction.nonce,
      state: transaction.state
    });

    reply.setCookie(
      DASHBOARD_GOOGLE_OAUTH_TRANSACTION_COOKIE,
      transaction.id,
      signedGoogleTransactionCookieOptions
    );
    return reply.header('Cache-Control', 'no-store').redirect(location, 302);
  } catch {
    clearGoogleTransactionCookie(reply);
    return redirectDashboard(reply, '/operator/login?error=invalid');
  }
};

const parseGoogleCallback = (
  query: unknown
): Readonly<{ code: string; state: string }> | undefined => {
  if (typeof query !== 'object' || query === null) {
    return undefined;
  }

  const candidate = query as Readonly<Record<string, unknown>>;
  const code = candidate.code;
  const state = candidate.state;

  if (
    typeof code !== 'string' ||
    !/^[!-~]{1,2048}$/.test(code) ||
    typeof state !== 'string' ||
    !OPAQUE_TOKEN_PATTERN.test(state)
  ) {
    return undefined;
  }

  return Object.freeze({ code, state });
};

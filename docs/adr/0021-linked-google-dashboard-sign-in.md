# ADR-0021: Configured Google sign-in for dashboard principals

**Date:** 2026-08-17

**Status:** accepted

## Context

The operator dashboard previously accepted only configured local principal IDs
and Argon2id password hashes. The owner also operates an approved Google OAuth
client in the adjacent 360Connect development service and needs one low-friction
way to sign in to the dashboard without creating a general public account
system.

The dashboard remains a narrow, server-rendered surface with configured
principals and inbox scope. A Google account, email address, or consent screen
must not become an implicit invitation, role assignment, or provider credential
store.

## Decision

### Enable Google only from two file-backed secret values

Google sign-in is optional. It is enabled only when both
`GOOGLE_OAUTH_CLIENT_ID_FILE` and `GOOGLE_OAUTH_CLIENT_SECRET_FILE` are valid,
distinct absolute files and a runtime `dashboard` is configured. Docker Compose
mounts the two values as separate read-only secret files; neither value enters
the runtime connection JSON document, HTML, browser JavaScript, PostgreSQL, or
application logs.

An approved existing OAuth client may be reused. Its registered redirect URI
must exactly equal:

```text
<dashboard.publicOrigin>/operator/auth/google/callback
```

### Permit one explicitly configured first Google sign-in

The optional runtime `dashboard.googleBootstrap` object contains exactly one
canonical Google email and the ID of one already configured dashboard
principal. It is a deployment-local allow-list, not an invitation or role
definition. On a first Google login only, after verifying the ID-token
signature/audience/nonce and `email_verified: true`, the server compares that
email with the configured value. A match writes the existing immutable
subject-HMAC link and issues that principal's session. A mismatch, unverified
email, stale principal, or link conflict returns the same generic invalid-login
result.

The raw email remains only in the runtime configuration long enough for this
comparison. PostgreSQL receives only the subject HMAC and principal ID.

### Keep manual link available for an authenticated principal

A Google identity is not an account-creation mechanism. An already
authenticated configured dashboard principal uses the native
`POST /operator/auth/google/link` form, which requires the exact configured
Origin, a signed active dashboard session, and the dashboard anti-forgery
token. The callback rechecks that the same principal still owns the session.

Migration `0015_dashboard_google_identities` stores exactly one immutable link
from an application-HMACed Google `sub` value to one configured principal ID.
It stores no raw Google subject, email, name, avatar, ID token, access token,
refresh token, browser session, or inbox bearer. One Google identity and one
configured principal can each be linked only once. A collision produces a
generic conflict response.

The OAuth client derives that HMAC inside the server-side OAuth boundary from
its file-backed secret and a fixed domain separator. It is deliberately
independent from `sessionIdPepper`: forced dashboard-session invalidation must
not orphan an otherwise valid Google link.

The ordinary `GET /operator/auth/google/login` callback first resolves an
existing verified HMAC link to a currently configured principal. Only if no
link exists may it evaluate the one configured bootstrap allow-list entry.
An unknown Google account receives the same generic invalid-login result as
another failed sign-in and cannot create or claim a principal.

### Use the server-side authorization-code flow with PKCE

The server uses the Google authorization-code flow with `openid email`, PKCE S256,
state, and nonce. A ten-minute in-memory transaction retains the code verifier,
state, nonce, and optional linking principal. The browser receives only a
signed opaque transaction-ID cookie. Every callback consumes the transaction
once, exchanges the authorization code server-side, verifies the ID token for
the configured client audience, and verifies the nonce before the raw `sub` is
HMACed.

The dashboard session and temporary OAuth transaction cookies use
`Secure`, `HttpOnly`, `Path=/`, and `SameSite=Lax`. Lax is required for a
top-level Google callback to return the cookies. It does not weaken dashboard
writes: password login, Google linking, logout, reply-intent recording, and
Telegram delivery authorization retain their exact-Origin and anti-forgery
checks.

## Options considered

### Automatically create a principal from a Google email

Rejected. An email address is personal data, changes over time, and does not
define dashboard inbox scope. The chosen bootstrap is narrower: it names one
pre-existing principal and cannot create a role, scope, or account.

### Persist a Google access or refresh token

Rejected. The dashboard needs only authenticated sign-in. Provider tokens add
refresh, rotation, revocation, and external-send risk without serving this
decision.

### Reuse the 360Connect browser session directly

Rejected. It couples two applications' cookie/session boundaries and makes
logout, revocation, and incident containment unclear. Reusing the registered
OAuth client through isolated secret files is smaller and explicit.

### Require a separate Google OAuth client

Rejected for this bounded operator sign-in. The shared client is already
approved by the owner and remains safe when its redirect list is updated with
the exact dashboard callback. A future public deployment may choose a separate
client after a separate operational review.

## Consequences

- One exact configured owner email can bind one existing principal at its first
  verified Google sign-in; an authenticated principal may still use the manual
  link flow. Neither path exposes an inbox bearer or provider credential to the
  browser.
- A service restart safely cancels an in-progress Google flow because the PKCE
  transaction is intentionally in memory only; a user simply starts it again.
- The current identity HMAC is derived inside the approved OAuth-client
  boundary, so a Google-client-secret rotation requires a separately reviewed
  identity-transition decision. Operators must not overwrite that credential
  during an incident and assume existing links will continue to resolve.
- Removing or reassigning a link requires a separately reviewed forward
  decision because the link table is immutable. There is intentionally no
  self-service unlink endpoint.
- This decision changes browser authentication only. It does not add a public
  user system, organization/RBAC, provider OAuth, connector token storage,
  provider request, worker, retry, delivery status, or production claim.

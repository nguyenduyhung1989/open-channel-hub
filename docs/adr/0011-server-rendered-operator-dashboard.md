# ADR-0011: Server-rendered local-principal operator dashboard

**Date:** 2026-08-13
**Status:** accepted

## Context

Phase 4a introduced a deliberately narrow, server-selected aggregate inbox
reader. It is useful to an API client, but it still requires an operator to
handle a bearer credential. Putting that credential in a browser, a
single-page application, local storage, or a page's JavaScript would create a
new high-value disclosure path and would duplicate the server's inbox-scope
rules in a less trustworthy place.

The immediate need is a small read-only operator view, not a full identity
platform. There are no organizations, invitations, roles, audit logs,
password-reset flow, public connection administration, or deployment TLS
proof. The local Compose runner is HTTP on loopback and therefore cannot be
treated as a browser-login deployment.

## Decision

Phase 4b adds an optional, server-rendered dashboard configured inside the
existing version-1 runtime secret document. It is enabled only when the same
document already configures inboxes and PostgreSQL is available.

- The dashboard exposes only same-origin HTML and CSS under `/operator`; it
  has no browser bearer token, browser API request, client-side JavaScript, or
  connection-listing API. The server resolves the signed-in principal and then
  resolves only that principal's configured inboxes.
- `dashboard.publicOrigin` is an exact external HTTPS origin. Configuration
  rejects IP addresses, localhost, local/private hostnames, credentials,
  query strings, fragments, and paths other than `/`. The local loopback HTTP
  Compose runner deliberately has no dashboard configuration.
- A principal is deployment-local configuration, not a durable user record.
  It has a safe opaque ID, an Argon2id PHC password hash using the exact
  `m=19456,t=2,p=1` profile, and an explicit allow-list of configured inbox
  IDs. Its password hash is verified only on the server.
- Browser state uses signed `__Host-` cookies with `Secure`, `HttpOnly`,
  `SameSite=Lax`, and `Path=/`; no `Domain` attribute is set. One or two
  configured signing keys allow a current key and a short overlap during key
  rotation. The browser cookie contains random session and anti-forgery token
  values, never a password, provider credential, or inbox bearer.
- PostgreSQL migration `0008_dashboard_sessions` stores only
  domain-separated HMAC-SHA-256 values for random session and anti-forgery
  tokens, plus principal ID, issued/touch/expiry/revocation timestamps. It
  stores no raw token, password, provider credential, inbox bearer, or message
  membership.
- A session expires after 30 minutes of inactivity and after eight hours in
  total. Every authenticated dashboard read refreshes the idle deadline. A
  logout revokes the session server side. Rotating `sessionIdPepper` makes all
  existing session HMACs unusable.
- State-changing forms require the exact configured `Origin`, a signed cookie,
  and a hidden anti-forgery token. The login route adds a bounded in-process
  failure throttle; a real proxy must still enforce rate limits across
  processes and instances.

ADR-0021 later narrowed the cookie change from `Strict` to `Lax` so an
optional top-level Google authorization callback can return to the dashboard.
All dashboard writes retain the exact-Origin and anti-forgery checks above;
the cookie change does not make a cross-site write valid.

## Options considered

### Browser application using the existing inbox bearer

Rejected. A bearer would reach browser memory, browser storage, extension
surfaces, developer tools, and potentially client logs. It would also make a
copy of the authorization decision outside the server.

### Persist full user accounts and RBAC before exposing any UI

Rejected for this slice. That would add password lifecycle, account recovery,
membership management, role design, auditing, and another migration family
before the existing inbox read scope has a minimal browser representation.

### HTTP local dashboard for the supplied Compose runner

Rejected. The browser must enforce `Secure` cookies and submit a matching HTTPS
origin. Treating an HTTP loopback runner as an authentication test would either
weaken those controls or create misleading proof.

### Proxy-provided Basic Authentication

Rejected. It would make a proxy-specific identity decision part of the product
contract and would not bind configured dashboard principals to configured
inbox scopes inside the application.

## Consequences

- A small team can use a password-authenticated, read-only browser view without
  exposing API bearers to the browser.
- Deployment now has a real browser security boundary: external HTTPS, an
  exact origin, proxy request-size/rate-limit/logging controls, and safe
  secret rotation need operating evidence before a production claim.
- `sessionCookieSigningKeys` can be rotated by placing the new key first and
  retaining at most one prior key long enough for the eight-hour absolute
  session window. `sessionIdPepper` rotation immediately invalidates every
  existing session; use it when forced logout is needed after password change
  or suspected session compromise.
- The dashboard remains deliberately smaller than an identity system. It has
  no user self-service, roles, organization boundary, audit trail, live
  session administration, search, attachment handling, conversation state, or
  outbound action.

# Phase 4b operator dashboard

Phase 4b adds an optional, read-only browser dashboard. It renders HTML on the
server at `/operator`; the browser receives no inbox bearer, provider
credential, password hash, or JavaScript API client. This document describes
the implemented boundary, not a claim that a TLS proxy or production deployment
has been verified.

The dashboard is absent when the `dashboard` object is absent from the runtime
configuration. The supplied local Compose runner intentionally leaves it
absent: it publishes HTTP only on loopback, while this dashboard requires a
real external HTTPS origin and `Secure` cookies.

## Prerequisites

Before enabling it, all of the following must already be true:

- PostgreSQL is configured and migration `0008_dashboard_sessions` has run.
- The version-1 runtime secret document contains configured `connections` and
  at least one configured `inboxes` entry. Dashboard principals may select only
  those inbox IDs; they never select a connection ID or bearer token.
- A TLS reverse proxy exposes one public HTTPS hostname. Its exact origin is
  the `publicOrigin` below. The hostname must not be an IP address,
  `localhost`, or a local/private hostname.
- The proxy preserves `Origin`, `Cookie`, and `Set-Cookie`, does not log
  passwords or cookies, and rate-limits `POST /operator/session`. The
  application's small in-process login throttle is a supplement, not a
  cross-instance rate-limit service.
- The API remains protected behind the proxy as appropriate for the
  deployment. Do not expose PostgreSQL. Do not rely on `X-Forwarded-*` to make
  the dashboard secure; the browser enforces the `Secure` cookie and the
  application compares the browser `Origin` to `publicOrigin` exactly.

Do not point a browser at `http://127.0.0.1:3000/operator` and call that a
dashboard test. The configured origin cannot be loopback HTTP, and a conforming
browser will not return a `Secure` session cookie over that connection.

## Add the optional runtime configuration

`dashboard` belongs at the root of the existing configuration document and is
valid only when `inboxes` exists. Replace every placeholder privately; the
following is a shape example, not usable configuration:

```json
{
  "version": 1,
  "connections": ["existing configured connections"],
  "inboxes": [
    {
      "id": "support-inbox",
      "token": "<unique inbox bearer already kept secret>",
      "connectionIds": ["telegram-bot-support"]
    }
  ],
  "dashboard": {
    "publicOrigin": "https://hub.example.invalid/",
    "sessionCookieSigningKeys": [
      "<current unique signing key>",
      "<optional prior unique signing key>"
    ],
    "sessionIdPepper": "<unique session HMAC pepper>",
    "principals": [
      {
        "id": "support-agent",
        "passwordHash": "<Argon2id PHC value>",
        "inboxIds": ["support-inbox"]
      }
    ]
  }
}
```

The validator requires the following:

- `publicOrigin` is an HTTPS URL with a public hostname and `/` as its only
  path. It has no username, password, query, or fragment. The server uses the
  normalized origin such as `https://hub.example.invalid` for every dashboard
  form submission.
- `sessionCookieSigningKeys` has one or two unique printable non-whitespace
  values, each 32–512 characters. The first signs new cookies; the optional
  second supports one previous key during a controlled rotation.
- `sessionIdPepper` is another unique printable non-whitespace value of
  32–512 characters. It must differ from each signing key and from every
  provider, webhook, account-operator, and inbox credential in the document.
- `principals` has one to one hundred entries. Every principal ID uses the
  same safe opaque-label alphabet as inbox IDs and cannot be `.` or `..`.
  Every principal has one to one hundred unique inbox IDs that already exist
  in `inboxes`.
- `passwordHash` is an Argon2id PHC version-19 value using exactly
  `m=19456,t=2,p=1`. The supplied password command creates this required
  profile; hashes with another cost profile are rejected.

The entire document remains a secret, including password hashes, signing keys,
and the pepper. In Compose, store its unpadded base64url form only in the
Git-ignored secret source described by the
[runtime multi-connection guide](runtime-multi-connection-2c.md). In another
deployment, mount the raw secret document outside the repository. Do not put
any of it in Git, shell history, issue text, screenshots, browser source, or
application logs.

## Create a password hash without putting a password on a command line

Build the CLI, then use a private terminal that supports hidden input:

```bash
npm run build
read -r -s -p 'Dashboard password: ' DASHBOARD_PASSWORD
printf '\n'
printf %s "$DASHBOARD_PASSWORD" | npm run dashboard:password:hash
unset DASHBOARD_PASSWORD
```

Type a unique password at the hidden prompt. It must be valid UTF-8, contain
12–512 bytes, and contain neither a newline nor a NUL byte. The command prints
only an Argon2id PHC hash. Copy that hash directly into the private secret
document through an editor; never use a password or hash as a shell argument,
environment variable, commit, issue, screenshot, or log value.

## Browser operation

Open `https://your-host/operator/login`. The login form asks for one configured
principal ID and its password. On success the server issues a signed,
`Secure`, `HttpOnly`, `SameSite=Strict` `__Host-och_dashboard_session` cookie
and redirects to `/operator`.

The first authorized inbox is shown by default. The page can switch only among
the signed-in principal's configured inboxes. It uses the same server-owned
scope and opaque cursor rules as Phase 4a, so the URL cannot expand a
principal's connection scope. Selecting another allowed inbox or following the
next-page link is read-only. Message text is rendered as escaped text; it is
still sensitive operational data and should not be copied into public issues
or screenshots.

Use the dashboard's **Log out** form when leaving the workstation. It revokes
the server-side session and clears the cookie. Sessions also expire after 30
minutes without an authenticated dashboard read and never survive more than
eight hours from issue time.

## Authentication and session boundary

- Login and logout require the exact browser `Origin` matching `publicOrigin`,
  a signed cookie, and a hidden anti-forgery token. Invalid or missing login
  credentials receive a generic response.
- The server stores only HMACs of random session and anti-forgery tokens in
  `open_channel_hub.dashboard_sessions`. It never stores a raw browser token,
  dashboard password, inbox bearer, provider credential, or configured inbox
  membership in that table.
- Five aggregate failed password attempts inside five minutes trigger a
  ten-minute in-process block. It deliberately does not record an IP address,
  password, or raw form value. Configure edge rate limiting before exposing
  the login route to untrusted networks.
- Changing a password hash does not itself revoke an existing session. Rotate
  `sessionIdPepper` and recreate the API when an immediate forced logout is
  required. This invalidates every existing dashboard session, so coordinate
  it with operators.

## Rotate session keys safely

For a normal cookie-signing-key rotation, edit the secret document so the new
key is first and the previous key is second, recreate the API, and retain the
previous key for at least the eight-hour absolute session window. Signed cookies
validated by the old key are reissued under the new first key. Remove the old
key in a later configuration update.

For a suspected session or password compromise, rotate the `sessionIdPepper`
instead. This makes every HMAC stored for existing session tokens unreachable,
which forces all users to sign in again. Rotate the cookie-signing key and
password hash at the same time when the incident scope requires it. The old
rows remain audit-free expiry/revocation metadata until a future explicit
retention policy exists; do not delete database rows manually as a substitute
for a documented operation.

## What this does not provide

- No self-service account creation, password reset, invitation flow,
  organization boundary, role model, audit log, live session list, or managed
  credential rotation endpoint.
- No public TLS/proxy configuration, cross-instance rate-limit proof, backup
  or restore proof, encryption-at-rest assurance, monitoring/alerting, or
  production deployment evidence.
- No conversation model, read/unread state, assignment, label, search,
  attachment, provider dispatch, provider access-token, OAuth, or live provider
  operation. Phase 4c's API-only source-bound reply-command ledger has no
  dashboard form; this dashboard remains read-only.

The repository's Compose smoke test deliberately validates only the database
migration count and existing synthetic API paths over loopback HTTP. Dashboard
authentication is tested at the route layer with synthetic features; it is not
forced through HTTP Compose because that would not prove the required HTTPS
cookie and origin behavior.

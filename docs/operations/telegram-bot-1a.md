# Phase 1a Telegram Bot: configuration and operating boundary

**Status:** the original one-Bot HTTP gateway and startup wiring are
implemented. Historical local and GitHub verification exists for the Phase 1a
candidate at <code>7141949</code>, and GitHub CI/CodeQL passed for the later
Phase 2b commit <code>4d5a9c9</code>. No real Telegram Bot token, API method
request, webhook registration, send/receive confirmation, or authorized
test-bot check has occurred.

This is the temporary **legacy one-Bot** guide. New multi-connection
configuration is documented separately in the
[Phase 2c guide](runtime-multi-connection-2c.md).

## Deliberately narrow scope

Legacy Phase 1a covers only text messages through the official Telegram Bot
API:

- <code>POST /v1/telegram-bot/messages</code> is the local operator API for
  sending text. It requires
  <code>Authorization: Bearer &lt;OPERATOR_API_TOKEN&gt;</code>.
- <code>POST /v1/webhooks/telegram-bot</code> is the Telegram ingress route.
  It accepts only an <code>X-Telegram-Bot-Api-Secret-Token</code> header that
  matches <code>TELEGRAM_WEBHOOK_SECRET</code>.
- After webhook authentication, the system normalizes only valid text updates.
  Stickers, photos, callbacks, and other update types are intentionally
  ignored.

<code>OPERATOR_API_TOKEN</code> is a shared key for a local operator. It is
**not** a user account, login system, or role-based authorization mechanism.
There are no users, organizations, or RBAC yet. Do not expose this API to the
Internet merely because it has a secret header; that is a Phase 1a boundary,
not complete administration.

An authenticated webhook returns <code>204</code> without a payload. With the
Phase 2a PostgreSQL configuration present, it appends the canonical incoming
text event before returning. A repeated
<code>(connection_id, provider_event_id)</code> does not create a second row,
and raw provider payloads are not stored. The later operator event-read API
exists, but this is still not a user inbox, conversation model, durable
outbound retry, or backup.

## Safe configuration

Copy <code>.env.example</code> to <code>.env</code> and edit it locally, or
place equivalent values in the deployment environment's secret store. These
variables are for the legacy one-Bot mode only; do not combine them with
<code>CONNECTIONS_CONFIG_FILE</code> or
<code>CONNECTIONS_CONFIG_BASE64_FILE</code>.
<code>.env</code> is ignored by Git.

Do not paste a token or password into a shell command, inline environment
assignment, terminal history, issue, pull request, screenshot, or log. If
someone else must configure it, use a private channel or permission to enter it
directly into the secret store. This document intentionally contains no command
with a token or password.

The supplied Compose stack sets <code>NODE_ENV=production</code>. It will not
start until <code>SOURCE_OFFER_URL</code> is nonblank and valid, and its
PostgreSQL migration service also needs the two distinct database passwords
documented in the
[Phase 2a PostgreSQL operations guide](postgresql-phase-2a.md). Set values in
the local environment file before starting Compose; never use a synthetic URL
or upstream URL unless it actually serves the exact corresponding source for
the version running.

| Variable                             | Needed when      | Requirement                                                                                                                                                                                                          |
| ------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <code>TELEGRAM_BOT_ENABLED</code>    | Always           | Defaults to <code>false</code>. Only <code>true</code> or <code>false</code> is valid; keep it disabled until ready.                                                                                                 |
| <code>TELEGRAM_BOT_TOKEN</code>      | Telegram enabled | A Telegram-issued bot token; it must not be blank.                                                                                                                                                                   |
| <code>OPERATOR_API_TOKEN</code>      | Telegram enabled | A separate key for the local operator API; 32–512 characters. Do not reuse it as the webhook secret.                                                                                                                 |
| <code>TELEGRAM_CONNECTION_ID</code>  | Telegram enabled | Internal connection label; defaults to <code>telegram-bot-default</code>, is at most 128 characters, and uses only letters, digits, <code>.</code>, <code>_</code>, <code>:</code>, and <code>-</code>.              |
| <code>TELEGRAM_WEBHOOK_SECRET</code> | Telegram enabled | A separate random secret Telegram returns in its header: 32–256 characters from <code>A-Z</code>, <code>a-z</code>, <code>0-9</code>, <code>_</code>, and <code>-</code>.                                            |
| <code>TELEGRAM_WEBHOOK_URL</code>    | Optional         | Blank is valid. When set with Telegram enabled, it must be an absolute public HTTPS URL for <code>/v1/webhooks/telegram-bot</code>, with no username, password, query string, fragment, or secret.                   |
| <code>SOURCE_OFFER_URL</code>        | Production       | Required when <code>NODE_ENV=production</code>. It must be the public, unauthenticated, exact corresponding-source HTTPS URL for the version running, with no username, password, query string, fragment, or secret. |

When <code>TELEGRAM_BOT_ENABLED=true</code>, the server must refuse to start if
<code>TELEGRAM_BOT_TOKEN</code>, <code>OPERATOR_API_TOKEN</code>, or
<code>TELEGRAM_WEBHOOK_SECRET</code> is missing, if the two Telegram
authentication values are the same, or if PostgreSQL storage is not configured.

The API publishes <code>SOURCE_OFFER_URL</code> through unauthenticated
<code>GET /source</code> and the
<code>Link: &lt;SOURCE_OFFER_URL&gt;; rel="source"</code> header on every
response. This helps operate the AGPL section 13 source offer; it is not legal
advice. A modified fork or SaaS must set a public, no-auth URL for the exact
corresponding source of the version it runs, not use the upstream repository as
a placeholder.

## Network and TLS

<code>compose.yaml</code> maps only <code>127.0.0.1:3000</code>, so the
operator API is not automatically exposed outside the host. PostgreSQL has no
host port and remains on an internal Docker network. For Telegram to deliver a
webhook, a TLS reverse proxy must provide a public HTTPS URL that forwards
precisely to <code>/v1/webhooks/telegram-bot</code>. Multi-connection mode
instead uses the dynamic route described in the
[Phase 2c guide](runtime-multi-connection-2c.md).

Compose does not issue a TLS certificate, expose a public port, register a
webhook automatically, or replace rate limiting and monitoring. Do not expose
port <code>3000</code> directly to the Internet for a quick test.

## Register a webhook without putting a token in a command

Only after the owner authorizes a live test, the TLS reverse proxy is working,
and <code>TELEGRAM_WEBHOOK_URL</code> points to the public route, run this from
the directory containing <code>compose.yaml</code> after the stack is started:

```bash
docker compose exec api npm run telegram:webhook:set
```

The command is available in the runtime image. Compose passes regular
environment values to the API container when it is created, not each time
<code>exec</code> runs. If <code>.env</code> changed after the API container
was created, recreate it before registering:

```bash
docker compose up -d --force-recreate api
docker compose exec api npm run telegram:webhook:set
```

In legacy mode, the command reads its configured Bot values from the container
environment. It takes no token on the command line and reports only a general
result. Do not replace it with a hand-built Telegram URL containing a token, and
do not copy a header or payload into a terminal or log. In multi-connection
mode, the same command reads the mounted secret document and processes each
configured <code>webhookUrl</code>; use the Phase 2c guide instead.

This command makes a real network request to Telegram. It has **not** run for
this project state and must be used only with an authorized test bot. Telegram
accepting registration proves only registration; it does not prove successful
message receipt, data persistence, or production readiness.

Before a real-token test, the operator must confirm:

1. The local environment file or secret store has all required values and they
   are absent from Git and logs.
2. The reverse proxy forwards public HTTPS to the webhook route while the
   container API port remains loopback-only.
3. The proxy does not log <code>Authorization</code>,
   <code>X-Telegram-Bot-Api-Secret-Token</code>, webhook payloads, or a URL
   containing a secret.
4. The test bot and permission to test it are explicit; resulting data is not
   treated as production data.
5. The operator understands that canonical message text will enter the local
   PostgreSQL ledger and has reviewed the data/volume warning in the
   [PostgreSQL guide](postgresql-phase-2a.md).

## What Phase 1a does not promise

- No user authentication, session, multi-tenancy, or RBAC.
- No user-visible inbox, conversation query, attachment storage, queue, retry,
  backup, restore drill, or retention/deletion policy.
- No proof of real network communication or Telegram acceptance during this
  work.
- No production deployment. Any public configuration needs a separate threat
  model, TLS, rate limiting, observability, secret operations, backup/recovery,
  and verification.

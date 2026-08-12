# Phase 1a Telegram Bot: configuration and operating boundary

**Status:** the HTTP gateway, startup wiring, and final candidate verification are complete: `npm run check` passed with seven test files, fifty tests, and a build; `npm audit --audit-level=low` found zero vulnerabilities; `docker compose config --quiet` passed; the non-root, read-only runtime image was built and checked; an independent audit passed; and GitHub CI and CodeQL succeeded at `7141949`. The bundled webhook CLI exits safely while Telegram is disabled and no real Telegram environment is present. Phase 1a is still not complete: no real token, network request, webhook registration, or authorized test-bot check has occurred.

## Deliberately narrow scope

Phase 1a covers only text messages through the official `Telegram Bot` API:

- `POST /v1/telegram-bot/messages` is the local operator API for sending text. It requires `Authorization: Bearer <OPERATOR_API_TOKEN>`.
- `POST /v1/webhooks/telegram-bot` is the Telegram ingress route. It accepts only an `X-Telegram-Bot-Api-Secret-Token` header that matches `TELEGRAM_WEBHOOK_SECRET`.
- After webhook authentication, the system normalizes only valid text updates. Stickers, photos, callbacks, and other update types are intentionally ignored.

`OPERATOR_API_TOKEN` is a shared key for a local operator. It is **not** a user account, login system, or role-based authorization mechanism. There are no users, organizations, or RBAC yet. Do not expose this API to the Internet merely because it has a secret header; that is a Phase 1a boundary, not complete administration.

An authenticated webhook returns `204` without a payload. Incoming events are not persisted; there is no inbox, deduplication, durable retry, or conversation-data audit log. Phase 2 must design those together with persistence rather than simulate them with in-memory state that disappears with the process.

## Safe configuration

Copy `.env.example` to `.env` and edit it locally, or place equivalent values in the deployment environment's secret store. `.env` is ignored by Git.

Do not paste a token into a shell command, inline environment assignment, terminal history, issue, pull request, screenshot, or log. If someone else must configure it, use a private channel or permission to enter it directly into the secret store. This document intentionally contains no command with a token.

The supplied Compose service sets `NODE_ENV=production`, so it will not start until `SOURCE_OFFER_URL` is nonblank and valid. Set it in `.env` before `docker compose up`; never use a synthetic URL or an upstream URL unless it actually serves the exact corresponding source for the version running.

| Variable                  | Needed when      | Requirement                                                                                                                                                                                               |
| ------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_ENABLED`    | Always           | Defaults to `false`. Only `true` or `false` is valid; keep it `false` until ready.                                                                                                                        |
| `TELEGRAM_BOT_TOKEN`      | Telegram enabled | A Telegram-issued bot token; it must not be blank.                                                                                                                                                        |
| `OPERATOR_API_TOKEN`      | Telegram enabled | A separate key for the local operator API; 32–512 characters. Do not reuse it as the webhook secret.                                                                                                      |
| `TELEGRAM_CONNECTION_ID`  | Telegram enabled | Internal connection label; defaults to `telegram-bot-default`, is at most 128 characters, and uses only letters, digits, `.`, `_`, `:`, and `-`.                                                          |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram enabled | A separate random secret Telegram returns in its header: 32–256 characters from `A-Z`, `a-z`, `0-9`, `_`, and `-`.                                                                                        |
| `TELEGRAM_WEBHOOK_URL`    | Optional         | Blank is valid. When set with Telegram enabled, it must be an absolute public `https://` URL for `/v1/webhooks/telegram-bot`, with no username, password, query string, fragment, or secret.              |
| `SOURCE_OFFER_URL`        | Production       | Required when `NODE_ENV=production`. It must be the public, unauthenticated, exact corresponding-source HTTPS URL for the version running, with no username, password, query string, fragment, or secret. |

When `TELEGRAM_BOT_ENABLED=true`, the server must refuse to start if `TELEGRAM_BOT_TOKEN`, `OPERATOR_API_TOKEN`, or `TELEGRAM_WEBHOOK_SECRET` is missing, rather than run partially configured. The Phase 1a startup path is wired; set these values only when preparing an authorized test-bot check.

The API publishes `SOURCE_OFFER_URL` through unauthenticated `GET /source` and the `Link: <SOURCE_OFFER_URL>; rel="source"` header on every response. This helps operate the AGPL section 13 source offer; it is not legal advice. A modified fork or SaaS must set a public, no-auth URL for the exact corresponding source of the version it runs, not use the upstream repository as a placeholder.

## Network and TLS

`compose.yaml` maps only `127.0.0.1:3000`, so the operator API is not automatically exposed outside the host. For Telegram to deliver a webhook, a TLS reverse proxy must provide a public HTTPS URL that forwards precisely to `/v1/webhooks/telegram-bot`.

Compose does not issue a TLS certificate, expose a public port, register a webhook automatically, or replace rate limiting and monitoring. Do not expose port `3000` directly to the Internet for a quick test.

## Register a webhook without putting a token in a command

Only after the owner authorizes a live test, the TLS reverse proxy is working, and `TELEGRAM_WEBHOOK_URL` points to the public route, run this from the directory containing `compose.yaml` after the Compose service is started:

```bash
docker compose exec api npm run telegram:webhook:set
```

The command is available in the runtime image. Compose passes environment values to the container when it is created, not each time `exec` runs. If `.env` or the Compose secret source changed after the `api` container was created, recreate that container before registering:

```bash
docker compose up -d --force-recreate api
docker compose exec api npm run telegram:webhook:set
```

The command reads its configured values from the container environment; it takes no token on the command line and reports only a general result. Do not replace it with a hand-built Telegram URL containing a token, and do not copy a header or payload into a terminal or log.

This command makes a real network request to Telegram. It **has not run for this candidate** and must be used only with an authorized test bot. Telegram accepting registration proves only registration; it does not prove successful message receipt, data persistence, or production readiness.

Before a real-token test, the operator must confirm:

1. The `.env` file or secret store has all required secrets and they are absent from Git and logs.
2. The reverse proxy forwards public HTTPS to the webhook route while the container API port remains loopback-only.
3. The proxy does not log `Authorization`, `X-Telegram-Bot-Api-Secret-Token`, webhook payloads, or a URL containing a secret.
4. The test bot and permission to test it are explicit; resulting data is not treated as production data.

## What Phase 1a does not promise

- No user authentication, session, multi-tenancy, or RBAC.
- No conversation persistence, restart recovery, update deduplication, queue, retry, or backup.
- No proof of real network communication or Telegram acceptance during this work.
- No production deployment. Any public configuration needs a separate threat model, TLS, rate limiting, observability, secret operations, and verification.

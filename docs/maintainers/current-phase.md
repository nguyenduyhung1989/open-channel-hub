# Public checkpoint: Phase 1a

**Updated:** 2026-08-12

**Objective:** wire the official `Telegram Bot` into a deliberately narrow text send/receive slice, with a local operator API, a separate webhook secret, and no token in source code, commands, or logs.

## Verified milestones

- Phase 0 GitHub CI and CodeQL succeeded at commit `8b80c3b`.
- GitHub Private Vulnerability Reporting, secret scanning, Dependabot alerts, and automatic security fixes are enabled.
- Final local candidate evidence passed: `npm run check` (seven test files, fifty tests, and build), `npm audit --audit-level=low` with zero vulnerabilities, `docker compose config --quiet`, non-root/read-only runtime checks, and independent audit.
- No GitHub CI or CodeQL result exists yet for this candidate; the verified Phase 0 result remains commit `8b80c3b`.
- The `0.1.0` release tag has not been created; that is a separate owner decision.
- Branch protection is intentionally open pending an owner decision. Do not describe it as an existing safeguard.

## Current code state

- The Telegram HTTP gateway and startup wiring are complete when `TELEGRAM_BOT_ENABLED=true`.
- `npm run check` passed with seven test files, fifty tests, and a build. The dependency audit reported zero vulnerabilities, Compose configuration passed, and a non-root/read-only image was healthy with a synthetic non-secret source URL: missing `SOURCE_OFFER_URL` failed fast, while `/health` and `/source` returned the expected results.
- The current surface is `POST /v1/telegram-bot/messages` with `OPERATOR_API_TOKEN`, and `POST /v1/webhooks/telegram-bot` with the `X-Telegram-Bot-Api-Secret-Token` header.
- Only valid text updates are authenticated and normalized. There is no persistence, inbox, deduplication, durable retry, user model, or RBAC before Phase 2.
- The runtime command `docker compose exec api npm run telegram:webhook:set` is bundled for a later authorized test, but it has not made a real request.
- The runtime offers its corresponding-source URL through unauthenticated `GET /source` and `Link: <SOURCE_OFFER_URL>; rel="source"` on every response. Production requires an explicit HTTPS `SOURCE_OFFER_URL` for the exact running source; this is an AGPL section 13 implementation aid, not legal advice.
- No real token, network request, webhook registration, or Telegram send/receive confirmation has occurred.

## Open risks

- A shared-token operator API is not user authentication or RBAC; Compose exposes the host port only on loopback.
- A Telegram webhook needs a public HTTPS URL behind a reverse proxy. Compose does not provide TLS or make a deployment production-safe.
- A modified fork or SaaS must publish its exact corresponding source without authentication and set that public URL as `SOURCE_OFFER_URL`; the upstream repository is not a valid placeholder for modified code.
- Offline tests do not prove live operation. Real tokens and payloads must stay out of Git, terminal history, and logs.

## Exact next verification

1. When the final candidate is pushed, verify GitHub CI and CodeQL for that exact commit; the old `8b80c3b` result is not evidence for it.
2. Only with owner authorization, place a test token in a safe secret source, use a public TLS URL, recreate the Compose `api` container if its environment changed, and run `docker compose exec api npm run telegram:webhook:set`. Then confirm one real Telegram flow without printing a token, header, or payload.
3. Update this checkpoint, the threat model, and the roadmap from the new evidence before calling 1a complete or creating a release tag.

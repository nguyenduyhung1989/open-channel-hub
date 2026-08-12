# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The public Phase 0 foundation for Open Channel Hub.
- The original mocked `Telegram Bot` vertical slice, connector contracts, and health-check API.
- CI, CodeQL, Dependabot, community-policy files, ADRs, and an initial threat model.
- Phase 1a: Telegram Bot HTTP transport, startup wiring, local operator API, separately authenticated webhook, and credential-safe configuration and operations documentation.
- An unauthenticated `GET /source` endpoint and `Link: <SOURCE_OFFER_URL>; rel="source"` response header to surface the configured corresponding-source offer.

### Changed

- The roadmap now separates GitHub CI/CodeQL evidence at `8b80c3b` from the owner's decision to create a `0.1.0` release tag.
- Phase 1a status now records passing final local candidate evidence: `npm run check` (seven test files, fifty tests, and build), `npm audit --audit-level=low` with zero vulnerabilities, `docker compose config --quiet`, non-root/read-only runtime checks, and independent audit.
- Real Telegram verification and GitHub CI/CodeQL evidence for the current candidate remain outstanding.

### Security

- Real secrets and data are prohibited in the repository, issues, pull requests, and tests.
- Telegram is disabled by default; Compose publishes only a loopback host port, documentation never puts tokens in commands or logs, and a configured `TELEGRAM_WEBHOOK_URL` cannot contain userinfo, a query string, a fragment, or a secret.
- Production requires an explicit HTTPS `SOURCE_OFFER_URL` with no userinfo, query string, fragment, or secret; it must provide the exact corresponding source for the version running.

There has been no official release. A version is dated here only when its release tag is created after final checks.

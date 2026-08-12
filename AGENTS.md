# Open Channel Hub Working Agreement

## Product boundary

- This repository is a public, self-hostable communication hub under `AGPL-3.0-or-later`.
- Build official provider integrations first. Any session-based or unofficial connector is opt-in, isolated, documented as experimental, and must never contain evasion, CAPTCHA bypass, fingerprint spoofing, or bulk-spam features.
- Never commit real account data, phone numbers, access tokens, cookies, webhook payloads, or customer messages. Tests use synthetic fixtures only.

## Architecture

- Keep business rules in `packages/domain`; adapters depend inward through contracts in `packages/connector-sdk`.
- Every connector declares its tier and capabilities. An action must be rejected before execution when a capability is absent.
- Treat all provider events and HTTP input as untrusted. Validate them at the boundary.
- Avoid speculative infrastructure: PostgreSQL, Redis, durable outbox, and the web dashboard land only when their vertical slice needs them.

## Code and verification

- Target Node.js `24.18.1` in CI and containers. Local development supports maintained Node.js `22.22.0` through `24.x`; pin all direct npm dependencies to exact stable versions; never use Docker `latest`.
- Use TypeScript strict mode. Prefer immutable values, explicit error types, and small feature-oriented files.
- Write behavior tests for every added use case and connector contract. Mock external providers; tests must not make network requests.
- Before a local commit, run the affected tests, `npm run typecheck`, `npm run lint`, and `npm run build` when dependencies are installed.

## Ownership while agents work

- The coordinator owns root configuration, `apps/api`, integration, package lock, and final verification.
- Do not modify another agent's assigned directory without first reporting the dependency to the coordinator.
- Keep public documentation honest about what is implemented versus planned.

# ADR-0002: Official-first connector tiers

**Date:** 2026-08-12
**Status:** accepted

## Context

Messaging platforms differ substantially in their official support, authorization model, and risk. A connector built on a public API is not equivalent to one that reuses a user session or relies on behavior the provider does not support.

If these differences are hidden behind a single “supported” label, operators cannot know what they are accepting and the project can drift toward policy-evasion features.

## Decision

Each connector must declare a clear tier. Source-code values are uppercase:

| Tier              | Meaning                                                                                                                                                    | Rule                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `OFFICIAL`        | Uses a provider's documented API or authorization flow.                                                                                                    | This is the preferred product path.                                               |
| `OFFICIAL_CLIENT` | A reserved contract slot for an official provider client surface with separate scopes or permissions. No connector uses this tier in the Phase 0–1a alpha. | An ADR and a separate permissions/risk description are required first.            |
| `EXPERIMENTAL`    | Has policy or technical uncertainty, for example because it relies on a signed-in session.                                                                 | Isolate it in a package, make it opt-in, and document risk and capability limits. |

`deferred` is a roadmap state, not a `ConnectorTier` value in source code: there is not enough technical or legal basis to build it, and it must not be presented as a feature.

An `EXPERIMENTAL` connector must not include CAPTCHA bypass, device-fingerprint spoofing, anti-automation bypass, session theft, unauthorized collection, or bulk spam. If it cannot be provided without those behaviors, it belongs in `deferred`.

Phase 0 had only a simulated `Telegram Bot` gateway. The Phase 0–1a alpha now includes an HTTP gateway for the official API, startup wiring, and synthetic offline API/connector tests. There is no proof from real credentials, network traffic, webhooks, or a production deployment. It is therefore an `OFFICIAL`-tier implementation under development, not evidence of an operating official connector.

## Options considered

### One “supported” label for every platform

- Benefit: simple marketing description.
- Cost: hides differences in permissions, durability, and risk.
- Rejected: conflicts with operational transparency.

### Prohibit all unofficial connectors

- Benefit: lower product risk.
- Cost: also blocks potentially useful lawful, opt-in research.
- Rejected: keep `EXPERIMENTAL` isolated, but only after a connector-specific ADR and a review of the current policy.

## Consequences

- Interfaces, documentation, and APIs must show the connector tier, not only the platform name.
- A new connector needs a capability matrix, policy/API source material, data model, tests, and an ADR when risk changes.
- Accepting an unofficial connector is a connector-specific decision, not a default precedent.

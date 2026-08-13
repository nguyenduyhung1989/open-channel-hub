# Architecture Decision Records

ADRs record decisions whose rationale people will still need to understand six
months later. The <code>accepted</code> status means a decision is in effect;
it does not mean a feature is complete.

| ADR                                                    | Status   | Decision                                                        |
| ------------------------------------------------------ | -------- | --------------------------------------------------------------- |
| [0001](0001-modular-monolith-and-inward-contracts.md)  | accepted | Modular monolith and inward-facing contracts                    |
| [0002](0002-official-first-connector-tiers.md)         | accepted | Official-first connector tiers                                  |
| [0003](0003-node-24-and-npm-workspaces.md)             | accepted | Node.js 24.18.1 and npm workspaces                              |
| [0004](0004-agpl-and-future-commercial-options.md)     | accepted | AGPL-3.0-or-later and future commercial options                 |
| [0005](0005-postgresql-inbound-event-ledger.md)        | accepted | Dedicated PostgreSQL schema and canonical inbound-event ledger  |
| [0006](0006-stable-inbound-event-pagination.md)        | accepted | Stable, connection-scoped inbound-event pagination              |
| [0007](0007-runtime-configured-connection-registry.md) | accepted | Runtime connection registry and token-bound account selection   |
| [0008](0008-facebook-page-signed-inbound.md)           | accepted | Facebook Page signed inbound text boundary                      |
| [0009](0009-whatsapp-business-signed-inbound.md)       | accepted | WhatsApp Business signed inbound text boundary                  |
| [0010](0010-configured-read-only-inbox-principals.md)  | accepted | Configured read-only inbox principals                           |
| [0011](0011-server-rendered-operator-dashboard.md)     | accepted | Server-rendered local-principal operator dashboard              |
| [0012](0012-source-bound-durable-reply-commands.md)    | accepted | Source-bound durable reply commands before provider dispatch    |
| [0013](0013-scoped-queued-reply-command-history.md)    | accepted | Scoped queued reply-command history without delivery semantics  |
| [0014](0014-server-rendered-queued-command-history.md) | accepted | Server-rendered queued command history for dashboard principals |
| [0015](0015-opt-in-dashboard-reply-intents.md)         | proposed | Opt-in source-bound dashboard reply-intent recording            |

Template for a new ADR:

```markdown
# ADR-NNNN: Decision title

**Date:** YYYY-MM-DD
**Status:** proposed | accepted | deprecated | superseded by ADR-NNNN

## Context

## Decision

## Options considered

## Consequences
```

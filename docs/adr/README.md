# Architecture Decision Records

ADRs record decisions whose rationale people will still need to understand six
months later. The <code>accepted</code> status means a decision is in effect;
it does not mean a feature is complete.

| ADR                                                   | Status   | Decision                                                       |
| ----------------------------------------------------- | -------- | -------------------------------------------------------------- |
| [0001](0001-modular-monolith-and-inward-contracts.md) | accepted | Modular monolith and inward-facing contracts                   |
| [0002](0002-official-first-connector-tiers.md)        | accepted | Official-first connector tiers                                 |
| [0003](0003-node-24-and-npm-workspaces.md)            | accepted | Node.js 24.18.1 and npm workspaces                             |
| [0004](0004-agpl-and-future-commercial-options.md)    | accepted | AGPL-3.0-or-later and future commercial options                |
| [0005](0005-postgresql-inbound-event-ledger.md)       | accepted | Dedicated PostgreSQL schema and canonical inbound-event ledger |

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

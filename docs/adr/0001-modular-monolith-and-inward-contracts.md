# ADR-0001: Modular monolith and inward-facing contracts

**Date:** 2026-08-12
**Status:** accepted

## Context

Open Channel Hub is intended to support multiple connectors and interfaces. Phase 0 began with a small API and a simulated `Telegram Bot` vertical slice. In the Phase 0–1a alpha, an official Telegram Bot HTTP transport, startup wiring, and synthetic offline tests exist, but there is no proof from real credentials, network traffic, webhooks, or a production deployment. Splitting into microservices or introducing a queue now would still add operational, deployment, and distributed-failure complexity before a live flow proves that either is needed.

At the same time, a connector must not pull provider SDKs or provider-specific details into shared business rules.

## Decision

Use a modular monolith in one deployable process, separated by npm workspaces:

- `packages/contracts`: canonical types and contracts.
- `packages/domain`: pure business rules with no framework or SDK dependency.
- `packages/connector-sdk`: connector ports facing inward to the core.
- `packages/connector-*`: adapters that translate provider data.
- `apps/api`: the HTTP adapter and dependency-composition point.

Dependencies point inward: adapters → contracts/core; the core does not import Fastify, an ORM, or a provider SDK. Split processes only when a live vertical slice demonstrates the need for separate load isolation, reliability, or access control.

## Options considered

### Microservices from the start

- Benefit: independent deployment isolation and scaling on paper.
- Cost: adds internal networking, queues, observability, secrets, and release coordination before there is traffic or durable data.
- Rejected: it does not fit KISS/YAGNI for the current Phase 0–1a alpha.

### One flat application directory

- Benefit: faster initial start.
- Cost: shared logic and connector details become mixed, making tests and later connector separation harder.
- Rejected: the future separation cost is higher than the current small contract layer.

## Consequences

- We have one simple deployment artifact, one lockfile, and clear test boundaries.
- Each connector must declare its capabilities; a command must not call a provider when the required capability is absent.
- A future service split requires a new ADR, a data/observability/deployment plan, and evidence that the monolith is the actual bottleneck.

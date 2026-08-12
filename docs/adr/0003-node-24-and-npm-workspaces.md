# ADR-0003: Node.js 24.18.1 LTS and npm workspaces

**Date:** 2026-08-12
**Status:** accepted

## Context

The project has an API and internal packages, but the Phase 0–1a alpha does not need a complex monorepo orchestrator. It needs one long-term-supported runtime and reproducible dependency management for developer machines, CI, and containers.

## Decision

Pin the CI and container runtime to **Node.js `24.18.1` LTS**, use the npm bundled with Node, and use npm workspaces at the repository root. CI uses `npm ci`; Docker uses `node:24.18.1-alpine`; direct dependencies use exact versions, and the lockfile freezes the dependency tree.

The `engines` field in `package.json` states the source code's minimum compatibility range. It does not replace the exact `24.18.1` pin in CI and containers.

## Options considered

### Multiple runtimes or an unpinned `node` in CI

- Benefit: fewer configuration updates when versions change.
- Cost: non-reproducible results and the possibility of an incompatible version or one that differs from production.
- Rejected: stability matters more than convenience.

### pnpm/Turborepo/Nx from the start

- Benefit: additional monorepo tooling and optimizations.
- Cost: adds tools and cache policies when npm workspaces plus one `package-lock.json` meet the current need.
- Rejected: revisit when package count or CI speed demonstrates the need.

## Consequences

- Contributors need Node `24.18.1` to match CI.
- A runtime upgrade is deliberate work: check the Node support schedule, dependency compatibility, Docker image, and CI, then record the appropriate ADR/PR.
- Do not use the Docker `latest` tag or install dependencies outside the lockfile in CI.

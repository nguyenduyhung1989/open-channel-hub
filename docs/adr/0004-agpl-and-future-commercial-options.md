# ADR-0004: AGPL-3.0-or-later and future commercial options

**Date:** 2026-08-12
**Status:** accepted

## Context

The project is a self-hosted messaging hub. A party can modify the code and operate it as a network service without distributing a binary, which means a conventional copyleft license may not trigger a source-availability obligation for service users.

The goal is to keep network-service improvements available to return to the community, while not pretending that a license can replace technical quality, security, or a business model.

## Decision

Release the source code under `AGPL-3.0-or-later`.

Under section 13, when a party modifies the program and lets others interact with that modified version over a network, the modified version must offer remote users an opportunity to receive the corresponding source for the version being run. This applies to the **modified version**; read the full license to assess particular combination and distribution situations.

The runtime exposes an unauthenticated `GET /source` endpoint and a `Link: <SOURCE_OFFER_URL>; rel="source"` header on every response. In production, `SOURCE_OFFER_URL` is required and must be an HTTPS URL without userinfo, query, or fragment. Operators of forks or modified SaaS deployments must point it to public, unauthenticated corresponding source for the exact version running; the upstream URL is not a placeholder for modified code. This is an implementation aid, not legal advice.

The project does not promise a commercial license, SaaS exception, or dual license at this time. Contributions follow an inbound-equals-outbound policy: contributors retain copyright while permitting their contributions to be distributed under `AGPL-3.0-or-later`.

## Options considered

### Apache-2.0

- Benefit: easy to use for libraries and ecosystems, with a clear patent clause.
- Cost: a SaaS operator can modify the project and keep the changes private.
- Rejected: does not match the goal of sharing network-service improvements.

### Dual licensing from the start

- Benefit: provides a clearer path for selling commercial exceptions.
- Cost: requires sufficient relicensing rights for every contribution; there is currently no CLA or copyright-assignment agreement to ensure that.
- Rejected for now: do not promise a right the project does not have.

## Consequences

- The README and release artifacts must name AGPL accurately rather than using an ambiguous “open source” label.
- Before proposing a commercial or dual license, maintainers need to assess the copyright model, contribution policy, appropriate legal advice, and a new ADR.
- Hosting, support, consulting, integration, and other commercialization can still exist; that business decision does not itself change AGPL obligations.

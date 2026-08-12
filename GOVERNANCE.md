# Project Governance

## Current phase

Open Channel Hub is in Phase 0–1a / alpha and is currently coordinated by one maintainer. The official `Telegram Bot` HTTP transport, startup wiring, and offline tests exist; no live credential, network, webhook, or production verification has occurred. That does not make decisions private: material changes need an issue or pull request, technical reasoning, and a public ADR when appropriate. See the [Phase 0–1a threat model](docs/security/threat-model.md) and [Phase 1a Telegram Bot operating boundary](docs/operations/telegram-bot-1a.md).

## Roles

- **Maintainer:** stewards product direction, reviews changes, handles security incidents, cuts releases, and protects project boundaries.
- **Contributor:** submits issues, documentation, tests, or pull requests under [CONTRIBUTING.md](CONTRIBUTING.md).
- **Reviewer:** assesses correctness, scope, verification, security, and documentation accuracy; review does not grant repository write access.

## Decision making

1. Small changes are discussed in an issue or pull request; the maintainer decides from the evidence and scope.
2. A decision affecting architecture, licensing, data, an authorization model, or connector strategy requires an ADR before or alongside the change.
3. For an urgent vulnerability, the maintainer may patch privately first to reduce harm, then publish the rationale and change when it is safe.

Official integrations, data protection, and small working slices take priority. More platforms do not outweigh a weak boundary or an untested promise.

## Releases

A version is released only after its changes have suitable tests, green CI, current status documentation, and no secret or real data in the change. `main` must remain verifiable; green CI alone does not mean the project is production-ready.

## Changing this policy

Material governance changes are proposed through a pull request, discussed publicly for at least seven days when not urgent, then decided and recorded by the maintainer.

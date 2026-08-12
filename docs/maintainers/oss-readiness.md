# Open-source readiness

This is an honest operating checklist, not a claim that a program or
organization has accepted the project.

## Present

- A public repository under [AGPL-3.0-or-later](../../LICENSE), instructions
  that run without secrets, and a clearly stated alpha status.
- Contribution guidance, code of conduct, support, governance, security policy,
  roadmap, changelog, ADRs, and phase checkpoints.
- CI files with a pinned runtime and formatting, lint, type, test, and build
  checks; CodeQL, Dependabot, and dependency review.
- A small verifiable slice rather than a claim to support every platform.
- Historical Phase 1a evidence: local candidate checks and GitHub CI/CodeQL at
  <code>7141949</code>. Live Telegram verification remains outstanding.
- Phase 2a source now contains a dedicated PostgreSQL schema, migration ledger,
  non-superuser role, canonical inbound-event storage, and a synthetic Docker
  proof of migration/idempotency. Final local candidate verification passed;
  fresh GitHub checks, live Telegram proof, and production operation remain
  unclaimed.

## Verified GitHub evidence

- GitHub CI and CodeQL succeeded at commit <code>8b80c3b</code>. This evidence
  applies only to that commit and does not replace verification of a later
  release commit or tag.
- GitHub CI and CodeQL succeeded for the Phase 1a candidate at
  <code>7141949</code>. A later release tag still needs its own owner decision
  and verification.
- GitHub Private Vulnerability Reporting, secret scanning, Dependabot alerts,
  and automatic security fixes are enabled.
- Branch protection is intentionally open for an owner decision. Do not
  describe it as an existing safeguard or change it during documentation work.

## Must be maintained through real work

- Keep <code>main</code> green; address dependency and CodeQL alerts; update
  the runtime and Actions through verified stable releases.
- Keep the final local evidence with the candidate and read fresh GitHub checks
  for the actual Phase 2a commit before making release claims.
- Maintain migrations as immutable, forward-only repository artifacts. Never
  manually alter a deployed database and then describe it as a repository
  migration.
- Treat canonical message text and identifiers as sensitive data. Build and
  test backup/restore, retention/deletion, secret rotation, access controls,
  and operational observability before operating real customer data.
- Keep examples, fixtures, screenshots, logs, and public discussions free of
  user data and secrets.
- Respond to issues and pull requests, record material decisions, and create
  release tags and changelog entries only when an actual release occurs.
- The owner decides the branch-protection scope before expanding write access
  or collaboration scale. After that decision, document required checks and
  any administrative exceptions.
- Maintain Private Vulnerability Reporting, secret scanning, Dependabot
  alerts, and automatic security fixes; recheck them after permission or
  GitHub-configuration changes.
- State which maintainers have write access and who is accountable for security
  reports.

## If applying to Codex for Open Source later

Apply with accurate information only: repository links, maintainer role,
maintenance history, users or community when they exist, and how Codex is
actually used for review, maintenance automation, or releases. Do not create
fake issues, pull requests, or metrics to make an application look stronger.

Read the current
[Codex for Open Source](https://developers.openai.com/community/codex-for-oss)
conditions and
[program terms](https://learn.chatgpt.com/docs/codex-for-oss-terms) immediately
before applying. The program and its benefits can change, and selection is not
guaranteed.

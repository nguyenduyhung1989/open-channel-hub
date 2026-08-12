# Open-source readiness

This is an honest operating checklist, not a claim that a program or organization has accepted the project.

## Present

- A public repository under [AGPL-3.0-or-later](../../LICENSE), instructions that run without secrets, and a clearly stated alpha status.
- Contribution guidance, code of conduct, support, governance, security policy, roadmap, changelog, and ADRs.
- CI files with a pinned runtime and formatting, lint, type, test, and build checks; CodeQL, Dependabot, and dependency review.
- A small verifiable slice instead of a claim to support every platform.
- The Phase 1a candidate has an HTTP gateway and startup wiring, and has passed final local evidence: `npm run check` (seven test files, fifty tests, and build), `npm audit --audit-level=low` with zero vulnerabilities, `docker compose config --quiet`, non-root/read-only runtime checks, and independent audit. Live Telegram verification and GitHub CI/CodeQL evidence for this candidate remain outstanding.

## Verified GitHub evidence

- GitHub CI and CodeQL succeeded at commit `8b80c3b`. This evidence applies only to that commit and does not replace verification of a later release commit or tag.
- GitHub Private Vulnerability Reporting, secret scanning, Dependabot alerts, and automatic security fixes are enabled.
- Branch protection is intentionally open for an owner decision. Do not describe it as an existing safeguard or change it during documentation work.

## Must be maintained through real work

- Keep `main` green; address dependency and CodeQL alerts; update the runtime and Actions through verified stable releases.
- Respond to issues and pull requests, record material decisions, and create release tags and changelog entries only when an actual release occurs.
- Keep examples, fixtures, and screenshots free of user data and secrets.
- The owner decides the branch-protection scope before expanding write access or collaboration scale. After that decision, document required checks and any administrative exceptions.
- Maintain Private Vulnerability Reporting, secret scanning, Dependabot alerts, and automatic security fixes; recheck them after permission or GitHub-configuration changes.
- State which maintainers have write access and who is accountable for security reports.

## If applying to Codex for Open Source later

Apply with accurate information only: repository links, maintainer role, maintenance history, users or community when they exist, and how Codex is actually used for review, maintenance automation, or releases. Do not create fake issues, pull requests, or metrics to make an application look stronger.

Read the current [Codex for Open Source](https://developers.openai.com/community/codex-for-oss) conditions and [program terms](https://learn.chatgpt.com/docs/codex-for-oss-terms) immediately before applying. The program and its benefits can change, and selection is not guaranteed.

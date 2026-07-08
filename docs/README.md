# skfiy Docs

This directory keeps current operator instructions separate from git-history
context. When a workflow changes, update the canonical document first. Dated
decision records are ADR references, not active implementation plans, task
queues, or progress trackers. Historical research and implementation notes
should be folded into canonical docs or left in git history, not kept as live
repo checklists. Date-stamped Markdown under this directory is reserved for
durable decision records and the single active plan.

## Canonical Docs

- `../README.md`: product positioning, current local evidence, smoke command
  overview, and dogfood command examples.
- `development-workflow.md`: mandatory testing contract for product-path
  validation through `dist/skfiy.app` and packaged smoke gates.
- `internal-alpha-build.md`: unsigned alpha packaging, release evidence,
  dogfood tester flow, and cohort verification.
- `chrome-extension-setup.md`: Chrome unpacked extension setup, Native
  Messaging host install/status checks, and troubleshooting.
- `product-readiness-matrix.md`: supervisor-facing product boundary,
  workstream ownership, real-scenario acceptance, and QA/SRE gate.
- `release-evidence/latest-alpha.json`: latest published alpha pointer used by
  dashboard and dogfood readiness checks.
- `superpowers/plans/2026-07-07-code-health-cleanup.md`: the single
  active implementation plan for current feature enrichment, starting with
  React Dashboard operator controls and evidence entry points.

## Reference Docs

- `decisions/`: durable ADR records that should stay stable unless the
  decision changes. They must not carry active plan sections, status blocks,
  task checklists, or next-work queues.
- `superpowers/plans/`: the current active implementation plan for agentic
  work. Keep exactly one plan file here. Retired dated plans belong in git
  history only, not repo docs, and must not be restored.

## Local Artifact Hygiene

Generated directories such as `.skfiy-smoke/`, `.skfiy-alpha/`,
`.skfiy-cli-smoke/`, `.skfiy-dogfood/`, `dist/`, and `macos-helper/.build/`
are ignored by git. Preserve current smoke/release evidence while an issue,
release, or dogfood run is active. Old alpha packages, stale local smoke copies,
dogfood downloads for superseded commits, `.DS_Store`, and helper build caches
can be deleted locally once they are no longer referenced by
`release-evidence/latest-alpha.json` or an active handoff.

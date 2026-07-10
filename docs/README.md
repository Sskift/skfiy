# skfiy Docs

This directory keeps current operator instructions separate from git-history
context. When a workflow changes, update the canonical document first.
Historical research, decision notes, and implementation notes should be folded
into canonical docs or left in git history, not kept as live repo checklists.
Date-stamped Markdown under this directory is reserved for the single active
plan. Older dated implementation plans, handoffs, checklists, decision notes,
and research notes belong in git history only.

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
- `superpowers/plans/2026-07-11-product-roadmap.md`: the single active product
  implementation plan for the pet, Background Agent, Computer Use, Browser
  Context, Dashboard, automations, adapters, and trusted distribution.

## Reference Docs

- `superpowers/plans/`: the current active implementation plan for agentic
  work. Keep exactly one plan file here. Delete retired dated plans from the
  live tree instead of archiving, parking, or renaming them. Historical planning
  material belongs in git history only, with no handoff, checklist, script,
  test, or workflow reference in the live repo tree.

## Local Artifact Hygiene

Generated directories such as `.skfiy-smoke/`, `.skfiy-alpha/`,
`.skfiy-cli-smoke/`, `.skfiy-dogfood/`, `dist/`, and `macos-helper/.build/`
are ignored by git. Preserve current smoke/release evidence while an issue,
release, or dogfood run is active. Old alpha packages, stale local smoke copies,
dogfood downloads for superseded commits, `.DS_Store`, and helper build caches
can be deleted locally once they are no longer referenced by an active
release/dogfood run. Temporary audit notes and stale cleanup outputs should not
be promoted into docs; fold durable decisions into canonical docs or leave the
history in git.

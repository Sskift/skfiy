# skfiy Docs

This directory separates current operator instructions from historical research.
When a workflow changes, update the canonical document first and leave old
research notes as dated context unless they contain a still-open product gap.

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
- `superpowers/plans/2026-06-23-pet-agent-browser-dashboard.md`: the single
  active implementation plan for Pet usability, Background Agent provider
  selection, Chrome browser context, Dashboard visibility, and validation.

## Reference Docs

- `decisions/`: durable decision records that should stay stable unless the
  decision changes.
- `research/`: dated research, architecture notes, and implementation logs.
  Most files are archival, not active task lists. The dated long plan above is
  the one exception while these workstreams are still open.
- `superpowers/plans/`: active implementation plans for agentic work. Keep
  exactly one active plan unless the project owner explicitly asks for a
  temporary split.
- Temporary specs and design notes should be folded into the active plan or a
  canonical doc once implemented. Do not keep a parallel
  `superpowers/specs/` task source that can drift from the single active plan.
- Short research notes that only restate a code-level API contract should be
  folded into canonical docs and tests, then removed. The Dashboard
  `/api/evidence-summary` contract now lives in
  `product-readiness-matrix.md` and `src/main/dashboard-evidence-summary.test.ts`.

## Local Artifact Hygiene

Generated directories such as `.skfiy-smoke/`, `.skfiy-alpha/`,
`.skfiy-cli-smoke/`, `.skfiy-dogfood/`, `dist/`, and `macos-helper/.build/`
are ignored by git. Preserve current smoke/release evidence while an issue,
release, or dogfood run is active. Old alpha packages, stale local smoke copies,
dogfood downloads for superseded commits, `.DS_Store`, and helper build caches
can be deleted locally once they are no longer referenced by
`release-evidence/latest-alpha.json` or an active handoff.

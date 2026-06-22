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
- `research/2026-06-22-agent-computer-use-long-plan.md`: the single active
  long-range implementation plan for dashboard, Agent provider, Computer Use,
  Chromium extension, binary/CLI, release, and money-run dogfood work.

## Reference Docs

- `decisions/`: durable decision records that should stay stable unless the
  decision changes.
- `research/`: dated research, architecture notes, and implementation logs.
  Most files are archival, not active task lists. The dated long plan above is
  the one exception while these workstreams are still open.
- `superpowers/plans/`: optional executable implementation plans for active
  agentic work. Delete or fold them back into the canonical long plan once that
  slice lands, so stale task handoffs do not compete with current direction.

## Local Artifact Hygiene

Generated directories such as `.skfiy-smoke/`, `.skfiy-alpha/`,
`.skfiy-cli-smoke/`, `.skfiy-dogfood/`, `dist/`, and `macos-helper/.build/`
are ignored by git. Preserve current smoke/release evidence while an issue,
release, or dogfood run is active. Old alpha packages, stale local smoke copies,
dogfood downloads for superseded commits, `.DS_Store`, and helper build caches
can be deleted locally once they are no longer referenced by
`release-evidence/latest-alpha.json` or an active handoff.

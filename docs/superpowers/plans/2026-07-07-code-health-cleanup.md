# skfiy Long-Term Product and Code Health Plan

> This is the repository's single active plan. It is a durable execution
> roadmap, not a historical log. Completed implementation details belong in
> git history and canonical product docs. Update this file when priorities,
> constraints, phase status, or exit criteria change; do not create parallel
> plans, handoff notes, cleanup checklists, or plan archives.

## Mission

Keep skfiy small enough to reason about while it grows into a dependable,
local-first macOS Computer Use runtime.

The product must continue to provide:

- a pixel desktop pet as the primary interaction surface,
- a selectable Background Agent for chat and reasoning,
- permissioned Computer Use owned by skfiy rather than the provider CLI,
- bounded Browser Context through the Chrome extension pageControl bridge,
- a local Dashboard for operator state and safe controls,
- a packaged CLI and MCP surface for automation and supervision,
- durable route outcomes, replay, memory, and release readiness without
  leaking provider secrets or local sensitive content.

Code health is not a separate rewrite program. Each cut must reduce ownership
ambiguity, duplicated tests, or operational risk while preserving current
product behavior.

## Current Baseline

The baseline is measured from the current active-plan head and should be
refreshed only when a phase closes or the architecture materially changes.

| Area | Current baseline | Long-term direction |
| --- | ---: | --- |
| Test files | 166 | Fewer broad integration fixtures; more focused owned tests |
| Test lines | about 76,000 | Below 65,000 without losing critical safety branches |
| Production files under `src/`, `scripts/`, and `chrome-extension/` | 201 | Ownership matters more than file count |
| Production lines in those paths | about 94,000 | Reduce duplication; do not chase an arbitrary total |
| Test files using source-string assertions | 74 | Below 45, limited to packaging or wiring contracts that cannot be imported |
| Largest test file | `cli-command-surface.test.ts`, about 5,950 lines | No test file above 4,000 lines |
| Chrome background test | about 2,250 lines, 35 behavior paths | Keep independent safety paths; continue fixture and mirror-assertion reduction |
| `src/main/main.ts` | about 1,250 lines | Electron lifecycle and IPC wiring only |
| `src/renderer/App.tsx` | about 875 lines | UI orchestration only; pure decisions remain outside React |
| Full Vitest run | about 45 seconds locally | Keep below 60 seconds on the same class of machine |

These are guardrails, not scorecards. A change that reduces line count while
adding indirection, hiding behavior, weakening a safety boundary, or merely
moving duplication does not advance the plan.

## Non-Negotiable Product Boundaries

- `Background Agent` means the selected chat and reasoning provider, such as
  Local, Codex, Claude Code, or Hermes.
- `Computer Use` is skfiy's permissioned desktop and app-control tool layer.
- `Computer Use Planner` is configured separately from the Background Agent.
- `Browser Context` comes only from the bounded Chrome extension pageControl
  bridge. It never replaces macOS Accessibility or Screen Recording.
- Background Agent CLI providers remain non-interactive and must not mutate
  the local machine directly from pet chat.
- Chrome host permissions must not broaden silently.
- Screen Recording, Accessibility, and Finder Automation requirements must not
  be bypassed or represented as granted when unknown.
- Unsupported generic visible-app requests must continue to clarify rather
  than fall through to shared primitive execution.
- Provider secrets, tokens, raw page text, private paths, and unbounded local
  state must stay out of Dashboard, CLI, logs, tests, and smoke summaries.
- Default smoke runs must not persist evidence or artifacts. Output paths are
  reserved for explicit release, dogfood, or debugging work.
- Product-facing UI behavior is stable during code-health-only cuts.

## Planning Model

This plan is executed as a sequence of small, reviewable cuts.

1. Start from a clean `codex/<short-scope>` branch based on `origin/main`.
2. Read this plan and run the plan hygiene guard.
3. Select one cut from the current phase.
4. Establish the focused behavior that must remain protected.
5. Remove duplication or extract one ownership boundary.
6. Run focused verification before committing.
7. Run the full readiness gate from the committed state.
8. Fast-forward and push only after all required checks pass.

Do not accumulate a chronological completion diary in this file. Phase status,
remaining scope, metrics, decisions, and changed constraints are durable;
individual commit summaries are not.

## Phase Overview

| Phase | Status | Exit outcome |
| --- | --- | --- |
| 0. Plan and repository hygiene | Complete, continuously enforced | One active plan and no stale plan-like artifacts |
| 1. Test portfolio reduction | In progress | Smaller, behavior-focused suite with no critical coverage loss |
| 2. Runtime ownership boundaries | In progress | Main and renderer shells primarily coordinate owned modules |
| 3. Route and outcome semantics | In progress | One durable outcome vocabulary across every surface |
| 4. Dashboard operator surface | In progress | Safe local APIs represented consistently in React Dashboard |
| 5. Smoke, dogfood, and release simplification | Queued | Quiet defaults, explicit release proof, less script duplication |
| 6. Sustainable maintenance | Queued | Automated budgets and review rules prevent regrowth |

Phases may overlap when a narrow product change naturally exercises more than
one area, but each commit still owns one primary objective.

## Phase 0: Plan and Repository Hygiene

Status: complete as a cleanup task; enforced before every implementation cut.

### Rules

- `docs/superpowers/plans/` contains exactly this active plan unless it is
  replaced by exactly one newer active plan.
- Historical plans, research notes, handoff logs, backlogs, and cleanup
  checklists stay in git history rather than the live tree.
- No archive, parking, reference, or retired-plan directory may be used to keep
  superseded planning material in the repository.
- Root documentation, scripts, tests, package metadata, and `AGENTS.md` must
  not reference inactive plan paths.
- Temporary audit output, smoke scratch, local evidence, and release debugging
  notes remain ignored or are deleted after use.

### Guard

```bash
npx vitest run src/main/plan-doc-status.test.ts --reporter=dot
```

If this guard passes, move to current product work. Do not spend a cut on plan
archaeology.

## Phase 1: Test Portfolio Reduction

Status: in progress and the immediate priority.

### Objective

Reduce maintenance cost while retaining the tests that protect product safety,
external contracts, state transitions, redaction, failure recovery, and real
user workflows.

### Keep

- permission denial and unknown-permission behavior,
- app-policy and host-policy denial,
- user denial, confirmation, cancellation, failure, completion, and stop-turn
  behavior,
- redaction and bounded-data guarantees,
- Chrome site-access, content-script, screenshot, and native-host boundaries,
- mutation approval and unsupported-route boundaries,
- timer, retry, dedupe, stale-event, and recovery branches,
- provider isolation and no-direct-desktop-control guarantees,
- packaged CLI, preload, and local API contracts that cross process boundaries,
- one representative product-path smoke for each supported surface.

### Collapse or Delete

- repeated fixtures that differ only in labels, timestamps, or irrelevant
  complete objects,
- assertions for every mirrored field when a test has one narrower purpose,
- repeated happy-path coverage at unit, wiring, script, and smoke layers when
  the entry point and behavior are already protected,
- source-string assertions that only confirm an import, export, identifier, or
  implementation spelling,
- static mock payloads that duplicate a canonical builder without testing a
  branch,
- obsolete evidence and artifact shape tests from default smoke behavior,
- tests for removed compatibility layers or commands that no longer exist,
- broad snapshots or exhaustive object equality where a stable behavioral
  matcher is sufficient.

### Replace

- replace source reads with imported behavior where module boundaries permit,
- replace repeated inline payloads with a shared local builder only when the
  builder makes the behavioral delta obvious,
- replace real sleeps with fake timers or condition-based waits where timing is
  not itself the contract,
- replace duplicated wiring tests with one process-boundary contract and
  focused tests in the owning module,
- replace broad React setup with pure view-model tests for non-visual decisions.

### Work Order

1. Slim `src/main/cli-command-surface.test.ts`.
   - Treat `src/main/cli-command-surface.ts` as an export-only surface.
   - Remove tests that validate implementation placement or repeat owned CLI
     runner/status module behavior.
   - Consolidate command fixture construction by command family.
   - Preserve packaged command metadata, mutation flags, typed blockers,
     redaction, and operator readiness contracts.
2. Slim Dashboard test fixtures.
   - Start with `dashboard-server.test.ts`, `dashboard-data.test.ts`,
     `dashboard/model.test.ts`, and `DashboardApp.test.tsx`.
   - Remove repeated full snapshots and mirrored server/model/UI assertions.
   - Keep local API authorization, secret redaction, operator actions, and
     observable UI behavior.
3. Slim dogfood and release tests.
   - Consolidate cohort, verifier, and status fixture families.
   - Remove default-path artifact assertions that conflict with quiet smoke.
   - Keep release identity, stale-build, gate, and typed-blocker behavior.
4. Continue Chrome test cleanup.
   - Keep the 35 independent background behavior paths unless branch analysis
     proves overlap.
   - Reduce popup and content-script fixture duplication.
   - Keep host permission, sensitive-page, native bridge, action, screenshot,
     stale wake, dedupe, and recovery paths.
5. Audit the remaining source-string test files by ownership group.
   - Packaging and generated-file contracts may retain source reads.
   - Product logic and module wiring should normally be exercised by imports or
     observable behavior.

### Exit Criteria

- Total test lines are below 65,000 or every remaining large suite has a
  documented ownership reason in this plan.
- No test file exceeds 4,000 lines.
- Source-string test files are below 45.
- Full Vitest remains below 60 seconds on the baseline development machine.
- Critical behavior from the Keep list remains covered.
- React tests no longer emit avoidable `act(...)` warnings from owned test
  setup; any remaining warning has a named follow-up in the current phase.
- No production behavior changes are bundled into a test-only cleanup commit.

## Phase 2: Runtime Ownership Boundaries

Status: in progress after the immediate test cuts.

### Main Process

`src/main/main.ts` should own Electron lifecycle, BrowserWindow creation, IPC
registration, runtime composition, and OS side-effect entry points. Continue
extracting deterministic logic when it can be tested without Electron.

Preferred extractions include:

- request/response normalization,
- route-to-task-event assembly,
- permission and readiness decisions,
- smoke-only deterministic turn construction,
- startup decision tables,
- window-independent state derivation.

Do not create a generic `utils` module. Each helper must have one domain owner
and a narrow contract. Side effects stay in `main.ts` or an explicitly owned
runtime module.

### Pet Renderer

`src/renderer/App.tsx` should own React composition, event binding, and visible
interaction state. Pure display decisions and state aggregation belong in
owned view-model modules.

- Keep pet click, drag, panel, settings, approval, and task behavior unchanged.
- Move only deterministic decisions that can be expressed without DOM or
  Electron APIs.
- Split `app-view-model.ts` by domain when extraction would otherwise turn it
  into a second monolith.
- Prefer pure tests over adding more broad `App.test.tsx` setup.

### Dashboard

The largest production files are currently Dashboard model, data, server, and
React surface modules. Reduce them by domain ownership rather than component
count.

- `dashboard-data.ts` owns snapshot assembly orchestration, not every domain
  normalizer.
- `dashboard-server.ts` owns loopback lifecycle and request routing, not large
  fallback templates or every handler implementation.
- `dashboard/model.ts` owns presentation derivation, with domain-specific
  helpers extracted when independently meaningful.
- `DashboardApp.tsx` owns screen composition and interaction, with dense,
  operator-oriented UI behavior preserved.
- Do not introduce new endpoints solely to make a refactor convenient.

### Chrome Extension

`chrome-extension/background.js` remains the service-worker entry point. Pure
policy, readiness, tab classification, and result-normalization logic may move
to extension-owned modules only when Chrome packaging and runtime loading stay
simple and covered.

### Exit Criteria

- `main.ts` contains no substantial deterministic fixture or response assembly.
- `App.tsx` contains no duplicated pure state derivation already represented in
  a view model.
- Each Dashboard hotspot has a clear orchestration role and no repeated domain
  normalizers.
- New modules remove real complexity; no extraction is merely a line-count
  transfer.
- Preload remains narrow and typed.

## Phase 3: Route and Outcome Semantics

Status: in progress alongside product work.

### Canonical Outcomes

Preserve distinct meanings for:

- `app_policy_denied`,
- `user_denied`,
- `blocked`,
- `confirmation_required`,
- `failed`,
- `cancelled`,
- `completed`,
- `stopTurnBehavior` and `Task stopped`.

The exact transport representation may differ by boundary, but conversions must
be explicit and lossless across:

- task routing,
- assistant tool calls,
- current-turn state,
- replay events,
- preload and pet renderer state,
- Dashboard snapshot and model,
- CLI status, doctor, and operator status,
- smoke and release summaries.

### Work

- Centralize pure outcome normalization in an owned shared module.
- Delete local ad hoc mappings after each consumer migrates.
- Add table-driven tests at conversion boundaries rather than repeating full
  snapshots in every surface.
- Keep unsupported visible-app requests as clarification outcomes.
- Add new adapters only with an explicit route, safety model, typed status, and
  real product-path smoke.

### Exit Criteria

- Every canonical outcome has a documented conversion path.
- No surface collapses denial, cancellation, blocking, and failure into a
  generic error.
- Stop requests remain visible in replay and operator state.
- Route semantics tests are table-driven and shared where appropriate.

## Phase 4: Dashboard Operator Surface

Status: in progress, bounded to existing safe local APIs.

### Direction

- Continue migrating useful fallback/server-only controls into React when a
  typed local API already exists.
- Keep the existing read-only `/api/operator-evidence` contract bounded and
  token-free.
- Keep the Dashboard dense, quiet, and operator-oriented rather than
  marketing-oriented.
- Preserve read-only operator state, current turn, replay, Browser Context,
  provider readiness, Computer Use readiness, memory, sessions, prompt stack,
  automation monitors, dogfood, and release state.
- Keep provider settings and Computer Use Planner settings visibly separate.
- Redact secrets before data reaches both fallback and React surfaces.

### Constraints

- No new permission scopes for Dashboard convenience.
- No remote bind or non-loopback control path.
- No raw secret, token, full prompt, private path, or unbounded page-content
  field.
- No API endpoint without an owning main-process module and focused contract
  tests.
- No duplicated full-snapshot assertions across server, model, and UI when each
  layer can assert its own transformation.

### Exit Criteria

- Every supported safe local control is represented consistently or explicitly
  left server-only for a documented safety reason.
- React and fallback paths use the same typed API semantics.
- Dashboard tests are organized by API, model, and visible behavior rather than
  repeated complete fixtures.
- Secret-redaction tests cover all provider and planner settings boundaries.

## Phase 5: Smoke, Dogfood, and Release Simplification

Status: queued after the largest test-fixture cuts.

### Direction

- Default smoke commands remain quiet and artifact-free.
- Explicit output paths remain available for release, dogfood, or debugging.
- Typed blockers are stable across CLI, Dashboard, Chrome, desktop session, and
  release readiness.
- Product-path scripts share bounded parsers and fixture builders rather than
  copying full evidence documents.
- Release identity and stale-build checks remain strict.

### Expected Typed Blockers

- `screen-recording-missing`
- `accessibility-missing`
- `finder-automation-unknown`
- `desktop-session-blocked`
- `desktop-session-loginwindow`
- `desktop-display-asleep`
- `chrome-native-host-missing`
- `chrome-extension-not-connected`
- `release-artifact-older-than-head`

### Exit Criteria

- Basic smoke writes no artifact unless `--output` is explicit.
- Script tests do not preserve obsolete default evidence paths.
- Shared readiness concepts use shared pure helpers.
- Release and dogfood suites retain stale-build, identity, cohort, and blocker
  coverage with materially smaller fixtures.

## Phase 6: Sustainable Maintenance

Status: queued.

After the current hotspots are reduced, add lightweight protections against
regrowth.

- Add a report-only test-health command that prints file and line hotspots
  without generating repository artifacts.
- Establish review thresholds for new test files above 1,500 lines and new
  production files above 1,200 lines. Thresholds require ownership review; they
  are not automatic failures for justified modules.
- Reject new source-string tests when imported behavior is available.
- Keep one focused test per bug regression and remove temporary broad coverage
  once the owned contract exists.
- Review the baseline at phase boundaries, not after every commit.
- Keep full-suite duration visible and investigate sustained regression above
  the 60-second baseline budget.

## Verification Matrix

### Before Every Cut

```bash
npx vitest run src/main/plan-doc-status.test.ts --reporter=dot
```

### Test Portfolio and Code-Health Cuts

```bash
npx vitest run \
  src/main/cli-command-surface.test.ts \
  src/main/chrome-extension-background.test.js \
  src/main/screenshot-path.test.ts \
  src/main/main-permission-diagnostics.test.ts \
  src/renderer/App.test.tsx \
  src/renderer/app-view-model.test.ts \
  --reporter=dot
npm run typecheck -- --pretty false
```

Use a narrower subset during iteration, then run this group before committing a
Phase 1 or Phase 2 cut.

### Route Semantics

```bash
npx vitest run \
  src/main/task-routing.test.ts \
  src/main/assistant-agent.test.ts \
  src/main/assistant-tools-main-wiring.test.ts \
  src/main/task-status-contract.test.ts \
  src/renderer/App.test.tsx \
  --reporter=dot
npm run typecheck -- --pretty false
```

### Dashboard

```bash
npx vitest run \
  src/main/dashboard-data.test.ts \
  src/main/dashboard-server.test.ts \
  src/main/dashboard-status.test.ts \
  src/dashboard/model.test.ts \
  src/dashboard/DashboardApp.test.tsx \
  --reporter=dot
npm run typecheck -- --pretty false
```

### Full Readiness Gate

Run after each focused commit:

```bash
git diff --check
npm run typecheck -- --pretty false
env -u TMUX npx vitest run --reporter=dot
npm run build
env -u TMUX npm run smoke:cli:basic -- --require-passed
```

`npm run build` must produce:

- `dist/skfiy.app`
- `dist/skfiy`
- `dist/skfiy-helper`

For UI, Dashboard, Chrome, or macOS behavior changes, run the matching product
smoke as well. Do not add `--output` unless the task explicitly requires
release, dogfood, or debugging evidence.

## Definition of Done for Each Cut

A cut is complete only when:

- it has one primary ownership objective,
- the diff contains no unrelated refactor or generated artifact,
- focused tests protect the retained behavior,
- deleted tests are demonstrably duplicated, obsolete, or implementation-only,
- new helpers reduce complexity rather than move it,
- product language and safety boundaries remain correct,
- the full readiness gate passes from the committed state,
- default smoke reports either `passed` or an exact typed blocker,
- temporary smoke, build, and audit files are removed,
- the commit is focused and pushed only after verification.

## Non-Goals

- Rewriting Electron, React, the Dashboard, or the Chrome extension wholesale.
- Replacing working local APIs solely for architectural symmetry.
- Increasing Chrome host permissions.
- Adding a generic visible-app fallback without an adapter contract.
- Treating Computer Use as a competing chat provider.
- Making provider CLIs directly mutate the desktop.
- Chasing test coverage percentage or line count at the expense of behavior.
- Splitting files without reducing duplication or clarifying ownership.
- Adding snapshots, evidence bundles, or artifact directories as a substitute
  for focused assertions.
- Restoring historical plans or creating secondary roadmap documents.

## Residual Risks

- macOS privacy state can block product-path smoke through Screen Recording,
  Accessibility, Finder Automation, a locked login session, or display sleep.
- Branded Chrome can restrict automated unpacked-extension loading; automated
  proof may require Chromium or Chrome for Testing while branded Chrome remains
  a manual validation path.
- Large Dashboard and dogfood fixtures can regrow if new fields are asserted at
  every layer instead of their owner.
- Source-string wiring tests can mask missing runtime behavior while appearing
  cheap to maintain.
- Pure extraction from Electron or Chrome code can accidentally hide lifecycle
  ordering; keep side effects visible and verify process-boundary behavior.
- Aggressive test deletion can erase rare failure coverage. Delete by behavior
  inventory, not by file size alone.

## Immediate Next Cuts

Execute in this order unless a product blocker changes priority:

1. Audit and slim `src/main/cli-command-surface.test.ts` by command family,
   removing export-placement and duplicated owned-module assertions first.
2. Remove repeated Dashboard snapshot builders across server, data, model, and
   React tests without weakening API authorization or redaction coverage.
3. Reduce dogfood status/verifier/cohort fixtures and obsolete default artifact
   assertions.
4. Audit source-string tests in main-process wiring and smoke script suites.
5. Resume pure extraction from `src/main/main.ts`, then renderer view-model
   cleanup, without changing UI behavior.

When these cuts close Phase 1, refresh the baseline table, mark Phase 1
complete, and promote the highest-value Phase 2 ownership boundary to the
immediate work list.

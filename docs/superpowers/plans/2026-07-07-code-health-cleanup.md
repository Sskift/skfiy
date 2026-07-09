# skfiy Active Code Health Plan

> **For agentic workers:** This is the only active implementation plan as of 2026-07-09. `docs/superpowers/plans/` must contain exactly one active plan file. Retired dated implementation plans, research notes, handoff logs, and cleanup checklists must stay out of repo docs; use git history or canonical docs instead.

## Current State

- skfiy is an agent-first local-first macOS Computer Use runtime with a pixel desktop pet, packaged CLI, local Dashboard, Chrome extension bridge, and focused app adapters.
- Computer Use is a permissioned tool capability requested by the selected Background Agent. It is not a competing chat mode and must stay inside skfiy approval, policy, replay, Screen Recording, Accessibility, Finder Automation, and browser-permission gates.
- Background Agent provider selection remains separate from Computer Use Planner selection.
- Browser Context enters provider prompts only through the explicit Chrome extension pageControl bridge and bounded prompt blocks.
- Dashboard remains the operator surface for provider readiness, Browser Context, Computer Use state, current turn, replay, memory, sessions, prompt stack, dogfood/release state, and read-only operator evidence.
- Live docs are on the one-active-plan model. Historical implementation material is not a live repo artifact and must not return as archived plans, parking docs, handoff notes, cleanup checklists, or dated research notes.
- Plan/doc hygiene is currently clean: the repo keeps one active plan file, no retired dated implementation Markdown, no stale handoff/checklist Markdown, and no stale workflow references to old plan paths.
- The current code-health pass has slimmed the CLI command surface down to an export-only surface, reduced Chrome extension background test fixture sprawl, cleaned manifest/source-string coverage, and started main/renderer pure-logic extraction.
- Default smoke runs stay output-free. Use `.skfiy-smoke/` artifacts only for explicit release, dogfood, or debugging evidence capture.

## Plan Hygiene

Status: clean and guarded.

- `docs/superpowers/plans/` must contain only this file unless this plan is replaced by exactly one newer active plan.
- Retired dated plans, research notes, handoff notes, and cleanup checklists must not be restored under `docs/`, root-level Markdown, parking folders, archive folders, or reference folders.
- Dated decision records under `docs/decisions/` are ADR-only context. They must not contain active plan sections, task status blocks, next-work queues, checklists, focused verification blocks, or references to active plan paths.
- Date-stamped Markdown in the repository is allowed only for this active plan and durable ADRs under `docs/decisions/`.
- Markdown dated before the active plan date is retired implementation material unless it is a durable ADR under `docs/decisions/`; delete it from the live repo tree instead of renaming, archiving, or parking it.
- Plan-like Markdown filenames or directories outside this active plan and durable ADRs are retired implementation material even when they are not date-stamped.
- Retired implementation plan material must remain absent from the live repo tree without naming old plan dates in current docs. Keep only durable ADRs under `docs/decisions/` and current canonical docs.
- Treat plan cleanup as a file-tree and reference invariant: one active plan file, zero retired dated implementation Markdown files, zero stale handoff/checklist Markdown files, and zero stale workflow references to old plan paths across docs, scripts, tests, package metadata, and AGENTS.
- Guard coverage must stay structural. Do not add per-retired-plan allowlists or preserve old plan-date anchors in tests.

Verification:

```bash
npx vitest run src/main/plan-doc-status.test.ts --reporter=dot
```

## Active Scope

Keep changes product-facing but narrow:

- move safe operator controls from fallback/server-only Dashboard paths into React Dashboard,
- keep provider secrets redacted,
- keep product language precise: Background Agent, Computer Use, Computer Use Planner, Browser Context,
- keep preload APIs, Chrome host permissions, and macOS permission boundaries stable,
- preserve the unsupported generic visible-app boundary until there is an explicit adapter contract and smoke result,
- continue code-health slimming only where it directly supports Dashboard/routing work.

## Next Work Order

1. Keep the plan/doc hygiene guard green before each implementation cut: one active plan, no retired dated implementation Markdown, no stale handoff/checklist Markdown, and no workflow references to old plan paths. Git history is the archive.
2. Finish the remaining safe Dashboard P1 migrations only where a local API already exists and the React surface can express it without new permissions, endpoints, or secret leakage.
3. Continue route-state enrichment for durable outcome semantics: app-policy denial, user denial, blocked, confirmation, failure, cancellation, completion, `stopTurnBehavior`, and `Task stopped`.
4. Keep slimming remaining code-health hotspots in small cuts: low-value `src/main/chrome-extension-background.test.js` fixtures, and pure logic that can leave `src/renderer/App.tsx` or `src/main/main.ts` without changing UI behavior.
5. Treat `src/main/cli-command-surface.ts` as already slimmed unless a regression reintroduces dispatch/status assembly there. Keep new CLI behavior in owned modules with focused tests.
6. Do not add menu action primitives until a supported adapter route and safety/status model are in place.
7. Run product readiness gates after each focused feature commit. If a product smoke is blocked by local macOS/Chrome state, report the exact typed blocker.

## File Ownership Map

- `src/dashboard/DashboardApp.tsx`: React operator Dashboard and controls.
- `src/dashboard/model.ts`: pure Dashboard view models.
- `src/dashboard/api.ts`: typed Dashboard loopback API calls.
- `src/main/dashboard-server.ts`: loopback server, fallback shell, and local API handlers.
- `src/main/dashboard-data.ts`: Dashboard snapshot assembly.
- `src/main/main.ts`: Electron BrowserWindow lifecycle, IPC registration, runtime wiring, and OS side effects.
- `src/main/preload.cts`: narrow typed renderer API surface. Do not broaden it during Dashboard enrichment.
- `src/main/task-routing.ts`: supported route selection and unsupported visible-app boundary.
- `src/main/cli-command-surface.ts`: packaged CLI dispatch and status assembly.
- `chrome-extension/background.js`: Chrome extension pageControl worker.

## Task 1: React Dashboard Operator Evidence

Status: complete.

The React Dashboard exposes the existing read-only `/api/operator-evidence` entry point from the Activity surface without adding endpoints, mutations, provider secrets, token-like values, or hidden local paths.

Focused verification:

```bash
npx vitest run src/dashboard/DashboardApp.test.tsx src/main/dashboard-server.test.ts --reporter=dot
npm run typecheck -- --pretty false
```

## Task 2: Dashboard Advanced Control Migration

Status: in progress.

Continue moving fallback/server-only Dashboard controls into React only when the existing API contract is safe, local, already covered, and token-free. Completed work should be summarized in durable product docs or tests, not accumulated here as historical bullet logs.

Acceptance:

- Advanced controls remain bounded to existing local APIs.
- React tests assert observable controls and API requests.
- Dashboard server tests keep fallback shell compatibility.
- Provider secret fields remain redacted.

Focused verification:

```bash
npx vitest run src/main/dashboard-data.test.ts src/main/dashboard-server.test.ts src/main/dashboard-status.test.ts src/dashboard/DashboardApp.test.tsx --reporter=dot
npm run typecheck -- --pretty false
```

## Task 3: Route State Semantics

Status: in progress.

As supported adapters grow, preserve distinct route outcomes across dashboard, replay, preload, CLI/operator evidence, and pet UI.

Acceptance:

- App-policy denial, user denial, blocked, confirmation, cancellation, failure, and completion remain distinct.
- `stopTurnBehavior` and `Task stopped` remain visible in docs and tests.
- Unsupported generic visible-app requests still clarify instead of selecting shared primitives.

Focused verification:

```bash
npx vitest run src/main/task-routing.test.ts src/main/assistant-agent.test.ts src/main/assistant-tools-main-wiring.test.ts src/main/task-status-contract.test.ts src/renderer/App.test.tsx --reporter=dot
npm run typecheck -- --pretty false
```

## Task 4: Code-Health Slimming

Status: in progress.

Keep slimming scoped to product-owned hotspots and pure logic extraction:

- keep `src/main/cli-command-surface.ts` as a thin export surface; do not move command dispatch or status assembly back into it,
- remove repeated fixtures and low-value coverage from `src/main/chrome-extension-background.test.js`,
- extract pure helpers from `src/renderer/App.tsx` and `src/main/main.ts` without changing UI behavior,
- keep default smoke runs silent and avoid new evidence/artifact output unless explicitly requested.

Focused verification:

```bash
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-background.test.js src/main/screenshot-path.test.ts src/renderer/App.test.tsx --reporter=dot
npm run typecheck -- --pretty false
```

## Task 5: Product Readiness Gates

Run after each focused feature commit:

```bash
git diff --check
npm run typecheck -- --pretty false
env -u TMUX npx vitest run --reporter=dot
npm run build
env -u TMUX npm run smoke:cli:basic -- --require-passed
```

`npm run build` must still produce `dist/skfiy.app` and `dist/skfiy`.

For Dashboard smoke, keep the default no-artifact path. When a compact status is needed, run:

```bash
env -u TMUX node scripts/smoke-dashboard-product.mjs | node -e 'let input=""; process.stdin.on("data", c => input += c); process.stdin.on("end", () => { const evidence = JSON.parse(input); const snapshot = evidence.snapshotResponse?.body; console.log(JSON.stringify({ result: evidence.result, runnerHasTmux: evidence.runnerHasTmux, artifactPath: evidence.artifactPath, knowledgeGraphEvidence: evidence.knowledgeGraphEvidence, operatorReadinessState: evidence.operatorReadiness?.state, alerts: snapshot?.alerts?.map((alert) => alert.code) ?? [], cleanup: evidence.cleanup }, null, 2)); });'
```

Expected local typed blockers may include:

- `screen-recording-missing`
- `accessibility-missing`
- `finder-automation-unknown`
- `desktop-session-blocked`
- `desktop-session-loginwindow`
- `desktop-display-asleep`
- `chrome-native-host-missing`
- `chrome-extension-not-connected`
- `release-artifact-older-than-head`

Knowledge Graph evidence is expected to be skipped when no output path is provided.

## Handoff Requirements

Before final handoff after code changes, report:

- commits created,
- verification commands run,
- smoke commands run and typed blockers observed,
- remaining blockers with exact typed reason.

## Residual Risks

- macOS can block product-path smoke through Screen Recording, Accessibility, Finder Automation, locked desktop sessions, display sleep, or browser extension authorization.
- Branded Google Chrome can block automated unpacked-extension loading. Use Chromium or Chrome for Testing for automated proof and keep branded Chrome proof manual when needed.
- Background Agent CLI providers are intentionally bounded and non-interactive. They must not bypass the Computer Use approval and policy layer.
- Generic visible-app fallback remains out of product scope until it has an explicit adapter contract and real smoke result.

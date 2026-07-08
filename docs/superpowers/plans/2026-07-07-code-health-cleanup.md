# skfiy Feature Enrichment Plan

> **For agentic workers:** This is the only active implementation plan as of 2026-07-08. `docs/superpowers/plans/` must contain exactly one active plan file. Dated research and decision records under `docs/research/` or `docs/decisions/` are archival references, not active task plans.

## Current State

- skfiy is an agent-first local-first macOS Computer Use runtime with a pixel desktop pet, packaged CLI, local Dashboard, Chrome extension bridge, and focused app adapters.
- Computer Use is a tool capability requested by the selected Background Agent. It is not a competing chat mode and must stay inside skfiy's approval, policy, replay, Screen Recording, Accessibility, Finder Automation, and browser-permission gates.
- Background Agent provider selection remains separate from Computer Use Planner selection.
- Browser Context enters provider prompts only through the explicit Chrome extension pageControl bridge and bounded prompt blocks.
- Dashboard remains the operator surface for provider readiness, Browser Context, Computer Use state, current turn, replay, memory, sessions, prompt stack, dogfood/release state, and read-only operator evidence.
- Default smoke runs stay output-free. Use `.skfiy-smoke/` artifacts only for explicit release, dogfood, or debugging evidence capture.
- Plan audit status: `docs/superpowers/plans/` contains only this active plan. Retired dated plans and stale date anchors should not be restored in agent workflow docs; dated research and decision files are archive-only context, not work queues.

## Completed Foundation

- CLI command-surface slimming, Chrome extension background test diet, manifest source-string cleanup, and main/renderer pure-logic extraction are complete for the current code-health pass.
- Plan hygiene is complete for the current pass: retired planning files are absent, workflow docs point only at this active plan, and the active plan directory is no longer a plan archive.
- Chrome extension background tests preserve permission recovery, page observe, native-message forwarding, target-tab popup behavior, and blocked-state classification without listener-count or source-string coverage.
- React Dashboard already owns provider, Computer Use, Browser Context, Dogfood/release, replay, Chrome/Finder/Ghostty readiness, Chrome page action controls, Chrome host-policy controls, memory controls, and provider settings.
- React Dashboard now exposes the existing read-only operator evidence JSON entry point from the Activity surface.
- React Dashboard can now load the existing read-only compact evidence summary from `/api/evidence-summary` and render lane counts without adding a new endpoint.
- Default smoke behavior is output-free, and Dashboard compact smoke skips Knowledge Graph evidence when no output path is provided.

## Active Scope

This is a feature enrichment plan. Keep changes product-facing but narrow:

- move safe operator controls from fallback/server-only Dashboard paths into React Dashboard,
- keep provider secrets redacted,
- keep product language precise: Background Agent, Computer Use, Computer Use Planner, Browser Context,
- keep preload APIs, Chrome host permissions, and macOS permission boundaries stable,
- preserve the unsupported generic visible-app boundary until there is an explicit adapter contract and smoke result.

## Next Work Order

1. Keep planning single-source. If another plan file appears under `docs/superpowers/plans/`, delete it in the same change or replace this file with exactly one newer active plan.
2. Finish Dashboard P1 migrations only where a local API already exists and the React surface can express it without new permissions, new endpoints, or secret leakage.
3. Continue route-state enrichment only for durable outcome semantics: app-policy denial, user denial, blocked, confirmation, failure, cancellation, completion, `stopTurnBehavior`, and `Task stopped`.
4. Keep any remaining code-health slimming scoped to pure-logic extraction, duplicate fixture removal, or command-surface decomposition that directly supports the active Dashboard/routing work.
5. Do not add menu action primitives until a supported adapter route and safety/status model are in place.
6. Run Task 4 gates after each focused feature commit. If a product smoke is blocked by local macOS/Chrome state, report the exact typed blocker.

## File Ownership Map

- `src/dashboard/DashboardApp.tsx`: React operator Dashboard and controls.
- `src/dashboard/model.ts`: pure Dashboard view models.
- `src/dashboard/api.ts`: typed Dashboard loopback API calls.
- `src/main/dashboard-server.ts`: loopback server, fallback shell, and local API handlers.
- `src/main/dashboard-data.ts`: Dashboard snapshot assembly.
- `src/main/main.ts`: Electron BrowserWindow lifecycle, IPC registration, runtime wiring, and OS side effects.
- `src/main/preload.cts`: narrow typed renderer API surface. Do not broaden it during Dashboard enrichment.
- `src/main/task-routing.ts`: supported route selection and unsupported visible-app boundary.
- `chrome-extension/background.js`: Chrome extension pageControl worker.

## Execution Rules

- Start from a clean worktree and keep one commit per feature package.
- Prefer behavior tests over source-string assertions.
- Use existing Dashboard loopback APIs before adding new endpoints.
- Do not change UI copy or layout outside the touched surface.
- Do not broaden preload APIs, Chrome host permissions, provider boundaries, or macOS permission boundaries unless a task explicitly requires it.
- Keep `docs/superpowers/plans/` to exactly one active plan file.
- Run focused verification before committing.
- Clean generated local smoke directories unless an explicit release, dogfood, or debugging handoff needs them.

## Task 1: React Dashboard Operator Evidence

Status: complete.

Move the existing read-only `/api/operator-evidence` entry from fallback/server-only discovery into the React Dashboard Activity area.

Acceptance:

- React Dashboard exposes an obvious operator evidence entry point.
- The entry opens `/api/operator-evidence` without adding a new endpoint or mutation.
- Provider secrets, local token-like values, and raw hidden paths are not newly displayed.
- Server fallback behavior remains compatible.

Focused verification:

```bash
npx vitest run src/dashboard/DashboardApp.test.tsx src/main/dashboard-server.test.ts --reporter=dot
npm run typecheck -- --pretty false
```

## Task 2: Dashboard Advanced Control Migration

Status: in progress.

Continue moving fallback/server-only Dashboard controls into React only when the existing API contract is safe, local, and covered.

Completed in this pass:

- The React Activity surface can call `/api/evidence-summary` on demand and render the compact evidence lane state, ready count, attention count, and blocked count.
- The React evidence summary now renders lane checks, next actions, and command mutability labels from the same read-only API.
- React personal memory controls now expose the existing `/api/personal-skills` unmute path for muted personal skills, without adding a new endpoint or changing provider/preload permissions.
- React personal memory controls now render the existing mutation safety receipt from `/api/personal-memory` and `/api/personal-skills`, showing planned/system mutation metadata without echoing memory content.

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

As supported adapters grow, preserve distinct route outcomes across dashboard, replay, preload, and pet UI.

Completed in this pass:

- React Dashboard Activity now shows a distinct Route outcome card derived from current-turn state, keeping app-policy denial, user denial, blocked, confirmation, cancellation, failure, and completion visibly separate.
- Dashboard runtime-turn-marker summaries preserve safe `route` and route-reason strings so route-state evidence is not dropped when the runtime snapshot is missing or stale.
- `/api/operator-evidence` now includes a token-free route outcome summary and status fields so CLI/plugin handoffs can distinguish app-policy denial, user denial, blocked, confirmation, cancellation, failure, and completion without exposing raw commands.
- Runtime snapshots now write a token-free shared route outcome, and CLI status evidence preserves it with safe route, route-reason, denial, policy, and latest-tool status fields.
- Pet UI view-model logic now derives the shared route outcome from local task state and replay evidence, preserving app-policy denial, user denial, confirmation, cancellation, and completion without changing visible UI behavior.
- Pet user dashboard now renders the derived route outcome as a compact status signal, keeping app-policy denial visibly distinct from generic blocked states without adding preload or permission surface.
- Task events now carry safe route, route-reason, denial-kind, and policy-kind metadata through main, preload, renderer task state, replay timeline, and runtime snapshot payloads so route outcomes no longer depend on message-text parsing.

Acceptance:

- App-policy denial, user denial, blocked, confirmation, cancellation, failure, and completion remain distinct.
- `stopTurnBehavior` and `Task stopped` remain visible in docs and tests.
- Unsupported generic visible-app requests still clarify instead of selecting shared primitives.

Focused verification:

```bash
npx vitest run src/main/task-routing.test.ts src/main/assistant-agent.test.ts src/main/assistant-tools-main-wiring.test.ts src/main/task-status-contract.test.ts src/renderer/App.test.tsx --reporter=dot
npm run typecheck -- --pretty false
```

## Task 4: Product Readiness Gates

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

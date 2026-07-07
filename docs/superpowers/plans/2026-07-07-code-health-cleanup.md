# skfiy Code Health Cleanup Plan

> **For agentic workers:** This is the only active implementation plan as of 2026-07-07. `docs/superpowers/plans/` must contain exactly one active plan file. Dated research and decision records under `docs/research/` or `docs/decisions/` are archival references, not active task plans.

## Current State

- skfiy is a local-first macOS Computer Use runtime with a pixel desktop pet, packaged CLI, local Dashboard, Chrome extension bridge, and focused app adapters.
- Computer Use remains a permissioned tool capability requested by the selected Background Agent. It is not a competing chat mode and must stay inside skfiy's approval, policy, replay, Screen Recording, Accessibility, Finder Automation, and browser-permission gates.
- Background Agent provider selection remains separate from Computer Use Planner selection.
- Browser Context enters provider prompts only through the explicit Chrome extension pageControl bridge and bounded prompt blocks.
- Dashboard remains the operator surface for provider readiness, Browser Context, Computer Use state, current turn, replay, memory, sessions, prompt stack, and dogfood/release state.
- Default smoke runs stay output-free. Use `.skfiy-smoke/` artifacts only for explicit release, dogfood, or debugging evidence capture.
- Plan audit status: `docs/superpowers/plans/` contains only this active plan, and extra plan files should not be restored.

## Completed Cleanup

- CLI command-surface slimming is complete for the current pass. Status formatting, readiness JSON, Chrome readiness, Dashboard probing, money-run status, permission output, Chrome capability envelopes, operator status output, extension info output, doctor output, status capabilities, skeleton output, status-reader inputs, local evidence, Chrome files, desktop status, default status reading, Chrome command execution, MCP serve, Dashboard command execution, status/doctor/operator execution, smoke/skin execution, permission opening, code-signature reading, and child-process execution now live in focused helpers.
- Chrome extension background test diet is complete for the current pass. Repeated Chrome globals, runtime message dispatch, tab lifecycle helpers, host-policy fixtures, page-control wake envelopes, native-response envelopes, and popup wake setup were consolidated. Low-value listener-count, duplicated-order, and redundant negative tests were removed while preserving behavior coverage.
- Chrome extension manifest coverage now checks manifest structure and declared files instead of source-string snapshots of background, content-script, popup HTML, and popup JS internals. Message, host-policy, native-bridge, page-control, and popup behavior remain covered by focused behavior tests.
- Main and renderer pure-logic extraction is complete for the current pass. Renderer task state, panel state, settings state, permission fallback state, pet drag state, desktop API fallback, and view-model decisions now live behind focused helpers. Main-process IPC payloads, runtime snapshot payloads, renderer payloads, Browser Context reading, Background Agent settings responses, Computer Use tool-result mapping, and duplicate window-bound clamping have been extracted or removed.
- The final Task 3 opportunistic pass removed the unused renderer permission-onboarding row forwarding helper and its forwarding-only test. Permission-onboarding completion now calls the shared missing-permission row helper directly, while onboarding row display remains covered through the root view-model tests.
- Remaining source-string cleanup removed renderer CSS implementation assertions and a money-run smoke script source snapshot assertion. App behavior and money-run dry-run/product-path behavior remain covered through observable tests.
- Project hygiene pass removed stale smoke artifact defaults, temporary smoke directories, source-string smoke tests, duplicate record helpers, and extra active-plan files.

## Active Scope

This is not a feature expansion plan. The remaining work is project slimming:

- reduce oversized orchestration files only where extraction is still obvious,
- remove duplicated or low-value tests,
- extract pure logic from broad integration files,
- keep product behavior, UI copy, preload APIs, Chrome permissions, provider boundaries, and smoke artifact defaults stable.

## Next Work Order

1. Keep planning single-source. If a stale plan file reappears under `docs/superpowers/plans/`, delete it in the same cleanup change or replace this file with exactly one newer active plan.
2. Treat the final Task 3 opportunistic scan as complete for this pass. Do not split JSX components just to reduce line count.
3. Treat `src/main/cli-command-surface.ts` and `src/main/main.ts` as mostly slimmed for this pass. Only move more code if the extracted unit is pure, named, tested, and keeps Electron/CLI side effects easier to follow.
4. Treat `src/main/chrome-extension-background.test.js` as slimmed for this pass. Do not add back listener-count tests, source-string assertions, duplicate fixtures, or redundant negative coverage.
5. After each focused cleanup commit, run Task 4 gates. If no clear pure extraction remains, pause code-health slimming and only address typed smoke blockers when the local macOS/Chrome environment is available.

## File Ownership Map

- `src/main/cli-command-surface.ts`: top-level CLI dispatch and compatibility exports.
- `src/main/cli-*.ts`: CLI parsing, status shaping, command-family runners, and injected side-effect helpers.
- `src/main/main.ts`: Electron BrowserWindow lifecycle, IPC registration, runtime wiring, and OS side effects.
- `src/main/main-*.ts`: pure main-process payload, settings, Browser Context, runtime snapshot, and tool-result helpers.
- `src/renderer/App.tsx`: pet UI composition, React state wiring, callbacks, and event subscriptions.
- `src/renderer/app-*.ts`: renderer-local pure state, transition, fallback, API-selection, and view-model helpers.
- `src/main/preload.cts`: narrow typed renderer API surface. Do not broaden it during cleanup.
- `chrome-extension/background.js`: Chrome extension pageControl worker.
- `src/main/chrome-extension-background.test.js`: browser bridge behavior tests.
- `src/dashboard/`: Dashboard frontend.
- `src/main/dashboard-data.ts`: Dashboard snapshot assembly.

## Execution Rules

- Start from a clean worktree and keep one commit per task.
- Prefer behavior tests over source-string assertions.
- Extract pure helpers before changing integration wiring.
- Do not change UI behavior, product language, preload API shape, Chrome host permissions, or macOS permission boundaries unless the task explicitly requires it.
- Keep `docs/superpowers/plans/` to exactly one active plan file.
- Run focused verification before committing.
- Clean generated local smoke directories unless an explicit release, dogfood, or debugging handoff needs them.

## Task 1: CLI Command Surface

Status: complete for the current cleanup pass.

Acceptance remains:

- `status`, `doctor`, Chrome readiness, Dashboard readiness, and smoke summary output stay backward compatible.
- Helpers accept typed inputs and return plain objects or strings where practical.
- `cli-command-surface.ts` stays focused on top-level dispatch instead of status assembly or process spawning.
- Tests assert observable command output, parsed options, returned status, or typed blockers.

Focused verification:

```bash
npx vitest run src/main/cli-command-surface.test.ts src/main/dashboard-status.test.ts src/main/chrome-readiness.test.ts --reporter=dot
npm run typecheck -- --pretty false
```

## Task 2: Chrome Extension Background Test Diet

Status: complete for the current cleanup pass.

Acceptance remains:

- Local test helpers remove repeated Chrome API, tab, permission, and native-message setup.
- Coverage remains for permission recovery, page observe, native-message forwarding, target-tab popup behavior, and blocked-state classification.
- Low-value listener-registration, duplicated-order, and source-string-style coverage should not come back.

Focused verification:

```bash
npx vitest run src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-page-control.test.ts --reporter=dot
npm run typecheck -- --pretty false
```

## Task 3: Main And Renderer Pure Logic

Status: complete for the current cleanup pass.

Future scope, only if new obvious cleanup appears:

- Remove unused forwarding helpers only when direct callers and tests confirm the behavior is covered elsewhere.
- Extract repeated renderer state/view-model assembly only if the extracted helper is clearer than the inline React code.
- Extract more main-process code only if it is pure mapping or payload normalization, not Electron lifecycle wiring.

Do not:

- change UI copy or layout,
- broaden preload APIs,
- change Chrome host permissions,
- change provider or Computer Use boundaries,
- split JSX components solely to chase line count.

Focused verification:

```bash
npx vitest run src/renderer/App.test.tsx src/main/runtime-snapshot-main-wiring.test.ts src/main/assistant-tools-main-wiring.test.ts --reporter=dot
npm run typecheck -- --pretty false
```

## Task 4: Product Readiness Gates

Run after each focused cleanup commit:

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

# skfiy Code Health Cleanup Plan

> **For agentic workers:** This is the single active plan as of 2026-07-07. Previous long-form implementation logs were retired because the pet, Background Agent, Browser Context, Dashboard, personalization, and validation milestones are already complete. New work should be small, code-health focused, and verified through behavior tests rather than source-string assertions.

## Current Baseline

- skfiy is an agent-first macOS Computer Use runtime with a pixel desktop pet, packaged CLI, local Dashboard, Chrome extension bridge, and app adapters for local experiments.
- Computer Use is a tool capability the selected Background Agent can request. It is not a separate chat mode and it must stay inside skfiy's policy, approval, replay, Screen Recording, Accessibility, Finder Automation, and browser-permission gates.
- Background Agent provider selection is separate from Computer Use Planner selection. Current providers are Codex (`codex`), Claude Code (`claude-code`), and bounded Hermes (`hermes`).
- Hermes remains a bounded chat backend only. Do not use Hermes `--oneshot`, `--yolo`, or any raw full-tool loop from pet chat.
- Browser Context enters provider prompts only through the explicit Chrome extension pageControl bridge and bounded prompt blocks. Chrome host policy and optional Chrome permissions remain explicit.
- Dashboard is the operator surface for provider readiness, Browser Context, Computer Use state, current turn, replay, memory, sessions, prompt stack, and dogfood/release state.
- Default smoke runs are output-free. Use `.skfiy-smoke/` artifacts only for explicit release, dogfood, or debugging evidence capture.
- 2026-07-07 cleanup removed stale smoke artifact defaults, low-value smoke source-string tests, duplicated record helpers, and temporary smoke directories.
- 2026-07-07 plan audit confirmed `docs/superpowers/plans/` contains only this active plan. Historical long-form plans have been removed from `docs/`.
- 2026-07-07 stale-date audit confirmed no retired June plan files or plan references remain; remaining stale-date hits were only deterministic test/smoke fixture timestamps and were refreshed to the active plan date.
- 2026-07-07 follow-up plan audit confirmed no retired June planning material or references remain in the repository; keep this directory as a one-file active-plan source of truth.

## Active Scope

This plan is not a feature expansion plan. The next work is project slimming:

- reduce oversized orchestration files,
- remove duplicated or low-value tests,
- extract pure logic from broad integration files,
- keep product behavior, UI copy, preload APIs, Chrome permissions, and provider boundaries stable.

## Next Work Order

1. Continue Task 3 renderer cleanup only where a remaining pure reducer, transition, option table, or view-model decision is obvious. Do not split JSX components solely to chase line count; keep UI copy, layout, pointer behavior, keyboard behavior, and preload API shape unchanged.
2. Treat Task 3 main-process mapping cleanup as mostly complete for the current pass. Runtime snapshot adaptation, provider status response assembly, Browser Context status mapping, and IPC payload normalization now live behind focused helpers; only extract more main-process code if it is clearly pure and reduces `src/main/main.ts` without obscuring Electron lifecycle wiring.
3. Treat Task 1 and Task 2 as complete for the current cleanup pass. Do not add back source-string tests, listener-count tests, duplicate Chrome background fixtures, stale smoke artifact defaults, or retired plan files.
4. Run Task 4 gates after the next focused cleanup commit, keeping smoke defaults output-free unless release, dogfood, or debugging evidence is explicitly requested.

## File Ownership Map

- `src/main/cli-command-surface.ts`: CLI command dispatch and IO wiring only after cleanup; pure JSON/status assembly should move to narrow helpers.
- `src/main/main.ts`: Electron BrowserWindow lifecycle, IPC registration, runtime wiring, and OS side effects.
- `src/renderer/App.tsx`: Pet UI composition and event wiring; pure state transitions should move to renderer-local helpers.
- `src/main/preload.cts`: narrow typed renderer API surface. Do not broaden it during cleanup.
- `src/main/record-utils.ts`: shared defensive record readers.
- `src/main/assistant-agent.ts`: Background Agent provider invocation and prompt construction.
- `src/main/planner-provider-settings.ts`: Computer Use Planner settings, separate from Background Agent settings.
- `src/main/browser-page-context.ts`: bounded Browser Context prompt state.
- `chrome-extension/background.js`: Chrome extension pageControl worker.
- `src/main/chrome-extension-background.test.js`: browser bridge behavior tests; fixture duplication should be reduced.
- `src/dashboard/`: Dashboard frontend.
- `src/main/dashboard-data.ts`: Dashboard snapshot assembly.

## Execution Rules

- Start from a clean worktree and keep one commit per task.
- Prefer behavior tests over source-string assertions.
- Extract pure helpers before changing integration wiring.
- Do not change UI behavior, product language, preload API shape, Chrome host permissions, or macOS permission boundaries unless the task explicitly requires it.
- Do not keep old long-form plans in `docs/superpowers/plans/`; this directory must contain exactly one active plan. Do not restore retired historical plans.
- Run the task-specific focused verification before committing.
- Before final handoff for code changes, run:

```bash
git diff --check
npm run typecheck -- --pretty false
env -u TMUX npx vitest run --reporter=dot
npm run build
```

`npm run build` must still produce `dist/skfiy.app` and `dist/skfiy`.

For product-facing smoke, keep defaults output-free:

```bash
npm run smoke:ui
npm run smoke:ghostty
npm run smoke:chrome
npm run smoke:finder
npm run smoke:money-run
npm run smoke:dashboard
```

Use `--output .skfiy-smoke/...` only for release, dogfood, or debugging evidence capture. Release readiness workflows that need machine-readable JSON should use explicit paths, for example:

```bash
npm run release:mac:check -- --json-output .skfiy-release/mac-release-check.json
```

## Task 1: Slim The CLI Command Surface

**Files likely to change:**
- `src/main/cli-command-surface.ts`
- `src/main/cli-status-evidence.ts`
- `src/main/cli-smoke-command.ts`
- focused `src/main/cli-*.ts` helpers
- `src/main/cli-command-surface.test.ts`

Progress:

- 2026-07-07: extracted pure status text formatting into `src/main/cli-status-output.ts` with direct behavior coverage. Remaining Task 1 work should continue with JSON readiness/status assembly and command dispatch separation.
- 2026-07-07: extracted runtime, dashboard, money-run, and binary readiness JSON assembly into `src/main/cli-status-readiness.ts`. Chrome extension readiness still stays in `cli-command-surface.ts` because it depends on Chrome setup-guide shaping.
- 2026-07-07: extracted CLI Chrome setup-guide/readiness shaping into `src/main/cli-chrome-readiness.ts`. Remaining Task 1 work is now mostly command dispatch and side-effect orchestration.
- 2026-07-07: extracted the static CLI command surface definition table into `src/main/cli-command-definitions.ts`, keeping `cli-command-surface.ts` focused on normalization, output assembly, and execution wiring.
- 2026-07-07: extracted pure CLI command normalization into `src/main/cli-command-normalization.ts`, including invocation types, permission targets, option parsing, Chrome page-control subcommand guards, and Chrome policy host normalization. `cli-command-surface.ts` now keeps the compatibility export while dispatch and IO remain in place.
- 2026-07-07: extracted dashboard probe URL, fetch summary, not-run output, and snapshot summary shaping into `src/main/cli-dashboard-probe-output.ts`. Dashboard network probing and stdout writing stay in `cli-command-surface.ts`.
- 2026-07-07: extracted money-run tmux status formatting and snapshot/failure shaping into `src/main/cli-money-run-status.ts`. The actual tmux probe process execution remains in `cli-command-surface.ts`.
- 2026-07-07: extracted permission settings URL and action-plan output shaping into `src/main/cli-permission-settings-output.ts`. Opening System Settings and error handling stay in `cli-command-surface.ts`.
- 2026-07-07: extracted Chrome page-safety/page-control capability and adapter status shaping into `src/main/cli-chrome-capabilities.ts`. Native host, connection, and host-policy reads remain in `cli-command-surface.ts`.
- 2026-07-07: extracted operator-status token-free supervisor summary and recommended read-only command shaping into `src/main/cli-operator-status-output.ts`. Status probing and exit-code handling stay in `cli-command-surface.ts`.
- 2026-07-07: extracted Chrome extension-info output and setup command shaping into `src/main/cli-chrome-extension-info-output.ts`. Manifest file reading remains in `cli-command-surface.ts`.
- 2026-07-07: extracted doctor diagnostics/preflight JSON shaping into `src/main/cli-doctor-output.ts` and shared status readiness/page-capability assembly into `src/main/cli-status-capabilities.ts`. Status/signature probing, process IO, and command dispatch remain in `cli-command-surface.ts`.
- 2026-07-07: extracted Chrome CLI status, tabs, reload, page-control, native-host mutation, and host-policy JSON envelopes into `src/main/cli-chrome-command-output.ts`. Native host reads/writes, extension invocations, Chrome reload, and host-policy mutations remain in `cli-command-surface.ts`.
- 2026-07-07: extracted generic CLI not-run/skeleton output shaping into `src/main/cli-output-skeleton.ts`. `cli-command-surface.ts` now keeps only the wrapper that supplies generated timestamps and manifest-reading callback for `chrome extension-info`.
- 2026-07-07: extracted status-reader input path construction and Chrome extension-id inference into `src/main/cli-status-reader-input.ts`, and moved status local-evidence assembly into `src/main/cli-status-evidence.ts`. `cli-command-surface.ts` still owns the actual status probe orchestration.
- 2026-07-07: moved the money-run tmux read-only probe orchestration into `src/main/cli-money-run-status.ts` behind an injected command runner. `cli-command-surface.ts` now only supplies the shared process runner when assembling status.
- 2026-07-07: moved Dashboard status discovery, state-file fallback, and loopback JSON fetch helpers into `src/main/cli-dashboard-status-reader.ts`. `cli-command-surface.ts` reuses that reader for status assembly and dashboard probe fetches.
- 2026-07-07: moved Chrome extension manifest summary and Chrome Preferences registration checks into `src/main/cli-chrome-extension-files.ts`. `cli-command-surface.ts` now keeps the Chrome command dispatch while local extension file parsing lives in the helper.
- 2026-07-07: moved Computer Use permission and desktop-session status fallback shaping into `src/main/cli-desktop-status.ts`. `cli-command-surface.ts` now creates the helper client and delegates status reads to the helper.
- 2026-07-07: moved default CLI status-reader orchestration into `src/main/cli-status-reader.ts`, including helper-missing fallbacks, Chrome native-host/connection/policy reads, Dashboard state, and money-run status probing. `cli-command-surface.ts` now injects that reader instead of owning the status assembly.
- 2026-07-07: moved Chrome command-family execution into `src/main/cli-chrome-command-runner.ts`, including Chrome status, tabs, reload, page-control actions, native-host install/uninstall, extension-info, and host-policy commands. `cli-command-surface.ts` now keeps only top-level command dispatch for the Chrome family.
- 2026-07-07: moved MCP serve execution into `src/main/cli-mcp-command-runner.ts`, including JSON server startup output, stdio transport, status/doctor provider wiring, and MCP shutdown handling. `cli-command-surface.ts` now delegates MCP command execution.
- 2026-07-07: moved Dashboard command-family execution into `src/main/cli-dashboard-command-runner.ts`, including dashboard server startup output, state-file writes, loopback probe fetching, URL opening, and shutdown handling. `cli-command-surface.ts` now delegates both `dashboard` and `dashboard status/snapshot` execution.
- 2026-07-07: moved `status`, `doctor`, and `operator status` execution into `src/main/cli-status-command-runner.ts`, including status evidence decoration, doctor status/signature fanout, operator readiness output, and error fallback shaping. `cli-command-surface.ts` now injects readers and delegates the status command family.
- 2026-07-07: moved `smoke *` execution into `src/main/cli-smoke-command-runner.ts` and `skin import` execution into `src/main/cli-skin-command-runner.ts`. `cli-command-surface.ts` now keeps those branches as top-level delegation only.
- 2026-07-07: moved `permissions open` execution and its default macOS settings opener into `src/main/cli-permission-command-runner.ts`. `cli-command-surface.ts` now injects the opener and delegates permission settings commands.
- 2026-07-07: moved the default `codesign` signature reader into `src/main/cli-code-signature-reader.ts` and the shared child-process command runner into `src/main/cli-process-command-runner.ts`. `cli-command-surface.ts` now has no direct process spawning and is mostly compatibility exports plus top-level dispatch.

- [x] **Map responsibilities**

Classify the remaining blocks in `src/main/cli-command-surface.ts` into command dispatch, pure status assembly, provider/browser/dashboard formatting, smoke command orchestration, and direct process side effects. Do not move behavior while mapping.

- [x] **Extract pure status and output assembly**

Move pure JSON/status shaping into small typed helpers. Keep command parsing, dispatch, process IO, and side effects in `cli-command-surface.ts`.

Acceptance:

- `status`, `doctor`, Chrome readiness, Dashboard readiness, and smoke summary output stay backward compatible.
- New helpers accept typed inputs and return plain objects or strings.
- `cli-command-surface.ts` loses meaningful line count.
- Tests assert observable command output, parsed options, returned status, or typed blockers; no new source-string assertions.

Focused verification:

```bash
npx vitest run src/main/cli-command-surface.test.ts src/main/dashboard-status.test.ts src/main/chrome-readiness.test.ts --reporter=dot
npm run typecheck -- --pretty false
```

## Task 2: Finish Chrome Extension Background Test Diet

**Files likely to change:**
- `src/main/chrome-extension-background.test.js`
- optional local test fixture helper only if it materially reduces duplication

Progress:

- 2026-07-07: consolidated repeated background import/global Chrome setup in `src/main/chrome-extension-background.test.js` behind a local `loadBackground` helper, and removed lifecycle listener-count assertions that only restated listener registration while preserving install/startup behavior coverage.
- 2026-07-07: consolidated repeated `runtime.onMessage` test dispatch in `src/main/chrome-extension-background.test.js` behind a local `sendRuntimeMessage` helper while preserving behavior assertions for policy status, page-control wake, native heartbeat, reload, and native-message forwarding.
- 2026-07-07: consolidated runtime lifecycle and tab created/updated event dispatch in `src/main/chrome-extension-background.test.js` behind local helpers, and removed `tabs.onUpdated` listener-count assertions that only restated registration.
- 2026-07-07: consolidated repeated Chrome host-policy storage and target-tab fixtures in `src/main/chrome-extension-background.test.js` behind local helpers, leaving direct storage/tab listener setup only inside helper code.
- 2026-07-07: consolidated repeated `PAGE_CONTROL_WAKE` runtime message envelopes in `src/main/chrome-extension-background.test.js` behind a local helper while keeping each test's action, selector, request id, and race/dedupe assertions explicit.
- 2026-07-07: consolidated repeated native-response envelopes in `src/main/chrome-extension-background.test.js` behind `createNativeResponse`, and removed the popup-delegated action test that only asserted response ordering already covered by action execution and dedupe behavior tests.
- 2026-07-07: consolidated popup wake URL construction, localhost wake background setup, and repeated fill wake directives behind local helpers; removed the no-target popup heartbeat negative test while preserving target-tab, page observe, action, screenshot, dedupe, and blocker behavior coverage.

- [x] **Consolidate fixtures**

Merge repeated Chrome API, tab, permission, and native-message setup into a tiny helper. Keep it local to the test file unless a separate helper clearly removes substantial duplication.

- [x] **Delete low-value coverage**

Remove tests that only restate listener registration, duplicated constants, or implementation order. Preserve coverage for permission recovery, page observe, native-message forwarding, target-tab popup behavior, and blocked-state classification.

Focused verification:

```bash
npx vitest run src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-page-control.test.ts --reporter=dot
npm run typecheck -- --pretty false
```

## Task 3: Extract Pure Logic From Main And Renderer

**Files likely to change:**
- `src/main/main.ts`
- `src/renderer/App.tsx`
- renderer-local state helper files
- main-process wiring helper files
- `src/renderer/App.test.tsx`
- focused main wiring tests where behavior is already covered

Progress:

- 2026-07-07: extracted renderer task event state transitions, replay record merging, assistant reply detection, and task status copy into `src/renderer/app-task-state.ts` with focused pure helper coverage. `src/renderer/App.tsx` now keeps the task-event subscription and React state wiring while the pure state updates live in the helper.
- 2026-07-07: extracted replay summary formatting, replay accessibility/OCR labels, and panel visibility derivation into `src/renderer/app-view-model.ts` with focused pure helper coverage. `src/renderer/App.tsx` now keeps component rendering and event wiring while this pure view-model logic lives in tested helpers.
- 2026-07-07: extracted main-process IPC payload normalization and Computer Use tool-result mapping into `src/main/main-ipc-payload.ts` and `src/main/main-computer-use-tool-result.ts` with focused pure helper coverage. `src/main/main.ts` now keeps the Electron IPC handlers and side effects while these pure mapping helpers live outside the runtime wiring file.
- 2026-07-07: extracted renderer-facing main-process payload helpers into `src/main/main-renderer-payload.ts`, covering Background Agent settings responses, runtime hotkey status, Browser Context read-failure fallback mapping, assistant turn messages, and planned Computer Use tool-call selection. `src/main/main.ts` now keeps the store reads, provider probes, and IPC handlers while these pure response helpers have direct behavior coverage.
- 2026-07-07: extracted renderer panel state transitions into `src/renderer/app-panel-state.ts`, covering assistant-panel, settings/details, permission-onboarding, task-event, and drag-close transitions. `src/renderer/App.tsx` now owns React event wiring while these panel reducer transitions have direct behavior coverage.
- 2026-07-07: extracted assistant submission transient conversation and task state into `src/renderer/app-task-state.ts`, covering pending Background Agent messages, planned task status, and send-failure state. `src/renderer/App.tsx` now keeps form input, panel transition, and IPC submission wiring while this state assembly has direct helper coverage.
- 2026-07-07: extracted runtime snapshot current-turn adaptation into `src/main/main-runtime-snapshot-payload.ts` and Background Agent provider selection into `src/renderer/app-view-model.ts`. `src/main/main.ts` now explicitly adapts task events before writing runtime markers, and `src/renderer/App.tsx` no longer owns provider fallback selection rules.
- 2026-07-07: extracted transient renderer task-status view creation into `src/renderer/app-task-state.ts`, covering stop-task cancellation, settings/approval failure messages, permission-ready idle state, and terminal-bubble dismissal. `src/renderer/App.tsx` now keeps the async command handlers while repeated TaskView object construction lives in a tested helper.
- 2026-07-07: extracted main-process Browser Context status reading and success/failure mapping into `src/main/main-browser-context-reader.ts` with injected Chrome connection reads. `src/main/main.ts` now only supplies `homeDir` and the real Chrome extension connection reader before passing Browser Context into the Background Agent turn.
- 2026-07-07: extracted main-process Background Agent settings response assembly into `src/main/main-assistant-agent-settings-response.ts`, including settings update normalization and injected provider-state reads. `src/main/main.ts` now keeps only the Electron IPC handlers and settings store delegation for Background Agent settings.
- 2026-07-07: extracted renderer settings default state and fallback update reducers into `src/renderer/app-settings-state.ts`, covering app policy updates, Background Agent provider selection state, and Computer Use Planner mode updates. `src/renderer/App.tsx` now imports these settings defaults/reducers while keeping settings UI rendering and API calls unchanged.
- 2026-07-07: extracted renderer permission fallback state and permission-onboarding completion checks into `src/renderer/app-permission-state.ts`. `src/renderer/App.tsx` now keeps permission API calls and UI rendering while unknown permission defaults and onboarding row/completion derivation live in a tested helper.
- 2026-07-07: extracted pet drag state creation, movement delta calculation, first-move detection, click-suppression checks, and visible-rect normalization into `src/renderer/app-pet-drag-state.ts`. `src/renderer/App.tsx` now keeps pointer capture/release, panel transition, and `moveWindowBy` side effects while drag state transitions live in a tested helper.
- 2026-07-07: extracted renderer task-event UI transition derivation and assistant-conversation task-event updates into `src/renderer/app-task-state.ts`. `src/renderer/App.tsx` now keeps the task-event subscription, refs, and React setters while assistant reply detection, pending-message cleanup, input-submitting completion, and panel-action selection live in tested pure helpers.
- 2026-07-07: extracted pet-click panel transition derivation into `src/renderer/app-panel-state.ts`, covering drag-click suppression, terminal task bubble reset, replay clearing, and assistant-panel action selection. `src/renderer/App.tsx` now applies those derived actions through refs and React setters while the click decision table lives in a tested helper.
- 2026-07-07: extracted stop-turn and assistant-input submission transition derivation into `src/renderer/app-task-state.ts`, and moved static settings option tables into `src/renderer/app-settings-state.ts`. `src/renderer/App.tsx` now keeps focus handling, IPC calls, refs, React setters, and JSX rendering while command trimming, blocked submission detection, cancelled task view, panel-action selection, and settings option data live behind tested helpers.
- 2026-07-07: extracted the renderer preload bridge fallback into `src/renderer/app-desktop-api.ts`. `src/renderer/App.tsx` now keeps the typed `DesktopApi` contract and component wiring while inert fallback methods, fallback settings reducers, and `window.skfiy` selection live behind focused helper coverage.

- [ ] **Extract renderer state reducers**

Move pure task, panel, settings, and transient-status transitions out of `src/renderer/App.tsx`. Keep markup, labels, controls, keyboard behavior, pointer behavior, and visual layout unchanged.

- [x] **Extract main-process mapping helpers**

Move pure IPC payload normalization, runtime snapshot adaptation, provider status mapping, and Browser Context status mapping out of `src/main/main.ts`. Keep BrowserWindow lifecycle and Electron side effects in `main.ts`.

Acceptance:

- No UI copy or layout changes.
- No preload API broadening.
- Existing product language remains: Background Agent, Computer Use, Computer Use Planner, Browser Context.
- `src/main/main.ts` and `src/renderer/App.tsx` become smaller because pure logic moved behind tested helpers.

Focused verification:

```bash
npx vitest run src/renderer/App.test.tsx src/main/runtime-snapshot-main-wiring.test.ts src/main/assistant-tools-main-wiring.test.ts --reporter=dot
npm run typecheck -- --pretty false
```

## Task 4: Refresh Product Readiness After Cleanup

Run this after one or more code-health tasks land.

Progress:

- 2026-07-07: after the Chrome background test diet, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. `npm run smoke:dashboard` was rerun output-free and remained typed-blocked by the current desktop and Chrome state: `screen-recording-missing`, `accessibility-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `desktop-display-asleep`, `chrome-native-host-missing`, and `chrome-extension-not-connected`.
- 2026-07-07: after popup wake fixture consolidation, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after renderer view-model extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after main IPC payload helper extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after main renderer payload helper extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after renderer panel state reducer extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after assistant submission state helper extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `desktop-display-asleep`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after runtime snapshot and provider-selection helper extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `desktop-display-asleep`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after renderer task-status helper extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `desktop-display-asleep`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after Browser Context reader extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `desktop-display-asleep`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after Background Agent settings response extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `desktop-display-asleep`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after renderer settings state extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `desktop-display-asleep`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after pet drag state helper extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `desktop-display-asleep`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after task-event transition helper extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `desktop-display-asleep`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after pet-click panel transition helper extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The output-free dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `desktop-display-asleep`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after renderer command transition and settings option-table extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed. The no-output-path dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `desktop-display-asleep`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.
- 2026-07-07: after renderer desktop API fallback extraction, full gates passed with `git diff --check`, `npm run typecheck -- --pretty false`, `env -u TMUX npx vitest run --reporter=dot`, and `npm run build`. `env -u TMUX npm run smoke:cli:basic -- --require-passed` passed on rerun. The no-output-path dashboard smoke remained typed-blocked by current desktop/Chrome state: `screen-recording-missing`, `accessibility-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `desktop-display-asleep`, `finder-automation-unknown`, `chrome-native-host-missing`, `chrome-extension-not-connected`, and `release-artifact-older-than-head`; Knowledge Graph evidence was skipped because no output path was provided.

- [ ] **Run full gates**

```bash
git diff --check
npm run typecheck -- --pretty false
env -u TMUX npx vitest run --reporter=dot
npm run build
```

- [ ] **Run changed-surface smoke output-free**

```bash
env -u TMUX npm run smoke:cli:basic -- --require-passed
npm run smoke:dashboard
```

If a smoke is blocked by macOS, Chrome, or local desktop state, record the typed blocker and rerun command. Do not create `.skfiy-smoke/` output unless release, dogfood, or debugging requires a persisted artifact.

## Dogfood And Release Workflow Notes

Dogfood assignment packets remain non-mutating by default:

```bash
npm run dogfood:assignments -- \
  --output .skfiy-dogfood/assignments/ \
  --json-output .skfiy-dogfood/assignments/
```

Assignment and report flows must still check App Bundle Preflight, `codesign --verify --deep --strict`, `designated => identifier "com.sskift.skfiy"`, Desktop Session Preflight, Permission Preflight, Evidence Preview Gate, `reportPreviewEligibility.eligible=true`, UI pet drag evidence, panic stop evidence, `runtimeStatus.stopTurnHotkey`, `--require-passed`, GitHub issue comment, and `--execute` before mutating remote state.

Panic stop behavior remains part of product acceptance: `stopTurnBehavior` must surface `Task stopped`.

## Residual Risks

- macOS can block product-path smoke through Screen Recording, Accessibility, Finder Automation, a locked desktop session, display sleep, or browser extension authorization.
- Branded Google Chrome can block automated unpacked-extension loading. Use Chromium or Chrome for Testing for automated proof and keep branded Chrome proof manual when needed.
- Background Agent CLI providers are intentionally bounded and non-interactive. They must not bypass the Computer Use approval and policy layer.
- Generic visible-app fallback remains out of product scope until it has an explicit adapter contract and real smoke result.

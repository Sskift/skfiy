# skfiy Code Health Cleanup Plan

> **For agentic workers:** This is the single active plan as of 2026-07-07. The previous long-form implementation log, including the 2026-06-23 browser/dashboard plan, was retired because the pet, Background Agent, Browser Context, Dashboard, personalization, and validation milestones are already complete. New work should be small, code-health focused, and verified through behavior tests rather than source-string assertions.

## Current Baseline

- skfiy is an agent-first macOS Computer Use runtime with a pixel desktop pet, packaged CLI, local Dashboard, Chrome extension bridge, and app adapters for local experiments.
- Computer Use is a tool capability the selected Background Agent can request. It is not a separate chat mode and it must stay inside skfiy's policy, approval, replay, Screen Recording, Accessibility, Finder Automation, and browser-permission gates.
- Background Agent provider selection is separate from Computer Use Planner selection. Current providers are Codex (`codex`), Claude Code (`claude-code`), and bounded Hermes (`hermes`).
- Hermes remains a bounded chat backend only. Do not use Hermes `--oneshot`, `--yolo`, or any raw full-tool loop from pet chat.
- Browser Context enters provider prompts only through the explicit Chrome extension pageControl bridge and bounded prompt blocks. Chrome host policy and optional Chrome permissions remain explicit.
- Dashboard is the operator surface for provider readiness, Browser Context, Computer Use state, current turn, replay, memory, sessions, prompt stack, and dogfood/release state.
- Default smoke runs are output-free. Use `.skfiy-smoke/` artifacts only for explicit release, dogfood, or debugging evidence capture.
- 2026-07-07 cleanup removed stale smoke artifact defaults, low-value smoke source-string tests, duplicated record helpers, and temporary smoke directories.

## Active Scope

This plan is not a feature expansion plan. The next work is project slimming:

- reduce oversized orchestration files,
- remove duplicated or low-value tests,
- extract pure logic from broad integration files,
- keep product behavior, UI copy, preload APIs, Chrome permissions, and provider boundaries stable.

## Next Work Order

1. Finish Task 1 by separating the remaining command dispatch and side-effect orchestration in `src/main/cli-command-surface.ts`.
2. Do Task 2 only after the CLI surface is smaller: consolidate repeated fixtures in `src/main/chrome-extension-background.test.js`, then delete tests that only restate listener registration or implementation order.
3. Do Task 3 after the test diet: extract pure renderer state transitions from `src/renderer/App.tsx` and pure main-process mapping helpers from `src/main/main.ts`, without changing UI behavior or preload APIs.
4. Run Task 4 gates after one or more cleanup commits land, keeping smoke defaults output-free unless release, dogfood, or debugging evidence is explicitly requested.

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
- Do not keep old long-form plans in `docs/superpowers/plans/`; this directory must contain exactly one active plan. Do not restore the retired 2026-06-23 plan.
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

- [ ] **Map responsibilities**

Classify the remaining blocks in `src/main/cli-command-surface.ts` into command dispatch, pure status assembly, provider/browser/dashboard formatting, smoke command orchestration, and direct process side effects. Do not move behavior while mapping.

- [ ] **Extract pure status and output assembly**

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

- [ ] **Consolidate fixtures**

Merge repeated Chrome API, tab, permission, and native-message setup into a tiny helper. Keep it local to the test file unless a separate helper clearly removes substantial duplication.

- [ ] **Delete low-value coverage**

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

- [ ] **Extract renderer state reducers**

Move pure task, panel, settings, and transient-status transitions out of `src/renderer/App.tsx`. Keep markup, labels, controls, keyboard behavior, pointer behavior, and visual layout unchanged.

- [ ] **Extract main-process mapping helpers**

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

# skfiy Agent and Computer Use Implementation Plan

Updated: 2026-06-22

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for independent implementation slices or `superpowers:executing-plans` for a single sequential pass. Work through the checkbox sections below and update tests in the same change as product behavior.

## Goal

Build skfiy as an agent-first desktop companion. The visible pet is a small always-available affordance; the real product is a background agent that can understand the user's request, choose an Agent provider, ask for clarification when needed, and invoke Computer Use tools for authorized desktop or browser work.

Computer Use is a tool capability, not a competing mode. The user should not have to switch between "agent" and "Computer Use". The agent owns the turn, and the tool router exposes observation, action, verification, approval, panic stop, and replay events.

## Product Boundaries

- skfiy does not own input capture, dictation, transcript collection, or third-party input-method integration.
- skfiy can work with text produced elsewhere, but the product surface is an assistant turn, not an input-method wrapper.
- Normal usage must run from the packaged `dist/skfiy.app` and `dist/skfiy` binary. A tmux session or dev server can be used for development, but must not be required for the product path.
- Desktop control requires explicit Accessibility and Screen Recording permission. The default test build may bypass per-turn approval, but permission state and action evidence must remain visible.
- Browser automation is developed and dogfooded in Chromium so the user's main Chrome profile is not disrupted.
- All plan work should converge here. `docs/superpowers/plans/` must stay empty unless a short-lived executable handoff is actively being run, and it should be folded back into this plan when the slice lands.

## Current Architecture

- Pet surface: `src/renderer/App.tsx`, `src/renderer/styles.css`, `src/renderer/pet-atlas.ts`, and `src/main/pet-skin.ts`.
- Main process: `src/main/main.ts`, `src/main/assistant-agent.ts`, `src/main/assistant-chat.ts`, `src/main/task-routing.ts`, `src/main/approval-bypass.ts`, and provider settings.
- Computer Use: `src/main/computer-use/*`, desktop helper bridge, app capability registry, smoke scripts, and screenshot/action evidence.
- Browser bridge: `chrome-extension/*`, `src/main/chrome-native-host.ts`, `src/main/chrome-extension-page-control.ts`, and Chromium smoke scripts.
- Dashboard: `dashboard.html`, `src/dashboard/*`, `src/main/dashboard-server.ts`, `src/main/dashboard-data.ts`, and dashboard smoke gates.
- Release and dogfood: `scripts/package-macos-app.mjs`, alpha publishing scripts, dogfood cohort scripts, release evidence, and money-run supervision smoke.

## Two-week-plus Outcome

By the end of this plan, skfiy should be usable as a packaged binary app for real local tasks:

- The pet starts from `dist/skfiy.app`, can be moved, can start an assistant turn, and no longer exposes obsolete audio or input-method product language.
- The dashboard is user-facing, polished, and useful for configuration, status, and replay without looking like a developer dump.
- Agent provider configuration supports local, Codex, and Claude Code, with readiness and connection health surfaced in the dashboard.
- The agent can call Computer Use for desktop and browser actions with evented evidence and stop behavior.
- Chromium extension control can observe, click, type, reload, and report permission or host issues without using the user's daily Chrome window.
- The binary and CLI expose status, doctor, dashboard, permission, Chrome, smoke, release, and dogfood commands.
- After a releasable build passes local smokes, skfiy is used to supervise the `money-run` tmux session as a long-horizon real-world task with read-only probes and explicit approval for any mutation.

## Workstream A: Dashboard UX

Goal: replace the current developer-oriented dashboard with a user dashboard inspired by Codebase/X, OpenClaw, Cube20, and HeroUI patterns.

Files:

- `src/dashboard/DashboardApp.tsx`
- `src/dashboard/styles.css`
- `src/dashboard/model.ts`
- `src/dashboard/contracts.ts`
- `src/main/dashboard-data.ts`
- `src/main/dashboard-server.ts`
- `scripts/smoke-dashboard-plan.mjs`
- `scripts/smoke-dashboard-product.mjs`

Tasks:

- [ ] Redesign the first screen around user jobs: agent status, current turn, provider health, Computer Use readiness, browser bridge, app permissions, and recent replays.
- [ ] Use HeroUI-style primitives: tabs, chips, segmented controls, tables, status badges, compact cards for repeated items, and clear empty states.
- [ ] Move heavy configuration from the pet right-click menu into dashboard settings.
- [ ] Add a provider settings page with connection state, selected provider, model or command configuration, timeout, and last health check.
- [ ] Add a Computer Use page with permission state, last screenshot, last action, stop state, app coverage, and smoke evidence.
- [ ] Add a Browser page for Chromium/native-host status, extension ID `plcpkkhlcacihjfohlojdknnkademlno`, current tab target, permission blockers, and reload health.
- [ ] Add a Dogfood page for current alpha evidence, tester readiness, smoke artifacts, and money-run supervision status.
- [ ] Keep developer logs available behind an advanced tab, not as the default dashboard experience.

Acceptance:

- `npm run smoke:dashboard -- --app dist/skfiy.app --require-passed --output .skfiy-smoke/dashboard-current.json` passes from the packaged app.
- A user can answer "can skfiy control my desktop/browser right now?" within one screen.
- Dashboard does not mention obsolete audio or input-method product paths.

Focused tests:

- `npx vitest run src/dashboard/DashboardApp.test.tsx src/main/dashboard-data.test.ts src/main/dashboard-server.test.ts src/main/dashboard-status.test.ts --reporter=dot`

## Workstream B: Agent Provider Foundation

Goal: make the agent layer an explicit product primitive. Codex and Claude Code should be supported providers, not hard-coded assumptions.

Files:

- `src/main/assistant-agent.ts`
- `src/main/assistant-chat.ts`
- `src/main/planner-provider-settings.ts`
- `src/main/task-routing.ts`
- `src/main/dashboard-data.ts`
- `src/renderer/App.tsx`
- `src/main/preload.cts`

Tasks:

- [ ] Define a stable Agent provider contract: `id`, `label`, `status`, `capabilities`, `configure`, `healthCheck`, `startTurn`, `cancelTurn`, and `toolCall`.
- [ ] Support local fallback, Codex, and Claude Code providers behind the same contract.
- [ ] Persist provider configuration in a small settings store and surface it in the dashboard.
- [ ] Show connection health and last error in dashboard and pet status.
- [ ] Route every user request into an assistant turn first. Computer Use is invoked only as an agent tool call.
- [ ] Preserve `stopTurnBehavior` so panic stop cancels the turn, stops queued tool calls, and surfaces `Task stopped`.
- [ ] Add structured turn logs: user request, selected provider, planned tool calls, approvals, desktop/browser observations, action results, verification, and final response.
- [ ] Make default local test mode bypass per-turn permission prompts while retaining global macOS permission checks.

Acceptance:

- A typed "hello" stays inside the agent and does not open Ghostty unless the agent intentionally calls a desktop tool.
- Provider status is visible in dashboard and pet state.
- Codex and Claude Code can be configured without changing Computer Use routing code.

Focused tests:

- `npx vitest run src/main/assistant-agent.test.ts src/main/assistant-chat.test.ts src/main/planner-provider-settings.test.ts src/main/task-routing.test.ts src/main/stop-turn-hotkey.test.ts --reporter=dot`

## Workstream C: Pet and Conversation Surface

Goal: keep the pet lightweight and delightful while making the interaction model clear.

Files:

- `src/renderer/App.tsx`
- `src/renderer/styles.css`
- `src/renderer/pet-atlas.ts`
- `src/main/pet-skin.ts`
- `src/main/main.ts`

Tasks:

- [ ] Left click opens or focuses the assistant conversation bubble.
- [ ] Right click opens a compact settings menu with status, dashboard, stop, and quit.
- [ ] Keep deep settings in dashboard, not in the pet menu.
- [ ] Keep the pet draggable across the full visible desktop without artificial top bounds.
- [ ] Make the hit area match the visible animated asset, not the old square source canvas.
- [ ] Keep idle animation and make shake/jitter optional through settings.
- [ ] Replace confusing UI labels with direct assistant states: idle, thinking, acting, waiting for approval, stopped, blocked.
- [ ] Make the bubble less boxy: anchored, compact, readable, and visually tied to the pet.

Acceptance:

- The pet can be dragged to the top, bottom, and sides of the screen.
- Clicking the pet does not show a command input-first UI; it starts an assistant conversation surface.
- `Task stopped` appears reliably after panic stop.

Focused tests:

- `npx vitest run src/renderer/App.test.tsx src/renderer/pet-atlas.test.ts src/main/approval-bypass*.test.ts --reporter=dot`

## Workstream D: Computer Use as Agent Tool

Goal: expand Computer Use from Ghostty examples into a general desktop-control capability that the agent can call.

Files:

- `src/main/computer-use/types.ts`
- `src/main/computer-use/desktop-helper.ts`
- `src/main/computer-use/app-capabilities.test.ts`
- `src/main/task-routing.ts`
- `src/shared/terminal-intent.ts`
- `src/main/orchestrator/ghostty-task.test.ts`
- smoke scripts for UI, Ghostty, Finder, Chrome, dashboard, and money-run

Tasks:

- [ ] Define a tool schema for observe, screenshot, click, type, keypress, app focus, menu action, drag, scroll, and verify.
- [ ] Keep the agent responsible for intent; app adapters provide capability hints and safer action primitives.
- [ ] Add a frontmost-app fallback path for apps without adapters.
- [ ] Keep Ghostty as one adapter, not the center of the architecture.
- [ ] Add Finder coverage for file selection, item movement, drag/drop, and confirmation.
- [ ] Add Chromium coverage through the browser bridge first, then fallback desktop actions.
- [ ] Store action evidence with screenshot before/after, target bounds, app name, result, confidence, and recovery suggestion.
- [ ] Add replay entries to dashboard so a user can see what skfiy did.
- [ ] Add policy gates for destructive actions, credential fields, payment/financial workflows, and external message sending.

Acceptance:

- A generic app request is routed to the agent, then to Computer Use if needed.
- The system can control Ghostty, Finder, and Chromium in packaged smoke tests.
- The dashboard shows Computer Use as an agent tool, not as a separate user mode.

Focused tests:

- `npx vitest run src/main/computer-use/desktop-helper.test.ts src/main/computer-use/app-capabilities.test.ts src/main/task-routing.test.ts src/shared/terminal-intent.test.ts --reporter=dot`
- `npm run smoke:ui -- --app dist/skfiy.app --require-passed --output .skfiy-smoke/ui-current.json`
- `npm run smoke:ghostty -- --app dist/skfiy.app --matrix --require-passed --output .skfiy-smoke/ghostty-current.json`
- `npm run smoke:finder -- --app dist/skfiy.app --item-drag-drop --require-passed --output .skfiy-smoke/finder-current.json`

## Workstream E: Chromium and Chrome Extension Control

Goal: make browser control reliable enough for skfiy to test and improve its own dashboard while using Chromium as the default controlled browser.

Files:

- `chrome-extension/manifest.json`
- `chrome-extension/background.js`
- `chrome-extension/content-script.js`
- `chrome-extension/popup.js`
- `src/main/chrome-native-host.ts`
- `src/main/chrome-extension-page-control.ts`
- `src/main/chrome-extension-reloader.ts`
- `docs/chrome-extension-setup.md`
- `scripts/smoke-chrome-plan.mjs`
- `scripts/smoke-chrome-product.mjs`

Tasks:

- [ ] Keep the extension Manifest V3 permissions minimal and explicit: active tab control, host permissions, native messaging, and scripted page interaction.
- [ ] Support Chromium as the default target app for development and smoke runs.
- [ ] Surface whether all-site access is granted and whether the native host is connected.
- [ ] Implement page observation, clickable element extraction, click, type, scroll, keyboard, reload, navigation, and screenshot hooks.
- [ ] Let skfiy refresh the unpacked extension from the extension page when permissions allow.
- [ ] Avoid stealing focus from the user's daily Chrome profile during dogfood.
- [ ] Record bridge status in dashboard and release evidence.

Acceptance:

- The extension has no visible error on `chrome://extensions/`.
- skfiy can control a dashboard tab in Chromium without taking over the user's main Chrome.
- The extension reload path is tested manually during development and represented in smoke evidence.

Focused tests:

- `npx vitest run src/main/chrome-extension-*.test.ts src/main/chrome-native-host.test.ts src/main/chrome-smoke-script.test.ts --reporter=dot`
- `npm run smoke:chrome -- --app dist/skfiy.app --require-passed --output .skfiy-smoke/chrome-current.json`

## Workstream F: Binary, CLI, and Release Path

Goal: ensure skfiy is a real app and command-line tool, not a tmux-backed dev process.

Files:

- `package.json`
- `scripts/package-macos-app.mjs`
- `scripts/create-alpha-artifact.mjs`
- `scripts/publish-alpha-github-release.mjs`
- `src/main/cli-command-surface.ts`
- `docs/internal-alpha-build.md`
- `docs/development-workflow.md`

Tasks:

- [ ] Build `dist/skfiy.app` and `dist/skfiy` in `npm run build`.
- [ ] Keep CLI commands for `status`, `doctor`, `dashboard`, `permissions`, `chrome`, `smoke`, `release`, and `dogfood`.
- [ ] Make `skfiy status` show app version, bundle path, provider status, permission state, browser bridge, and last smoke summary.
- [ ] Make `skfiy doctor` explain missing Accessibility, Screen Recording, native host, extension, or provider config.
- [ ] Keep release evidence in `docs/release-evidence/latest-alpha.json`.
- [ ] Keep app packaging free of obsolete audio permission keys.
- [ ] Keep release scripts deterministic and usable without a dev server.

Acceptance:

- `npm run build` produces `dist/skfiy.app` and `dist/skfiy`.
- `dist/skfiy` can inspect the packaged app and dashboard state.
- Release evidence points to the current alpha artifact and smoke outputs.

Focused tests:

- `npx vitest run src/main/electron-build.test.ts src/main/cli-command-surface.test.ts src/main/mac-release-script.test.ts src/main/alpha-artifact.test.ts src/main/alpha-github-release.test.ts --reporter=dot`
- `npm run build`

## Workstream G: Real Scenario Dogfood and Long-horizon Supervision

Goal: prove skfiy can run in real desktop conditions, not only in unit tests.

Files:

- `scripts/desktop-session-preflight.mjs`
- `scripts/run-dogfood-tester.mjs`
- `scripts/dogfood-status.mjs`
- `scripts/create-dogfood-*.mjs`
- `scripts/verify-dogfood-*.mjs`
- `scripts/sync-dogfood-tracking-issue.mjs`
- `docs/internal-alpha-build.md`
- `.github/ISSUE_TEMPLATE/skfiy-dogfood.yml`

Tasks:

- [ ] Keep screen awake during long tests with `caffeinate -dimsu` and stop that process after the run.
- [ ] Run packaged UI, Ghostty, Finder, Chromium, dashboard, and money-run smokes before claiming readiness.
- [ ] Use real macOS permission state, not mocked permission state, for product smoke gates.
- [ ] Keep dogfood reports centered on real tester workflows: coding terminal, screenshot inspection, Finder file work, browser fallback, panic stop, and long-horizon supervision.
- [ ] After a releasable build is available, use skfiy to supervise tmux session `money-run` through read-only probes first.
- [ ] Require explicit approval before skfiy mutates `money-run` state.
- [ ] Store money-run supervision evidence in smoke artifacts and dashboard.

Acceptance:

- `npm run dogfood:status` reports readiness from packaged evidence.
- `npm run smoke:money-run -- --app dist/skfiy.app --session money-run --require-passed --output .skfiy-smoke/money-run-current.json` passes before release handoff.
- The user can inspect dashboard replay and understand what skfiy observed or did.

Focused tests:

- `npx vitest run src/main/dogfood-*.test.ts src/main/desktop-session-preflight.test.ts src/main/smoke-process-matching.test.ts --reporter=dot`

## Workstream H: Documentation and Plan Hygiene

Goal: keep repository direction clear and prevent stale plan files from competing with the current product direction.

Files:

- `README.md`
- `docs/README.md`
- `docs/development-workflow.md`
- `docs/internal-alpha-build.md`
- `docs/chrome-extension-setup.md`
- `docs/research/2026-06-22-agent-computer-use-long-plan.md`
- `src/main/plan-doc-status.test.ts`

Tasks:

- [ ] Treat this file as the single active long plan.
- [ ] Keep old dated plans deleted once folded into this file.
- [ ] Keep `docs/superpowers/plans/` empty unless a temporary executable handoff is actively in progress.
- [ ] Update README with current app description, binary/CLI path, dashboard, extension, and dogfood commands.
- [ ] Keep Chrome extension setup focused on Chromium plus optional Chrome.
- [ ] Keep docs clear that skfiy has no owned audio capture or input-method integration.
- [ ] Add or update tests whenever docs promise a product behavior.

Acceptance:

- `npx vitest run src/main/plan-doc-status.test.ts --reporter=dot` passes.
- Repository search finds no active references to deleted plan filenames.
- Production docs point to this plan for future direction.

## Priority Order

P0:

- Agent provider foundation, Computer Use as agent tool, packaged app/binary path, Chromium extension stability, and pet conversation behavior.

P1:

- Dashboard redesign, replay polish, Finder and arbitrary-app expansion, CLI doctor coverage, and dogfood evidence quality.

P2:

- Advanced browser self-iteration, richer app adapters, release signing/notarization, custom pet skins, and marketplace-ready extension packaging.

## Verification Matrix

Run the narrow command for the touched workstream, then run the broad checks before declaring a milestone ready:

```bash
npm run typecheck -- --pretty false
npx vitest run --reporter=dot
swift build --package-path macos-helper
npm run build
```

For packaged product readiness:

```bash
npm run smoke:ui -- --app dist/skfiy.app --require-passed --output .skfiy-smoke/ui-current.json
npm run smoke:ghostty -- --app dist/skfiy.app --matrix --require-passed --output .skfiy-smoke/ghostty-current.json
npm run smoke:chrome -- --app dist/skfiy.app --require-passed --output .skfiy-smoke/chrome-current.json
npm run smoke:finder -- --app dist/skfiy.app --item-drag-drop --require-passed --output .skfiy-smoke/finder-current.json
npm run smoke:dashboard -- --app dist/skfiy.app --require-passed --output .skfiy-smoke/dashboard-current.json
npm run smoke:money-run -- --app dist/skfiy.app --session money-run --require-passed --output .skfiy-smoke/money-run-current.json
```

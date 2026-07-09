# skfiy Product Readiness Matrix

Updated: 2026-07-09

This document is the supervisor-facing readiness reference for the active agent
and Computer Use work. It does not replace
`docs/superpowers/plans/2026-07-07-code-health-cleanup.md`; the active plan now
tracks current feature enrichment, while this matrix keeps grouped ownership,
QA/SRE gates, and real-scenario acceptance rules.

## Supervisor Workflow

1. Keep work grouped by independent product lines:
   - Agent and routing
   - Dashboard and settings
   - Computer Use adapters
   - Browser bridge
   - Binary, release, dogfood, and SRE
   - Product boundary and capability matrix
2. Use subagents for independent audit or implementation slices with disjoint
   write ownership.
3. The supervisor reviews every subagent result for:
   - product-boundary fit
   - changed files and conflict risk
   - focused test evidence
   - real-scenario evidence or a recorded manual-authorization skip
4. Do not mark a feature ready because unit tests pass alone. A feature is ready
   only when its product-path smoke or equivalent real scenario is either
   passing or explicitly blocked by a manual macOS authorization/preflight state.
5. Keep exactly one active plan under `docs/superpowers/plans/`. Keep
   `docs/decisions/` limited to ADR context; fold operational steps into the
   active plan or canonical docs so stale local reports do not compete with
   current direction. Do not keep retired implementation plans in archive or
   parking folders.

## Product Boundary

skfiy is an agent-first macOS Computer Use runtime. The pet opens the assistant
turn; Computer Use is a permissioned tool layer the agent can call.

In scope:

- Text-based assistant turns.
- Local fallback, Codex, and Claude Code style provider configuration.
- Permissioned desktop observation and action through the packaged app.
- Ghostty, Chromium/Chrome, Finder, screenshot, replay, approval, stop, and
  verification evidence.
- Local dashboard for status, settings, readiness, replay, and dogfood state.

Out of scope:

- Owned audio capture.
- Dictation.
- Speech recognition providers.
- Input-method integration.
- Hidden desktop mutation without visible approval/risk evidence.
- Product claims that require `npm start`, Vite, tmux, or helper-only paths.
- Generic visible-app fallback is not a product route. Unknown or unsupported
  app requests must clarify instead of using shared Computer Use primitives.
  Shared action-runner and app-capabilities are internal building blocks, not
  evidence that arbitrary visible apps are supported.

Manual blocker policy:

- Skip and record when macOS requires Screen Recording, Accessibility, Finder
  Automation, an unlocked desktop session, or browser extension authorization.
- Do not replace skipped real evidence with dev-server or helper-only evidence.
- Rerun the same smoke after authorization is available.

## Capability Matrix

| Capability | Expected behavior | Boundary | Evidence |
| --- | --- | --- | --- |
| Agent-first assistant turn | User input enters an assistant turn first. The agent may answer, clarify, refuse, request confirmation, or call Computer Use. | Computer Use is not a separate user mode. CLI providers must not directly execute desktop actions from pet chat. | `src/main/assistant-agent.test.ts`, `src/main/assistant-chat.test.ts`, `src/main/task-routing.test.ts`. |
| External text input | skfiy can process text produced elsewhere as a normal assistant turn. | skfiy does not own audio capture, dictation, speech recognition, transcript collection, or input-method wrapping. | Boundary `rg` over README, docs, and source. |
| Desktop Computer Use | Observe supported app fixtures, capture screenshots, activate supported apps, click, type, drag, scroll, press keys, wait, and verify with replay evidence. | No permission means no desktop control. The helper must not silently send screenshots or command output to remote services. Shared Computer Use primitives are not product routes by themselves. | `src/main/computer-use/*` tests and packaged UI/Ghostty/Finder smokes. |
| Permission and session gate | Screen Recording gates screenshots; Accessibility gates activation, pointer, and keyboard actions; loginwindow or sleeping display blocks control. | Approval bypass never bypasses macOS TCC. Finder Automation and browser permissions are separate integration gates. | `src/main/computer-use/app-capabilities.test.ts`, `npm run smoke:desktop-session`. |
| Ghostty, Chromium, and Finder fixtures | These are the first real regression targets. Ghostty handles terminal turns, Chromium/Chrome handles browser bridge turns, Finder handles file organization and drag/drop. | Ghostty is not the architecture center. Generic visible-app fallback is not a product route until it has an explicit adapter contract and real smoke evidence. | Focused adapter tests plus `smoke:ghostty`, `smoke:chrome`, and `smoke:finder`. |
| Browser bridge | Chromium/Chrome bridge provides DOM/current-tab observation, page actions, native-host heartbeat, host policy, and screenshot fallback. | Browser bridge is not a substitute for Screen Recording/Accessibility. Default dogfood should avoid the user's daily Chrome profile. | Chrome extension/native host tests and `smoke:chrome`. |
| Approval and risk | Read-only actions can proceed; local mutation requires approval; destructive, privileged, installer-pipe, credential, payment, or external-message workflows require stronger gates or refusal. | Dogfood bypass is for reducing test friction only; strict/ask mode is required when validating safety behavior. | Risk-policy and orchestrator tests, plus approval evidence in smoke artifacts. |
| Stop and replay | Escape/global stop cancels the current turn where possible, shows `Task stopped.`, and preserves replay/current-turn evidence. | Stop is not an undo mechanism for already executed external side effects. Replay is audit evidence, not continuous screen recording. | Stop-hotkey, runtime snapshot, UI smoke, and dashboard evidence. |
| money-run supervision | Long-horizon supervision uses read-only tmux probes and explicit approval before mutation. | skfiy product path must not depend on tmux. Direct tmux mode is diagnostic only. | `smoke:money-run` and dashboard/dogfood status evidence. |

## Workstream Matrix

| Workstream | Expected capability | Current evidence to inspect | Real acceptance |
| --- | --- | --- | --- |
| Agent and routing | Every user request enters an assistant turn; the agent can answer, clarify, refuse, request confirmation, or call Computer Use tools. | `src/main/assistant-agent.ts`, `src/main/task-routing.ts`, `src/main/main.ts`, focused agent/routing tests. | Chat request stays in agent; Ghostty/Chrome/Finder requests produce structured turn/tool evidence; stop cancels queued work. |
| Dashboard and settings | Dashboard answers whether skfiy can control desktop/browser now and exposes provider, permission, current turn, replay, dogfood, and bridge health. | `src/dashboard/*`, `src/main/dashboard-server.ts`, `src/main/dashboard-data.ts`, dashboard tests. | `npm run smoke:dashboard -- --cli dist/skfiy --require-passed`. |
| Computer Use adapters | Agent tool layer can observe, act, verify, stop, and replay for supported Ghostty, Finder, and Chromium/Chrome routes. | `src/main/computer-use/*`, `src/main/task-routing.ts`, adapter tests, smoke artifacts. | UI, Ghostty, Finder, and Chrome packaged smokes pass or are blocked only by manual macOS/browser authorization. |
| Browser bridge | Chromium extension and native host can observe, navigate, click, type, scroll, reload, and report permission/host failures. | `chrome-extension/*`, `src/main/chrome-native-host.ts`, `src/main/chrome-extension-page-control.ts`, Chrome tests. | `npm run smoke:chrome -- --app dist/skfiy.app --require-passed`. |
| Release and dogfood SRE | Build, smoke, alpha artifact, issue body, dogfood report, cohort, and status gates all reference the same commit and artifacts. | `package.json`, `scripts/create-alpha-artifact.mjs`, `scripts/dogfood-status.mjs`, generated local release evidence when a release/dogfood run is active. | Build passes; required smoke artifacts match current commit; alpha artifact and dogfood status do not point to stale evidence. |
| Product boundary | Docs, tests, UI, and templates do not reintroduce obsolete audio/dictation/input-method product paths. | README, canonical docs, issue templates, package scripts, negative tests. | Boundary `rg` is manually reviewed; allowed hits are boundary docs, negative tests, Chrome's `Google Network Speech` diagnostic name, packaging removal of old macOS permission keys, and turn replay transcript context. |

## Readiness Acceptance

Use the active plan for task order. Use this matrix only to decide whether a
workstream is ready to claim:

- Agent and routing readiness requires distinct terminal states across route
  selection, replay, dashboard, preload, CLI evidence, and pet UI.
- Dashboard readiness requires the React operator surface and fallback server
  shell to agree on local API behavior without exposing provider secrets.
- Computer Use adapter readiness requires a supported route, safety/status
  model, focused tests, and packaged-app smoke evidence or a typed local
  authorization blocker.
- Browser bridge readiness requires Chrome extension pageControl, native-host
  heartbeat, host policy, and current-tab context to stay bounded by explicit
  bridge permissions.
- Release and dogfood readiness requires build output, alpha metadata, dogfood
  status, and smoke evidence to point at the same source commit.
- Product-boundary readiness requires docs and tests to avoid obsolete
  audio/dictation/input-method claims and to keep generic visible-app control
  unsupported until a real adapter contract exists.

## Release Evidence Policy

Release/dogfood flows may generate `docs/release-evidence/latest-alpha.json` as
a local pointer for dashboard and dogfood readiness checks. It is runtime
evidence for the active release, not a durable planning doc. Keep stale pointers
out of git; regenerate or refresh them only while preparing an explicit release
or dogfood handoff.

When preparing release or dogfood evidence, use commit-scoped artifact paths and
record exact typed blockers such as `screen-recording-missing`,
`accessibility-missing`, `desktop-session-loginwindow`, or
`chrome-extension-not-connected`. For normal development, keep smoke runs
output-free.

## Default QA Gate

Run this gate before accepting an integration batch:

```bash
git diff --check
npm run typecheck -- --pretty false
npx vitest run --reporter=dot
npm run build
```

Add focused tests for the touched workstream before the full gate. For default
development verification, run packaged smokes without `--output`:

```bash
npm run smoke:ui -- --app dist/skfiy.app --require-passed
npm run smoke:ghostty -- --app dist/skfiy.app --matrix --require-passed
npm run smoke:chrome -- --app dist/skfiy.app --extension-chrome-app "Chromium" --extension-id <id> --require-passed
npm run smoke:finder -- --app dist/skfiy.app --item-drag-drop --require-passed
npm run smoke:dashboard -- --cli dist/skfiy --extension-chrome-app "Chromium" --extension-id <id> --require-passed
npm run smoke:money-run -- --app dist/skfiy.app --session money-run --require-passed
```

Add commit-scoped output paths only for explicit release, dogfood, or debugging
evidence capture. If a smoke is skipped for manual authorization, record the
exact typed blocker in the release or dogfood status output.

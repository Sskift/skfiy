# skfiy Product Readiness Matrix

Updated: 2026-06-22
Cleanup baseline commit: `d9b6c71`

This document is the supervisor-facing convergence checklist for the active
agent and Computer Use work. It does not replace
`docs/research/2026-06-22-agent-computer-use-long-plan.md`; it turns that plan
into grouped ownership, QA/SRE gates, and real-scenario acceptance evidence.

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
5. Keep `docs/superpowers/plans/` empty except for short-lived executable
   handoffs. Fold durable decisions back into the long plan or canonical docs.

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
| Desktop Computer Use | Observe visible apps, capture screenshots, activate apps, click, type, drag, scroll, press keys, wait, and verify with replay evidence. | No permission means no desktop control. The helper must not silently send screenshots or command output to remote services. | `src/main/computer-use/*` tests and packaged UI/Ghostty/Finder smokes. |
| Permission and session gate | Screen Recording gates screenshots; Accessibility gates activation, pointer, and keyboard actions; loginwindow or sleeping display blocks control. | Approval bypass never bypasses macOS TCC. Finder Automation and browser permissions are separate integration gates. | `src/main/computer-use/app-capabilities.test.ts`, `npm run smoke:desktop-session`. |
| Ghostty, Chromium, and Finder fixtures | These are the first real regression targets. Ghostty handles terminal turns, Chromium/Chrome handles browser bridge turns, Finder handles file organization and drag/drop. | Ghostty is not the architecture center. Generic app support is a direction/frontmost fallback, not a fully proven universal adapter claim. | Focused adapter tests plus `smoke:ghostty`, `smoke:chrome`, and `smoke:finder`. |
| Browser bridge | Chromium/Chrome bridge provides DOM/current-tab observation, page actions, native-host heartbeat, host policy, and screenshot fallback. | Browser bridge is not a substitute for Screen Recording/Accessibility. Default dogfood should avoid the user's daily Chrome profile. | Chrome extension/native host tests and `smoke:chrome`. |
| Approval and risk | Read-only actions can proceed; local mutation requires approval; destructive, privileged, installer-pipe, credential, payment, or external-message workflows require stronger gates or refusal. | Dogfood bypass is for reducing test friction only; strict/ask mode is required when validating safety behavior. | Risk-policy and orchestrator tests, plus approval evidence in smoke artifacts. |
| Stop and replay | Escape/global stop cancels the current turn where possible, shows `Task stopped.`, and preserves replay/current-turn evidence. | Stop is not an undo mechanism for already executed external side effects. Replay is audit evidence, not continuous screen recording. | Stop-hotkey, runtime snapshot, UI smoke, and dashboard evidence. |
| money-run supervision | Long-horizon supervision uses read-only tmux probes and explicit approval before mutation. | skfiy product path must not depend on tmux. Direct tmux mode is diagnostic only. | `smoke:money-run` and dashboard/dogfood status evidence. |

## Workstream Matrix

| Workstream | Expected capability | Current evidence to inspect | Real acceptance |
| --- | --- | --- | --- |
| Agent and routing | Every user request enters an assistant turn; the agent can answer, clarify, refuse, request confirmation, or call Computer Use tools. | `src/main/assistant-agent.ts`, `src/main/task-routing.ts`, `src/main/main.ts`, focused agent/routing tests. | Chat request stays in agent; Ghostty/Chrome/Finder requests produce structured turn/tool evidence; stop cancels queued work. |
| Dashboard and settings | Dashboard answers whether skfiy can control desktop/browser now and exposes provider, permission, current turn, replay, dogfood, and bridge health. | `src/dashboard/*`, `src/main/dashboard-server.ts`, `src/main/dashboard-data.ts`, dashboard tests. | `npm run smoke:dashboard -- --cli dist/skfiy --require-passed --output .skfiy-smoke/dashboard-<commit>.json`. |
| Computer Use adapters | Agent tool layer can observe, act, verify, stop, and replay for Ghostty, Finder, Chromium, and generic visible apps. | `src/main/computer-use/*`, `src/main/task-routing.ts`, adapter tests, smoke artifacts. | UI, Ghostty, Finder, and Chrome packaged smokes pass or are blocked only by manual macOS/browser authorization. |
| Browser bridge | Chromium extension and native host can observe, navigate, click, type, scroll, reload, and report permission/host failures. | `chrome-extension/*`, `src/main/chrome-native-host.ts`, `src/main/chrome-extension-page-control.ts`, Chrome tests. | `npm run smoke:chrome -- --app dist/skfiy.app --require-passed --output .skfiy-smoke/chrome-<commit>.json`. |
| Release and dogfood SRE | Build, smoke, alpha artifact, issue body, dogfood report, cohort, and status gates all reference the same commit and artifacts. | `package.json`, `scripts/create-alpha-artifact.mjs`, `scripts/dogfood-status.mjs`, `docs/release-evidence/latest-alpha.json`. | Build passes; required smoke artifacts match current commit; alpha artifact and dogfood status do not point to stale evidence. |
| Product boundary | Docs, tests, UI, and templates do not reintroduce obsolete audio/dictation/input-method product paths. | README, canonical docs, issue templates, package scripts, negative tests. | Boundary `rg` is manually reviewed; allowed hits are boundary docs, negative tests, Chrome's `Google Network Speech` diagnostic name, packaging removal of old macOS permission keys, and turn replay transcript context. |

## Audit Queue

These items are the current supervisor queue. A subagent audit can add items,
but implementation should stay in disjoint work packages.

## Current Cleanup Evidence

The cleanup batch moved release evidence from stale-only to verifier-checkable
local evidence, but it is not a published dogfood release yet.

- UI smoke is valid as `no-onboarding` when Screen Recording and Accessibility
  are already granted; it still proves pet drag, stop hotkey, and stop behavior.
- Chrome smoke passes through strict app-policy approval, CDP extraction,
  native-host heartbeat, installed-extension Native Messaging, and current-page
  evidence.
- Ghostty and Finder strict smokes are currently blocked by
  `frontmostBundleId=com.apple.loginwindow` plus sleeping display. The blocker
  artifacts are valid evidence, but not passed capability proof.
- money-run product-path smoke is not valid evidence yet. It timed out waiting
  for `approval_required` under the locked desktop session; keep it out of the
  alpha manifest until the product path passes.
- After this cleanup commit, regenerate the alpha artifact from the final HEAD
  before publishing or updating `docs/release-evidence/latest-alpha.json`.

| Priority | Workstream | Finding | First implementation package | Focused acceptance |
| --- | --- | --- | --- | --- |
| P0 | Agent and routing | Agent turns now emit provider/tool-plan evidence, but `main.ts` still ultimately owns direct Ghostty/Chrome/Finder execution. | Continue from the `assistant-tools` bridge into an agent-owned executor contract with cancellation, confirmation, and tool-result state. | Focused agent + orchestrator tests, then UI/Ghostty/Chrome/Finder packaged smokes when auth allows. |
| P0 | Dashboard and settings | Packaged dashboard serves the React dashboard first, but the richer controls still live mostly in the fallback inline dashboard. | Move provider/settings/readiness/dogfood controls into `src/dashboard/*` and keep fallback only as degraded mode. | `npx vitest run src/dashboard/DashboardApp.test.tsx src/main/dashboard-server.test.ts --reporter=dot` |
| P0 | Dashboard and settings | Real provider settings are exposed via `/api/provider-settings` but not folded into `/snapshot.json` or the React dashboard state model. | Add provider settings summary to dashboard snapshot and render selectable provider/readiness details in React dashboard. | `npx vitest run src/main/dashboard-data.test.ts src/main/dashboard-server.test.ts src/dashboard/DashboardApp.test.tsx --reporter=dot` |
| P0 | Release and dogfood SRE | `docs/release-evidence/latest-alpha.json` still points to old published commit `2e292e9`; local alpha evidence can be regenerated for current HEAD, but is not published. | After the cleanup commit, regenerate current-head alpha evidence, run `dogfood:verify --require-current-head`, then publish/update latest-alpha only if release ownership accepts blocker artifacts. | `npm run dogfood:verify -- --manifest <current-alpha-manifest> --require-current-head` |
| P0 | Release and dogfood SRE | Current machine evidence proves Chrome and UI, but Ghostty/Finder are blocked by locked/asleep desktop and money-run product path is not valid. | Record blocker artifacts first, then rerun strict smokes after the Mac is unlocked/awake and money-run product-path approval reaches the renderer. | `npm run smoke:desktop-session -- --output .skfiy-smoke/desktop-session-<commit>.json` plus strict smoke reruns |
| P1 | Dashboard and settings | Chrome readiness is relatively complete, while Finder/Ghostty readiness are not first-class dashboard lanes. | Add readiness lane data and UI for Finder, Ghostty, and Chrome using existing smoke/runtime evidence. | `npx vitest run src/main/dashboard-data.test.ts src/main/dashboard-status.test.ts src/dashboard/DashboardApp.test.tsx --reporter=dot` |
| P1 | Agent and routing | Route states lack first-class `confirmation` and `denial`; app-policy denial is surfaced as generic failure. | Extend route/status contracts so clarification, confirmation, denial, blocked, and failure are distinct. | `npx vitest run src/main/task-routing.test.ts src/main/app-policy-settings.test.ts --reporter=dot` |
| P1 | Product boundary | “app-agnostic observe any visible app” can read as a full universal-app promise, while current real regression fixtures are Ghostty, Chromium/Chrome, and Finder. | Tighten docs so generic app support is described as capability direction/frontmost fallback, not a fully proven adapter set. | `npx vitest run src/main/plan-doc-status.test.ts --reporter=dot` plus boundary `rg` |
| P1 | Product boundary | `transcript` can mean turn replay or obsolete audio transcription. | Use “turn replay transcript” for replay evidence in product-facing docs and keep “audio transcription” out of product claims. Existing code identifiers may remain `transcript` when the surrounding type/module is explicitly turn replay. | Boundary `rg -n "audio|dictation|input-method|transcript-entry|smoke:voice|transcription|transcript" README.md docs src` |

## Default QA Gate

Run this gate before accepting an integration batch:

```bash
git diff --check
npm run typecheck -- --pretty false
npx vitest run --reporter=dot
npm run build
```

Add focused tests for the touched workstream before the full gate. Add packaged
smokes when product behavior or release evidence changes:

```bash
npm run smoke:ui -- --app dist/skfiy.app --require-passed --output .skfiy-smoke/ui-<commit>.json
npm run smoke:ghostty -- --app dist/skfiy.app --matrix --require-passed --output .skfiy-smoke/ghostty-<commit>.json
npm run smoke:chrome -- --app dist/skfiy.app --require-passed --output .skfiy-smoke/chrome-<commit>.json
npm run smoke:finder -- --app dist/skfiy.app --item-drag-drop --require-passed --output .skfiy-smoke/finder-<commit>.json
npm run smoke:dashboard -- --cli dist/skfiy --require-passed --output .skfiy-smoke/dashboard-<commit>.json
```

If a smoke is skipped for manual authorization, record the exact blocker,
artifact path if produced, and next rerun command in the handoff or dogfood
status output.

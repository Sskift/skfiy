# skfiy Product Readiness Matrix

Updated: 2026-06-26
Cleanup baseline commit: `d97f542`
Latest local alpha evidence recorded during the earlier cleanup: `7666314`

This document is the supervisor-facing convergence checklist for the active
agent and Computer Use work. It does not replace
`docs/superpowers/plans/2026-06-23-pet-agent-browser-dashboard.md`; it turns that plan
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
5. Keep exactly one active plan under `docs/superpowers/plans/`. Fold durable
   decisions back into that plan or canonical docs so stale handoffs do not
   compete with current direction.

## Product Boundary

skfiy is a local-first macOS desktop pet that fronts a Background Agent. The pet
opens the assistant turn; Computer Use is a permissioned tool layer the agent can
call after skfiy validates policy, permissions, risk, and approval.

In scope:

- Text-based assistant turns.
- Codex, Claude Code, and Hermes Background Agent provider configuration.
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
- Keep provider auth/quota failures, stale dashboard build identity, Chrome
  host-policy or optional-permission failures, and money-run inspection failures
  as typed blockers rather than folding them into generic readiness failures.

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
| Dashboard and settings | Dashboard answers whether skfiy can control desktop/browser now and exposes provider readiness, permission state, current turn, replay, dogfood, Browser Context, Computer Use tool status, monitor scheduler state, and dashboard build identity. | `src/dashboard/*`, `src/main/dashboard-server.ts`, `src/main/dashboard-data.ts`, dashboard tests. | `npm run smoke:dashboard -- --cli dist/skfiy --require-passed --output .skfiy-smoke/dashboard-<commit>.json`. |
| Computer Use adapters | Agent tool layer can observe, act, verify, stop, and replay for supported Ghostty, Finder, and Chromium/Chrome routes. | `src/main/computer-use/*`, `src/main/task-routing.ts`, adapter tests, smoke artifacts. | UI, Ghostty, Finder, and Chrome packaged smokes pass or are blocked only by manual macOS/browser authorization. |
| Browser bridge | Chromium extension and native host can observe, navigate, click, type, scroll, reload, and report permission/host failures. | `chrome-extension/*`, `src/main/chrome-native-host.ts`, `src/main/chrome-extension-page-control.ts`, Chrome tests. | `npm run smoke:chrome -- --app dist/skfiy.app --require-passed --output .skfiy-smoke/chrome-<commit>.json`. |
| Release and dogfood SRE | Build, smoke, alpha artifact, issue body, dogfood report, cohort, and status gates all reference the same commit and artifacts. | `package.json`, `scripts/create-alpha-artifact.mjs`, `scripts/dogfood-status.mjs`, `docs/release-evidence/latest-alpha.json`. | Build passes; required smoke artifacts match current commit; alpha artifact and dogfood status do not point to stale evidence. |
| Product boundary | Docs, tests, UI, and templates do not reintroduce obsolete audio/dictation/input-method product paths. | README, canonical docs, issue templates, package scripts, negative tests. | Boundary `rg` is manually reviewed; allowed hits are boundary docs, negative tests, Chrome's `Google Network Speech` diagnostic name, packaging removal of old macOS permission keys, and turn replay transcript context. |

## Audit Queue

These items are the current supervisor queue. A subagent audit can add items,
but implementation should stay in disjoint work packages.

## Current Branch Hardening Evidence

The cleanup batch moved release evidence from stale-only to verifier-checkable
local evidence, but it is not a published dogfood release yet. The current
`codex/agent-workbench-hardening` branch adds stricter runtime truthfulness on
top of that baseline.

- UI smoke is valid as `no-onboarding` when Screen Recording and Accessibility
  are already granted; it still proves pet drag, stop hotkey, and stop behavior.
- Chrome smoke passes through strict app-policy approval, CDP extraction,
  native-host heartbeat, installed-extension Native Messaging, and current-page
  evidence. The stricter installed-extension action smoke has now been run with
  Chromium extension id `plcpkkhlcacihjfohlojdknnkademlno`; the local artifact
  `.skfiy-smoke/chrome-extension-action-865e2e8.json` proves
  `installedExtensionActionRun.result: passed`, `classification: passed`,
  page-control readiness, and verified observe/screenshot/fill/click/submit/
  scroll actions on the authorized HTTP fixture.
- Ghostty ready-marker recovery has passed product-path smoke. Future Ghostty
  failures caused by `frontmostBundleId=com.apple.loginwindow` or display sleep
  remain desktop-session blockers, not adapter regressions.
- Finder Automation has passed with the compiled `skfiy.app` identity in
  `.skfiy-smoke/finder-automation-granted-passed.json`. Future Finder blockers
  must distinguish desktop preflight, TCC Screen Recording/Accessibility, and
  AppleEvents/Finder Automation.
- Dashboard runtime readiness now records a build identity. A reachable
  loopback dashboard with an older descriptor is
  `stale-dashboard-build-mismatch`, not ready.
- Background Agent readiness distinguishes executable discovery, version probe,
  bounded dry-run chat proof, and auth/quota/permission failure. Only dry-run
  chat proof is `chat-ready`.
- Automation monitor snapshots now separate the persisted monitor result from
  the app-process scheduler lifecycle. Dashboard API `run-now` is a read-only
  one-shot with `mutatesSession: false`; an inactive scheduler with a persisted
  `observing` result must display as scheduler-inactive instead of live
  observing.
- money-run supervision is still non-mutating. If pane output contains an error
  marker such as an `AttributeError`, status and Dashboard should report
  `money-run-needs-attention` with recommendation action `inspect_output`.
- Local alpha evidence was regenerated for `7666314` and passed
  `dogfood:verify --require-current-head` at that commit. It is not published
  dogfood evidence: `docs/release-evidence/latest-alpha.json` still points to
  `2e292e9`, the tracking issue input is missing, and broader release ownership
  has not accepted the current branch as publishable dogfood. Any later source
  commit must regenerate alpha evidence before publication.

## Subagent Convergence

Long-horizon subagent audits converged on the same boundary: the cleanup
baseline is usable as a development starting point, but the product is not
release-ready. The remaining blockers are split between manual desktop session
authorization, release evidence, and product design gaps.

- Agent and tool ownership: `src/main/assistant-computer-use-executor.ts` now
  defines an agent-owned Computer Use tool continuation contract and proves one
  `{turnId, toolCallId}` through approval, denial, bypass, cancellation,
  completion, replay, transcript, and runtime snapshot evidence. `main.ts` now
  stores pending approvals by that identity and resumes approval through the
  existing continuation instead of re-entering the command route. Main, preload,
  and renderer task status contracts now carry `planned`, `running`, `denied`,
  `blocked`, and `cancelled` without collapsing them into idle or failed UI.
- Dashboard parity: React now renders app readiness lanes for Chrome, Finder,
  and Ghostty, provider details, dogfood/release drift, replay state, and
  ignored unsupported smoke evidence. `smoke:dashboard` now requires React asset
  content markers for readiness and Chrome operator controls rather than
  accepting a bare shell. Chrome page actions and host-policy controls are now
  available in the React dashboard. Installed-extension execution with the real
  Chromium id now has a passed local action smoke; dashboard and Chrome smokes
  still both need to stay in the release gate so the operator surface and CLI
  proof cannot drift apart.
- Release SRE: `7666314` local alpha evidence is verifier-checkable with UI,
  Ghostty, Chrome, Finder, and dashboard artifacts for that commit, but
  `latest-alpha.json` remains the old published `2e292e9`. `dogfood:status`
  correctly emits `missing-tracking-issue` until a tracking issue/file is
  provided. After `7627010`, that `7666314` alpha is stale and any new app-code
  commit must regenerate alpha evidence before publication. Current-head status
  now emits the app-relevant changed files, commit-scoped smoke artifact paths,
  the rerun smoke commands, and the matching `alpha:artifact` command.
- Real Computer Use: pet drag/click/stop, Ghostty recovery, Chrome CDP/native
  host paths, Finder Automation, and automation-monitor observation have real
  evidence. Generic visible-app fallback remains product-design incomplete
  rather than a ready product route.

| Priority | Workstream | Finding | First implementation package | Focused acceptance |
| --- | --- | --- | --- | --- |
| P0 | Agent and routing | Runtime approval now preserves a single `{turnId, toolCallId}` through app-policy approval, orchestrator approval, denial, stop, bypass, completion, and replay evidence. Main/preload/renderer now share canonical `planned`, `running`, `denied`, `blocked`, `failed`, `cancelled`, and `completed` task states. | Keep route, replay, preload, renderer, and pet status contracts aligned as more terminal states are added. | `npx vitest run src/main/assistant-computer-use-executor.test.ts src/main/assistant-tools-main-wiring.test.ts src/main/approval-bypass-main-wiring.test.ts src/main/runtime-snapshot.test.ts src/main/computer-use/turn-replay-store.test.ts src/main/computer-use/turn-transcript.test.ts src/renderer/App.test.tsx src/main/task-status-contract.test.ts --reporter=dot` |
| P0 | Dashboard and settings | React now owns provider, Computer Use, Browser, Dogfood/release, replay, Chrome/Finder/Ghostty readiness, Chrome page action controls, Chrome host-policy controls, dashboard build identity, and automation monitor scheduler lifecycle. Provider settings expose Codex/Claude Code/Hermes readiness without leaking cwd/token-like paths, Computer Use Planner settings live under Agent tools as advanced tool-layer settings, and the overview leads with the operator workspace before the auxiliary evidence graph. Real Chromium extension id `plcpkkhlcacihjfohlojdknnkademlno` now proves installed-extension Native Messaging and page actions through a passed local action smoke. | Keep the installed-extension action smoke and dashboard smoke together in the release gate so the selected target tab, host-policy state, page actions, provider health, scheduler state, stale-dashboard detection, and operator surface all stay aligned. | `npx vitest run src/dashboard/DashboardApp.test.tsx src/main/dashboard-data.test.ts src/main/dashboard-server.test.ts src/main/dashboard-status.test.ts src/main/dashboard-evidence-summary.test.ts src/main/dashboard-smoke-script.test.ts --reporter=dot` and `npm run smoke:dashboard -- --cli dist/skfiy --extension-chrome-app "Chromium" --extension-id <id> --require-passed --output .skfiy-smoke/dashboard-<commit>.json` |
| P0 | Release and dogfood SRE | `docs/release-evidence/latest-alpha.json` still points to old published commit `2e292e9`; alpha evidence for `7666314` verifies locally, but any later source commit must regenerate it before publication. `dogfood:status` now turns stale app-code HEAD into machine-readable refresh commands instead of a vague handoff note. | Publish/update latest-alpha only if release ownership accepts the locked-desktop Ghostty/Finder blocker artifacts and a tracking issue/file is provided; otherwise rerun the status-emitted current-head smokes and then the emitted `alpha:artifact` command. | `npm run dogfood:verify -- --manifest <current-alpha-manifest> --require-current-head` plus `npx vitest run src/main/dogfood-status.test.ts --reporter=dot` |
| P0 | Release and dogfood SRE | Current machine evidence proves UI, Chrome paths, Ghostty recovery, Finder Automation, Dashboard, and automation-monitor observation. Remaining live blockers must stay typed: Browser Context may be blocked by host policy or Chrome optional permission, money-run may need output inspection, provider dry-run may be auth-blocked, and dashboard readiness may be stale-build blocked. | Record blocker artifacts first, then rerun strict smokes after the specific host policy, Chrome permission, provider auth, dashboard runtime, or monitored pane issue is resolved. | `npm run smoke:desktop-session -- --output .skfiy-smoke/desktop-session-<commit>.json` plus strict smoke reruns |
| P0 | Release and dogfood SRE | Dashboard and automation-monitor smokes are first-class alpha manifest/verifier/status/publish/prepare inputs, and `dogfood:status` can emit non-mutating blocker status with current-head refresh commands. Dashboard and automation-monitor artifacts exist locally, but release evidence must be regenerated after each source commit and accepted by release ownership before publication. | Keep regenerated alpha evidence local until release ownership accepts blockers and tracking issue state exists; regenerate after each source commit using commit-scoped smoke paths. | `npx vitest run src/main/alpha-artifact.test.ts src/main/alpha-github-release.test.ts src/main/dogfood-status.test.ts src/main/dogfood-verifier.test.ts src/main/alpha-dogfood-prepare.test.ts --reporter=dot` |
| P0 | Computer Use adapters | Generic visible-app fallback is not a product route; unknown app requests clarify instead of using shared Computer Use primitives. | Keep unsupported/generic visible-app detection returning `needs_clarification`; only Ghostty, Chrome/Chromium, Finder, and money-run supervision select product routes until a real adapter contract and smoke exist. | `npx vitest run src/main/task-routing.test.ts src/main/plan-doc-status.test.ts --reporter=dot` plus boundary `rg` |
| P0 | Computer Use adapters | Safety/status states are now less ambiguous in UI and replay, but route-level confirmation/denial semantics still need to remain distinct as more adapters are added. | Keep app-policy denial, user denial, blocked, confirmation, failure, cancellation, and completion distinct across adapter events, replay, dashboard, preload, and pet UI. | `npx vitest run src/main/task-routing.test.ts src/shared/risk-policy.test.ts src/main/task-status-contract.test.ts src/renderer/App.test.tsx --reporter=dot` |
| P1 | Dashboard and settings | Chrome, Finder, Ghostty, Provider, Computer Use, Browser, and Dogfood readiness now have first-class React sections, but some advanced operator controls still live in fallback/server-only paths. | Continue moving advanced controls from fallback/server-only paths into the React dashboard while keeping provider secrets redacted. | `npx vitest run src/main/dashboard-data.test.ts src/main/dashboard-server.test.ts src/main/dashboard-status.test.ts src/dashboard/DashboardApp.test.tsx --reporter=dot` |
| P1 | Browser bridge | Chrome CDP/native-host evidence passes, installed-extension Native Messaging passes with a real Chromium id, and installed-extension action smoke now passes. Screenshot fallback is still not a complete action path when Chrome capture permission is unavailable. | Keep extension action proof in the Chrome smoke/readiness contract and separately finish screenshot fallback evidence after the Mac desktop permissions are available. | `npm run smoke:chrome -- --app dist/skfiy.app --extension-chrome-app "Chromium" --extension-id <id> --require-passed --output .skfiy-smoke/chrome-<commit>.json` |
| P1 | Agent and routing | Route states now have first-class clarification, confirmation, user denial, and route-policy blocked outcomes before Computer Use continuation. | Keep app-policy denial, route-level denial, blocked, confirmation, cancellation, failure, and completion distinct as each supported adapter adds richer safety cases. | `npx vitest run src/main/task-routing.test.ts src/main/assistant-agent.test.ts src/main/assistant-tools-main-wiring.test.ts src/main/task-status-contract.test.ts --reporter=dot` |
| P1 | Computer Use adapters | Workstream D calls for menu actions, but the current shared action schema has no menu primitive. | Add a menu action primitive only after a supported adapter route and safety/status model are in place. | Computer Use action schema tests plus a supported-route smoke case. |
| P1 | Product boundary | Generic visible-app wording can read as a universal-app promise, while current real regression fixtures are Ghostty, Chromium/Chrome, and Finder. | Keep docs explicit that shared primitives and frontmost-app concepts are internal design pieces, not evidence of a ready arbitrary-app route. | `npx vitest run src/main/plan-doc-status.test.ts --reporter=dot` plus boundary `rg` |
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
npm run smoke:chrome -- --app dist/skfiy.app --extension-chrome-app "Chromium" --extension-id <id> --require-passed --output .skfiy-smoke/chrome-<commit>.json
npm run smoke:finder -- --app dist/skfiy.app --item-drag-drop --require-passed --output .skfiy-smoke/finder-<commit>.json
npm run smoke:dashboard -- --cli dist/skfiy --extension-chrome-app "Chromium" --extension-id <id> --require-passed --output .skfiy-smoke/dashboard-<commit>.json
npm run smoke:money-run -- --app dist/skfiy.app --session money-run --require-passed --output .skfiy-smoke/money-run-<commit>.json
```

If a smoke is skipped for manual authorization, record the exact blocker,
artifact path if produced, and next rerun command in the handoff or dogfood
status output.

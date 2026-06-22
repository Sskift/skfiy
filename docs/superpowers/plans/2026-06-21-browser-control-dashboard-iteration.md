# Browser Control and User Dashboard Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the installed skfiy Chrome extension `pageControl.ready` proof into packaged CLI/browser actions, dashboard-visible user controls, and repeatable real-scene smoke evidence.

**Architecture:** Keep `skfiy.app` plus packaged `dist/skfiy` as the only product runtime. The Chrome MV3 extension observes and acts inside eligible tabs, Native Messaging records bounded heartbeat/replay evidence, the CLI exposes stable commands, and the dashboard renders user-readable readiness/actions while keeping raw diagnostics in Advanced.

**Tech Stack:** Electron main process TypeScript, Vitest, Manifest V3 background/content/popup JavaScript, Chrome Native Messaging, loopback dashboard HTTP/SSE, macOS packaged `dist/skfiy`.

---

## Current State

- Manually installed Chrome extension id: `plcpkkhlcacihjfohlojdknnkademlno`.
- Proven DOM-action path: `./dist/skfiy chrome reload-extension --extension-id plcpkkhlcacihjfohlojdknnkademlno --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json` can verify an authorized localhost HTTP page enough for observe/click/fill/submit/scroll when `SKFIY_CHROME_TARGET_TAB_ID` is manually discovered today or produced by future tab discovery. Screenshot readiness is tracked separately because Chrome visible-tab capture has a stronger permission requirement.
- Implemented command-surface capabilities: diagnostics, observe, screenshot, click, fill, submit, scroll, host policy, Native Messaging status, dashboard launch/status, and packaged binary smoke commands.
- Proven installed-extension capabilities on 2026-06-21: extension-context reload verified through `skfiyWakeAction=dev-reload`; observe verified; click, fill, submit, and scroll verified in a real Chrome tab on `http://127.0.0.1:63852/?skfiy_action_live=20260621`.
- Not yet proven end-to-end: screenshot with `pageScreenshot.hasDataUrl: true`, dashboard-triggered Chrome actions after the latest `pageControl.activeTab` target metadata/preflight regression, and broader non-browser desktop app smokes. Fresh MV3 `skfiy.tabs.discover` tab evidence is proven from the installed extension, and the action smoke harness now consumes native `pageTabs` correctly.
- 2026-06-21 implementation update: `chrome observe`, `chrome screenshot`, `chrome click`, `chrome fill`, `chrome submit`, and `chrome scroll` have been added to the packaged CLI command surface. Wake URLs can request page-control actions, Native Messaging can persist `pageObservation`, `pageActionResult`, and `pageScreenshot`, and the related Vitest suite plus `npm run build` have passed locally.
- Latest 2026-06-21 hardening update: popup wake URLs now support `dev-reload`; background owns page-control wake execution; repeated `tabs.onUpdated` events for the same wake URL are deduplicated; Native Messaging preserves `latestCommand` so health heartbeats cannot hide command evidence; screenshot blockers are recorded as bounded evidence; page-control verification rejects screenshot heartbeats without image data, stale command evidence, and action heartbeats for the wrong action.
- Latest verification evidence: after the 0.0.14 native-host allowlist fix and stalled content-diagnostics timeout, the Chrome command/background/native-host/dashboard slice passed `npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-manifest.test.ts src/main/chrome-extension-reloader.test.ts src/main/chrome-smoke-script.test.ts src/main/dashboard-smoke-script.test.ts` with 9 files / 171 tests, followed by `npx tsc --noEmit` and `npm run build`.
- 2026-06-21 live proof: a compiled `./dist/skfiy chrome observe` run passed against Chrome tab `1782096038` on `http://127.0.0.1:63852/`; `pageObservation.visibleText` contained `skfiy observe live smoke 2026-06-21 compiled binary path`, and local evidence was saved to `.skfiy-smoke/chrome-observe-live.json`. Commit `3dbed8b` (`feat: add Chrome observe page-control command`) was pushed to `main`.
- Current product answer to "can skfiy control Chrome?": **partially, with repeatable current proof for observe/click/fill/submit/scroll through the installed extension, extension self-reload diagnostics, native MV3 target-tab discovery in 0.0.14, and a user dashboard Chrome control card with historical Activity proof**. skfiy can now discover and act on authorized ordinary HTTP(S) Chrome tabs through the installed extension and packaged CLI, but it is not a complete browser controller until the dashboard action API consumes/preserves the same ordinary-page target evidence, screenshot capture/fallback is green, and broader desktop-app smokes pass from the compiled binary.
- Subagent contract check: extension runtime support and packaged CLI subcommands exist for screenshot, DOM actions, extension-native tab discovery, repeatable installed-extension action smoke, and the first user dashboard Chrome control card. The remaining product gaps are the dashboard `unsupported-page` preflight regression caused by incomplete `pageControl.activeTab` target metadata, screenshot capture permission/fallback, and broader non-browser desktop smokes.
- Development update boundary: Codex may reload the skfiy extension card while iterating because the user granted Chrome extension developer-mode permissions. The product path now starts with extension-context reload (`skfiyWakeAction=dev-reload`) and falls back to OCR/clicking `chrome://extensions` only when extension-context verification fails. A locked/asleep macOS desktop still blocks general desktop Computer Use and the OCR/click fallback, but it must not be reported as an ambiguous extension failure.
- Target-tab discovery update: Task 4 code now adds `skfiy chrome tabs --json`, `skfiy.tabs.discover` background discovery, bounded Native Messaging `pageTabs` evidence, startup scanning for wake tabs that loaded before the service worker woke, `tabs.onCreated` wake handling for newly opened wake tabs, bounded `chrome.tabs.query` failure evidence, per-tab summary blockers, and a CLI registration-drift diagnostic.
- Historical 2026-06-21 installed-extension freshness diagnosis: the local unpacked extension manifest reached `0.0.7`, and Chrome reported the installed extension service worker at `0.0.7` after refresh. At that point `skfiy chrome tabs` verified target-tab discovery only through packaged CLI fallback with `discoveryMode: "chrome-apple-events"` and non-empty bounded `tabs[]`; that historical extension-parity gap is now superseded by the 0.0.14 native `skfiy.tabs.discover` proof below. `skfiy chrome reload-extension` still preserves stale-registration and locked/asleep desktop fallback evidence under typed fields.
- 2026-06-21 screenshot-readiness correction: earlier `pageControl.state: "ready"` evidence over-reported the screenshot path because a current-site optional host grant is enough for DOM actions but not enough for background `chrome.tabs.captureVisibleTab`. Commit `216aad0` now reports `pageControl.state: "partial"` in that shape, with `capabilities.domActions: true`, `capabilities.screenshot: false`, and `chromeCapturePermission.state: "missing"`. Real `./dist/skfiy chrome screenshot ... --json` returns `reason: "chrome-capture-permission-missing"` with Chrome's `Either the '<all_urls>' or 'activeTab' permission is required.` message. The dashboard must show screenshot as a separate permission/fallback lane.
- 2026-06-21 dashboard update: commit `e7005fc` adds the Apps and Sites Chrome control card to the user dashboard. It shows honest states for ready DOM control, screenshot permission gaps, skfiy host approval, Chrome site access, extension refresh, internal pages, Chrome tab fallback, and screenshot fallback. It also exposes copyable packaged `./dist/skfiy chrome ... --json` commands for eligible pages. The 2026-06-22 launcher persistence, dashboard-smoke, and real-user-HOME live action updates close the first dashboard browser-control slice: the dashboard API can trigger live Chrome `observe|fill|click|submit|scroll` actions and mirror fresh verified Activity rows into `/snapshot.json`.
- 2026-06-22 action-smoke update: commit `973cf5d` adds `installedExtensionActionRun` to `smoke:chrome`, a local HTTP action fixture, packaged CLI calls for `chrome tabs`, `chrome reload-extension`, `chrome observe`, `chrome screenshot`, `chrome fill`, `chrome click`, `chrome submit`, and `chrome scroll`, plus classifier helpers in `scripts/smoke-chrome-plan.mjs`. It also fixes Apple Events fallback tab ids that arrived as numeric strings, so `./dist/skfiy chrome tabs --extension-id plcpkkhlcacihjfohlojdknnkademlno --json` can return eligible tabs with numeric `id` values through `discoveryMode: "chrome-apple-events"`. The local unpacked extension manifest was `0.0.8` in that commit, and CLI-to-extension wake URLs now carry `skfiyRequestId` so page-control evidence can be tied to the current command instead of stale heartbeats.
- 2026-06-22 request-scoped stabilization update: local source is now `chrome-extension` manifest `0.0.10`, and Chrome's installed `plcpkkhlcacihjfohlojdknnkademlno` service-worker registration also reports `0.0.10` in `Default/Secure Preferences`. The action fixture separates `#click-only` from form submit, background wake summaries record current `requestId` even when a page action returns no response, selectorless scroll is covered in content-script tests, popup wake URLs now delegate `screenshot|click|fill|submit|scroll|observe` back to the background worker through `skfiy.page_control.wake`, stale timestamped wake URLs older than 30 seconds are ignored, and popup-delegated wakes execute before responding to the popup.
- Latest real action-smoke evidence on 2026-06-22: `.skfiy-smoke/chrome-extension-actions-latest.json` selected fixture tab `1782097316` on `http://127.0.0.1:54586/?skfiy_action_live=<redacted>`. `caffeinate -dimsu npm run smoke:chrome -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/chrome-extension-actions-latest.json --timeout-ms 8000 --settle-ms 300 --require-passed` exited 0 with top-level `result: "passed"` and `installedExtensionActionRun.classification: "screenshot-blocked"`. The branded-Chrome temporary-profile extension-load lane remains a known diagnostic blocker with `installedExtensionRun.blockedReason: "branded_chrome_load_extension_removed"`, but the manually installed extension action lane verified `observe`, `fill`, `click`, `submit`, `scroll`, and final `observe` with fresh request ids and final visible text containing `clicked 1 submitted skfiy #1 scroll target ready`. `reload-extension` is accepted as a typed `desktop-session-locked` blocker because the desktop fallback cannot click while the session is locked, and `screenshot` is accepted as the only typed Chrome blocker with `reason: "chrome-capture-permission-missing"` and `pageScreenshot.hasDataUrl: false`.
- 2026-06-22 dashboard launcher persistence update: the user dashboard now has local-only one-click launchers for `observe|screenshot|click|fill|submit|scroll`, backed by `POST /api/chrome-control-action` and packaged `rootDir/dist/skfiy`. Launcher results are bounded into `activityEntry`, mirrored in the running `/snapshot.json`, and durably persisted into `~/Library/Application Support/skfiy/runtime-snapshot.json` as `currentTurn.chromeControlActivity` plus bounded `replay.chromeControlActions[]`. The red/green durability test proves raw command stdout such as page text or tokens is not copied into the snapshot. The shell/launcher surface is proven, and an earlier `.skfiy-smoke/dashboard-live-action-latest.json` proved a real dashboard-triggered Chrome action sequence. The latest `.skfiy-smoke/dashboard-live-action-latest.json` is red with `unsupported-page`, so dashboard actions are the current P0 before this can be called current field proof again.
- Current real-environment blocker: the local macOS desktop session can be locked/asleep during agent work. When `skfiy-helper desktop-session-status` reports `cgSessionScreenIsLocked: true`, `ioConsoleLocked: true`, `frontmostBundleId: "com.apple.loginwindow"`, or `mainDisplayAsleep: true`, desktop/Ghostty/Finder/dashboard require-passed gates must report typed blockers. This does not block code, unit tests, compiled CLI smoke work, or Chrome extension URL/Native Messaging work that can run without desktop clicking.
- 2026-06-22 product-answer update: skfiy does not yet have full Codex-style browser control. The current proven layer is structured control of ordinary authorized HTTP(S) tabs through the installed extension and packaged CLI, with current smoke proof for observe/fill/click/submit/scroll/final-observe, historical dashboard-triggered `observe|fill|click|submit|scroll` Activity, a typed screenshot permission blocker, and 0.0.14 native `skfiy.tabs.discover` target discovery. The next proof is no longer extension-native tabs or action-smoke target selection; it is restoring the dashboard action API to the same `screenshot-blocked` field shape by preserving enough ordinary-page target metadata for `/api/chrome-control-action` preflight, then closing screenshot data or desktop fallback. Until those pass, dashboard and README copy should say "Chrome structured control is partially working" rather than "browser control is complete".
- 2026-06-22 operator-permission update: the user has granted the Codex Chrome plugin developer-mode permission, so during development Codex may act as the temporary operator to reload the unpacked skfiy extension from `chrome://extensions/` when a source change requires it. This only shortens the iteration loop. It is not product capability, not release evidence, and not a substitute for the packaged `dist/skfiy chrome reload-extension ... --json` diagnostic path plus a post-reload `smoke:chrome --require-passed` or `smoke:dashboard -- --extension-id ... --require-passed` proof.
- 2026-06-22 tabs-discovery request-scope update: local source reached `chrome-extension` manifest `0.0.11`. `invokeChromeExtensionTabDiscovery()` now generates or accepts a request id, passes it into `skfiyWakeAction=tabs`, and only accepts `skfiy.tabs.discover` / `pageTabs` evidence whose `requestId` matches the current command. The MV3 background now forwards that same request id into Native Messaging instead of replacing it with `tabs-discover-native-*`. Focused red/green tests passed, the broad Chrome/dashboard slice passed 8 files / 158 tests, `npx tsc --noEmit` passed, and `npm run build` rebuilt `dist/skfiy.app` plus `dist/skfiy`. That closed stale-request acceptance in code, but the real installed extension still needed reload proof before the fallback could be retired.
- 2026-06-22 0.0.14 extension-native tabs update: local source and Chrome's registered unpacked extension are now `0.0.14`. Two fixes closed the native tabs field gate: stalled content-script diagnostics are bounded by a timeout instead of hanging the discovery request, and the packaged Native Messaging host allowlist now accepts `skfiy.tabs.discover` frames. `./dist/skfiy chrome tabs --extension-id plcpkkhlcacihjfohlojdknnkademlno --json` returned `result: "verified"`, `discoveryMode: "extension"`, `latestCommand.messageType: "skfiy.tabs.discover"`, matching request id `tabs-discover-cli-1782072479501`, and 86 bounded `pageTabs` entries. Task 6.10 then closed the smoke harness selector mismatch: native `pageTabs`, top-level fallback `tabs[]`, and redacted fixture query values now feed the same eligible-target selector.
- 2026-06-22 Task 6.10 field proof: `caffeinate -dimsu npm run smoke:chrome -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/chrome-extension-actions-latest.json --timeout-ms 8000 --settle-ms 300 --require-passed` exited 0. The artifact selected tab `1782097316` on `http://127.0.0.1:54586/?skfiy_action_live=<redacted>`, kept `tabsRun.discoveryMode: "extension"`, verified observe, fill, click, submit, scroll, and final observe with final visible text containing `clicked 1 submitted skfiy #1 scroll target ready`, and classified the run as `screenshot-blocked` with screenshot reason `chrome-capture-permission-missing`. The follow-up dashboard smoke is now red for a different reason: `/api/chrome-control-action` rejects safe actions with `unsupported-page` because the dashboard `pageControl.activeTab` summary has `tabId`, `host`, and `scheme` but no full ordinary-page URL/equivalent preflight evidence.
- 2026-06-22 pet-skin update: the renderer pet art is now manifest-driven and separate from backend Computer Use state. The default bundled skin is `skfiy-black-cat`, `skfiy-cloudbot` remains a legacy built-in, and a custom-manifest hook allows a user-provided local skin atlas to replace the visual asset without changing task planning, permissions, or action execution. Luo Xiaohei official art is the visual reference direction for local prototype skins, but official/third-party images must stay in local licensed skin packs and must not be committed or included in release artifacts without redistribution rights.

## Current Execution Snapshot 2026-06-22

- Product runtime boundary: all user-test claims must go through `dist/skfiy.app`, embedded `dist/skfiy-helper`, or packaged `dist/skfiy`. Source-tree Electron, tmux sessions, Browser Use tabs, and ad hoc scripts are allowed only as diagnostics or iteration scaffolding.
- Current source state: `chrome-extension/manifest.json` and the background fallback manifest are `0.0.14`. The 0.0.10 code fix moved wake directive claiming from scheduling time to execution time so a delayed `tabs.onUpdated` wake cannot pre-dedupe and suppress an immediate popup-delegated action; the 0.0.11 code fix makes `skfiy.tabs.discover` evidence request-scoped from CLI wake URL through Native Messaging; the 0.0.12 popup fix schedules `dev-reload` before render/status failures can block the wake; the 0.0.13 background fix executes `tabs` discovery wakes immediately instead of via a delayed timer; and the 0.0.14 fix makes content-script diagnostics time-bounded and accepts `skfiy.tabs.discover` inside the packaged native host.
- Current installed-extension state: Chrome extension id `plcpkkhlcacihjfohlojdknnkademlno` is registered at `0.0.14` from `/Users/bytedance/Desktop/test/skfiy/chrome-extension`, and `./dist/skfiy chrome tabs --extension-id plcpkkhlcacihjfohlojdknnkademlno --json` has native extension proof with `discoveryMode: "extension"`. Freshness and action-smoke target selection are no longer the current blocker. The latest current blocker is dashboard action preflight: the real-user-HOME dashboard snapshot reports `pageControl.activeTab` with `tabId`, `host`, and `scheme`, but `/api/chrome-control-action` still returns `unsupported-page` because it does not have or accept enough ordinary HTTP(S) target evidence.
- Allowed refresh paths: first try the packaged `./dist/skfiy chrome reload-extension ... --json` path; if it returns `extension-card-reload-required` and the desktop is unlocked, Codex may click the visible reload button on the skfiy extension card as the temporary operator because the user has granted the Codex Chrome plugin developer-mode permission. For iteration, this means Codex may refresh skfiy instead of waiting for skfiy to refresh itself. For product claims, this operator shortcut does not count: Browser Use still cannot be the product runtime, raw CDP/browser internals remain outside the allowed product path, and final evidence must come from packaged `dist/skfiy`.
- Next executable gate after native tabs: repair dashboard Chrome control target preflight so the same tab selected by the passing action smoke is accepted by `POST /api/chrome-control-action`. Either preserve the full selected target URL from `installedExtensionActionRun.selectedTargetTab` into dashboard `pageControl.activeTab`, or make the preflight safely accept trusted `scheme: "http:"|"https:"` plus `host` plus matching `targetTabId`. Then rerun `npm run smoke:dashboard -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --require-passed` until observe/fill/click/submit/scroll Activity rows are current again. After that, close one of the two screenshot lanes: Chrome capture with `pageScreenshot.hasDataUrl: true` or an unlocked-desktop packaged screenshot fallback.
- Dashboard follow-up: the Apps and Sites card now distinguishes the user-facing `Extension needs refresh` state from `Desktop locked for extension refresh` when the desktop session is blocked, asleep, or sitting at `loginwindow`. The local action endpoint now runs packaged `dist/skfiy chrome observe|screenshot|click|fill|submit|scroll`, returns bounded verified/blocked JSON, mirrors the latest row into `/snapshot.json`, and persists the latest row into the runtime snapshot for Activity/replay. It must still not imply that Chrome internal pages, extension pages, local files, or unsupported schemes are controllable targets.
- Dashboard smoke classifier update: `smoke:dashboard --require-passed` now passes when the dashboard loopback path, launcher surface, token hygiene, runtime snapshot, and latest Chrome action artifact are healthy even if operator readiness remains typed-blocked by isolated-HOME or desktop-session evidence. Latest isolated-HOME local run wrote `.skfiy-smoke/dashboard-latest.json` with shell HTTP 200, `/api/chrome-control-action` present, `data-chrome-control-launcher` present, `tokenLeakDetected: false`, `runtimeSnapshot: "available"`, latest Chrome artifact `result: "passed"`, `operatorReadiness: "blocked"`, `desktopSession: "blocked"`, `nativeHost: "missing"` in the isolated HOME, and top-level `result: "passed"`. Current alert codes include `speech-recognition-missing`, `desktop-session-blocked`, `desktop-session-loginwindow`, `finder-automation-unproven`, `chrome-native-host-missing`, `chrome-extension-not-connected`, `smoke-evidence-stale`, and `release-artifact-older-than-head`.
- Historical 2026-06-22 dashboard real-action proof: an earlier `caffeinate -dimsu npm run smoke:dashboard -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/dashboard-live-action-latest.json --require-passed` exited 0 after the smoke was upgraded from one observe call to a safe DOM action sequence. The harness kept the normal dashboard smoke in an isolated HOME, then launched a second packaged dashboard in the real user HOME for Chrome extension action proof so Native Messaging read `/Users/bytedance/Library/Application Support/skfiy/chrome-extension-connection.json` rather than a temporary directory. That proof recorded verified `Chrome observe`, `Chrome fill`, `Chrome click`, `Chrome submit`, and `Chrome scroll` Activity/replay rows.
- Latest 2026-06-22 dashboard real-action blocker: after Task 6.10 restored `smoke:chrome`, the follow-up `caffeinate -dimsu npm run smoke:dashboard -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/dashboard-live-action-latest.json --require-passed` failed with top-level `result: "failed"`, `tokenLeakDetected: false`, `dashboardChromeControlActionApi.homeMode: "real-user-home"`, and every safe action returning HTTP 400 `unsupported-page`. The snapshot's `runtimeHealth.extension.pageControl.activeTab` identified target tab `1782097316` on host `127.0.0.1:54586` with `scheme: "http:"`, but lacked the URL or equivalent accepted ordinary-page proof. This is the new dashboard P0.

## Immediate P0 Loop

1. Keep the installed-extension self-refresh loop explicit and treat current-source freshness as a recurring field gate. Current source and installed registration are `0.0.14`; future service-worker changes must bump the manifest, reload the installed extension, and rerun the packaged field gate before any new claim. Codex may reload the visible extension card only as a temporary operator action after the desktop is unlocked; product code must still prove its own compiled `dist/skfiy` reload/diagnostic path and must not depend on tmux, a dev server, raw CDP, or manual browser UI state.
2. Keep action-smoke target selection green after native tabs. The latest `smoke:chrome` run proves `tabsRun.discoveryMode: "extension"` and Native Messaging `skfiy.tabs.discover`, selects the current fixture tab from native `pageTabs`, and verifies observe/fill/click/submit/scroll/final-observe with classification `screenshot-blocked`. Any regression back to `no-eligible-target-tab` is P0.
3. Keep extension-native live tab discovery as the preferred target selector. `skfiy chrome tabs --json` now has real MV3 proof; `discoveryMode: "chrome-apple-events"` remains a labeled fallback only when the extension-native route is blocked, stale, or unavailable.
4. Close screenshot capture evidence after readiness is honest: `./dist/skfiy chrome screenshot --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json` now writes current bounded evidence for `reason: "chrome-capture-permission-missing"` with Chrome's `Either the '<all_urls>' or 'activeTab' permission is required.` message. The remaining screenshot product choice is to add an explicit user-granted Chrome capture permission path or unlock desktop and prove the existing screenshot fallback; do not mark screenshot verified until the latest command evidence has `pageScreenshot.hasDataUrl: true`.
5. Keep click/fill/submit/scroll sequential in smoke until the artifact format stores independent per-command evidence files. The historical packaged field gate verified observe, fill, click, submit, scroll, and final observe with fresh request ids. The classifier should stay strict: any stale latest command, wrong request id, wrong action, no eligible native target, or unknown screenshot blocker must fail or block; the only accepted current screenshot blocker is `chrome-capture-permission-missing`.
6. Restore the user dashboard Chrome action field gate. The card surfaces Chrome observe/click/fill/submit/scroll readiness, packaged Apple Events fallback tab discovery, screenshot permission/fallback blockers, copyable packaged commands, local-only one-click launchers, durable Activity/replay rows, and the difference between `Extension needs refresh` and `Desktop locked for extension refresh`. The first real dashboard launcher sequence was historically proven, but the latest run now blocks with `unsupported-page`; next P0 dashboard work is making the dashboard preflight consume the same safe target evidence as the passing action smoke, then exposing the verified rows clearly in Activity while keeping screenshot and unsupported targets honest.
7. Keep desktop Computer Use separate from Chrome extension control: locked/asleep desktop blockers should be explicit for Ghostty/Finder/general app tests, while Chrome extension tests should continue through URL wake and Native Messaging when possible.

## Next P0 Order

1. **Dashboard Chrome action preflight**: repair `/api/chrome-control-action` or dashboard `pageControl.activeTab` summarization so a trusted ordinary HTTP(S) tab with matching `targetTabId`, `scheme`, and `host` is accepted. Immediate pass condition: latest dashboard smoke no longer returns `unsupported-page` for observe/fill/click/submit/scroll.
2. **Browser self-iteration proof**: after any MV3 source change, Codex may use the granted Chrome developer-mode permission to click reload as operator, then the compiled product must prove freshness with `./dist/skfiy chrome reload-extension ... --json`, `./dist/skfiy chrome tabs ... --json`, and `npm run smoke:chrome -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --require-passed`. The artifact must say whether reload was extension-context verified, operator-assisted, or blocked by desktop session state.
3. **Screenshot lane**: either obtain Chrome visible-tab capture evidence with `pageScreenshot.hasDataUrl: true` or prove a packaged desktop screenshot fallback on an unlocked desktop. Until then, screenshot remains a typed blocker and must not be folded into the "Chrome control works" headline.
4. **User dashboard clarity**: expose the real action rows for observe/fill/click/submit/scroll in Activity in user language, keep unsupported schemes and screenshot blockers visible, and hide raw artifact paths under Advanced.
5. **General desktop control**: after browser self-iteration is stable, rerun Ghostty/Finder/general desktop smokes from compiled `dist/skfiy.app` on an unlocked, awake desktop. Ghostty is still only an early fixture; the product requirement is arbitrary visible-app Computer Use through app listing, activation, screenshot/OCR/accessibility observation, pointer/keyboard actions, and verification.
6. **Pet skin productization**: add a user-facing skin picker/importer after the renderer registry is stable. It should read local skin packs from `~/Library/Application Support/skfiy/skins/`, validate `.pet.json` manifests, crop/pack licensed avatar or sticker art into the 8-by-9 atlas shape, and keep release packaging fail-closed for third-party assets.

## Browser Control Completion Criteria

Use these labels in dashboard, README, and handoffs until the product reaches full parity.

1. **Chrome structured control, partial**: packaged `dist/skfiy chrome tabs` can find an eligible tab, and at least one of `observe|click|fill|submit|scroll` verifies through the installed extension on an ordinary HTTP(S) page. This is now the historical baseline, not the current ceiling.
2. **Chrome structured control, repeatable**: local source and Chrome installed registration both report the same current manifest version, `smoke:chrome --require-passed` verifies observe, fill, click, submit, scroll, and final observe with current request ids, and screenshot is either verified or the only typed blocker is `chrome-capture-permission-missing`. This label now applies to the latest packaged CLI action lane, with the explicit caveat that screenshot is still blocked and desktop reload fallback can be typed-blocked while the macOS session is locked.
3. **Dashboard browser control**: the Apps and Sites card offers local-only launchers for eligible pages, each launcher calls packaged `dist/skfiy`, and Activity shows target tab/host, action, result, blocker, and screenshot lane without requiring raw JSON inspection. This was historically proven through `smoke:dashboard -- --extension-id ...`, but the latest field gate is red with `unsupported-page`; this label applies again only after dashboard preflight accepts the same ordinary-page target evidence as the passing action smoke.
4. **Computer Use browser parity**: planner actions can navigate, observe, click by role/selector/text, fill, submit, scroll, recover from stale tabs, handle iframes/multi-tab flows, pause sensitive surfaces, and fall back to screenshot/OCR only with an explicit reason. This is not in the current P0; it starts after the repeatable Chrome structured-control gate is green.

## File Structure

- Modify `src/main/cli-command-surface.ts`: add Chrome page-control command normalization, execution, JSON output, and blocker mapping.
- Create `src/main/chrome-extension-page-control.ts`: shared invoker for extension-backed observe, screenshot, click, fill, submit, and scroll commands.
- Modify `src/main/chrome-extension-reloader.ts`: keep reload target-tab verification, allow wake URLs to request a specific page-control action, and try extension-context `dev-reload` before desktop OCR/click fallback.
- Modify `src/main/chrome-native-host.ts`: persist page observation/action/tab summaries into `chrome-extension-connection.json` without raw secrets.
- Modify `chrome-extension/popup.js`: handle extension-context `dev-reload` and `tabs` wake requests while leaving screenshot/action wakes to the background worker so clicks/submits/captures are not duplicated.
- Modify `chrome-extension/manifest.json`: bump version whenever background/service-worker behavior changes so CLI diagnostics can compare local source with Chrome's registered service-worker version.
- Modify `chrome-extension/background.js`: route page-control requests to the requested tab, deduplicate repeated wake events, and return typed blockers for host policy, Chrome site access, internal pages, stale content script, capture permission, and sensitive pause.
- Modify `chrome-extension/content-script.js`: keep page snapshots/action results bounded and mark sensitive forms before fills/clicks/submits.
- Modify `src/main/dashboard-server.ts` and `src/main/dashboard-data.ts`: render user-facing Chrome readiness/actions and move raw evidence to Advanced.
- Modify `src/renderer/pet-atlas.ts`, `src/renderer/App.tsx`, and `src/renderer/styles.css`: keep pet skins manifest-driven and renderer-only, with backend task state mapped to abstract animation states.
- Add renderer skin assets under `src/renderer/assets/` only for bundled original or licensed assets; user-provided official art belongs in local skin packs outside git.
- Modify `scripts/smoke-chrome-product.mjs` and `scripts/smoke-chrome-plan.mjs`: add installed-extension action evidence.
- Modify tests in `src/main/cli-command-surface.test.ts`, `src/main/chrome-extension-page-control.test.ts`, `src/main/chrome-extension-reloader.test.ts`, `src/main/chrome-native-host.test.ts`, `src/main/dashboard-data.test.ts`, `src/main/dashboard-server.test.ts`, `src/main/dashboard-smoke-script.test.ts`, `src/main/chrome-smoke-script.test.ts`, `src/main/chrome-extension-popup.test.js`, `src/main/chrome-extension-background.test.js`, and `src/main/chrome-extension-content-script.test.js`.

## Acceptance Gates

- `npx vitest run src/main/cli-command-surface.test.ts -t "runs chrome observe"`
- `npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts`
- `npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-popup.test.js`
- `npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts`
- `npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-popup.test.js src/main/chrome-extension-manifest.test.ts --testNamePattern "stale Chrome extension registration|runs tab discovery|manifest"`
- `npx vitest run src/main/chrome-extension-background.test.js --testNamePattern "only the current host|capture permission|page-control health"`
- `npx tsc --noEmit`
- `npm run build`
- `export SKFIY_CHROME_EXTENSION_ID=plcpkkhlcacihjfohlojdknnkademlno`
- Open the authorized ordinary HTTP(S) test page in Chrome.
- `./dist/skfiy chrome tabs --extension-id "$SKFIY_CHROME_EXTENSION_ID" --json`
- Expected current result: `./dist/skfiy chrome tabs --json` returns `result: "verified"`, `discoveryMode: "extension"`, fresh `skfiy.tabs.discover` Native Messaging evidence, and bounded `pageTabs`. `discoveryMode: "chrome-apple-events"` is now fallback evidence only and should be called out explicitly when used.
- Preferred target discovery after Task 6.9 real proof: `export SKFIY_CHROME_TARGET_TAB_ID=$(./dist/skfiy chrome tabs --extension-id "$SKFIY_CHROME_EXTENSION_ID" --json | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { const json = JSON.parse(data); const tabs = Array.isArray(json.tabs) ? json.tabs : (json.extensionConnection?.latestCommand?.pageTabs?.tabs || json.extensionConnection?.pageTabs?.tabs || []); const tab = tabs.find((entry) => entry.eligible === true || entry.state === "eligible"); if (!tab) process.exit(2); console.log(tab.id); });')`
- Debug-only manual fallback if `chrome tabs` cannot run: `export SKFIY_CHROME_TARGET_TAB_ID=$(osascript -e 'tell application "Google Chrome" to id of active tab of front window')`. Product smokes should prefer `./dist/skfiy chrome tabs --json`.
- `./dist/skfiy chrome reload-extension --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json`
- `./dist/skfiy chrome observe --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json`
- `./dist/skfiy chrome screenshot --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json`
- `./dist/skfiy chrome click --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --selector "#click-only" --json`
- `./dist/skfiy chrome fill --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --selector "#name" --text skfiy --json`
- `./dist/skfiy chrome submit --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --selector "form" --json`
- `./dist/skfiy chrome scroll --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --dy 600 --json`
- Run action smokes sequentially. Do not run click/fill/submit/scroll in parallel until the smoke harness stores per-request evidence with independent artifact files.
- `npm run smoke:chrome -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/chrome-extension-actions.json --require-passed`
- `npm run smoke:dashboard -- --output .skfiy-smoke/dashboard.json --require-passed`
- `npm run smoke:dashboard -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/dashboard-live-action-latest.json --require-passed`
- `npm run smoke:cli:basic -- --output .skfiy-smoke/cli-basic.json --require-passed`

## Two-Week Execution Roadmap

This roadmap is the product-order view of the tasks below. All user-facing acceptance must use the compiled `dist/skfiy.app` or packaged `dist/skfiy` binary. Source-tree Electron launches, tmux backends, loose helper binaries, and hidden browser-control helpers are debug-only.

### Week 1: Browser Control Becomes Repeatable

1. Keep the extension-context self-reload path as the default: `chrome reload-extension` opens `skfiyWakeAction=dev-reload`, verifies the requested tab, and returns `desktop-session-locked` only when it has to fall back to desktop clicking while macOS is locked/asleep.
2. Close screenshot readiness and evidence in two layers. First, page-control health must report `state: "partial"` when DOM actions are ready but screenshot capture is blocked by missing `<all_urls>`/activeTab gesture permission. Second, either request/grant the required Chrome capture permission for the installed extension or prove the packaged desktop screenshot fallback after `smoke:desktop-session` passes. A screenshot cannot be verified unless the latest command evidence has `pageScreenshot.hasDataUrl: true`.
3. Keep `skfiy chrome tabs --json` extension-native live proof as the preferred target selector. Code and tests now cover bounded tab metadata plus blockers for internal Chrome pages, extension pages, file URLs, unsupported schemes, missing skfiy host policy, missing Chrome site access, stale content scripts, stalled content diagnostics, tab-query failures, wake tabs created after the service worker starts, wake tabs whose update event lost the query string, Native Messaging allowlist acceptance, Apple Events fallback, and per-tab summary failures. The current compiled command has real `discoveryMode: "extension"` proof, and action smoke now reads the native `pageTabs` shape correctly; dashboard consumers still need to preserve enough active-tab target metadata for action preflight.
4. Maintain the automated action smoke as a required regression gate. The current pass shape for `npm run smoke:chrome -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/chrome-extension-actions-latest.json --timeout-ms 8000 --settle-ms 300 --require-passed` is action classification `screenshot-blocked`: observe, fill, click, submit, scroll, and final observe verify with current request ids; reload is a typed desktop-session blocker; screenshot is the only accepted Chrome capture-permission blocker. A regression to `no-eligible-target-tab`, stale request ids, wrong action evidence, or unknown screenshot blockers is P0.
5. Keep all action smokes sequential until each command writes independent request ids and artifact files and the harness proves stale wake tabs cannot replay across parallel commands. Current request ids are proven in the latest installed-extension smoke for observe, fill, click, submit, scroll, and final observe. Parallelism remains out of scope until screenshot and per-command evidence files are closed.

### Week 2: User Control Plane And Field Gate

1. Move the dashboard from developer status panels to user state: Home, Approvals, Activity, Apps and Sites, Permissions, Agents, Releases, and Advanced Diagnostics. Raw JSON, smoke paths, PIDs, and stale evidence belong under Advanced.
2. Keep the implemented Apps and Sites Chrome card as the first user-facing browser-control surface. It separates DOM control from screenshot control and says exactly one of: ready to control this page, DOM actions ready but screenshot capture needs permission, needs skfiy host approval, needs Chrome site access, extension needs refresh, internal Chrome page cannot be controlled, screenshot fallback blocked by locked/asleep macOS, or desktop fallback required.
3. Finish local-only dashboard controls for eligible HTTP(S) pages: observe current page, screenshot current page, click confirmed selector, fill approved field, submit approved test form, and scroll. The endpoint, Activity persistence, and historical real installed-extension verification for observe/fill/click/submit/scroll from the packaged dashboard path exist. Current work is repairing `unsupported-page` preflight for the same safe fixture target, making the Activity UI understandable without JSON, and keeping screenshot blocked until data or fallback evidence exists.
4. Keep the Codex plugin and MCP path read-only for status/doctor until dashboard and CLI evidence are stable. The plugin should consume the packaged binary, not become a second runtime.
5. Gate the long-horizon `money-run` field task on green product smokes: desktop-session, CLI basic, dashboard, Chrome extension actions, Ghostty/Finder/voice where applicable, and release evidence. Only then can skfiy supervise `money-run` through the packaged app path and preserve `tmuxSupervisionReport`, screenshots/actions, approvals, stop behavior, and dashboard visibility.

## Task 1: Chrome Observe Command

**Files:**
- Modify: `src/main/cli-command-surface.ts`
- Create: `src/main/chrome-extension-page-control.ts`
- Modify: `src/main/chrome-extension-reloader.ts`
- Modify: `src/main/chrome-native-host.ts`
- Modify: `chrome-extension/popup.js`
- Test: `src/main/cli-command-surface.test.ts`
- Test: `src/main/chrome-native-host.test.ts`

- [x] **Step 1: Keep the current failing CLI test**

Run:

```bash
npx vitest run src/main/cli-command-surface.test.ts -t "runs chrome observe"
```

Observed: FAIL with exit code assertion `expected 0, received 2`, proving `chrome observe` was not wired yet.

- [x] **Step 2: Add the page-control invoker**

Create `src/main/chrome-extension-page-control.ts` with an exported `invokeChromeExtensionPageControl(input)` that:

```ts
export type ChromeExtensionPageControlAction = "observe" | "screenshot" | "click" | "fill" | "submit" | "scroll";

export interface ChromeExtensionPageControlInput {
  action: ChromeExtensionPageControlAction;
  extensionId: string;
  homeDir: string;
  targetTabId?: number;
  selector?: string;
  text?: string;
  dy?: number;
}
```

Implemented for `observe`: it opens the extension wake URL, polls `chrome-extension-connection.json`, returns `result: "verified"` only when the heartbeat is fresh for the requested action and target tab, and returns `result: "blocked"` with a `reason`/`nextAction` otherwise.

- [x] **Step 3: Wire `chrome observe` into the CLI**

In `src/main/cli-command-surface.ts`, add `observe` to `ChromeSubcommand`, command metadata, command normalization, and execution through the invoker. JSON output must include `command: "chrome observe"`, `executesSystemMutation: true`, `action: "observe"`, `extensionId`, `wakeUrl`, and `extensionConnection`.

- [x] **Step 4: Relay observe results through Native Messaging**

In `chrome-extension/popup.js`, parse `skfiyWakeAction=observe`, send a bounded `skfiy.page.observe` request to the requested `skfiyTargetTabId`, and forward the resulting page snapshot to the native host as `pageObservation`. In `src/main/chrome-native-host.ts`, persist `pageObservation` beside `pageControl` in the connection heartbeat.

- [x] **Step 5: Verify green tests**

Run:

```bash
npx vitest run src/main/cli-command-surface.test.ts -t "runs chrome observe"
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-popup.test.js
npx tsc --noEmit
npm run build
```

Observed: PASS for the new observe path, unchanged existing CLI/native-host tests, popup wake observe test, TypeScript, and the packaged build.

- [x] **Step 6: Real observe test**

Run against an authorized local HTTP tab:

```bash
./dist/skfiy chrome observe \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" \
  --json
```

Observed on 2026-06-21 against Chrome tab `1782096038` on `http://127.0.0.1:63852/`: `result: "verified"` and `extensionConnection.pageObservation.visibleText` contained `skfiy observe live smoke 2026-06-21 compiled binary path`. Local evidence was persisted to `.skfiy-smoke/chrome-observe-live.json`.

- [x] **Step 7: Commit**

```bash
git add src/main/cli-command-surface.ts src/main/chrome-extension-page-control.ts src/main/chrome-extension-reloader.ts src/main/chrome-native-host.ts chrome-extension/popup.js src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-popup.test.js
git commit -m "feat: add Chrome observe page-control command"
```

Observed: committed and pushed as `3dbed8b feat: add Chrome observe page-control command`.

## Task 2: Chrome Action Commands

**Files:**
- Modify: `src/main/cli-command-surface.ts`
- Modify: `src/main/chrome-extension-page-control.ts`
- Modify: `chrome-extension/background.js`
- Modify: `chrome-extension/content-script.js`
- Test: `src/main/cli-command-surface.test.ts`

- [x] **Step 1: Add failing tests for action commands**

Add tests for:

- `chrome screenshot --target-tab-id 42`
- `chrome click --target-tab-id 42 --selector "#submit"`
- `chrome fill --target-tab-id 42 --selector "#name" --text skfiy`
- `chrome submit --target-tab-id 42 --selector "form"`
- `chrome scroll --target-tab-id 42 --dy 600`

Each test should inject `chromeExtensionPageControlInvoker`, assert the exact action input, and require `executesSystemMutation: true`.

- [x] **Step 2: Run tests red**

```bash
npx vitest run src/main/cli-command-surface.test.ts -t "chrome .*page-control"
```

Observed: FAIL for the five new subcommands with exit code `2`, proving the CLI does not yet recognize or dispatch `screenshot`, `click`, `fill`, `submit`, and `scroll`.

- [x] **Step 3: Implement normalization and argument validation**

Add selectors/text/dy parsing to `src/main/cli-command-surface.ts`. Missing selector for click/fill/submit, missing text for fill, and missing dy for scroll must return structured CLI errors with exit code `2`.

- [x] **Step 3a: Extend page-control action type and wake parameters**

In `src/main/chrome-extension-page-control.ts`, expand the action type and invoker input:

```ts
export type ChromeExtensionPageControlAction =
  | "observe"
  | "screenshot"
  | "click"
  | "fill"
  | "submit"
  | "scroll";

export interface ChromeExtensionPageControlInput {
  action: ChromeExtensionPageControlAction;
  extensionId: string;
  homeDir: string;
  targetTabId?: number;
  selector?: string;
  text?: string;
  dy?: number;
}
```

In `src/main/chrome-extension-reloader.ts`, let `createChromeExtensionWakeUrl()` include `skfiySelector`, `skfiyText`, and `skfiyDy` when present. Do not log arbitrary user text as a product default; test text such as `skfiy` is acceptable in local smoke artifacts.

- [x] **Step 3b: Add CLI subcommands**

In `src/main/cli-command-surface.ts`, add command metadata and dispatch for:

```text
skfiy chrome screenshot --extension-id <id> --target-tab-id <tab-id> --json
skfiy chrome click --extension-id <id> --target-tab-id <tab-id> --selector <css> --json
skfiy chrome fill --extension-id <id> --target-tab-id <tab-id> --selector <css> --text <text> --json
skfiy chrome submit --extension-id <id> --target-tab-id <tab-id> --selector <css> --json
skfiy chrome scroll --extension-id <id> --target-tab-id <tab-id> --dy <pixels> --json
```

The CLI invoker input must match the red test shapes:

```ts
{ action: "screenshot", targetTabId: 42 }
{ action: "click", targetTabId: 42, selector: "#submit" }
{ action: "fill", targetTabId: 42, selector: "#name", text: "skfiy" }
{ action: "submit", targetTabId: 42, selector: "form" }
{ action: "scroll", targetTabId: 42, dy: 600 }
```

- [x] **Step 4: Implement action dispatch**

Use the existing extension-layer contracts:

```js
// screenshot
{ type: "skfiy.page.screenshot", tabId, payload: { format: "png" } }

// click
{ type: "skfiy.page.action", tabId, payload: { action: { kind: "click", selector } } }

// fill
{ type: "skfiy.page.action", tabId, payload: { action: { kind: "fill", selector, value: text } } }

// submit
{ type: "skfiy.page.action", tabId, payload: { action: { kind: "submit", selector, confirmed: true } } }

// scroll
{ type: "skfiy.page.action", tabId, payload: { action: { kind: "scroll", deltaY: dy } } }
```

Persist bounded results in `src/main/chrome-native-host.ts`:

```ts
pageActionResult?: Record<string, unknown>;
pageScreenshot?: Record<string, unknown>;
```

Refuse sensitive fields before fill/click/submit and return `sensitive-paused` instead of executing.

- [x] **Step 5: Run unit tests**

```bash
npx vitest run src/main/cli-command-surface.test.ts
```

Observed: focused CLI action tests pass. The broader Chrome action slice also passes:

```bash
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js
npx tsc --noEmit
npm run build
```

Latest observed status after extension-context reload, evidence hardening, and
tab-discovery tests:
6 test files / 129 tests passed, TypeScript passed, and `npm run build`
produced the current `dist/skfiy.app`, `dist/skfiy-helper`, and `dist/skfiy`.

- [x] **Step 6: Real local form test**

Run each command against a local test page with a safe form and button. Expected: fill/click/submit/scroll produce before/after page evidence and verified action summaries.

Latest real installed-extension update on 2026-06-21: the safe local page at
`http://127.0.0.1:63852/?skfiy_action_live=20260621&clean=3` opened in Chrome
tab `1782096181`, host policy was set to `always_allow`, and `./dist/skfiy
chrome reload-extension --extension-id plcpkkhlcacihjfohlojdknnkademlno
--target-tab-id 1782096181 --json` returned `result: "verified"` with
`reloadStrategy: "extension-context-wake"` and a fresh `pageControl.state:
"ready"`. Sequential compiled-binary runs of `fill`, `click`, `submit`, and
`scroll` all returned `result: "verified"` with matching
`latestCommand.pageActionResult.action`. Final `observe` returned visible text
`clicked 1` and `submitted skfiy #2`, proving the duplicate wake execution bug
is closed for real action smokes. Screenshot remains open under Task 3.5:
`chrome screenshot` now records precise blocker evidence
`reason: "chrome-capture-permission-missing"` with Chrome's
`Either the '<all_urls>' or 'activeTab' permission is required.` message.

- [x] **Step 7: Commit**

```bash
git add src/main/cli-command-surface.ts src/main/chrome-extension-page-control.ts chrome-extension/background.js chrome-extension/content-script.js src/main/cli-command-surface.test.ts
git commit -m "feat: add Chrome extension page action commands"
```

Observed: committed and pushed as `c346213 feat: add Chrome page-control action commands`.

## Task 3: Extension-Context Self Reload Loop

**Files:**
- Modify: `chrome-extension/popup.js`
- Modify: `src/main/chrome-extension-reloader.ts`
- Test: `src/main/chrome-extension-popup.test.js`
- Test: `src/main/chrome-extension-reloader.test.ts`

- [x] **Step 1: Write failing popup wake test for `dev-reload`**

Add a popup test that opens:

```text
/popup.html?skfiyWake=1&skfiyWakeAction=dev-reload&skfiyTargetTabId=42
```

The test should assert that the popup sends:

```js
{
  type: "skfiy.dev.reload",
  schemaVersion: 1
}
```

instead of a normal `skfiy.host_policy.request` heartbeat.

Observed: `src/main/chrome-extension-popup.test.js` now covers
`skfiyWakeAction=dev-reload` and asserts that the popup schedules the extension
context reload path through `skfiy.dev.reload`.

- [x] **Step 2: Run the popup test red**

```bash
npx vitest run src/main/chrome-extension-popup.test.js -t "auto-schedules dev reload"
```

Expected before implementation: FAIL because the current wake handler only auto-runs observe or heartbeat.

Observed before implementation: the focused test failed because the wake handler
did not branch to `reloadExtension()` for `dev-reload`.

- [x] **Step 3: Implement popup auto dev reload**

In `chrome-extension/popup.js`, extend the wake handler:

```js
if (readWakeAction() === "observe") {
  void observeCurrentPageFromWake();
} else if (readWakeAction() === "dev-reload") {
  void reloadExtension();
} else {
  void checkHeartbeat();
}
```

The `reloadExtension()` path must keep using the existing `skfiy.dev.reload` background message so the actual reload happens inside the extension context with `chrome.runtime.reload()`.

Observed: `chrome-extension/popup.js` now treats `skfiyWakeAction=dev-reload`
as a reload wake and keeps normal heartbeat/observe behavior for other wake
paths.

- [x] **Step 4: Write failing reloader fast-path test**

Add a test in `src/main/chrome-extension-reloader.test.ts` where `targetTabId: 42` is supplied. The test should expect:

```ts
{
  result: "verified",
  reloadStrategy: "extension-context-wake",
  contextReloadUrl: expect.stringContaining("skfiyWakeAction=dev-reload")
}
```

The test should also assert that `helper.activateApp` and desktop OCR helpers are not called when the extension-context wake path verifies the requested target tab.

Observed: `src/main/chrome-extension-reloader.test.ts` now covers both the
verified extension-context fast path and the fallback case where the target tab
does not become ready.

- [x] **Step 5: Run the reloader test red**

```bash
npx vitest run src/main/chrome-extension-reloader.test.ts -t "extension-context dev reload"
```

Expected before implementation: FAIL because `reload-extension` opens `chrome://extensions` first.

Observed before implementation: the focused reloader test failed because
`reload-extension` opened `chrome://extensions` before trying an extension wake.

- [x] **Step 6: Implement extension-context reload before desktop fallback**

In `src/main/chrome-extension-reloader.ts`, when `targetTabId` is present:

1. open `createChromeExtensionWakeUrl(extensionId, { targetTabId, wakeAction: "dev-reload" })`,
2. wait for the extension reload to be scheduled,
3. open the normal target-tab wake URL,
4. poll `chrome-extension-connection.json`,
5. return `result: "verified"` only when the fresh heartbeat reports the requested `targetTabId`,
6. fall back to the current `chrome://extensions` OCR/click path when the context wake path does not verify.

Add optional result fields:

```ts
contextReloadUrl?: string;
reloadStrategy?: "extension-context-wake" | "desktop-extension-card";
```

Use the existing locked-desktop guard on the fallback path, so a locked macOS session still returns `reason: "desktop-session-locked"` instead of trying to click.

Observed: `src/main/chrome-extension-reloader.ts` now tries
`skfiyWakeAction=dev-reload`, reopens the normal wake URL, verifies
the target-tab heartbeat and DOM-action readiness, and only then returns
`reloadStrategy: "extension-context-wake"`. Screenshot readiness is checked
separately by Task 4.5. The desktop OCR/click path remains as fallback and still
fails closed on `desktop-session-locked`.

- [x] **Step 7: Verify and build**

```bash
npx vitest run src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts
npx tsc --noEmit
npm run build
```

Observed: the current Chrome extension slice passed locally:

```bash
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts
npx tsc --noEmit
npm run build
```

The Vitest run reported 6 files / 129 tests passed, TypeScript passed, and the
build rebuilt `dist/skfiy.app`, `dist/skfiy-helper`, and `dist/skfiy`.

- [x] **Step 8: Real reload smoke**

Run:

```bash
./dist/skfiy chrome reload-extension \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" \
  --json
```

Expected after the installed extension has the new popup/background code:
`result: "verified"`, `reloadStrategy: "extension-context-wake"`, and a fresh
`extensionConnection.pageControl.activeTab.tabId` matching the requested tab.
If extension-context verification fails or the desktop fallback is locked, the
valid intermediate result is a typed blocker plus a fallback next action, not a
blind click.

Observed on 2026-06-21 against target tab `1782096085`: compiled
`./dist/skfiy chrome reload-extension` returned `result: "verified"`,
`reloadStrategy: "extension-context-wake"`, and a fresh target-tab
page-control heartbeat for the requested tab. Later screenshot testing proved
that this reload proof should be read as DOM-action readiness until Task 4.5
separates capture permission from the general page-control state.

- [x] **Step 9: Commit**

```bash
git add chrome-extension/popup.js src/main/chrome-extension-reloader.ts src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts
git commit -m "feat: add Chrome extension-context reload wake"
```

Observed: included in commit `7dfbd63 feat: harden Chrome extension wake evidence`, pushed to `main`.

## Task 3.5: Page-Control Evidence Isolation

**Files:**
- Modify: `src/main/chrome-extension-page-control.ts`
- Modify: `chrome-extension/popup.js`
- Modify: `chrome-extension/background.js`
- Test: `src/main/chrome-extension-page-control.test.ts`
- Test: `src/main/chrome-extension-popup.test.js`
- Test: `src/main/chrome-extension-background.test.js`

- [x] **Step 1: Add failing tests for stale action and empty screenshot evidence**

Add tests that prove these cases remain blocked:

```ts
// src/main/chrome-extension-page-control.test.ts
expect(await invokeChromeExtensionPageControl({
  action: "click",
  extensionId: EXTENSION_ID,
  homeDir: "/Users/tester",
  targetTabId: 42,
  selector: "#submit",
  io,
  opener,
  wait,
  pollTimeoutMs: 1
})).toMatchObject({
  result: "blocked",
  action: "click",
  extensionConnection: {
    pageActionResult: {
      action: "submit"
    }
  }
});

expect(await invokeChromeExtensionPageControl({
  action: "screenshot",
  extensionId: EXTENSION_ID,
  homeDir: "/Users/tester",
  targetTabId: 42,
  io,
  opener,
  wait,
  pollTimeoutMs: 1
})).toMatchObject({
  result: "blocked",
  action: "screenshot",
  reason: "chrome-capture-blocked",
  extensionConnection: {
    pageScreenshot: {
      hasDataUrl: false
    }
  }
});
```

Observed: these tests were added so a click can no longer be verified by a
submit heartbeat, and a screenshot can no longer be verified by a blocked result
that lacks image bytes.

- [x] **Step 2: Require typed evidence before verification**

In `src/main/chrome-extension-page-control.ts`, verification must only pass
when the heartbeat matches the requested action:

```ts
function hasScreenshotData(connection: Record<string, unknown>): boolean {
  const screenshot = readRecord(connection.pageScreenshot);
  return screenshot?.hasDataUrl === true;
}

function hasExpectedActionResult(connection: Record<string, unknown>, action: ChromeExtensionPageControlAction): boolean {
  const result = readRecord(connection.pageActionResult);
  return typeof result?.action === "string" && result.action === action;
}
```

Observed: action commands now return blocked for mismatched heartbeats instead
of treating any fresh `pageActionResult` as success. Native Messaging also
persists a separate `latestCommand` object with its own `observedAt`,
`messageType`, `requestId`, and bounded page evidence, so readiness or host
policy health heartbeats can update the live connection without hiding the most
recent command result. Page-control verification accepts `latestCommand` only
when its `observedAt` is not older than the current request start time.

- [x] **Step 3: Record bounded screenshot blocker evidence**

In `chrome-extension/background.js`, `routePageScreenshot()` should activate the
target tab before capture and return a bounded `skfiy.page.screenshot_result`
when Chrome blocks capture:

```js
try {
  await chrome.tabs.update(tab.id, { active: true });
  dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format });
} catch (error) {
  return {
    type: MESSAGE_TYPES.PAGE_SCREENSHOT_RESULT,
    result: "blocked",
    reason: error instanceof Error ? error.message : "capture_visible_tab_failed",
    tabId: tab.id,
    format
  };
}
```

Observed: background tests now prove capture failures are persisted without raw
image data or secrets.

- [x] **Step 4: Make background the single wake-action executor**

In `chrome-extension/background.js`, `skfiyWakeAction=screenshot|click|fill|submit|scroll`
must create a typed page-control request, redact fill text from Native Messaging
evidence, and summarize screenshot data as `hasDataUrl` plus `dataUrlBytes`
rather than storing the raw `dataUrl`. In `chrome-extension/popup.js`, those
same wake actions must be a no-op so the popup does not duplicate clicks,
submits, scrolls, or screenshot captures already scheduled by the background
service worker.

Observed: background tests prove action wake requests are relayed, fill text is
redacted, screenshot blockers are bounded, and repeated `tabs.onUpdated` events
for the same wake URL are deduplicated. Popup tests prove screenshot/action wake
URLs do not execute inside the popup.

- [x] **Step 5: Verify evidence isolation**

Run:

```bash
npx vitest run src/main/chrome-extension-page-control.test.ts src/main/chrome-extension-popup.test.js src/main/chrome-extension-background.test.js
```

Observed: the evidence-isolation slice passes as part of the broader 6-file /
126-test Chrome extension verification run.

- [ ] **Step 6: Close real screenshot smoke**

Run after rebuilding and extension-context reload:

```bash
./dist/skfiy chrome reload-extension \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" \
  --json
./dist/skfiy chrome screenshot \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" \
  --json
```

Expected pass: `result: "verified"` and
`extensionConnection.pageScreenshot.hasDataUrl: true`.

Observed blocked shape on 2026-06-21: `result: "blocked"`, `reason:
"chrome-capture-permission-missing"`, and
`extensionConnection.latestCommand.pageScreenshot.reason: "Either the
'<all_urls>' or 'activeTab' permission is required."` after the duplicate
capture path was removed. Current desktop fallback is unavailable because
`./dist/skfiy-helper desktop-session-status` reports `cgSessionScreenIsLocked:
true`, `ioConsoleLocked: true`, `frontmostBundleId: "com.apple.loginwindow"`,
and `mainDisplayAsleep: true`.

- [x] **Step 7: Commit with Task 3**

```bash
git add chrome-extension/background.js chrome-extension/popup.js src/main/chrome-extension-background.test.js src/main/chrome-extension-page-control.test.ts src/main/chrome-extension-page-control.ts src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts src/main/chrome-extension-reloader.ts
git commit -m "feat: harden Chrome extension reload and action wake evidence"
```

Observed: committed and pushed as `7dfbd63 feat: harden Chrome extension wake evidence`.

## Task 4: Tab Discovery and Blocker States

**Files:**
- Modify: `src/main/cli-command-surface.ts`
- Modify: `src/main/chrome-extension-page-control.ts`
- Modify: `src/main/chrome-native-host.ts`
- Modify: `chrome-extension/popup.js`
- Modify: `chrome-extension/manifest.json`
- Modify: `chrome-extension/background.js`
- Test: `src/main/cli-command-surface.test.ts`
- Test: `src/main/chrome-native-host.test.ts`
- Test: `src/main/chrome-extension-popup.test.js`
- Test: `src/main/chrome-extension-manifest.test.ts`
- Test: `src/main/chrome-extension-background.test.js`

- [x] **Step 1: Write failing test for `chrome tabs --json`**

The test should return eligible and blocked tabs with states for ordinary HTTP(S), `chrome://`, `chrome-extension://`, `file://`, missing skfiy host policy, and missing Chrome optional host permission.

Observed before implementation:

```bash
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js --testNamePattern "chrome tabs|tab discovery|bounded Chrome tab|latest tab discovery|operator commands"
```

The red run failed because `chrome tabs` was not in the CLI command surface, the background returned `unsupported_message` for tab discovery, and Native Messaging did not preserve `latestCommand.pageTabs`.

- [x] **Step 2: Implement tab discovery**

Expose a background message that reads extension-visible tabs and returns bounded metadata: id, window id, title, URL, host, eligibility state, blocker code, and next action.

Implemented:

- `chrome-extension/background.js` now supports `skfiy.tabs.discover`, returns `skfiy.tabs.discover_result`, and records `payload.pageTabs` through Native Messaging.
- `chrome-extension/popup.js` now treats `skfiyWakeAction=tabs` as a tab-discovery wake, sending `skfiy.tabs.discover` instead of a normal heartbeat so old `skfiy.page.observe` evidence cannot masquerade as a tab scan.
- `src/main/chrome-extension-page-control.ts` now exports `invokeChromeExtensionTabDiscovery()`, opens a `skfiyWakeAction=tabs` wake URL, polls `chrome-extension-connection.json`, and only verifies fresh `skfiy.tabs.discover` evidence.
- `src/main/chrome-native-host.ts` preserves bounded `pageTabs` evidence across later health heartbeats and drops raw page content fields such as `visibleText` and `cookies`.
- `chrome-extension/manifest.json` is bumped to `0.0.3` so the packaged CLI can compare local extension source against Chrome's registered MV3 service-worker version.
- `chrome-extension/background.js` now scans already-open skfiy wake tabs when the service worker starts, so `skfiyWakeAction=tabs` still runs if Chrome wakes the service worker after the extension tab finished loading.

- [x] **Step 3: CLI output**

`./dist/skfiy chrome tabs --extension-id "$SKFIY_CHROME_EXTENSION_ID" --json` must return a stable `tabs[]` array and never expose raw cookies, page text, or secrets.

Observed code-side verification:

```bash
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js --testNamePattern "chrome tabs|tab discovery|bounded Chrome tab|latest tab discovery|operator commands"
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts
npx tsc --noEmit
npm run build
```

Observed results: focused tab-discovery slice passed; the broader Chrome slice passed with 7 files / 133 tests; TypeScript passed; `npm run build` rebuilt `dist/skfiy.app`, `dist/skfiy-helper`, and `dist/skfiy`. Later 0.0.6 hardening added tab-query failure evidence and `tabs.onCreated` wake handling; the updated Chrome slice passed with 7 files / 136 tests, followed by `npx tsc --noEmit` and `npm run build`.

Observed live blocker before installed-extension reload:

```bash
./dist/skfiy chrome tabs --extension-id plcpkkhlcacihjfohlojdknnkademlno --json
```

now returns `result: "blocked"`, `reason: "extension-registration-stale"`, `tabs: []`, `extensionRegistration.localManifestVersion: "0.0.3"`, `extensionRegistration.registeredVersion: "0.0.2"`, and `extensionRegistration.extensionPath: "/Users/bytedance/Desktop/test/skfiy/chrome-extension"`. This proves the packaged CLI can distinguish Chrome service-worker registration drift from a generic tab-discovery failure. Next step: use the Chrome extension-card reload button from an unlocked desktop or another Chrome-supported re-registration path, then rerun the same compiled command until `latestCommand.messageType` is `skfiy.tabs.discover`.

- [x] **Step 3.4: Add stale registration diagnostics**

Add a CLI diagnostic before `chrome tabs` returns a generic not-verified result. The command should read:

- local manifest: `chrome-extension/manifest.json`,
- Chrome profile: `~/Library/Application Support/Google/Chrome/Default/Secure Preferences`,
- extension entry: `extensions.settings[plcpkkhlcacihjfohlojdknnkademlno]`,
- registered version: `service_worker_registration_info.version`,
- installed path: `extensions.settings[...].path`.

When local version and registered version differ, `chrome tabs --json` must return:

```json
{
  "result": "blocked",
  "reason": "extension-registration-stale",
  "extensionRegistration": {
    "state": "stale",
    "localManifestVersion": "0.0.3",
    "registeredVersion": "0.0.2",
    "extensionPath": "/Users/bytedance/Desktop/test/skfiy/chrome-extension"
  },
  "nextAction": "Reload the skfiy extension card in Chrome Extension Manager so Chrome re-registers the MV3 service worker, then retry `skfiy chrome tabs`."
}
```

Verification:

```bash
npx vitest run src/main/cli-command-surface.test.ts --testNamePattern "stale Chrome extension registration"
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-manifest.test.ts src/main/chrome-extension-popup.test.js
npx tsc --noEmit
npm run build
./dist/skfiy chrome tabs --extension-id plcpkkhlcacihjfohlojdknnkademlno --json
```

Observed verification on 2026-06-21:

```bash
npx vitest run src/main/cli-command-surface.test.ts --testNamePattern "stale Chrome extension registration"
npx vitest run src/main/chrome-extension-background.test.js --testNamePattern "tabs wake page already loaded"
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts src/main/chrome-extension-manifest.test.ts
npx tsc --noEmit
npm run build
./dist/skfiy chrome tabs --extension-id plcpkkhlcacihjfohlojdknnkademlno --json
```

Observed interim live result before the extension-card reload: the JSON contains
`result: "blocked"`, `reason: "extension-registration-stale"`, local version
`0.0.3`, registered version `0.0.2`, and the repository `chrome-extension`
path.

- [ ] **Step 3.5: Prove tab discovery in the real installed extension**

Run:

```bash
./dist/skfiy chrome reload-extension \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" \
  --json
./dist/skfiy chrome tabs \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --json
```

Expected pass after Chrome re-registers the service worker: `result:
"verified"`, `extensionConnection.messageType: "skfiy.tabs.discover"`, and
`tabs[]` containing at least one eligible ordinary HTTP(S) tab plus typed
blockers for internal/non-controllable pages. Expected blocked shape before
re-registration: `reason: "extension-registration-stale"` plus
local/registered version evidence and a next action to reload the installed
extension card. Historical boundary after Task 4.5: Chrome registration is fresh at
`0.0.4`, but `./dist/skfiy chrome tabs --extension-id
plcpkkhlcacihjfohlojdknnkademlno --json` still returned `reason:
"chrome-tabs-not-verified"` because no fresh `skfiy.tabs.discover` / `pageTabs`
Native Messaging evidence was written. That was the historical Task 4.5
boundary. Current boundary after Task 4.6: local source is now `0.0.6`, Chrome
remains registered at `0.0.5`, and the command correctly blocks as
`extension-registration-stale` until the installed extension service worker is
re-registered.

- [ ] **Step 4: Commit**

```bash
git add src/main/cli-command-surface.ts src/main/chrome-extension-page-control.ts chrome-extension/background.js src/main/cli-command-surface.test.ts
git commit -m "feat: add Chrome tab discovery blockers"
```

## Task 4.5: Screenshot Capture Readiness Contract

**Files:**
- Modify: `chrome-extension/background.js`
- Modify: `src/main/chrome-extension-background.test.js`
- Modify: `docs/chrome-extension-setup.md`
- Test: `src/main/chrome-extension-background.test.js`
- Test: `src/main/chrome-extension-page-control.test.ts`

- [x] **Step 1: Add focused regression for site-only permission**

Add a background test where:

```js
const mock = createChromeMock([], {
  activeTab: {
    id: 46,
    windowId: 8,
    url: "https://allowed.example/dashboard"
  },
  grantedOrigins: ["https://allowed.example/*"],
  contentScriptSession: {
    state: "loaded",
    pageControl: {
      state: "ready",
      capabilities: {
        diagnostics: true,
        observe: true,
        domActions: true,
        click: true,
        fill: true,
        submit: true,
        scroll: true,
        screenshot: "background_required"
      }
    }
  }
});
```

Expected health response:

```js
expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
  pageControl: expect.objectContaining({
    capable: true,
    state: "partial",
    reason: "Chrome visible-tab capture requires <all_urls> permission or an activeTab user gesture.",
    capabilities: expect.objectContaining({
      domActions: true,
      screenshot: false
    }),
    chromeCapturePermission: expect.objectContaining({
      state: "missing",
      origins: ["<all_urls>"]
    }),
    screenshot: {
      capable: false,
      state: "blocked",
      reason: "Chrome visible-tab capture requires <all_urls> permission or an activeTab user gesture.",
      nextAction: "grant_chrome_capture_permission"
    }
  })
}));
```

Observed local WIP: the focused red test was added and now passes after the
background readiness implementation. The full background suite still needs a
fresh rerun and expectation cleanup.

- [x] **Step 2: Implement capture permission status in background health**

`chrome-extension/background.js` should expose:

```js
function createChromeCapturePermissionMessage() {
  return "Chrome visible-tab capture requires <all_urls> permission or an activeTab user gesture.";
}
```

`readCurrentTabDiagnostics()` should include `chromeCapturePermission`, and
`createPageControlReadiness()` should compute:

```js
const capturePermissionReady = currentTab?.chromeCapturePermission?.state === "granted";
const screenshotAvailable = activeTabAvailable
  && hostPolicyAllowed
  && capabilities?.tabs === true
  && capturePermissionReady;
```

When capture permission is missing, the page-control result should be partial:
DOM actions remain available, screenshot is blocked, and `nextAction` is
`grant_chrome_capture_permission`.

- [x] **Step 3: Repair existing readiness tests**

Run:

```bash
npx vitest run src/main/chrome-extension-background.test.js
```

Expected work: tests that intentionally model a fully screenshot-ready extension
must add `"<all_urls>"` to `grantedOrigins`; tests that model only current-site
host access must expect `pageControl.state: "partial"` and
`capabilities.screenshot: false`. Do not restore the old false-positive
behavior where `activeTab` plus current host permission made screenshot look
ready.

Observed: `src/main/chrome-extension-background.test.js` now has 28 passing
tests. Fully screenshot-ready tests explicitly grant `"<all_urls>"`, while
site-only tests assert DOM actions are still available and screenshot is
blocked.

- [x] **Step 4: Verify the Chrome slice and build**

Run:

```bash
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts src/main/chrome-extension-manifest.test.ts
npx tsc --noEmit
npm run build
```

Expected: all commands pass; `dist/skfiy.app`, `dist/skfiy-helper`, and
`dist/skfiy` rebuild from the same commit.

Observed:

```bash
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts src/main/chrome-extension-manifest.test.ts
npx tsc --noEmit
npm run build
```

The Chrome slice passed with 7 files / 134 tests, TypeScript passed, and
`npm run build` rebuilt `dist/skfiy.app`, `dist/skfiy-helper`, and `dist/skfiy`.

- [x] **Step 5: Real installed-extension verification**

Run:

```bash
./dist/skfiy chrome reload-extension \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" \
  --json
./dist/skfiy chrome screenshot \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" \
  --json
```

Expected interim result before capture permission/fallback closes: reload can
verify DOM-action readiness, but screenshot returns
`reason: "chrome-capture-permission-missing"` and dashboard/status health show
the page-control lane as `partial`, not full `ready`.

Observed on 2026-06-21:

```bash
./dist/skfiy chrome screenshot \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id 1782096181 \
  --json
```

The packaged command returned `result: "blocked"`, `reason:
"chrome-capture-permission-missing"`. The same response included
`extensionConnection.pageControl.state: "partial"`,
`capabilities.domActions: true`, `capabilities.screenshot: false`,
`chromeCapturePermission.state: "missing"`, and screenshot
`nextAction: "grant_chrome_capture_permission"`. This proves the readiness
contract is now honest in the real installed extension path.

Related live `chrome tabs` result after the 0.0.6 tab-discovery hardening:

```bash
./dist/skfiy chrome tabs \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --json
```

Chrome registration is stale again: local manifest `0.0.6`, registered service
worker `0.0.5`. The command returns `result: "blocked"`, `reason:
"extension-registration-stale"` with version/path evidence. The latest
extension-context reload attempt returned `reload: "desktop-session-locked"` and
left the registered service worker at `0.0.5`, so the next Task 4 blocker is
extension service-worker re-registration, separate from screenshot readiness.

- [x] **Step 6: Commit**

```bash
git add chrome-extension/background.js chrome-extension/manifest.json src/main/chrome-extension-background.test.js src/main/chrome-extension-manifest.test.ts docs/chrome-extension-setup.md docs/research/2026-06-20-dashboard-cli-plan.md docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md
git commit -m "fix: report Chrome screenshot capture permission readiness"
```

Observed: commit `216aad0` (`fix: report Chrome screenshot capture permission readiness`) was pushed to `main`.

## Task 4.6: Tab Discovery Wake And Failure Hardening

**Files:**
- Modify: `chrome-extension/background.js`
- Modify: `chrome-extension/manifest.json`
- Modify: `src/main/chrome-extension-background.test.js`
- Modify: `src/main/chrome-extension-manifest.test.ts`
- Modify: `docs/research/2026-06-20-dashboard-cli-plan.md`
- Modify: `docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md`
- Test: `src/main/chrome-extension-background.test.js`
- Test: `src/main/chrome-extension-manifest.test.ts`

- [x] **Step 1: Add regression for tab query failure**

Add a background test that makes `chrome.tabs.query({})` throw `Tabs cannot be
queried in this context`. Expected result: Native Messaging receives
`payload.pageTabs.result: "blocked"`, `reason: "Tabs cannot be queried in this
context"`, and `tabs: []`; the direct response is
`skfiy.tabs.discover_result` with the same blocked reason.

- [x] **Step 2: Add regression for newly created wake tabs**

Add a background test where a tab is created with:

```text
chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=created-tabs&skfiyWakeAction=tabs
```

Expected result: the service worker schedules tab discovery from
`chrome.tabs.onCreated`, records `skfiy.tabs.discover` Native Messaging
evidence, includes the extension wake tab as a blocked extension page, and also
includes an ordinary HTTP(S) tab from the same query.

- [x] **Step 3: Implement bounded tab discovery hardening**

Implementation details:

- `discoverChromeTabs()` catches top-level tab-query failures and still writes bounded `pageTabs` evidence.
- Per-tab summarization failures become blocked tab summaries with `blocker: "tab_summary_failed"` instead of aborting the full discovery.
- `registerTabHeartbeatListeners()` registers `chrome.tabs.onCreated` and schedules wake directives for newly opened skfiy wake tabs.
- `chrome-extension/manifest.json` and the fallback manifest are bumped to `0.0.6` so Chrome registration drift remains detectable.

- [x] **Step 4: Verify the code-side slice**

Run:

```bash
npx vitest run src/main/chrome-extension-background.test.js --testNamePattern "wake page is created|tab query fails"
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts src/main/chrome-extension-manifest.test.ts
npx tsc --noEmit
npm run build
```

Observed: focused tests passed; the full Chrome slice passed with 7 files / 136
tests; TypeScript passed; `npm run build` rebuilt the packaged app/helper/CLI.

- [ ] **Step 5: Prove extension-native tab discovery without fallback**

Run:

```bash
./dist/skfiy chrome reload-extension \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" \
  --json
./dist/skfiy chrome tabs \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --json
```

Current product bridge after Task 4.9: `./dist/skfiy chrome tabs --json`
returns `result: "verified"` through `discoveryMode: "chrome-apple-events"`.
Expected extension-native pass for this step: fresh
`extensionConnection.messageType: "skfiy.tabs.discover"`, fresh `pageTabs`
evidence, at least one eligible ordinary HTTP(S) tab, typed blockers for
internal/non-controllable tabs, and no need to use the Apple Events fallback.

- [x] **Step 6: Commit**

```bash
git add chrome-extension/background.js chrome-extension/manifest.json src/main/chrome-extension-background.test.js src/main/chrome-extension-manifest.test.ts docs/research/2026-06-20-dashboard-cli-plan.md docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md
git commit -m "fix: harden Chrome tab discovery wake evidence"
```

Observed: commit `e18e16c` (`fix: harden Chrome tab discovery wake evidence`)
was pushed to `main`.

## Task 4.7: Reload Command Registration Drift Blocker

**Files:**
- Modify: `src/main/cli-command-surface.ts`
- Modify: `src/main/cli-command-surface.test.ts`
- Modify: `docs/chrome-extension-setup.md`
- Modify: `docs/research/2026-06-20-dashboard-cli-plan.md`
- Modify: `docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md`
- Test: `src/main/cli-command-surface.test.ts`

- [x] **Step 1: Add failing CLI regression**

Add a `chrome reload-extension` test where:

- local `chrome-extension/manifest.json` reports `0.0.6`,
- Chrome `Secure Preferences` reports registered service worker `0.0.5`,
- the reloader returns `result: "blocked"` with `reason: "desktop-session-locked"`.

Expected output: top-level `reason: "extension-card-reload-required"`,
`extensionRegistration.state: "stale"`, local/registered versions, extension
path, and a `desktopFallback.reason: "desktop-session-locked"` object preserving
the original desktop blocker.

- [x] **Step 2: Implement CLI output enrichment**

When `chrome reload-extension` returns blocked, call
`readChromeExtensionRegistrationStatus()`. If registration is stale, replace the
top-level reason with `extension-card-reload-required`, attach
`extensionRegistration`, preserve the original desktop blocker under
`desktopFallback`, and set `nextAction` to tell the user to open
`chrome://extensions` on an unlocked desktop and click the skfiy reload button.

- [x] **Step 3: Verify the code-side slice**

Run:

```bash
npx vitest run src/main/cli-command-surface.test.ts --testNamePattern "extension card reload requirement"
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-reloader.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-manifest.test.ts src/main/chrome-extension-background.test.js
npx tsc --noEmit
```

Observed: focused test passed; broader CLI/reloader/background slice passed with
6 files / 124 tests; TypeScript passed.

- [x] **Step 4: Prove with compiled binary**

Run:

```bash
npm run build
./dist/skfiy chrome reload-extension \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" \
  --json
```

Expected blocker while Chrome remains on an older registered service worker:
`result: "blocked"`, `reason: "extension-card-reload-required"`,
`extensionRegistration.localManifestVersion` newer than
`extensionRegistration.registeredVersion`, and
`desktopFallback.reason` if the desktop fallback cannot click the extension card.

Observed with compiled `dist/skfiy` on 2026-06-21: local manifest `0.0.7`,
registered service worker `0.0.6`, top-level reason
`extension-card-reload-required`, and `desktopFallback.reason:
"desktop-session-locked"`.

- [x] **Step 5: Commit**

```bash
git add src/main/cli-command-surface.ts src/main/cli-command-surface.test.ts docs/chrome-extension-setup.md docs/research/2026-06-20-dashboard-cli-plan.md docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md
git commit -m "fix: surface Chrome extension card reload blocker"
```

Observed: the reload blocker enrichment was folded into the pushed `33c041b
fix: recover Chrome tabs wake execution` change set, alongside the wake recovery
and registration-drift diagnostics.

## Task 4.8: Tabs Wake Execution Recovery

**Files:**
- Modify: `chrome-extension/popup.js`
- Modify: `chrome-extension/background.js`
- Modify: `chrome-extension/manifest.json`
- Modify: `src/main/chrome-extension-popup.test.js`
- Modify: `src/main/chrome-extension-background.test.js`
- Modify: `src/main/chrome-extension-manifest.test.ts`
- Modify: `docs/research/2026-06-20-dashboard-cli-plan.md`
- Modify: `docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md`
- Test: `src/main/chrome-extension-popup.test.js`
- Test: `src/main/chrome-extension-background.test.js`

- [x] **Step 1: Add popup regression for render failure**

Add a popup test where `skfiyWakeAction=tabs` is present and the initial
`skfiy.host_policy.sync_status` render request throws. Expected result:
`popup.js` still sends `skfiy.tabs.discover` and does not fall back to a generic
native heartbeat.

- [x] **Step 2: Run it red**

Observed before implementation: only `skfiy.host_policy.sync_status` was sent;
`skfiy.tabs.discover` was never sent.

- [x] **Step 3: Execute tabs wake before UI render**

`popup.js` now starts the `tabs` wake action before `renderPopup()` so tab
discovery does not depend on the UI status render path. Other wake actions still
run after render to avoid overwriting visible reload/observe status.

- [x] **Step 4: Add background query-string recovery regression**

Add a background test where `tabs.onUpdated` reports an extension URL without the
original query string, while `chrome.tabs.query({})` can still see an existing
`skfiyWakeAction=tabs` tab. Expected result: background rescans existing wake
tabs and records `skfiy.tabs.discover` Native Messaging evidence.

- [x] **Step 5: Implement background recovery**

When an extension page update does not directly yield a wake directive,
background schedules `scheduleExistingWakeTabs()` before returning, so Chrome
events that drop the query string can still recover from the full tab list.

- [x] **Step 6: Verify code-side slice**

Run:

```bash
npx vitest run src/main/chrome-extension-popup.test.js --testNamePattern "tab discovery from wake URLs"
npx vitest run src/main/chrome-extension-background.test.js --testNamePattern "query string|wake page is created|tabs wake page already loaded|tab query fails"
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-popup.test.js src/main/chrome-extension-background.test.js src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-reloader.test.ts src/main/chrome-extension-manifest.test.ts
npx tsc --noEmit
npm run build
```

Observed: popup focused slice passed; background query-string regression passed;
the full Chrome slice passed with 7 files / 139 tests; TypeScript passed; `npm
run build` rebuilt the packaged app/helper/CLI.

- [x] **Step 7: Prove with compiled binary**

Run:

```bash
./dist/skfiy chrome tabs \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --json
```

Initial observed blocker with compiled `dist/skfiy` on 2026-06-21:
`skfiy chrome tabs` returned `result: "blocked"`, `reason:
"extension-registration-stale"`, `extensionRegistration.localManifestVersion:
"0.0.7"`, and `extensionRegistration.registeredVersion: "0.0.6"`.

Updated live state after the Chrome extension card was refreshed: Chrome reports
the installed service worker at `0.0.7`. The command no longer blocks on
registration drift, but the real MV3 wake still does not write fresh
`skfiy.tabs.discover` / `pageTabs` evidence. Task 4.9 adds the compiled CLI
fallback that makes tab discovery usable while this native-evidence gap remains.

- [x] **Step 8: Commit**

```bash
git add chrome-extension/popup.js chrome-extension/background.js chrome-extension/manifest.json src/main/chrome-extension-popup.test.js src/main/chrome-extension-background.test.js src/main/chrome-extension-manifest.test.ts docs/research/2026-06-20-dashboard-cli-plan.md docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md
git commit -m "fix: recover Chrome tabs wake execution"
```

Observed: committed and pushed as `33c041b fix: recover Chrome tabs wake execution`.

## Task 4.9: Packaged Chrome Tab Discovery Fallback

**Files:**
- Modify: `src/main/chrome-extension-page-control.ts`
- Modify: `src/main/chrome-extension-page-control.test.ts`
- Modify: `docs/research/2026-06-20-dashboard-cli-plan.md`
- Modify: `docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md`
- Test: `src/main/chrome-extension-page-control.test.ts`

- [x] **Step 1: Add failing fallback regression**

Add a tab-discovery invoker test where the extension connection is fresh but has
no fresh `skfiy.tabs.discover` / `pageTabs` evidence. Inject a fake fallback tab
lister returning one HTTPS page and one `chrome://extensions` tab. Expected
result: `result: "verified"`, `discoveryMode: "chrome-apple-events"`, the HTTPS
tab marked eligible, and the `chrome://` tab blocked as `internal_chrome_page`.

- [x] **Step 2: Implement fallback**

`invokeChromeExtensionTabDiscovery()` now attempts the extension wake first. If
no fresh `pageTabs` evidence arrives, it falls back to a Chrome Apple Events tab
lister, converts URLs into bounded tab summaries, and returns
`discoveryMode: "chrome-apple-events"` when at least one tab is discovered.

- [x] **Step 3: Verify code-side slice**

Run:

```bash
npx vitest run src/main/chrome-extension-page-control.test.ts --testNamePattern "Apple Events"
npx vitest run src/main/chrome-extension-page-control.test.ts src/main/cli-command-surface.test.ts --testNamePattern "chrome tabs|Apple Events|stale Chrome extension registration"
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-extension-popup.test.js src/main/chrome-extension-background.test.js src/main/chrome-native-host.test.ts src/main/chrome-extension-reloader.test.ts src/main/chrome-extension-manifest.test.ts
npx tsc --noEmit
npm run build
```

Observed: focused fallback tests passed; broader tabs/CLI slice passed; full
Chrome verification passed with 7 files / 140 tests; TypeScript passed; `npm run
build` rebuilt the packaged app/helper/CLI.

- [x] **Step 4: Prove with compiled binary**

Run:

```bash
./dist/skfiy chrome tabs \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --json
```

Observed with compiled `dist/skfiy` on 2026-06-21: `result: "verified"`,
`discoveryMode: "chrome-apple-events"`, and non-empty `tabs[]` containing
eligible HTTP(S) pages plus blocked `chrome://` and `chrome-extension://` pages.

- [x] **Step 5: Commit**

```bash
git add src/main/chrome-extension-page-control.ts src/main/chrome-extension-page-control.test.ts docs/research/2026-06-20-dashboard-cli-plan.md docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md
git commit -m "feat: add Chrome tab discovery fallback"
```

Observed: committed and pushed as `55d0e06 feat: add Chrome tab discovery fallback`.

## Task 5: User Dashboard Chrome Control Card

**Files:**
- Modify: `src/main/dashboard-data.ts`
- Modify: `src/main/dashboard-server.ts`
- Modify: dashboard HTML helper code colocated with the server
- Test: `src/main/dashboard-data.test.ts`
- Test: `src/main/dashboard-server.test.ts`
- Test: `src/main/dashboard-smoke-script.test.ts`

Implementation note from the dashboard survey subagent: the safest user-facing
entry point is `renderUserAppsSitesPanel()` in `src/main/dashboard-server.ts`.
Do not move raw Chrome heartbeat JSON, smoke artifact paths, PIDs, or the
existing Advanced Diagnostics lanes onto the first screen. Keep
`renderEvidenceSummaryPanel()`, `renderSmokeEvidencePanel()`,
`createChromePageControlRows()`, policy controls, alert groups,
`data-dashboard-root`, `aria-label="skfiy user dashboard"`,
`data-user-panel="apps-sites"`, `renderUserDashboard(snapshot)`, and
`readUserNextAction(snapshot)` stable unless the dashboard smoke is updated in
the same commit.

- [x] **Step 1: Write dashboard test for user labels**

Require visible labels equivalent to:

- Ready to control this page
- DOM actions ready, screenshot needs permission
- Needs skfiy host approval
- Needs Chrome site access
- Extension needs refresh
- Internal Chrome page cannot be controlled
- Using Chrome tab fallback
- Falling back to screenshot

Recommended test location: use the DOM-oriented
`renderDashboardHtmlWithSnapshot()` helper in `src/main/dashboard-server.test.ts`
so assertions prove what the user sees inside `data-user-panel="apps-sites"`,
not just the presence of helper-function source text.

Observed in commit `e7005fc`: `src/main/dashboard-server.test.ts` now verifies
the Chrome control card and user-facing states inside the Apps and Sites panel.

- [x] **Step 2: Render the Apps and Sites card**

Use `extension.pageControl`, tab discovery state, host policy, Chrome host
permission state, Chrome capture permission state, and `discoveryMode` to show
the user's next action. The card must distinguish:

- DOM control ready and screenshot ready.
- DOM control ready while screenshot needs Chrome capture permission or desktop
  fallback.
- Target-tab discovery using MV3 `skfiy.tabs.discover` when available, with
  packaged `chrome-apple-events` called out as a fallback when native discovery
  is stale, blocked, or unavailable.
- Host blocked by skfiy policy.
- Host blocked by Chrome optional site access.
- Extension stale or needs refresh.
- Internal Chrome/extension/file/unsupported pages that must stay blocked.

Keep raw heartbeat JSON, smoke artifact paths, and command artifacts in Advanced
Diagnostics only.

Observed in commit `e7005fc`: `renderUserAppsSitesPanel()` renders a
user-facing Chrome control card with status labels for ready, partial,
permission-blocked, refresh-required, internal-page, fallback, and screenshot
lanes. Raw evidence remains outside the first-screen user card.

- [x] **Step 3: Add copyable packaged commands for eligible pages**

Only show action launchers for eligible HTTP(S) pages. Initial launchers are
observe, screenshot, click confirmed selector, fill approved field, submit
approved test form, and scroll. Launchers must call the packaged `dist/skfiy`
command surface, not source-tree shims or tmux. Until the launcher endpoint is
implemented, the dashboard may expose copyable packaged commands, but the UI
must label them as commands rather than pretend a click was executed.

Observed in commit `e7005fc`: eligible Chrome states now expose copyable
packaged CLI commands for `observe`, `screenshot`, `click`, `fill`, `submit`,
and `scroll`. They are labelled as commands, not as already-executed dashboard
actions.

- [x] **Step 3a: Add one-click local action launchers**

Add a failing dashboard-server test in `src/main/dashboard-server.test.ts` for a
local-only POST endpoint:

```http
POST /api/chrome-control-action
Content-Type: application/json

{
  "action": "observe",
  "extensionId": "plcpkkhlcacihjfohlojdknnkademlno",
  "targetTabId": 1782096947
}
```

The test should inject a fake `chromeControlRunner` and require the endpoint to
invoke packaged `dist/skfiy`, not a source-tree shim:

```ts
expect(runner.calls[0]).toEqual({
  binaryPath: expect.stringContaining("/dist/skfiy"),
  args: [
    "chrome",
    "observe",
    "--extension-id",
    "plcpkkhlcacihjfohlojdknnkademlno",
    "--target-tab-id",
    "1782096947",
    "--json"
  ]
});
```

Implement the endpoint in `src/main/dashboard-server.ts` beside
`/api/chrome-host-policy`. It must:

- accept only `observe`, `screenshot`, `click`, `fill`, `submit`, and `scroll`;
- require `extensionId` and numeric `targetTabId`;
- require `selector` for `click|fill|submit`, `text` for `fill`, and numeric
  `dy` for `scroll`;
- reject `chrome://`, `chrome-extension://`, `file://`, unsupported schemes,
  missing skfiy host policy, missing Chrome site access, or sensitive fields
  before spawning the command;
- spawn only the packaged binary under the current `rootDir/dist/skfiy`;
- return bounded JSON with `result`, `action`, `targetTabId`, `command`,
  `stdoutSummary`, `blockerReason`, and `activityEntry`;
- never print tokens, raw screenshots, full page text, or unrestricted command
  stdout into the HTML shell.

Run:

```bash
npx vitest run src/main/dashboard-server.test.ts --testNamePattern "chrome control action"
npx tsc --noEmit
```

Expected: endpoint tests pass, TypeScript passes, and unsupported actions return
HTTP 400 with `result: "blocked"` rather than launching a process.

Observed on 2026-06-22: `src/main/dashboard-server.ts` now exposes local-only
`POST /api/chrome-control-action`, validates action arguments and current-page
eligibility, rejects unsupported page schemes before spawning, invokes packaged
`rootDir/dist/skfiy`, returns bounded `activityEntry` evidence, and stores the
latest in the running dashboard snapshot. The Apps and Sites card now renders
one-click launch buttons for observe, screenshot, click, fill, submit, and
scroll plus selector/text inputs. Verification passed:

```bash
npx vitest run src/main/dashboard-server.test.ts --testNamePattern "Chrome control action|Chrome control launcher|one-click Chrome control launchers"
npx tsc --noEmit
```

Packaged endpoint smoke also passed by starting `./dist/skfiy dashboard
--no-open --port 0 --json` and posting an invalid action to
`/api/chrome-control-action`; it returned HTTP 400 with `result: "blocked"` and
`error.code: "unknown-action"`.

- [x] **Step 3b: Record launcher results in Activity**

Write a failing dashboard Activity test that launches an action and then renders
`data-user-panel="activity"`. The Activity panel must show a user-level row like:

```text
Chrome observe
127.0.0.1:59369
Verified
tab 1782096947
```

Store bounded activity evidence in the runtime snapshot shape already consumed
by `renderUserActivityPanel()`:

```json
{
  "kind": "chrome-control-action",
  "title": "Chrome observe",
  "target": {
    "app": "Google Chrome",
    "host": "127.0.0.1:59369",
    "tabId": 1782096947
  },
  "result": "verified",
  "blockerReason": null,
  "command": "dist/skfiy chrome observe --extension-id ... --target-tab-id ... --json",
  "timestamp": "2026-06-22T00:00:00.000Z"
}
```

For blocked actions, show the blocker in user language:

```text
Chrome screenshot
Screenshot permission needed
```

Run:

```bash
npx vitest run src/main/dashboard-server.test.ts --testNamePattern "Activity"
npm run smoke:dashboard -- --output .skfiy-smoke/dashboard-latest.json
```

Expected: the Activity row is visible in HTML, dashboard smoke remains token-free,
and `--require-passed` passes when the launcher surface, snapshot, token hygiene,
and latest Chrome action artifact are healthy. Desktop/session/native-host
readiness can remain visible as typed operator alerts without making the
dashboard shell gate fail.

Observed on 2026-06-22: `renderUserActivityPanel()` now reads
`currentTurn.chromeControlActivity`, `currentTurn.latestChromeControlAction`,
and `replay.chromeControlActions[]`. Launcher responses are mirrored into the
running dashboard snapshot through `chromeControlActivityStore`, so `/snapshot.json`
can show the latest `Chrome observe` activity and replay history without raw
stdout or full page text. Focused and broad dashboard tests passed:

```bash
npx vitest run src/main/dashboard-server.test.ts src/main/dashboard-data.test.ts src/main/dashboard-smoke-script.test.ts
npx tsc --noEmit
```

Additional durability update on 2026-06-22: launcher Activity is no longer only
in-memory. `createDashboardChromeControlActionResponse()` persists each bounded
launcher result into `runtime-snapshot.json`, preserving existing
`currentTurn`/`replay` fields, setting `currentTurn.chromeControlActivity`, and
appending to `replay.chromeControlActions[]` with a last-20 bound. The red test
first failed because no runtime-snapshot write happened; the green
implementation adds injectable Activity IO, creates a minimal snapshot on first
write, and uses temp-write plus rename when filesystem rename is available. The
test fixture deliberately includes raw stdout text
`token=secret should not persist`, and the assertion proves it does not appear
in the saved snapshot.

Verification passed:

```bash
npx vitest run src/main/dashboard-server.test.ts --testNamePattern "persists Chrome control launcher Activity"
npx vitest run src/main/dashboard-server.test.ts src/main/dashboard-data.test.ts src/main/dashboard-smoke-script.test.ts src/main/runtime-snapshot.test.ts
npx tsc --noEmit
npm run build
```

- [x] **Step 4: Verify dashboard smoke**

```bash
npm run smoke:dashboard -- --output .skfiy-smoke/dashboard.json --require-passed
```

Expected: PASS with user information architecture evidence and no token leakage.

Current observed state after launcher persistence and Chrome action smoke:
focused and broad dashboard tests pass, TypeScript passes, `npm run build`
succeeds, and packaged `npm run smoke:dashboard -- --output
.skfiy-smoke/dashboard-latest.json --require-passed` exits 0. The artifact
returns `result: "passed"` with `tokenLeakDetected: false`, shell HTTP 200,
`runtimeSnapshot: "available"`, and latest Chrome artifact `result: "passed"`.
The shell contains `/api/chrome-control-action` and
`data-chrome-control-launcher`, proving the packaged dashboard includes the new
launcher surface. Operator-readiness alerts remain visible:
`operatorReadiness: "blocked"`, `desktopSession: "blocked"`, isolated-HOME
`nativeHost: "missing"`, `speech-recognition-missing`,
`desktop-session-blocked`, `desktop-session-loginwindow`,
`finder-automation-unproven`, `chrome-native-host-missing`,
`chrome-extension-not-connected`, `smoke-evidence-stale`, and
`release-artifact-older-than-head`.

- [x] **Step 5: Commit**

```bash
git add src/main/dashboard-data.ts src/main/dashboard-server.ts src/main/dashboard-data.test.ts src/main/dashboard-server.test.ts src/main/dashboard-smoke-script.test.ts
git commit -m "feat: surface Chrome control in user dashboard"
```

Observed: committed and pushed as `e7005fc feat: surface Chrome control in user dashboard`.

## Task 6: Product Smoke and Field Proof

**Files:**
- Modify: `scripts/smoke-chrome-product.mjs`
- Modify: `scripts/smoke-chrome-plan.mjs`
- Modify: `docs/chrome-extension-setup.md`
- Modify: `docs/development-workflow.md`
- Test: `src/main/chrome-smoke-script.test.ts`

- [x] **Step 1: Write red tests for installed-extension action smoke**

Add source-contract and classifier tests in `src/main/chrome-smoke-script.test.ts`.
The tests should require:

- a top-level `installedExtensionActionRun` evidence lane,
- a helper such as `runInstalledChromeExtensionActionSmoke`,
- a local HTTP fixture server rather than `file://`,
- packaged CLI calls for `chrome tabs`, `chrome reload-extension`,
  `chrome observe`, `chrome screenshot`, `chrome fill`, `chrome click`,
  `chrome submit`, and `chrome scroll`,
- target-tab selection that chooses eligible HTTP(S) tabs and rejects
  `chrome://`, `chrome-extension://`, `file://`, and unsupported schemes,
- a screenshot-blocked lane that accepts `chrome-capture-permission-missing`
  without marking DOM action smoke as failed.

Run:

```bash
npx vitest run src/main/chrome-smoke-script.test.ts --testNamePattern "installed-extension action"
```

Expected before implementation: FAIL because the action lane, classifier, and
local HTTP fixture runner do not exist yet.

Observed on 2026-06-22: the red tests were added and initially failed on the
missing `--extension-id` option, missing installed-extension action lane,
missing product-path constant/classifier, missing HTTP fixture contract, and
missing packaged `chrome tabs/reload-extension/observe/screenshot/fill/click/
submit/scroll` command sequence. The tests now also assert target-tab selection
and the screenshot-blocked classifier lane.

- [x] **Step 2: Add smoke-plan classifier helpers**

In `scripts/smoke-chrome-plan.mjs`, export a product path constant and
classifier for the installed-extension action lane:

```js
export const INSTALLED_EXTENSION_ACTION_PRODUCT_PATH =
  "dist/skfiy -> chrome tabs/reload-extension/observe/screenshot/fill/click/submit/scroll -> installed Chrome extension";

export function classifyInstalledExtensionActionSmokeEvidence(run) {
  // passed: runnerHasTmux is false, extensionId exists, tabs discovered an
  // eligible HTTP(S) target, reload/observe/fill/click/submit/scroll verified,
  // and screenshot is either verified with image data or blocked only by the
  // known Chrome capture-permission lane.
}
```

Expected classifier results:

- `passed` when DOM actions verify and screenshot has `pageScreenshot.hasDataUrl: true`,
- `screenshot-blocked` when DOM actions verify, reload is verified or blocked
  only by typed `desktop-session-locked`, and screenshot blocks with
  `chrome-capture-permission-missing` or `chrome-capture-blocked`,
- `blocked` for missing extension id, no eligible target tab, missing skfiy host
  policy, missing Chrome site access, stale extension registration, or unknown
  reload/screenshot blockers,
- `failed` when reload, observe, fill, click, submit, or scroll does not verify.

Observed on 2026-06-22: `scripts/smoke-chrome-plan.mjs` exports
`INSTALLED_EXTENSION_ACTION_PRODUCT_PATH`, parses `--extension-id`, selects an
eligible fixture tab, and classifies action-smoke evidence as `passed`,
`screenshot-blocked`, `blocked`, or `failed`. It accepts reload blocked only by
typed `desktop-session-locked` so DOM action proof can proceed through extension
URL wake and Native Messaging while the visible desktop fallback is unavailable.

- [x] **Step 3: Implement installed-extension action smoke**

The smoke should use `--extension-id plcpkkhlcacihjfohlojdknnkademlno` when supplied, serve a local HTTP page, require skfiy host policy plus Chrome optional host permission, run observe/screenshot/fill/click/submit/scroll, and persist `.skfiy-smoke/chrome-extension-actions.json`.

Implementation details:

- Add a local `http` fixture page with a safe form, a submit button, a visible
  result element, and enough page height for scroll verification.
- Open that page in Chrome, run `./dist/skfiy chrome tabs --extension-id <id>
  --json`, and select a tab whose URL matches the fixture host/path and whose
  tab summary is eligible.
- Run CLI commands sequentially. Do not parallelize action commands until each
  command has independent request ids and artifacts.
- Persist per-command stdout JSON, stderr, exit code, selected target tab,
  final observed visible text, screenshot lane state, and classifier output.
- Keep `runnerHasTmux: false` as a required product-path assertion.

Observed on 2026-06-22: `scripts/smoke-chrome-product.mjs` now runs
`runInstalledChromeExtensionActionSmoke(options)` after the existing installed
extension bridge check. It serves a loopback HTTP fixture, opens it in Chrome,
sets skfiy Chrome host policy for `new URL(fixture.url).host`, discovers the
fixture tab with packaged `./dist/skfiy chrome tabs`, runs the packaged action
commands sequentially, writes `.skfiy-smoke/chrome-extension-actions.json`, and
records selected tab, per-command JSON, final visible text, and classification.
The page-control command path now also sends a CLI-owned `skfiyRequestId` through
the wake URL and requires matching `latestCommand.requestId` evidence when that
id is present.

Historical real run before Task 6.5 stabilization:

```text
fixture: http://127.0.0.1:56437/?skfiy_action_live=smoke
selected tab: 1782096556
policy: configured for 127.0.0.1:56437
final text: clicked 1 submitted skfiy #2
classification: blocked
top-level smoke result: failed
verified current request ids: observe, fill, click, final observe
reload blocker: desktop-session-locked
screenshot blocker: page-control-screenshot-not-verified; latest command stayed on previous observe
submit blocker: page-control-submit-not-verified; latest command stayed on click
scroll blocker: page-control-scroll-not-verified; latest command stayed on click
```

The smoke is not allowed to pass yet because `reload-extension` reports
`desktop-session-locked`, screenshot lacks current request evidence/image data,
and `submit` / `scroll` do not write current `pageActionResult` evidence. The
old "installed extension still on 0.0.7" explanation is no longer sufficient:
the real browser now proves the 0.0.8 `skfiyRequestId` path for observe, fill,
and click. The next implementation step is to fix request-scoped submit,
scroll, and screenshot evidence, then rerun the real smoke with the desktop
unlocked or with reload classified as an explicit extension-context-only pass.
This run is superseded by Task 6.5's `0.0.9` source-level stabilization and
the later real smoke at `http://127.0.0.1:61858/?skfiy_action_live=smoke`,
which has a truthful final fixture state of `clicked 1 submitted skfiy #1`.

- [ ] **Step 4: Prove unsupported pages fail closed**

The smoke should record blockers for `chrome://`, `chrome-extension://`, missing Chrome site access, missing skfiy host approval, and sensitive fields.

- [ ] **Step 5: Run binary and dashboard gates**

```bash
npm run build
npm run smoke:cli:basic -- --output .skfiy-smoke/cli-basic.json --require-passed
npm run smoke:chrome -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/chrome-extension-actions.json --require-passed
npm run smoke:dashboard -- --output .skfiy-smoke/dashboard.json --require-passed
```

Expected: PASS from packaged `dist/skfiy` and no tmux/backend dependency.

If the desktop is locked/asleep, desktop/Ghostty/Finder/dashboard require-passed
gates may block with typed desktop-session reasons. The Chrome action smoke
should still run as far as URL wake, Native Messaging, host policy, and
packaged CLI evidence allow, and it must write the blocker instead of hanging or
silently falling back to a tmux/backend runtime.

Observed on 2026-06-22 before commit `973cf5d`:

```bash
npx vitest run src/main/chrome-smoke-script.test.ts --testNamePattern "installed Chrome extension action|Chrome product path"
npx vitest run src/main/chrome-extension-page-control.test.ts --testNamePattern "Apple Events|numeric strings"
npx tsc --noEmit
npm run build
npm run smoke:chrome -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/chrome-extension-actions.json --timeout-ms 6000 --settle-ms 300
```

Focused tests, TypeScript, and build passed before commit `973cf5d`; the
commit was pushed to `main`. Later real smokes proved the fixture and
request-id path were working enough to mutate the page, but Task 6.5 was needed
to remove the false `clicked 1 submitted skfiy #2` signal, make screenshot
write current bounded blockers, delegate popup action wakes through background
dedupe, and bump the local extension to `0.0.9`. Before marking the product
smoke gate complete, Task 6.5 refreshed Chrome's installed skfiy extension card
to `0.0.9`; Task 6.6 now owns the remaining wake-tab isolation and compiled
`npm run smoke:chrome ... --require-passed` gate.

- [x] **Step 6: Commit**

```bash
git add scripts/smoke-chrome-product.mjs scripts/smoke-chrome-plan.mjs src/main/chrome-smoke-script.test.ts docs/chrome-extension-setup.md docs/development-workflow.md
git commit -m "test: add installed Chrome extension action smoke"
```

Observed: implemented and pushed as `973cf5d test: add installed Chrome action smoke`.

## Task 6.5: Request-Scoped Action Smoke Stabilization

**Files:**
- Modify: `scripts/smoke-chrome-product.mjs`
- Modify: `scripts/smoke-chrome-plan.mjs`
- Modify: `chrome-extension/background.js`
- Modify: `chrome-extension/content-script.js`
- Modify: `chrome-extension/popup.js`
- Modify: `chrome-extension/manifest.json`
- Test: `src/main/chrome-smoke-script.test.ts`
- Test: `src/main/chrome-extension-background.test.js`
- Test: `src/main/chrome-extension-content-script.test.js`
- Test: `src/main/chrome-extension-popup.test.js`
- Test: `src/main/chrome-extension-manifest.test.ts`

- [x] **Step 1: Add a fixture contract test that separates click and submit**

Update `src/main/chrome-smoke-script.test.ts` so the source-contract test
requires the fixture HTML to include a click-only button and a separate submit
control. The expected command sequence should use:

```text
chrome fill --selector #name --text skfiy
chrome click --selector #click-only
chrome submit --selector form
chrome scroll --dy 600
```

Expected final fixture state after a true pass:

```text
clicked 1 submitted skfiy #1
```

This prevents a click on a submit button from making the smoke look healthier
than it is.

Observed: `src/main/chrome-smoke-script.test.ts` now requires a
`#click-only` button with `type="button"`, a separate `#submit` button with
`type="submit"`, the action-smoke command selector `"#click-only"`, and no
click listener attached to `#submit`.

- [x] **Step 2: Add red tests for current request action evidence and blockers**

In `src/main/chrome-extension-background.test.js`, add wake URL tests for:

```text
/popup.html?skfiyWake=1&skfiyTargetTabId=42&skfiyWakeAction=submit&skfiyRequestId=page-control-submit-cli-1&skfiySelector=form
/popup.html?skfiyWake=2&skfiyTargetTabId=42&skfiyWakeAction=scroll&skfiyRequestId=page-control-scroll-cli-2&skfiyDy=600
```

Each test must assert that the Native Messaging payload preserves the current
request id and action:

```js
expect(nativeMessages.at(-1)).toMatchObject({
  type: "skfiy.page.action_result",
  requestId: "page-control-submit-cli-1",
  pageActionResult: { action: "submit", result: "passed" }
});

expect(nativeMessages.at(-1)).toMatchObject({
  type: "skfiy.page.action_result",
  requestId: "page-control-scroll-cli-2",
  pageActionResult: { action: "scroll", result: "passed" }
});
```

Also add a no-response wake-action regression so background writes a bounded
current-request blocker instead of leaving `latestCommand` on an older
screenshot/click/submit request:

```js
expect(nativeMessages.at(-1)).toMatchObject({
  type: "skfiy.page.action_result",
  requestId: "page-control-scroll-cli-2",
  pageActionResult: {
    action: "scroll",
    result: "blocked",
    reason: "page_action_no_response"
  }
});
```

Observed: the no-response regression failed before implementation because no
current bounded blocker was posted. Existing happy-path submit/scroll tests plus
the new blocker test now guard both successful action evidence and failed wake
evidence.

- [x] **Step 3: Add a content-script regression for scroll without selector**

In `src/main/chrome-extension-content-script.test.js`, call the content-script
message handler with:

```js
{
  type: "skfiy.page.action",
  payload: { action: { kind: "scroll", deltaY: 600 } }
}
```

Expected result:

```js
expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
  type: "skfiy.page.action_result",
  result: "passed",
  action: "scroll"
}));
```

This proves scroll does not require a selector lookup before it can execute.

Observed: selectorless scroll was already handled by `content-script.js`; the
new regression passed and confirmed content-script selector handling was not
the root cause of the real smoke failure.

- [x] **Step 4: Run the focused tests red**

Run:

```bash
npx vitest run src/main/chrome-smoke-script.test.ts --testNamePattern "installed Chrome extension action"
npx vitest run src/main/chrome-extension-background.test.js --testNamePattern "submit|scroll|wake"
npx vitest run src/main/chrome-extension-content-script.test.js --testNamePattern "scroll"
```

Expected before implementation: at least one assertion fails because the fixture
still clicks `#submit` and the real smoke shows submit/scroll evidence staying
on the previous click request.

Observed red state: the smoke fixture contract failed because action smoke still
used `#submit` as both click and submit control; the background no-response
wake regression failed because no current request blocker was written.

- [x] **Step 5: Implement the minimal fixes**

In `scripts/smoke-chrome-product.mjs`, change the fixture and command selector
so click and submit are independent:

```html
<button id="click-only" type="button">Click</button>
<button id="submit" type="submit">Submit</button>
```

The click handler must only increment `clicked`, and the form submit handler
must only increment `submitted`. The smoke must run click against
`#click-only`, not `#submit`.

In `chrome-extension/background.js`, ensure `createWakePageControlRequest()`
and the Native Messaging summary copy the incoming `requestId` into the final
`pageActionResult` message for submit and scroll. In
`chrome-extension/content-script.js`, run the scroll branch before any selector
requirement so selectorless scroll can pass.

Observed implementation:

- `scripts/smoke-chrome-product.mjs` now clicks `#click-only`; final fixture text
  is meaningful as `clicked 1 submitted skfiy #1`.
- `chrome-extension/background.js` now summarizes missing page responses as
  current request blockers with `reason: "page_action_no_response"` and wraps
  page-action/page-screenshot wake routes so exceptions still persist bounded
  evidence.
- `chrome-extension/popup.js` now delegates
  `screenshot|click|fill|submit|scroll` wake URLs to background with
  `skfiy.page_control.wake`, keeping background dedupe as the single executor
  while avoiding the earlier popup no-op drop.
- `chrome-extension/manifest.json` and fallback manifest version were bumped to
  `0.0.9` because background/popup service-worker behavior changed.

- [x] **Step 6: Verify code and build**

Run:

```bash
npx vitest run src/main/chrome-smoke-script.test.ts --testNamePattern "installed Chrome extension action|Chrome product path"
npx vitest run src/main/chrome-extension-background.test.js src/main/chrome-extension-content-script.test.js --testNamePattern "submit|scroll|wake"
npx vitest run src/main/chrome-extension-page-control.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-content-script.test.js src/main/chrome-smoke-script.test.ts
npx tsc --noEmit
npm run build
```

Expected: all focused tests pass, TypeScript passes, and `dist/skfiy` is rebuilt
from the same commit.

Observed verification:

```bash
npx vitest run src/main/chrome-smoke-script.test.ts --testNamePattern "installed Chrome extension action"
npx vitest run src/main/chrome-extension-background.test.js --testNamePattern "submit|scroll|wake"
npx vitest run src/main/chrome-extension-content-script.test.js --testNamePattern "scroll"
npx vitest run src/main/chrome-extension-popup.test.js --testNamePattern "delegates|wake URLs"
npx vitest run src/main/chrome-extension-manifest.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-content-script.test.js src/main/chrome-extension-popup.test.js src/main/chrome-smoke-script.test.ts
npx tsc --noEmit
npm run build
```

All focused and broader Chrome extension slices passed; TypeScript passed; the
packaged app/helper/CLI were rebuilt.

- [x] **Step 7: Run the real action smoke again without `--require-passed`**

Run:

```bash
npm run smoke:chrome -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/chrome-extension-actions.json \
  --timeout-ms 8000 \
  --settle-ms 300
```

Expected next non-green shape if the desktop remains locked: observe, fill,
click, submit, scroll, and final observe all verify against their own
`page-control-*-cli-*` request ids; screenshot is either a current request
`chrome-capture-permission-missing` blocker or has image data; reload reports
`desktop-session-locked` only under `desktopFallback` or as an explicit
extension-context reload blocker. The smoke must not pass until these facts are
true from the compiled `dist/skfiy` path.

Observed pre-refresh non-green shape on 2026-06-22:

```text
fixture: http://127.0.0.1:61858/?skfiy_action_live=smoke
selected tab: 1782096624
policy: configured for 127.0.0.1:61858
final text: clicked 1 submitted skfiy #1
classification: blocked
top-level smoke result: failed
reload blocker: extension-card-reload-required
extension registration: local 0.0.9, registered 0.0.8
desktop fallback: desktop-session-locked
observe: verified with current request id page-control-observe-cli-1782062694256
screenshot: current blocker chrome-capture-permission-missing, hasDataUrl false
fill: page-control-fill-not-verified, latest command remained screenshot
click: page-control-click-not-verified, latest command remained screenshot
submit: verified with current request id page-control-submit-cli-1782062710191
scroll: page-control-scroll-not-verified, latest command remained submit
final observe: verified with current request id page-control-observe-cli-1782062715841
```

This proved the local code and fixture were healthier, but it was not a passing
product smoke. The installed Chrome worker was still `0.0.8`, so
popup-delegated action wakes from `0.0.9` had not yet been field-proven. The
post-refresh state is captured in Step 8 and Task 6.6.

- [x] **Step 8: Refresh the installed extension to `0.0.9` and rerun the field gate**

Run from an unlocked desktop, or after a proven Chrome-supported non-click
extension refresh path is available:

```bash
./dist/skfiy chrome reload-extension \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" \
  --json
npm run smoke:chrome -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/chrome-extension-actions.json \
  --timeout-ms 8000 \
  --settle-ms 300 \
  --require-passed
```

Expected pass or acceptable typed blocker:

- Pass path: Chrome registration reports local/registered `0.0.9`; reload,
  observe, fill, click, submit, scroll, and final observe each verify with their
  own current `page-control-*-cli-*` request id; screenshot either has
  `pageScreenshot.hasDataUrl: true` or is the only blocked lane with the known
  `chrome-capture-permission-missing` classifier path if DOM actions are green.
- Typed blocker path: if the desktop is still locked/asleep, reload must return
  `extension-card-reload-required` with `desktopFallback.reason:
  "desktop-session-locked"` and no smoke should claim the browser-control gate
  is complete.

Observed after refresh on 2026-06-22: Chrome registration reports local and
registered `0.0.9`, but the require-passed gate still fails. The latest real
artifact verifies only `observe` and `click` against fresh request evidence.
`screenshot`, `fill`, `submit`, `scroll`, and final `observe` remain blocked by
stale or missing `latestCommand` evidence, and `chrome tabs` shows multiple
leftover `chrome-extension://.../popup.html?skfiyWake=...` tabs from earlier
runs. The product blocker moved to Task 6.6: wake-tab isolation and compiled
smoke determinism.

- [ ] **Step 9: Commit**

```bash
git add scripts/smoke-chrome-product.mjs chrome-extension/background.js chrome-extension/content-script.js chrome-extension/popup.js chrome-extension/manifest.json src/main/chrome-smoke-script.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-content-script.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-manifest.test.ts docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md
git commit -m "fix: stabilize Chrome action smoke evidence"
```

## Task 6.6: Wake-Tab Isolation and Compiled Chrome Action Gate

**Files:**
- Modify: `scripts/smoke-chrome-product.mjs`
- Modify: `src/main/chrome-smoke-script.test.ts`
- Modify: `chrome-extension/background.js` only if harness cleanup does not fully isolate evidence
- Modify: `src/main/chrome-extension-background.test.js` only if background changes are needed
- Modify: `docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md`

- [x] **Step 1: Add a source-contract test for wake-tab cleanup**

In `src/main/chrome-smoke-script.test.ts`, extend the installed Chrome
extension action smoke source test so it requires a cleanup helper and per-step
cleanup calls:

```ts
expect(source).toContain("closeInstalledExtensionWakeTabs");
expect(source).toContain("chrome-extension://${extensionId}/popup.html?skfiyWake=");
expect(source).toContain("cleanupBeforeRun");
expect(source).toContain("cleanupAfterRun");
expect(source).toContain("cleanupBetweenCommands");
```

Run:

```bash
npx vitest run src/main/chrome-smoke-script.test.ts --testNamePattern "installed Chrome extension action"
```

Expected before implementation: FAIL because the smoke opens wake tabs but does
not close old skfiy extension wake tabs before, between, or after commands.

Observed: FAIL before implementation because the smoke source had no
`closeInstalledExtensionWakeTabs`, `cleanupBeforeRun`, `cleanupAfterRun`, or
`cleanupBetweenCommands` evidence.

- [x] **Step 2: Implement scoped wake-tab cleanup in the smoke harness**

Add `closeInstalledExtensionWakeTabs(options, extensionId)` in
`scripts/smoke-chrome-product.mjs`. It must use Apple Events JavaScript against
the selected Chrome app, close only tabs whose URL starts with:

```text
chrome-extension://<extensionId>/popup.html?skfiyWake=
```

and return bounded evidence:

```js
{
  result: "passed" | "blocked",
  chromeAppName,
  extensionId,
  closedCount,
  reason
}
```

Initial implementation calls it:

1. before opening the fixture,
2. before each packaged CLI command except the first `chrome tabs` command,
3. in a `finally` block after the installed-extension action run.

The cleanup must not close ordinary Chrome tabs, `chrome://extensions`, the
fixture tab, or unrelated extension pages.

Observed: implemented. The helper closes only URLs whose prefix is:

```text
chrome-extension://plcpkkhlcacihjfohlojdknnkademlno/popup.html?skfiyWake=
```

The latest unverified code change adds a settle wait after each per-command
cleanup to reduce close/open races. This must be verified before keeping the
between-command cleanup design.

- [x] **Step 3: Persist cleanup evidence in the action artifact**

`installedExtensionActionRun` must include:

```js
cleanupBeforeRun
cleanupBetweenCommands
cleanupAfterRun
```

where `cleanupBetweenCommands` records the command label, closed wake-tab count,
and blocker if Apple Events are unavailable. A cleanup blocker should classify
the action lane as `blocked`, not `failed`, because the product cannot trust
request evidence when historical wake pages remain open.

Observed: implemented in `scripts/smoke-chrome-product.mjs` and
`scripts/smoke-chrome-plan.mjs`. Cleanup blockers/errors classify the
installed-extension action lane as `blocked`.

- [ ] **Step 4: Verify unit tests and rebuild**

Run:

```bash
node --check scripts/smoke-chrome-product.mjs
npx vitest run src/main/chrome-smoke-script.test.ts --testNamePattern "installed Chrome extension action|Chrome product path"
npx vitest run src/main/chrome-extension-manifest.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-content-script.test.js src/main/chrome-extension-popup.test.js src/main/chrome-smoke-script.test.ts
npx tsc --noEmit
npm run build
```

Expected: all tests pass, TypeScript passes, and `dist/skfiy` is rebuilt from
the current tree.

Current status: the focused and broad Chrome slices, TypeScript, and build
passed before the last settle-after-cleanup tweak. Rerun the full commands above
before claiming this step complete.

- [ ] **Step 5: Run the real compiled action smoke**

Run:

```bash
npm run smoke:chrome -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/chrome-extension-actions.json \
  --timeout-ms 8000 \
  --settle-ms 300 \
  --require-passed
```

Expected pass or typed-blocked path:

- Chrome registration reports local and registered `0.0.9`.
- `cleanupBeforeRun` closes historical skfiy wake tabs or reports zero.
- `cleanupBetweenCommands` either prevents stale wake tabs from replaying into
  later request evidence, or the field artifact proves that between-command
  cleanup itself causes late-evidence races and Task 6.7 must replace it.
- `observe`, `fill`, `click`, `submit`, `scroll`, and final `observe` verify
  against their own fresh request ids.
- `screenshot` either verifies with `pageScreenshot.hasDataUrl: true` or is the
  only accepted blocker with `chrome-capture-permission-missing`.
- `reload-extension` is either verified through extension context or blocked
  only by typed `desktop-session-locked`; a locked desktop must not be disguised
  as browser-control failure.

Observed before the latest settle-after-cleanup tweak:

```text
artifact: .skfiy-smoke/chrome-extension-actions.json
top-level result: failed
installedExtensionActionRun.classification: blocked
fixture: http://127.0.0.1:56178/?skfiy_action_live=smoke
target tab: 1782096857
cleanupBeforeRun: passed, closedCount 3
cleanupBetweenCommands: passed before each action command, closedCount 1 each
cleanupAfterRun: passed, closedCount 1
verified commands: fill, click, scroll
typed blockers: reload-extension -> desktop-session-locked
stale/latest evidence blockers: observe, screenshot, submit, final observe
```

If this step still shows stale latest evidence after the current settle tweak,
do not add more arbitrary sleeps. Move to Task 6.7 and switch to run-boundary
cleanup plus request-id-only isolation during the command sequence.

- [ ] **Step 6: Commit the cleanup experiment only after verification**

```bash
git add scripts/smoke-chrome-product.mjs src/main/chrome-smoke-script.test.ts docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md
git commit -m "test: isolate Chrome extension action wake tabs"
```

## Task 6.7: Request-ID-Only Sequential Wake Isolation

**Files:**
- Modify: `scripts/smoke-chrome-product.mjs`
- Modify: `scripts/smoke-chrome-plan.mjs`
- Modify: `src/main/chrome-smoke-script.test.ts`
- Modify: `chrome-extension/background.js`
- Modify: `chrome-extension/manifest.json`
- Modify: `src/main/chrome-extension-background.test.js`
- Modify: `src/main/chrome-extension-manifest.test.ts`
- Modify: `docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md`

- [x] **Step 1: Add the failing source-contract test for run-boundary cleanup**

If Task 6.6 still flakes, replace the between-command cleanup contract in
`src/main/chrome-smoke-script.test.ts` with a run-boundary cleanup contract:

```ts
expect(source).toContain("closeInstalledExtensionWakeTabs");
expect(source).toContain("cleanupBeforeRun");
expect(source).toContain("cleanupAfterRun");
expect(source).toContain("wakeIsolationStrategy");
expect(source).toContain("request-id-during-run");
expect(source).toContain("cleanupBetweenCommands");
```

Run:

```bash
npx vitest run src/main/chrome-smoke-script.test.ts --testNamePattern "installed Chrome extension action"
```

Expected before implementation: FAIL because the smoke still closes skfiy wake
tabs immediately before each action command instead of preserving wake pages
until the run finishes.

Observed red state: FAIL because `scripts/smoke-chrome-product.mjs` did not
contain `wakeIsolationStrategy` or `request-id-during-run`.

- [x] **Step 2: Change command execution to cleanup only at run boundaries**

In `scripts/smoke-chrome-product.mjs`, remove the call to
`cleanupBeforeCommand()` from each packaged CLI command. Keep:

```js
cleanupBeforeRun = await closeInstalledExtensionWakeTabs(options, extensionId);
```

before policy/open/tab discovery, and keep:

```js
cleanupAfterRun = await closeInstalledExtensionWakeTabs(options, extensionId);
```

in `finally`.

Record the strategy explicitly:

```js
wakeIsolationStrategy: "request-id-during-run",
cleanupBetweenCommands: [
  {
    commandName: "chrome reload-extension",
    phase: "between-command",
    result: "skipped",
    reason: "request-id-isolation-during-run"
  }
]
```

Add one `skipped` entry for each action command so the artifact proves the
absence of between-command tab closing is intentional, not a missing cleanup.

Observed implementation: action smoke now records
`wakeIsolationStrategy: "request-id-during-run"`, keeps `cleanupBeforeRun` and
`cleanupAfterRun`, and records one skipped `cleanupBetweenCommands` entry per
action command with `reason: "request-id-isolation-during-run"`.

- [x] **Step 3: Keep the classifier strict on request ids**

In `scripts/smoke-chrome-plan.mjs`, `cleanupBetweenCommands` entries with
`result: "skipped"` and `reason: "request-id-isolation-during-run"` must not
block classification. The classifier must still block when any command's
`latestCommand.requestId` is missing or belongs to another command.

Run:

```bash
npx vitest run src/main/chrome-smoke-script.test.ts --testNamePattern "installed Chrome extension action"
```

Expected: tests pass, and the source contains both the explicit strategy and the
request-id classifier expectations.

Observed: focused action smoke tests passed. `cleanupBetweenCommands` entries
with `result: "skipped"` no longer block classification; blocked/error cleanup
entries still classify as `blocked`.

- [x] **Step 4: Add a background wake race regression test**

Real 0.0.9 field evidence showed a second race: `scheduleWakeDirective()`
claimed a wake directive before delayed execution. If the MV3 worker suspended
before the delayed `setTimeout` ran, the immediate popup-delegated action was
returned as `deduplicated` and no action result reached Native Messaging.

Add this regression to `src/main/chrome-extension-background.test.js`:

```js
mock.chrome.tabs.onUpdated.listeners[0](99, { status: "complete" }, {
  id: 99,
  windowId: 7,
  url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=popup-fill-race&skfiyTargetTabId=42&skfiyWakeAction=fill&skfiyRequestId=page-control-fill-cli-race&skfiySelector=%23name&skfiyText=skfiy"
});

mock.chrome.runtime.onMessage.listeners[0]({
  type: PAGE_CONTROL_WAKE,
  schemaVersion: 1,
  requestId: "page-control-fill-cli-race",
  directive: {
    wakeId: "popup-fill-race",
    requestId: "page-control-fill-cli-race",
    targetTabId: 42,
    wakeAction: "fill",
    selector: "#name",
    text: "skfiy",
    dy: 0
  }
}, {}, sendResponse);
```

Run:

```bash
npx vitest run src/main/chrome-extension-background.test.js --testNamePattern "scheduled wake dedupe"
```

Observed before implementation: FAIL because `sendResponse` received
`result: "deduplicated"` instead of `result: "executed"`.

- [x] **Step 5: Move wake directive claiming to execution time**

In `chrome-extension/background.js`, change `scheduleWakeDirective()` so it does
not call `claimWakeDirective()` before `setTimeout`. It should validate the
directive shape, schedule `executeWakeDirective(directive)`, and let
`executeWakeDirective()` own dedupe at the moment the action actually runs.

Because service-worker behavior changed, bump:

```text
chrome-extension/manifest.json: 0.0.10
chrome-extension/background.js FALLBACK_EXTENSION_MANIFEST.version: 0.0.10
src/main/chrome-extension-manifest.test.ts expected version: 0.0.10
```

Observed focused verification:

```bash
npx vitest run src/main/chrome-extension-background.test.js --testNamePattern "scheduled wake dedupe|popup-delegated|wake actions|stale timestamped"
npx vitest run src/main/chrome-extension-manifest.test.ts
```

Both passed.

- [x] **Step 6: Rebuild and rerun the real compiled smoke**

Run:

```bash
npx vitest run src/main/chrome-extension-manifest.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-content-script.test.js src/main/chrome-extension-popup.test.js src/main/chrome-smoke-script.test.ts
npx tsc --noEmit
npm run build
npm run smoke:chrome -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/chrome-extension-actions.json \
  --timeout-ms 8000 \
  --settle-ms 300 \
  --require-passed
```

Expected if Chrome control is ready: `observe`, `fill`, `click`, `submit`,
`scroll`, and final `observe` verify with their own request ids. Expected if the
desktop is locked: only `reload-extension` and desktop fallback lanes report
typed `desktop-session-locked`; DOM action commands should still proceed through
extension URL wake and Native Messaging when Chrome is running.

Observed source/build verification:

```bash
npx vitest run src/main/chrome-extension-manifest.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-content-script.test.js src/main/chrome-extension-popup.test.js src/main/chrome-smoke-script.test.ts
npx tsc --noEmit
npm run build
```

The Chrome extension/smoke slice passed 6 files / 84 tests; TypeScript passed;
`dist/skfiy.app` and `dist/skfiy-helper` rebuilt.

Observed field gate on 2026-06-22 after Chrome loaded the fixed worker:

```text
local extension source: 0.0.10
installed Chrome registration: 0.0.10
artifact: .skfiy-smoke/chrome-extension-actions-latest.json
top-level result: passed
installedExtensionActionRun.classification: screenshot-blocked
verified commands: observe, fill, click, submit, scroll, final observe
typed blockers: reload-extension -> desktop-session-locked; screenshot -> chrome-capture-permission-missing
final visible text: clicked 1 submitted skfiy #1 scroll target ready
```

The branded-Chrome temporary-profile extension-load lane still records
`blockedReason: "branded_chrome_load_extension_removed"` and should remain a
diagnostic warning, not the blocker for the manually installed extension action
lane.

- [x] **Step 7: Reload installed Chrome extension to 0.0.10 and rerun field gate**

Run after the desktop is unlocked, or after a non-click Chrome extension reload
path is proven:

```bash
./dist/skfiy chrome reload-extension \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" \
  --json
npm run smoke:chrome -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/chrome-extension-actions.json \
  --timeout-ms 8000 \
  --settle-ms 300 \
  --require-passed
```

Observed:

```bash
npm run smoke:chrome -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/chrome-extension-actions-latest.json \
  --timeout-ms 8000 \
  --settle-ms 300 \
  --require-passed
```

Exit code 0. Chrome registration reports local/registered `0.0.10`; observe,
fill, click, submit, scroll, and final observe verify with their own request ids.
Screenshot remains the single accepted `chrome-capture-permission-missing`
blocker until a capture permission path or packaged desktop screenshot fallback
is implemented.

- [ ] **Step 8: Commit**

```bash
git add scripts/smoke-chrome-product.mjs scripts/smoke-chrome-plan.mjs src/main/chrome-smoke-script.test.ts chrome-extension/background.js chrome-extension/manifest.json src/main/chrome-extension-background.test.js src/main/chrome-extension-manifest.test.ts docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md
git commit -m "test: isolate Chrome action smoke by request id"
```

## Task 6.8: Extension Interaction Self-Iteration Gate

**Files:**
- Modify: `docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md`
- Modify: `docs/research/2026-06-20-dashboard-cli-plan.md`
- Modify: `scripts/smoke-chrome-product.mjs` only if the field artifact needs a new evidence field
- Modify: `src/main/chrome-smoke-script.test.ts` only if the smoke contract changes

- [x] **Step 1: Prove the current installed extension version before acting**

Run:

```bash
./dist/skfiy chrome reload-extension \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id 1782096947 \
  --json | tee .skfiy-smoke/chrome-reload-0.0.10-latest.json
```

Expected if the extension is already fresh: `result: "verified"` and the
registration evidence reports local and installed `0.0.10`.

Expected if Chrome still needs a visible reload:
`result: "blocked"`, `reason: "extension-card-reload-required"`, and either a
typed desktop blocker or an instruction to click the visible reload icon on the
skfiy extension card. Do not treat this as a generic browser-control failure.

Observed: Chrome `Default/Secure Preferences` and packaged status evidence now
show the skfiy extension id `plcpkkhlcacihjfohlojdknnkademlno` registered at
`0.0.10`, matching local source. The subsequent packaged action smoke used that
fresh registration.

- [x] **Step 2: Use Codex only as the temporary operator for visible reload**

If the desktop is unlocked and Chrome shows the extension card, Codex may click
the visible reload icon because the user granted Chrome developer-mode
permission. This is an operator action, not product proof. Record it explicitly
in the plan and then immediately rerun the packaged command from Step 1.

Do not use raw CDP/browser internals to mutate `chrome://extensions`; do not
claim skfiy can self-update merely because Codex clicked Chrome's developer UI.

Observed: the visible Chrome extension-manager reload was treated as an operator
step and not counted as product capability. Final proof came from packaged
`dist/skfiy` smoke evidence after registration reported `0.0.10`.

- [x] **Step 3: Run the compiled action field gate after reload**

Run:

```bash
npm run smoke:chrome -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/chrome-extension-actions.json \
  --timeout-ms 8000 \
  --settle-ms 300 \
  --require-passed
```

Expected for repeatable Chrome structured control:

- local source and Chrome registration both report `0.0.10`;
- `observe`, `fill`, `click`, `submit`, `scroll`, and final `observe` verify
  with current request ids;
- `reload-extension` is verified through extension context or blocked only by a
  typed desktop/session fallback;
- `screenshot` either has `pageScreenshot.hasDataUrl: true` or is the only
  accepted typed blocker with `chrome-capture-permission-missing`.

Observed: `.skfiy-smoke/chrome-extension-actions-latest.json` passed with
classification `screenshot-blocked`, current request ids for observe/fill/click/
submit/scroll/final-observe, reload blocked only by `desktop-session-locked`,
and screenshot blocked only by `chrome-capture-permission-missing`.

- [x] **Step 4: Feed the latest artifact into dashboard status**

Run:

```bash
npm run smoke:dashboard -- --output .skfiy-smoke/dashboard-latest.json
```

Observed:

```bash
npm run smoke:dashboard -- --output .skfiy-smoke/dashboard-latest.json --require-passed
```

Exit code 0. The dashboard artifact reports `result: "passed"`,
`tokenLeakDetected: false`, shell HTTP 200, `/api/chrome-control-action`,
`data-chrome-control-launcher`, `runtimeSnapshot: "available"`, and latest
Chrome artifact `result: "passed"`. It still keeps `operatorReadiness:
"blocked"`, `desktopSession: "blocked"`, and isolated-HOME native host
`"missing"` as visible alerts rather than hiding them.

- [ ] **Step 5: Commit only after evidence is current**

```bash
git add docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md docs/research/2026-06-20-dashboard-cli-plan.md scripts/smoke-chrome-product.mjs src/main/chrome-smoke-script.test.ts
git commit -m "docs: gate Chrome extension self iteration evidence"
```

## Task 6.9: 0.0.14 Extension-Native Tabs Field Gate

**Files:**
- Modify: `chrome-extension/popup.js`
- Modify: `chrome-extension/background.js`
- Modify: `chrome-extension/manifest.json`
- Modify: `src/main/chrome-native-host.ts`
- Modify: `src/main/chrome-extension-popup.test.js`
- Modify: `src/main/chrome-extension-background.test.js`
- Modify: `src/main/chrome-extension-manifest.test.ts`
- Modify: `src/main/chrome-native-host.test.ts`
- Modify: `docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md`
- Modify: `docs/research/2026-06-20-dashboard-cli-plan.md`

- [x] **Step 1: Prove popup render failures can block dev reload**

Regression:

```js
it("auto-schedules dev reload before status rendering can block wake handling", async () => {
  window.history.replaceState(
    {},
    "",
    "/popup.html?skfiyWake=1&skfiyWakeAction=dev-reload&skfiyTargetTabId=42&skfiyRequestId=dev-reload-render-fails"
  );
  installPopupDocument();
  const mock = createPopupChromeMock({
    policy: createPolicy(),
    onSendMessage: (message) => {
      if (message.type === DEV_RELOAD_REQUEST) {
        return {
          type: "skfiy.dev.reload_result",
          schemaVersion: 1,
          requestId: message.requestId,
          devReload: { state: "scheduled", reloadAvailable: true }
        };
      }
      throw new Error("status unavailable before wake");
    }
  });
  globalThis.chrome = mock.chrome;

  await importPopup();

  await waitForAssertion(() => {
    expect(mock.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: DEV_RELOAD_REQUEST,
      schemaVersion: 1,
      requestId: "dev-reload-render-fails"
    }));
  });
});
```

Observed red: before the fix, the popup only sent
`skfiy.host_policy.sync_status` when status rendering failed.

- [x] **Step 2: Schedule wake actions before popup status rendering**

Implementation:

```js
if (shouldAutoCheckHeartbeat() && readWakeAction()) {
  startAutoWakeAction();
}
```

`reloadExtension()` now reuses `skfiyRequestId` from the wake URL, so
extension-context reload evidence can be tied to the product command instead of
a popup-local generated id.

Verification:

```bash
npx vitest run src/main/chrome-extension-popup.test.js
```

Observed: 15 popup tests passed.

- [x] **Step 3: Prove `tabs` wake cannot depend on delayed MV3 timers**

Regression:

```js
it("runs tab discovery from created wake tabs without relying on delayed timers", async () => {
  const mock = createChromeMock([{
    schemaVersion: 1,
    type: "skfiy.native.response",
    requestId: "tabs-discover-immediate",
    result: "accepted",
    bridgeState: "connected",
    launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
    messageType: TABS_DISCOVER
  }], {
    allTabs: [
      {
        id: 99,
        windowId: 7,
        active: true,
        url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=created-tabs-immediate&skfiyWakeAction=tabs&skfiyRequestId=tabs-discover-immediate"
      },
      {
        id: 41,
        windowId: 7,
        title: "Immediate app",
        url: "https://immediate.example/dashboard"
      }
    ]
  });
  globalThis.chrome = mock.chrome;
  await importBackground();

  mock.chrome.tabs.onCreated.listeners[0]({
    id: 99,
    windowId: 7,
    active: true,
    url: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/popup.html?skfiyWake=created-tabs-immediate&skfiyWakeAction=tabs&skfiyRequestId=tabs-discover-immediate"
  });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  await waitForAssertion(() => {
    const discoveryMessage = mock.postedMessages.find((message) => message.type === TABS_DISCOVER);
    expect(discoveryMessage?.requestId).toBe("tabs-discover-immediate");
    expect(discoveryMessage?.payload?.pageTabs?.tabs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 41, host: "immediate.example" })
    ]));
  });
});
```

Observed red: before the fix, no `skfiy.tabs.discover` Native Messaging
message was posted without advancing the delayed timer.

- [x] **Step 4: Execute `tabs` wake directives immediately and bump to 0.0.13**

Implementation:

```js
if (wakeAction === "tabs") {
  void executeWakeDirective(directive);
  return true;
}
```

Keep delayed execution for page actions where the target page may still be
loading; only tab discovery must run immediately to survive MV3 service-worker
suspension.

Verification:

```bash
npx vitest run src/main/chrome-extension-background.test.js
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-manifest.test.ts src/main/chrome-extension-reloader.test.ts src/main/chrome-smoke-script.test.ts src/main/dashboard-smoke-script.test.ts
npx tsc --noEmit
```

Observed: background tests passed; the broader Chrome/dashboard slice passed
9 files / 169 tests; TypeScript passed.

- [x] **Step 5: Bound stalled content diagnostics and accept tabs discover in the native host**

Regression for stalled page diagnostics:

```js
it("times out stalled content diagnostics during tab discovery", async () => {
  const mock = createChromeMock([{
    schemaVersion: 1,
    type: "skfiy.native.response",
    requestId: "tabs-discover-timeout",
    result: "accepted",
    bridgeState: "connected",
    launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
    messageType: TABS_DISCOVER
  }], {
    allTabs: [{ id: 41, windowId: 7, title: "Slow app", url: "https://slow.example/dashboard" }],
    stalledDiagnosticTabIds: [41]
  });
  globalThis.chrome = mock.chrome;
  await importBackground();
  await discoverTabs({ requestId: "tabs-discover-timeout" });

  expect(mock.postedMessages[0].payload.pageTabs.tabs[0]).toEqual(expect.objectContaining({
    id: 41,
    blocker: "content_script_diagnostics_timeout"
  }));
});
```

Regression for native-host allowlist:

```ts
it("accepts tab discovery payloads and persists pageTabs command evidence", async () => {
  const response = await sendNativeFrame({
    schemaVersion: 1,
    type: "skfiy.tabs.discover",
    requestId: "tabs-discover-native-host",
    payload: { pageTabs: { result: "passed", tabs: [{ id: 41, state: "eligible" }] } }
  });

  expect(response.result).toBe("accepted");
  expect(readConnection().latestCommand.messageType).toBe("skfiy.tabs.discover");
});
```

Observed red: before the fix, stalled diagnostics prevented native tab discovery
from completing, and the native host returned `result: "invalid"` with
`unsupported_message_type` for `skfiy.tabs.discover`, so no command evidence was
persisted.

Implementation: `requestContentScriptDiagnostics()` now races the content-script
diagnostics request against a 750 ms timeout and records a bounded unavailable
state. `CHROME_NATIVE_BRIDGE_MESSAGE_TYPES` now includes
`skfiy.tabs.discover`, and the extension manifest/background fallback version
was bumped to `0.0.14`.

- [x] **Step 6: Rebuild and reload the installed extension to 0.0.14**

Run:

```bash
npm run build
./dist/skfiy chrome reload-extension \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id 1782097079 \
  --json | tee .skfiy-smoke/chrome-reload-0.0.14-latest.json
```

Expected if extension-context reload succeeds:
`result: "verified"` or a typed result proving local and registered extension
versions both match `0.0.14`.

Expected if the visible extension-card reload is still required:
`result: "blocked"`, `reason: "extension-card-reload-required"`, and typed
desktop fallback evidence. If the desktop is unlocked, Codex may click the
visible reload icon as operator, then rerun this compiled command. That click is
not product evidence.

Observed: `npm run build` passed. Direct extension-context `dev-reload` moved
Chrome's registered unpacked extension from 0.0.13 to 0.0.14 while the desktop
session was locked. The follow-up packaged reload diagnostic no longer reported
stale registration; it reported only the typed `desktop-session-locked` fallback
blocker because the visible Chrome extension-card click path cannot run at the
loginwindow.

- [x] **Step 7: Prove extension-native tab discovery in the real browser**

Run:

```bash
./dist/skfiy chrome tabs \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --json | tee /tmp/skfiy-tabs-0.0.14-nativehost.json
```

Expected pass shape:

```json
{
  "result": "verified",
  "discoveryMode": "extension",
  "extensionConnection": {
    "messageType": "skfiy.tabs.discover",
    "requestId": "tabs-discover-cli-*",
    "pageTabs": [{ "state": "eligible" }]
  }
}
```

Expected fallback shape while still incomplete:
`result: "verified"` with `discoveryMode: "chrome-apple-events"` is acceptable
for target selection, but dashboard and README copy must label it as fallback
until this task passes with `discoveryMode: "extension"`.

Observed: the compiled command returned `result: "verified"`,
`discoveryMode: "extension"`, `extensionConnection.liveConnection:
"connected"`, `latestCommand.messageType: "skfiy.tabs.discover"`, matching
request id `tabs-discover-cli-1782072479501`, and 86 bounded `pageTabs` entries.

- [x] **Step 8: Rerun product smokes after native tabs are proven and record the new blocker**

Run:

```bash
npm run smoke:chrome -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/chrome-extension-actions-latest.json \
  --timeout-ms 8000 \
  --settle-ms 300 \
  --require-passed
npm run smoke:dashboard -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/dashboard-live-action-latest.json \
  --require-passed
```

Expected: action smoke remains at least `screenshot-blocked` with
observe/fill/click/submit/scroll/final-observe verified by current request ids;
dashboard smoke records user-facing Activity rows and does not hide screenshot
or desktop-session blockers.

Observed before Task 6.10: broad Chrome/dashboard/unit slice passed 9 files /
171 tests, `npx tsc --noEmit` passed, and `npm run build` passed. The
`smoke:chrome --require-passed` run exited non-zero with top-level
`result: "failed"` because its healthy extension-native `tabsRun` still stopped
before reload/observe with `reason: "no-eligible-target-tab"`. Task 6.10
superseded this blocker by teaching the action smoke to consume native
`pageTabs`.

## Task 6.10: Native Tabs Action-Smoke Target Selection

**Files:**
- Modify: `scripts/smoke-chrome-product.mjs`
- Modify: `scripts/smoke-chrome-plan.mjs` only if classification wording changes
- Test: `src/main/chrome-smoke-script.test.ts`
- Modify: `docs/superpowers/plans/2026-06-21-browser-control-dashboard-iteration.md`
- Modify: `docs/research/2026-06-20-dashboard-cli-plan.md`

- [x] **Step 1: Write the failing smoke selection test**

Add a fixture in `src/main/chrome-smoke-script.test.ts` that feeds
`installedExtensionActionRun` a `tabsRun` shaped like the 0.0.14 field artifact:
no top-level selected target, `discoveryMode: "extension"`, and eligible tabs
inside `extensionConnection.latestCommand.pageTabs.tabs`.

Expected test body shape:

```ts
it("selects an eligible action fixture tab from extension-native pageTabs", async () => {
  const tabsRun = {
    result: "verified",
    discoveryMode: "extension",
    extensionConnection: {
      latestCommand: {
        messageType: "skfiy.tabs.discover",
        pageTabs: {
          result: "passed",
          tabs: [
            { id: 10, title: "Other", url: "https://example.com", eligible: true },
            { id: 41, title: "skfiy installed-extension action smoke", url: "http://127.0.0.1:49552/?skfiy_action_live=smoke", eligible: true }
          ]
        }
      }
    }
  };

  expect(selectInstalledExtensionActionTarget(tabsRun, "127.0.0.1:49552")).toEqual(expect.objectContaining({
    id: 41,
    eligible: true
  }));
});
```

Run:

```bash
npx vitest run src/main/chrome-smoke-script.test.ts --testNamePattern "extension-native pageTabs"
```

Observed red: the selector returned no target for the redacted native `pageTabs`
fixture and would classify the run as `no-eligible-target-tab`.

- [x] **Step 2: Implement target extraction for native and fallback tab shapes**

In `scripts/smoke-chrome-product.mjs`, centralize tab extraction:

```js
function readTabsFromChromeTabsResult(tabsRun) {
  if (Array.isArray(tabsRun?.tabs)) return tabsRun.tabs;
  const latestTabs = tabsRun?.extensionConnection?.latestCommand?.pageTabs?.tabs;
  if (Array.isArray(latestTabs)) return latestTabs;
  const connectionTabs = tabsRun?.extensionConnection?.pageTabs?.tabs;
  if (Array.isArray(connectionTabs)) return connectionTabs;
  return [];
}
```

Implemented in `scripts/smoke-chrome-plan.mjs` as
`readInstalledExtensionActionTargetTabs(tabsRun)` and reused from
`scripts/smoke-chrome-product.mjs`. The selector now accepts top-level
`tabs[]`, `extensionConnection.latestCommand.pageTabs.tabs`,
`extensionConnection.pageTabs.tabs`, and fixture URLs whose query values were
redacted as `<redacted>` while preserving the strict blocker when no eligible
tab is present.

- [x] **Step 3: Run focused and broad tests**

Run:

```bash
npx vitest run src/main/chrome-smoke-script.test.ts --testNamePattern "extension-native pageTabs"
npx vitest run src/main/chrome-smoke-script.test.ts src/main/chrome-extension-background.test.js src/main/chrome-native-host.test.ts
npx tsc --noEmit
```

Observed: focused `installed Chrome extension action smoke` tests passed, the
related Chrome/background/native-host slice passed 3 files / 72 tests, and
`npx tsc --noEmit` stayed green.

- [x] **Step 4: Rebuild and rerun the real action smoke**

Run:

```bash
npm run build
npm run smoke:chrome -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/chrome-extension-actions-latest.json \
  --timeout-ms 8000 \
  --settle-ms 300 \
  --require-passed
```

Observed: `npm run build` passed, then this command exited 0:

```bash
caffeinate -dimsu npm run smoke:chrome -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/chrome-extension-actions-latest.json \
  --timeout-ms 8000 \
  --settle-ms 300 \
  --require-passed
```

`tabsRun.discoveryMode: "extension"` remained true, selected target tab
`1782097316` from native `pageTabs`, and verified
observe/fill/click/submit/scroll/final-observe. The run classified as
`screenshot-blocked` with screenshot reason `chrome-capture-permission-missing`;
reload fallback was typed `desktop-session-locked`.

- [x] **Step 5: Update dashboard smoke and docs after the action lane is green**

Run:

```bash
npm run smoke:dashboard -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/dashboard-live-action-latest.json \
  --require-passed
```

Observed: docs were updated to record the passing Chrome action lane and the new
dashboard-specific blocker. The dashboard smoke did not pass yet; it now fails
at `/api/chrome-control-action` with HTTP 400 `unsupported-page` even though the
snapshot has an eligible `pageControl.activeTab` with matching tab id, host, and
scheme. Task 6.11 owns that blocker.

## Task 6.11: Dashboard Chrome Action Preflight Target Metadata

**Files:**
- Modify: `src/main/dashboard-server.ts`
- Modify: `src/main/dashboard-data.ts` if the snapshot strips the URL/equivalent target metadata before the server sees it
- Modify: `scripts/smoke-chrome-product.mjs` if `pageControl.activeTab` needs to preserve `selectedTargetTab.url`
- Modify: `scripts/smoke-chrome-plan.mjs` if page-control evidence needs a shared helper
- Test: `src/main/dashboard-server.test.ts`
- Test: `src/main/dashboard-data.test.ts`
- Test: `src/main/dashboard-smoke-script.test.ts`
- Test: `src/main/chrome-smoke-script.test.ts`

- [ ] **Step 1: Write the failing dashboard preflight test**

Add a test that builds a dashboard snapshot with:

```json
{
  "runtimeHealth": {
    "extension": {
      "pageControl": {
        "state": "ready",
        "activeTab": {
          "state": "eligible",
          "tabId": 1782097316,
          "host": "127.0.0.1:54586",
          "scheme": "http:"
        }
      }
    }
  }
}
```

Then call the same preflight path used by `POST /api/chrome-control-action`
with `targetTabId: 1782097316`.

Run:

```bash
npx vitest run src/main/dashboard-server.test.ts --testNamePattern "Chrome control action preflight"
```

Expected red before the fix: HTTP 400 / `unsupported-page`.

- [ ] **Step 2: Decide the safe target contract**

Prefer preserving the full URL from
`installedExtensionActionRun.selectedTargetTab.url` into
`pageControl.activeTab.url` when the smoke artifact and dashboard snapshot can
carry it without leaking user text. If only bounded target metadata is
available, allow preflight to accept `scheme: "http:"|"https:"`, non-empty
`host`, `state: "eligible"`, and a matching `targetTabId`. Keep `chrome:`,
`chrome-extension:`, `file:`, unsupported schemes, missing tab ids, and tab-id
mismatches blocked.

- [ ] **Step 3: Implement the minimal preflight/snapshot fix**

Make the dashboard action endpoint classify the current field shape as an
ordinary safe HTTP(S) page while preserving blockers for internal pages,
extension pages, files, unsupported schemes, and stale or missing page-control
evidence.

- [ ] **Step 4: Run focused and broad tests**

Run:

```bash
npx vitest run src/main/dashboard-server.test.ts --testNamePattern "Chrome control action preflight"
npx vitest run src/main/dashboard-smoke-script.test.ts src/main/dashboard-server.test.ts src/main/dashboard-data.test.ts src/main/chrome-smoke-script.test.ts
npx tsc --noEmit
npm run build
```

Expected: dashboard preflight accepts the eligible localhost target, existing
unsupported-page cases stay blocked, TypeScript stays green, and packaged
artifacts are rebuilt.

- [ ] **Step 5: Rerun the real dashboard field gate**

Run:

```bash
caffeinate -dimsu npm run smoke:dashboard -- \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --output .skfiy-smoke/dashboard-live-action-latest.json \
  --require-passed
```

Expected: `dashboardChromeControlActionApi.result: "passed"`,
`homeMode: "real-user-home"`, token leakage stays false, and
observe/fill/click/submit/scroll create current Activity/replay rows. Screenshot
remains blocked unless `pageScreenshot.hasDataUrl: true` or packaged desktop
fallback proof is present.

## Task 7: Long-Horizon Readiness Gate

**Files:**
- Modify: `docs/research/2026-06-16-voice-computer-control-long-plan.md`
- Modify: `scripts/smoke-money-run-supervision.mjs` when the gate needs new persisted evidence fields
- Modify: `src/main/dashboard-data.ts` when the dashboard needs to render new `money-run` evidence
- Test: `src/main/dashboard-data.test.ts`

- [ ] **Step 1: Gate `money-run` supervision**

Do not start the long-horizon `money-run` supervision task until Chrome action smoke, dashboard smoke, CLI basic smoke, desktop-session smoke, and at least one real Ghostty/Finder/voice smoke are current and passed.

- [ ] **Step 2: Record supervision evidence**

When the gate passes, run the `money-run` supervision field task through the packaged product path and preserve `tmuxSupervisionReport`, screenshot/action verification, approval/stop behavior, dashboard visibility, and replay summaries.

- [ ] **Step 3: Commit**

```bash
git add docs scripts src/main
git commit -m "docs: gate money-run on product smoke evidence"
```

## Self-Review

- Spec coverage: covers Chrome control, extension-context reload/update boundary, evidence isolation, user dashboard, binary/CLI product path, repeated real-scene testing, and long-horizon `money-run` gating.
- Open-ended step scan: every open task has a concrete file, command, expected pass shape, and expected blocked shape where a real machine state can prevent success.
- Current risk scan: the 0.0.14 field gate proves installed-extension native tab discovery from packaged `dist/skfiy`; `chrome tabs` no longer needs Apple Events fallback for the current machine. The highest browser-control risk is now the dashboard action preflight mismatch: `smoke:chrome` selects and controls the eligible native `pageTabs` fixture, but the real-user-HOME dashboard rejects the same target as `unsupported-page` because `pageControl.activeTab` lacks a full URL or accepted equivalent target proof. Screenshot remains a separate top browser-control risk because `captureVisibleTab` still needs Chrome-side permission/state or a proven packaged desktop fallback before `pageScreenshot.hasDataUrl: true` can be claimed.
- Type consistency: `ChromeExtensionPageControlAction`, `pageControl`, `pageObservation`, `pageActionResult`, `pageScreenshot`, `targetTabId`, `extensionId`, `reloadStrategy`, and `executesSystemMutation` are used consistently across CLI, extension, native host, and dashboard tasks.

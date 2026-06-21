# Browser Control and User Dashboard Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the installed skfiy Chrome extension `pageControl.ready` proof into packaged CLI/browser actions, dashboard-visible user controls, and repeatable real-scene smoke evidence.

**Architecture:** Keep `skfiy.app` plus packaged `dist/skfiy` as the only product runtime. The Chrome MV3 extension observes and acts inside eligible tabs, Native Messaging records bounded heartbeat/replay evidence, the CLI exposes stable commands, and the dashboard renders user-readable readiness/actions while keeping raw diagnostics in Advanced.

**Tech Stack:** Electron main process TypeScript, Vitest, Manifest V3 background/content/popup JavaScript, Chrome Native Messaging, loopback dashboard HTTP/SSE, macOS packaged `dist/skfiy`.

---

## Current State

- Manually installed Chrome extension id: `plcpkkhlcacihjfohlojdknnkademlno`.
- Proven path: `./dist/skfiy chrome reload-extension --extension-id plcpkkhlcacihjfohlojdknnkademlno --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json` can verify `pageControl.state: "ready"` on an authorized localhost HTTP page when `SKFIY_CHROME_TARGET_TAB_ID` is manually discovered today or produced by future tab discovery.
- Implemented command-surface capabilities: diagnostics, observe, screenshot, click, fill, submit, scroll, host policy, Native Messaging status, dashboard launch/status, and packaged binary smoke commands.
- Proven installed-extension capabilities on 2026-06-21: extension-context reload verified through `skfiyWakeAction=dev-reload`; observe verified; click, fill, submit, and scroll verified in a real Chrome tab on `http://127.0.0.1:63852/?skfiy_action_live=20260621`.
- Not yet proven end-to-end: screenshot with `pageScreenshot.hasDataUrl: true`, tab discovery, user-facing dashboard controls, and automated installed-extension action smoke. Manual compiled-binary action smokes passed on 2026-06-21; the repeatable smoke script still needs to encode that path.
- 2026-06-21 implementation update: `chrome observe`, `chrome screenshot`, `chrome click`, `chrome fill`, `chrome submit`, and `chrome scroll` have been added to the packaged CLI command surface. Wake URLs can request page-control actions, Native Messaging can persist `pageObservation`, `pageActionResult`, and `pageScreenshot`, and the related Vitest suite plus `npm run build` have passed locally.
- Latest 2026-06-21 hardening update: popup wake URLs now support `dev-reload`; background owns page-control wake execution; repeated `tabs.onUpdated` events for the same wake URL are deduplicated; Native Messaging preserves `latestCommand` so health heartbeats cannot hide command evidence; screenshot blockers are recorded as bounded evidence; page-control verification rejects screenshot heartbeats without image data, stale command evidence, and action heartbeats for the wrong action.
- Latest verification evidence: `npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts` passed with 6 files / 126 tests; `npx tsc --noEmit` passed; `npm run build` rebuilt `dist/skfiy.app`, `dist/skfiy-helper`, and the packaged CLI.
- 2026-06-21 live proof: a compiled `./dist/skfiy chrome observe` run passed against Chrome tab `1782096038` on `http://127.0.0.1:63852/`; `pageObservation.visibleText` contained `skfiy observe live smoke 2026-06-21 compiled binary path`, and local evidence was saved to `.skfiy-smoke/chrome-observe-live.json`. Commit `3dbed8b` (`feat: add Chrome observe page-control command`) was pushed to `main`.
- Current product answer to "can skfiy control Chrome?": **partially, with real proof for observe/click/fill/submit/scroll and self-reload**. skfiy can now drive an authorized ordinary HTTP(S) Chrome tab through the installed extension and packaged CLI, but it is not a complete browser controller until screenshot capture, tab discovery, dashboard controls, and repeatable product smoke are green from the compiled binary.
- Subagent contract check: extension runtime support and packaged CLI subcommands exist for screenshot and DOM actions. The remaining product gaps are screenshot capture permission/fallback, target-tab discovery, user dashboard controls, and replay/dashboard evidence for action outcomes.
- Development update boundary: Codex may reload the skfiy extension card while iterating because the user granted Chrome extension developer-mode permissions. The product path now starts with extension-context reload (`skfiyWakeAction=dev-reload`) and falls back to OCR/clicking `chrome://extensions` only when extension-context verification fails. A locked/asleep macOS desktop still blocks general desktop Computer Use and the OCR/click fallback, but it must not be reported as an ambiguous extension failure.
- Target-tab discovery gap: `skfiy chrome tabs` is not implemented yet. Until Task 4 lands, real tests may use a manually discovered numeric Chrome tab id or a development-only Chrome control helper solely to identify the current ordinary HTTP(S) tab.

## Immediate P0 Loop

1. Close screenshot first: `./dist/skfiy chrome screenshot --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json` now returns a precise `reason: "chrome-capture-permission-missing"` with latest bounded evidence (`Either the '<all_urls>' or 'activeTab' permission is required.`). Next implementation choice: add an explicit user-granted Chrome capture permission path or unlock desktop and use the existing screenshot fallback.
2. Keep click/fill/submit/scroll sequential, not parallel, until the smoke harness writes one artifact per request. The real clean-page run now verifies action results and final visible text `clicked 1` plus `submitted skfiy #2`, proving the duplicate-execution bug is closed.
3. Commit the extension-context reload and action-evidence hardening with latest real smoke evidence.
4. Implement `skfiy chrome tabs --json` so target-tab discovery stops depending on AppleScript or manual Chrome tab ids.
5. Promote browser controls into the user dashboard only after screenshot permission/fallback and tab discovery are designed; until then the dashboard should say "Chrome observe/click/fill/submit/scroll verified; screenshot capture blocked by Chrome permission or locked desktop fallback."
6. Keep desktop Computer Use separate from Chrome extension control: locked/asleep desktop blockers should be explicit for Ghostty/Finder/general app tests, while Chrome extension tests should continue through URL wake and Native Messaging when possible.

## File Structure

- Modify `src/main/cli-command-surface.ts`: add Chrome page-control command normalization, execution, JSON output, and blocker mapping.
- Create `src/main/chrome-extension-page-control.ts`: shared invoker for extension-backed observe, screenshot, click, fill, submit, and scroll commands.
- Modify `src/main/chrome-extension-reloader.ts`: keep reload target-tab verification, allow wake URLs to request a specific page-control action, and try extension-context `dev-reload` before desktop OCR/click fallback.
- Modify `src/main/chrome-native-host.ts`: persist page observation/action summaries into `chrome-extension-connection.json` without raw secrets.
- Modify `chrome-extension/popup.js`: handle extension-context `dev-reload` wake requests while leaving screenshot/action wakes to the background worker so clicks/submits/captures are not duplicated.
- Modify `chrome-extension/background.js`: route page-control requests to the requested tab, deduplicate repeated wake events, and return typed blockers for host policy, Chrome site access, internal pages, stale content script, capture permission, and sensitive pause.
- Modify `chrome-extension/content-script.js`: keep page snapshots/action results bounded and mark sensitive forms before fills/clicks/submits.
- Modify `src/main/dashboard-server.ts` and `src/main/dashboard-data.ts`: render user-facing Chrome readiness/actions and move raw evidence to Advanced.
- Modify `scripts/smoke-chrome-product.mjs` and `scripts/smoke-chrome-plan.mjs`: add installed-extension action evidence.
- Modify tests in `src/main/cli-command-surface.test.ts`, `src/main/chrome-extension-page-control.test.ts`, `src/main/chrome-extension-reloader.test.ts`, `src/main/chrome-native-host.test.ts`, `src/main/dashboard-data.test.ts`, `src/main/dashboard-server.test.ts`, `src/main/dashboard-smoke-script.test.ts`, `src/main/chrome-smoke-script.test.ts`, `src/main/chrome-extension-popup.test.js`, `src/main/chrome-extension-background.test.js`, and `src/main/chrome-extension-content-script.test.js`.

## Acceptance Gates

- `npx vitest run src/main/cli-command-surface.test.ts -t "runs chrome observe"`
- `npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts`
- `npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-popup.test.js`
- `npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-extension-page-control.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-background.test.js src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- `export SKFIY_CHROME_EXTENSION_ID=plcpkkhlcacihjfohlojdknnkademlno`
- Open the authorized ordinary HTTP(S) test page in the front Chrome tab, then run `export SKFIY_CHROME_TARGET_TAB_ID=$(osascript -e 'tell application "Google Chrome" to id of active tab of front window')`
- Future replacement after Task 4: `export SKFIY_CHROME_TARGET_TAB_ID=$(./dist/skfiy chrome tabs --extension-id "$SKFIY_CHROME_EXTENSION_ID" --json | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { const json = JSON.parse(data); const tab = json.tabs.find((entry) => entry.eligible === true || entry.state === "eligible"); if (!tab) process.exit(2); console.log(tab.id); });')`
- `./dist/skfiy chrome reload-extension --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json`
- `./dist/skfiy chrome observe --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json`
- `./dist/skfiy chrome screenshot --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json`
- `./dist/skfiy chrome click --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --selector "#submit" --json`
- `./dist/skfiy chrome fill --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --selector "#name" --text skfiy --json`
- `./dist/skfiy chrome submit --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --selector "form" --json`
- `./dist/skfiy chrome scroll --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --dy 600 --json`
- Run action smokes sequentially. Do not run click/fill/submit/scroll in parallel until the smoke harness stores per-request evidence with independent artifact files.
- `npm run smoke:chrome -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/chrome-extension-actions.json --require-passed`
- `npm run smoke:dashboard -- --output .skfiy-smoke/dashboard.json --require-passed`
- `npm run smoke:cli:basic -- --output .skfiy-smoke/cli-basic.json --require-passed`

## Two-Week Execution Roadmap

This roadmap is the product-order view of the tasks below. All user-facing acceptance must use the compiled `dist/skfiy.app` or packaged `dist/skfiy` binary. Source-tree Electron launches, tmux backends, loose helper binaries, and hidden browser-control helpers are debug-only.

### Week 1: Browser Control Becomes Repeatable

1. Keep the extension-context self-reload path as the default: `chrome reload-extension` opens `skfiyWakeAction=dev-reload`, verifies the requested tab, and returns `desktop-session-locked` only when it has to fall back to desktop clicking while macOS is locked/asleep.
2. Close screenshot evidence: either request/grant the required Chrome capture permission for the installed extension or prove the packaged desktop screenshot fallback after `smoke:desktop-session` passes. A screenshot cannot be verified unless the latest command evidence has `pageScreenshot.hasDataUrl: true`.
3. Add `skfiy chrome tabs --json` so target selection comes from product code, not AppleScript/manual tab ids. Every tab must report eligibility and a user-readable blocker for internal Chrome pages, missing skfiy host policy, missing Chrome site access, or stale content scripts.
4. Turn the manual action proof into `npm run smoke:chrome -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/chrome-extension-actions.json --require-passed`. The smoke should serve a local safe page, set isolated host policy, run reload/observe/fill/click/submit/scroll sequentially, record final visible page text, and keep screenshot as a required pass only after Step 2 closes.
5. Keep all action smokes sequential until each command writes independent request ids and artifact files. The current duplicate wake bug is fixed by background-only execution plus wake dedupe, but the smoke harness still needs per-command artifacts before parallel runs are safe.

### Week 2: User Control Plane And Field Gate

1. Move the dashboard from developer status panels to user state: Home, Approvals, Activity, Apps and Sites, Permissions, Agents, Releases, and Advanced Diagnostics. Raw JSON, smoke paths, PIDs, and stale evidence belong under Advanced.
2. Add an Apps and Sites Chrome card that says exactly one of: ready to control this page, needs skfiy host approval, needs Chrome site access, extension needs refresh, internal Chrome page cannot be controlled, screenshot capture blocked, or desktop fallback blocked by locked/asleep macOS.
3. Add local-only dashboard controls for eligible HTTP(S) pages: observe current page, screenshot current page, click confirmed selector, fill approved field, submit approved test form, and scroll. Each launcher must call `dist/skfiy`, persist Native Messaging evidence, and show a verified/blocked result in Activity.
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

Latest observed status after extension-context reload and evidence hardening:
6 test files / 126 tests passed, TypeScript passed, and `npm run build`
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
`pageControl.state: "ready"` and target-tab match, and only then returns
`reloadStrategy: "extension-context-wake"`. The desktop OCR/click path remains
as fallback and still fails closed on `desktop-session-locked`.

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

The Vitest run reported 6 files / 126 tests passed, TypeScript passed, and the
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
`reloadStrategy: "extension-context-wake"`, and a fresh
`pageControl.state: "ready"` for the requested tab.

- [ ] **Step 9: Commit**

```bash
git add chrome-extension/popup.js src/main/chrome-extension-reloader.ts src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts
git commit -m "feat: add Chrome extension-context reload wake"
```

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

- [ ] **Step 7: Commit with Task 3**

```bash
git add chrome-extension/background.js chrome-extension/popup.js src/main/chrome-extension-background.test.js src/main/chrome-extension-page-control.test.ts src/main/chrome-extension-page-control.ts src/main/chrome-extension-popup.test.js src/main/chrome-extension-reloader.test.ts src/main/chrome-extension-reloader.ts
git commit -m "feat: harden Chrome extension reload and action wake evidence"
```

## Task 4: Tab Discovery and Blocker States

**Files:**
- Modify: `src/main/cli-command-surface.ts`
- Modify: `src/main/chrome-extension-page-control.ts`
- Modify: `chrome-extension/background.js`
- Test: `src/main/cli-command-surface.test.ts`

- [ ] **Step 1: Write failing test for `chrome tabs --json`**

The test should return eligible and blocked tabs with states for ordinary HTTP(S), `chrome://`, `chrome-extension://`, `file://`, missing skfiy host policy, and missing Chrome optional host permission.

- [ ] **Step 2: Implement tab discovery**

Expose a background message that reads extension-visible tabs and returns bounded metadata: id, window id, title, URL, host, eligibility state, blocker code, and next action.

- [ ] **Step 3: CLI output**

`./dist/skfiy chrome tabs --extension-id "$SKFIY_CHROME_EXTENSION_ID" --json` must return a stable `tabs[]` array and never expose raw cookies, page text, or secrets.

- [ ] **Step 4: Commit**

```bash
git add src/main/cli-command-surface.ts src/main/chrome-extension-page-control.ts chrome-extension/background.js src/main/cli-command-surface.test.ts
git commit -m "feat: add Chrome tab discovery blockers"
```

## Task 5: User Dashboard Chrome Control Card

**Files:**
- Modify: `src/main/dashboard-data.ts`
- Modify: `src/main/dashboard-server.ts`
- Modify: dashboard HTML helper code colocated with the server
- Test: `src/main/dashboard-data.test.ts`
- Test: `src/main/dashboard-server.test.ts`
- Test: `src/main/dashboard-smoke-script.test.ts`

- [ ] **Step 1: Write dashboard test for user labels**

Require visible labels equivalent to:

- Ready to control this page
- Needs skfiy host approval
- Needs Chrome site access
- Extension needs refresh
- Internal Chrome page cannot be controlled
- Falling back to screenshot

- [ ] **Step 2: Render the Apps and Sites card**

Use `extension.pageControl`, tab discovery state, host policy, and Chrome host permission state to show the user's next action. Keep raw heartbeat JSON and smoke artifact paths in Advanced Diagnostics only.

- [ ] **Step 3: Add local action launchers**

Only show action launchers for eligible HTTP(S) pages. Initial launchers are observe, screenshot, click confirmed selector, fill approved field, submit approved test form, and scroll.

- [ ] **Step 4: Verify dashboard smoke**

```bash
npm run smoke:dashboard -- --output .skfiy-smoke/dashboard.json --require-passed
```

Expected: PASS with user information architecture evidence and no token leakage.

- [ ] **Step 5: Commit**

```bash
git add src/main/dashboard-data.ts src/main/dashboard-server.ts src/main/dashboard-data.test.ts src/main/dashboard-server.test.ts src/main/dashboard-smoke-script.test.ts
git commit -m "feat: surface Chrome control in user dashboard"
```

## Task 6: Product Smoke and Field Proof

**Files:**
- Modify: `scripts/smoke-chrome-product.mjs`
- Modify: `scripts/smoke-chrome-plan.mjs`
- Modify: `docs/chrome-extension-setup.md`
- Modify: `docs/development-workflow.md`
- Test: `src/main/chrome-smoke-script.test.ts`

- [ ] **Step 1: Add installed-extension action smoke**

The smoke should use `--extension-id plcpkkhlcacihjfohlojdknnkademlno` when supplied, serve a local HTTP page, require skfiy host policy plus Chrome optional host permission, run observe/screenshot/fill/click/submit/scroll, and persist `.skfiy-smoke/chrome-extension-actions.json`.

- [ ] **Step 2: Prove unsupported pages fail closed**

The smoke should record blockers for `chrome://`, `chrome-extension://`, missing Chrome site access, missing skfiy host approval, and sensitive fields.

- [ ] **Step 3: Run binary and dashboard gates**

```bash
npm run build
npm run smoke:cli:basic -- --output .skfiy-smoke/cli-basic.json --require-passed
npm run smoke:chrome -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/chrome-extension-actions.json --require-passed
npm run smoke:dashboard -- --output .skfiy-smoke/dashboard.json --require-passed
```

Expected: PASS from packaged `dist/skfiy` and no tmux/backend dependency.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-chrome-product.mjs scripts/smoke-chrome-plan.mjs src/main/chrome-smoke-script.test.ts docs/chrome-extension-setup.md docs/development-workflow.md
git commit -m "test: add installed Chrome extension action smoke"
```

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
- Current risk scan: screenshot is the highest-priority open browser-control risk because `captureVisibleTab` requires both Chrome-side permission/state and unambiguous Native Messaging evidence; click/submit are next because they need sequential real smoke after the action-match guard.
- Type consistency: `ChromeExtensionPageControlAction`, `pageControl`, `pageObservation`, `pageActionResult`, `pageScreenshot`, `targetTabId`, `extensionId`, `reloadStrategy`, and `executesSystemMutation` are used consistently across CLI, extension, native host, and dashboard tasks.

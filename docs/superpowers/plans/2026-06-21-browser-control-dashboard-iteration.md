# Browser Control and User Dashboard Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the installed skfiy Chrome extension `pageControl.ready` proof into packaged CLI/browser actions, dashboard-visible user controls, and repeatable real-scene smoke evidence.

**Architecture:** Keep `skfiy.app` plus packaged `dist/skfiy` as the only product runtime. The Chrome MV3 extension observes and acts inside eligible tabs, Native Messaging records bounded heartbeat/replay evidence, the CLI exposes stable commands, and the dashboard renders user-readable readiness/actions while keeping raw diagnostics in Advanced.

**Tech Stack:** Electron main process TypeScript, Vitest, Manifest V3 background/content/popup JavaScript, Chrome Native Messaging, loopback dashboard HTTP/SSE, macOS packaged `dist/skfiy`.

---

## Current State

- Manually installed Chrome extension id: `plcpkkhlcacihjfohlojdknnkademlno`.
- Proven path: `./dist/skfiy chrome reload-extension --extension-id plcpkkhlcacihjfohlojdknnkademlno --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json` can verify `pageControl.state: "ready"` on an authorized localhost HTTP page when `SKFIY_CHROME_TARGET_TAB_ID` is set from tab discovery.
- Proven readiness capabilities: diagnostics, observe, DOM actions, click, fill, submit, scroll, screenshot, and downloads.
- 2026-06-21 implementation update: `chrome observe` has been added to the packaged CLI command surface, the popup wake URL can request `skfiyWakeAction=observe`, the Native Messaging heartbeat can persist `pageObservation`, and the related Vitest suite plus `npm run build` have passed locally.
- 2026-06-21 live proof: a compiled `./dist/skfiy chrome observe` run passed against Chrome tab `1782096038` on `http://127.0.0.1:63852/`; `pageObservation.visibleText` contained `skfiy observe live smoke 2026-06-21 compiled binary path`, and local evidence was saved to `.skfiy-smoke/chrome-observe-live.json`. Commit `3dbed8b` (`feat: add Chrome observe page-control command`) was pushed to `main`.
- Current product answer to "can skfiy control Chrome?": **partially**. skfiy can now perform read-only observe on an authorized ordinary HTTP(S) tab through the installed extension and packaged CLI. It cannot yet be called a complete browser controller because screenshot/click/fill/submit/scroll are not wired through `dist/skfiy`, not persisted as action/screenshot heartbeats, and not covered by real smoke evidence.
- Subagent contract check: extension runtime support already exists for `skfiy.page.screenshot` in `chrome-extension/background.js` and `skfiy.page.action` in `chrome-extension/content-script.js`. The product gaps are CLI subcommands, wake URL parameters, Native Messaging persistence for `pageActionResult` / `pageScreenshot`, and dashboard/replay evidence.
- Development update boundary: Codex may reload the skfiy extension card while iterating because the user granted Chrome extension developer-mode permissions, but skfiy product behavior must rely on packaged CLI freshness checks and target-tab verification. Local unpacked reloads and packaged extension uploads remain explicit browser/distribution operations.
- Target-tab discovery gap: `skfiy chrome tabs` is not implemented yet. Until Task 3 lands, real tests may use a manually discovered numeric Chrome tab id or a development-only Chrome control helper solely to identify the current ordinary HTTP(S) tab.

## Immediate P0 Loop

1. Keep the compiled-binary observe proof fresh: after extension source changes, reload `plcpkkhlcacihjfohlojdknnkademlno`, rerun `./dist/skfiy chrome observe --extension-id plcpkkhlcacihjfohlojdknnkademlno --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json`, and require `result: "verified"`.
2. Finish Task 2 before claiming browser control: wire `chrome screenshot`, `chrome click`, `chrome fill`, `chrome submit`, and `chrome scroll` through `dist/skfiy`.
3. For each action command, require a typed Native Messaging heartbeat (`pageScreenshot` or `pageActionResult`), selector/action metadata, target tab id, and a stable blocked result when the extension cannot safely act.
4. Add the local safe-form real smoke only after unit tests pass. The smoke must prove before/after page state for fill/click/submit/scroll and screenshot metadata for screenshot.
5. Promote browser controls into the user dashboard only after the action smoke exists; until then the dashboard should say "Chrome observe verified; actions pending."

## File Structure

- Modify `src/main/cli-command-surface.ts`: add Chrome page-control command normalization, execution, JSON output, and blocker mapping.
- Create `src/main/chrome-extension-page-control.ts`: shared invoker for extension-backed observe, screenshot, click, fill, submit, and scroll commands.
- Modify `src/main/chrome-extension-reloader.ts`: keep reload target-tab verification and allow wake URLs to request a specific page-control action.
- Modify `src/main/chrome-native-host.ts`: persist page observation/action summaries into `chrome-extension-connection.json` without raw secrets.
- Modify `chrome-extension/popup.js`: handle `skfiyWakeAction` for observe/screenshot/action probes and relay bounded results to Native Messaging.
- Modify `chrome-extension/background.js`: route page-control requests to the requested tab and return typed blockers for host policy, Chrome site access, internal pages, stale content script, and sensitive pause.
- Modify `chrome-extension/content-script.js`: keep page snapshots/action results bounded and mark sensitive forms before fills/clicks/submits.
- Modify `src/main/dashboard-server.ts` and `src/main/dashboard-data.ts`: render user-facing Chrome readiness/actions and move raw evidence to Advanced.
- Modify `scripts/smoke-chrome-product.mjs` and `scripts/smoke-chrome-plan.mjs`: add installed-extension action evidence.
- Modify tests in `src/main/cli-command-surface.test.ts`, `src/main/chrome-native-host.test.ts`, `src/main/dashboard-data.test.ts`, `src/main/dashboard-server.test.ts`, `src/main/dashboard-smoke-script.test.ts`, `src/main/chrome-smoke-script.test.ts`, `src/main/chrome-extension-popup.test.js`, `src/main/chrome-extension-background.test.js`, and `src/main/chrome-extension-content-script.test.js`.

## Acceptance Gates

- `npx vitest run src/main/cli-command-surface.test.ts -t "runs chrome observe"`
- `npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts`
- `npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts src/main/chrome-extension-popup.test.js`
- `npx tsc --noEmit`
- `npm run build`
- `export SKFIY_CHROME_EXTENSION_ID=plcpkkhlcacihjfohlojdknnkademlno`
- Open the authorized ordinary HTTP(S) test page in the front Chrome tab, then run `export SKFIY_CHROME_TARGET_TAB_ID=$(osascript -e 'tell application "Google Chrome" to id of active tab of front window')`
- Future replacement after Task 3: `export SKFIY_CHROME_TARGET_TAB_ID=$(./dist/skfiy chrome tabs --extension-id "$SKFIY_CHROME_EXTENSION_ID" --json | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { const json = JSON.parse(data); const tab = json.tabs.find((entry) => entry.eligible === true || entry.state === "eligible"); if (!tab) process.exit(2); console.log(tab.id); });')`
- `./dist/skfiy chrome reload-extension --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json`
- `./dist/skfiy chrome observe --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json`
- `./dist/skfiy chrome screenshot --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --json`
- `./dist/skfiy chrome click --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --selector "#submit" --json`
- `./dist/skfiy chrome fill --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --selector "#name" --text skfiy --json`
- `./dist/skfiy chrome submit --extension-id "$SKFIY_CHROME_EXTENSION_ID" --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" --selector "form" --json`
- `npm run smoke:chrome -- --extension-id plcpkkhlcacihjfohlojdknnkademlno --output .skfiy-smoke/chrome-extension-actions.json --require-passed`
- `npm run smoke:dashboard -- --output .skfiy-smoke/dashboard.json --require-passed`
- `npm run smoke:cli:basic -- --output .skfiy-smoke/cli-basic.json --require-passed`

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

- [ ] **Step 3: Implement normalization and argument validation**

Add selectors/text/dy parsing to `src/main/cli-command-surface.ts`. Missing selector for click/fill/submit, missing text for fill, and missing dy for scroll must return structured CLI errors with exit code `2`.

- [ ] **Step 3a: Extend page-control action type and wake parameters**

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

- [ ] **Step 3b: Add CLI subcommands**

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

- [ ] **Step 4: Implement action dispatch**

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

- [ ] **Step 5: Run unit tests**

```bash
npx vitest run src/main/cli-command-surface.test.ts
```

Expected: PASS.

- [ ] **Step 6: Real local form test**

Run each command against a local test page with a safe form and button. Expected: fill/click/submit/scroll produce before/after page evidence and verified action summaries.

- [ ] **Step 7: Commit**

```bash
git add src/main/cli-command-surface.ts src/main/chrome-extension-page-control.ts chrome-extension/background.js chrome-extension/content-script.js src/main/cli-command-surface.test.ts
git commit -m "feat: add Chrome extension page action commands"
```

## Task 3: Tab Discovery and Blocker States

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

## Task 4: User Dashboard Chrome Control Card

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

## Task 5: Product Smoke and Field Proof

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

## Task 6: Long-Horizon Readiness Gate

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

- Spec coverage: covers Chrome control, extension reload/update boundary, user dashboard, binary/CLI product path, repeated real-scene testing, and long-horizon `money-run` gating.
- Open-ended step scan: every task has a concrete file, command, or expected evidence.
- Type consistency: `ChromeExtensionPageControlAction`, `pageControl`, `pageObservation`, `targetTabId`, `extensionId`, and `executesSystemMutation` are used consistently across CLI, extension, native host, and dashboard tasks.

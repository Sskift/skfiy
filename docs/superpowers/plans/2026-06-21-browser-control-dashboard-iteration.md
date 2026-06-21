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
- Not yet product-complete: packaged `chrome observe/screenshot/click/fill/submit/scroll` commands are not all implemented, replay evidence is not yet written for each extension action, and dashboard launchers are not yet user-grade.
- Development update boundary: Codex may click the Chrome extension card reload button while iterating, but skfiy product behavior must rely on packaged CLI freshness checks and target-tab verification. Local unpacked reloads and packaged extension uploads remain explicit browser/distribution operations.

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
- `npm run build`
- `export SKFIY_CHROME_EXTENSION_ID=plcpkkhlcacihjfohlojdknnkademlno`
- `export SKFIY_CHROME_TARGET_TAB_ID=$(./dist/skfiy chrome tabs --extension-id "$SKFIY_CHROME_EXTENSION_ID" --json | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { const json = JSON.parse(data); const tab = json.tabs.find((entry) => entry.eligible === true || entry.state === "eligible"); if (!tab) process.exit(2); console.log(tab.id); });')`
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

- [ ] **Step 1: Keep the current failing CLI test**

Run:

```bash
npx vitest run src/main/cli-command-surface.test.ts -t "runs chrome observe"
```

Expected: FAIL with exit code assertion `expected 0, received 2`, proving `chrome observe` is not wired yet.

- [ ] **Step 2: Add the page-control invoker**

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

It opens the extension wake URL, polls `chrome-extension-connection.json`, returns `result: "verified"` only when the heartbeat is fresh for the requested action and target tab, and returns `result: "blocked"` with a `reason`/`nextAction` otherwise.

- [ ] **Step 3: Wire `chrome observe` into the CLI**

In `src/main/cli-command-surface.ts`, add `observe` to `ChromeSubcommand`, command metadata, command normalization, and execution through the invoker. JSON output must include `command: "chrome observe"`, `executesSystemMutation: true`, `action: "observe"`, `extensionId`, `wakeUrl`, and `extensionConnection`.

- [ ] **Step 4: Relay observe results through Native Messaging**

In `chrome-extension/popup.js`, parse `skfiyWakeAction=observe`, send a bounded `skfiy.page.observe` request to the requested `skfiyTargetTabId`, and forward the resulting page snapshot to the native host as `pageObservation`. In `src/main/chrome-native-host.ts`, persist `pageObservation` beside `pageControl` in the connection heartbeat.

- [ ] **Step 5: Verify green tests**

Run:

```bash
npx vitest run src/main/cli-command-surface.test.ts -t "runs chrome observe"
npx vitest run src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts
```

Expected: PASS for the new observe path and unchanged existing CLI/native-host tests.

- [ ] **Step 6: Real observe test**

Run against an authorized local HTTP tab:

```bash
./dist/skfiy chrome observe \
  --extension-id plcpkkhlcacihjfohlojdknnkademlno \
  --target-tab-id "$SKFIY_CHROME_TARGET_TAB_ID" \
  --json
```

Expected: `result: "verified"` and `extensionConnection.pageObservation.visibleText` contains the test page text.

- [ ] **Step 7: Commit**

```bash
git add src/main/cli-command-surface.ts src/main/chrome-extension-page-control.ts src/main/chrome-extension-reloader.ts src/main/chrome-native-host.ts chrome-extension/popup.js src/main/cli-command-surface.test.ts src/main/chrome-native-host.test.ts
git commit -m "feat: add Chrome observe page-control command"
```

## Task 2: Chrome Action Commands

**Files:**
- Modify: `src/main/cli-command-surface.ts`
- Modify: `src/main/chrome-extension-page-control.ts`
- Modify: `chrome-extension/background.js`
- Modify: `chrome-extension/content-script.js`
- Test: `src/main/cli-command-surface.test.ts`

- [ ] **Step 1: Add failing tests for action commands**

Add tests for:

- `chrome screenshot --target-tab-id 42`
- `chrome click --target-tab-id 42 --selector "#submit"`
- `chrome fill --target-tab-id 42 --selector "#name" --text skfiy`
- `chrome submit --target-tab-id 42 --selector "form"`
- `chrome scroll --target-tab-id 42 --dy 600`

Each test should inject `chromeExtensionPageControlInvoker`, assert the exact action input, and require `executesSystemMutation: true`.

- [ ] **Step 2: Run tests red**

```bash
npx vitest run src/main/cli-command-surface.test.ts -t "chrome .*page-control"
```

Expected: FAIL for unknown subcommands or missing arguments.

- [ ] **Step 3: Implement normalization and argument validation**

Add selectors/text/dy parsing to `src/main/cli-command-surface.ts`. Missing selector for click/fill/submit, missing text for fill, and missing dy for scroll must return structured CLI errors with exit code `2`.

- [ ] **Step 4: Implement action dispatch**

Use `chrome-extension/background.js` and `chrome-extension/content-script.js` existing page action routes. Refuse sensitive fields before fill/click/submit and return `sensitive-paused` instead of executing.

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

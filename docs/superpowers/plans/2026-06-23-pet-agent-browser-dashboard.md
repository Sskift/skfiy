# Pet Agent Browser Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make skfiy feel like one coherent local pet product: the pet stays usable on screen, can select and call a real local background agent provider, can receive real Chrome page context through the extension bridge, and has a useful local dashboard for operator visibility.

**Architecture:** Keep the pet renderer thin and make the Electron main process own OS/window/provider state. Represent the pet's position as a visible pet anchor in display coordinates, not as a large transparent window position. Treat Background Agent, Computer Use planner, Chrome page context, and Dashboard as separate capability surfaces with explicit typed contracts between main, preload, renderer, dashboard, and extension code.

**Tech Stack:** Electron, TypeScript, React 19, Vite, Vitest, macOS packaged app/helper, Chrome MV3 extension, Native Messaging, local loopback Dashboard.

---

## Current Baseline And Gaps

- The useless diamond marker is the assistant bubble arrow in `src/renderer/styles.css`; it should be removed.
- Pet dragging is currently bounded by a transparent Electron window, not the visible pet hitbox, so it does not align with the real screen.
- Background Agent already supports `local`, `codex`, and `claude-code` in `src/main/assistant-agent.ts`, but Pet settings do not expose these choices.
- Pet settings currently expose Computer Use planner modes from `src/main/planner-provider-settings.ts`; that is not the same as selecting the Background Agent Provider.
- Chrome extension pageControl can report current tab readiness and run observe/click/fill/submit/scroll paths, but Pet Agent prompts do not yet receive bounded real webpage context.
- Dashboard already has snapshot/provider/browser panels, but it needs to become the readable operator surface for these capabilities, not a raw diagnostics page.

## File Ownership Map

- `src/main/window-position.ts`: pure display/window geometry math.
- `src/main/main.ts`: Electron BrowserWindow lifecycle, IPC handlers, runtime wiring.
- `src/main/preload.cts`: safe renderer API surface.
- `src/renderer/App.tsx`: Pet UI, settings, drag interaction, task bubbles.
- `src/renderer/styles.css`: Pet and bubble visual layout.
- `src/renderer/pet-atlas.ts`: Pet sprite sizing and visual scale.
- `src/main/assistant-agent.ts`: Background Agent settings, readiness, invocation, prompt construction.
- `src/main/assistant-agent-settings.ts`: new persistent Background Agent settings store.
- `src/main/browser-page-context.ts`: new bounded Chrome page context reader for agent prompts.
- `src/main/chrome-extension-*.ts`: existing Chrome extension diagnostics and pageControl bridge.
- `chrome-extension/background.js`: MV3 pageControl worker.
- `chrome-extension/popup.js`: extension operator UI and wake actions.
- `src/dashboard/DashboardApp.tsx`: Dashboard shell and panels.
- `src/dashboard/model.ts`: Dashboard view-model readers.
- `src/dashboard/contracts.ts`: Dashboard frontend API contracts.
- `src/main/dashboard-data.ts`: Dashboard backend snapshot assembly.
- `docs/chrome-extension-setup.md`: Chrome extension setup and readiness docs.
- `AGENTS.md`: project workflow for future agents.

## Execution Rules

- Work from a clean branch. Do not keep mixed UI experiments and runtime changes in one commit.
- Use tests first for behavior that can be captured in pure TypeScript or renderer tests.
- Keep one commit per completed task below. Commit only after the task's listed verification passes.
- Do not claim the screen-boundary fix is complete without a packaged-app visual smoke on macOS.
- Do not describe `Computer Use` as a separate pet chat mode. It is the permissioned tool layer used by the selected Background Agent.
- Do not silently broaden Chrome host permissions. Host policy and optional Chrome site permission must remain explicit.

---

## Task 1: Pet Visual Cleanup And Stable Click Behavior

**Files:**
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/pet-atlas.ts`
- Modify: `src/renderer/pet-atlas.test.ts`

- [ ] **Step 1: Write renderer regression tests**

Add tests in `src/renderer/App.test.tsx` that assert:

```ts
it("does not render the obsolete assistant bubble diamond marker", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).not.toContain(".assistant-bubble::after");
});

it("does not move the pet window from a plain left click", async () => {
  const api = createMockDesktopApi();
  render(<App api={api} />);
  await userEvent.click(screen.getByRole("button", { name: /skfiy pet/i }));
  expect(api.moveWindowBy).not.toHaveBeenCalled();
});
```

Add or update `src/renderer/pet-atlas.test.ts` so the selected pet skin renders at the product target scale:

```ts
it("scales pet hitbox and visual sprite for desktop use", () => {
  const style = getPetSpriteStyle(getBuiltInPetAtlas("skfiy-black-cat"), "idle");
  expect(Number.parseFloat(style["--pet-visual-scale"])).toBeLessThan(0.5);
  expect(Number.parseInt(style["--pet-hitbox-width"], 10)).toBeLessThan(100);
});
```

- [ ] **Step 2: Run tests to verify current failure**

Run:

```bash
npx vitest run src/renderer/App.test.tsx src/renderer/pet-atlas.test.ts --reporter=dot
```

Expected: failure on the diamond CSS selector or pet scale assertion before implementation.

- [ ] **Step 3: Remove obsolete marker and stabilize bubble anchoring**

In `src/renderer/styles.css`:

- Delete the entire `.assistant-bubble::after` rule.
- Anchor `.assistant-bubble` relative to the pet bottom area rather than pushing the pet.
- Remove any `.pet-stage.panel-open .skfiy-pet` rule that changes pet top/bottom when panels open.
- Keep bubble text wrapping with `overflow-wrap: anywhere`.

In `src/renderer/App.tsx`:

- Ensure plain left click toggles UI only.
- Ensure dragging is only started by pointer movement after pointer down.
- Make terminal task bubbles dismissible with a subsequent pet click.
- Remove the static phrase `Computer Use 是 agent 可调用工具` from the pet bubble.

In `src/renderer/pet-atlas.ts`:

- Apply the product display scale in one place.
- Keep manifest layout values as source geometry and derive displayed hitbox/visual scale from them.

- [ ] **Step 4: Run focused verification**

Run:

```bash
npx vitest run src/renderer/App.test.tsx src/renderer/pet-atlas.test.ts --reporter=dot
npm run typecheck -- --pretty false
```

Expected: all focused tests pass and typecheck exits with code 0.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/App.tsx src/renderer/App.test.tsx src/renderer/styles.css src/renderer/pet-atlas.ts src/renderer/pet-atlas.test.ts
git commit -m "fix: stabilize pet bubble interaction"
```

---

## Task 2: Screen-Aligned Pet Drag Bounds

**Files:**
- Modify: `src/main/window-position.ts`
- Modify: `src/main/window-position.test.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.cts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Write pure geometry tests**

Add tests in `src/main/window-position.test.ts` for a new pure function named `movePetAnchorByDelta`:

```ts
it("clamps the visible pet anchor to the display bounds", () => {
  const displays = [{ bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 875 } }];
  expect(movePetAnchorByDelta({
    anchor: { x: 100, y: 100 },
    delta: { x: -1000, y: -1000 },
    petSize: { width: 90, height: 66 },
    displays
  })).toEqual({ x: 0, y: 0 });

  expect(movePetAnchorByDelta({
    anchor: { x: 100, y: 100 },
    delta: { x: 10000, y: 10000 },
    petSize: { width: 90, height: 66 },
    displays
  })).toEqual({ x: 1350, y: 834 });
});
```

Add a multi-display test:

```ts
it("uses the display nearest to the requested pet anchor", () => {
  const displays = [
    { bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 875 } },
    { bounds: { x: 1440, y: 0, width: 1280, height: 720 }, workArea: { x: 1440, y: 0, width: 1280, height: 720 } }
  ];
  const anchor = movePetAnchorByDelta({
    anchor: { x: 1500, y: 40 },
    delta: { x: 2000, y: 1000 },
    petSize: { width: 90, height: 66 },
    displays
  });
  expect(anchor).toEqual({ x: 2630, y: 654 });
});
```

- [ ] **Step 2: Run geometry tests to verify current failure**

Run:

```bash
npx vitest run src/main/window-position.test.ts --reporter=dot
```

Expected: failure because `movePetAnchorByDelta` does not exist.

- [ ] **Step 3: Implement anchor-based geometry**

In `src/main/window-position.ts`, add:

```ts
export interface PetAnchorMoveOptions {
  anchor: Point;
  delta: Point;
  petSize: Size;
  displays: readonly DisplayLike[];
}
```

Implement `movePetAnchorByDelta(options: PetAnchorMoveOptions): Point` so it:

- Computes requested anchor as `anchor + delta`.
- Selects the display containing the requested anchor, or the nearest display center.
- Uses `display.bounds` when present, falling back to `display.workArea`.
- Clamps `x` between `display.x` and `display.x + display.width - petSize.width`.
- Clamps `y` between `display.y` and `display.y + display.height - petSize.height`.

Keep `calculatePetWindowBounds` and `resizePetWindowBoundsKeepingBottom` intact for launch/expanded positioning.

- [ ] **Step 4: Wire renderer drag to visible pet geometry**

In `src/renderer/App.tsx`:

- On pointer down, record `getBoundingClientRect()` for the visible pet.
- When dragging starts, close transient panels and switch to compact mode.
- Send drag delta plus visible pet rect to preload.
- Do not use panel height to compute drag bounds.

In `src/main/main.ts`:

- Track current pet anchor in screen coordinates.
- Compute compact window bounds from the current anchor and current pet size.
- When expanded, resize around the same pet anchor and clamp the expanded window to the display.
- On `skfiy:move-window-by`, update the anchor through `movePetAnchorByDelta`, then set BrowserWindow bounds from that anchor.

In `src/main/preload.cts`:

- Extend `moveWindowBy(deltaX, deltaY, visibleRect)` and keep the existing call signature backward compatible.

- [ ] **Step 5: Add renderer tests for drag payload and panel collapse**

Add tests in `src/renderer/App.test.tsx`:

```ts
it("sends the visible pet rect when dragging", async () => {
  const api = createMockDesktopApi();
  render(<App api={api} />);
  const pet = screen.getByRole("button", { name: /skfiy pet/i });
  vi.spyOn(pet, "getBoundingClientRect").mockReturnValue({
    x: 114, y: 15, left: 114, top: 15, width: 90, height: 66, right: 204, bottom: 81,
    toJSON: () => ({})
  } as DOMRect);
  fireEvent.pointerDown(pet, { button: 0, pointerId: 1, screenX: 200, screenY: 200 });
  fireEvent.pointerMove(pet, { pointerId: 1, screenX: 210, screenY: 215 });
  expect(api.moveWindowBy).toHaveBeenCalledWith(10, 15, { x: 114, y: 15, width: 90, height: 66 });
});
```

- [ ] **Step 6: Packaged app visual smoke**

Run:

```bash
npm run build
npm run smoke:ui -- --output .skfiy-smoke/ui-pet-bounds.json --keep-open
```

Then use CDP or a small smoke script to drag the pet to top, bottom, left, and right. Record:

- visible pet top is at the top display bound or macOS usable top bound,
- visible pet bottom is not below display bottom,
- visible pet left is not left of display left,
- visible pet right is not beyond display right.

Do not mark this task complete if the pet still stops near the middle of the screen or can be dragged below the screen.

- [ ] **Step 7: Commit**

```bash
git add src/main/window-position.ts src/main/window-position.test.ts src/main/main.ts src/main/preload.cts src/renderer/App.tsx src/renderer/App.test.tsx src/renderer/styles.css .skfiy-smoke/ui-pet-bounds.json
git commit -m "fix: bound pet dragging to visible screen"
```

---

## Task 3: Background Agent Provider Selection In Pet Settings

**Files:**
- Create: `src/main/assistant-agent-settings.ts`
- Create: `src/main/assistant-agent-settings.test.ts`
- Modify: `src/main/assistant-agent.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/preload.cts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/main/dashboard-data.ts`
- Modify: `src/main/dashboard-data.test.ts`
- Modify: `src/dashboard/contracts.ts`

- [ ] **Step 1: Write settings-store tests**

Create `src/main/assistant-agent-settings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAssistantAgentSettingsStore, readInitialAssistantAgentSettingsFromConfig } from "./assistant-agent-settings";

describe("assistant agent settings store", () => {
  it("defaults to local and accepts codex or claude-code", () => {
    const store = createAssistantAgentSettingsStore(readInitialAssistantAgentSettingsFromConfig({}, { cwd: "/repo" }));
    expect(store.get().mode).toBe("local");
    expect(store.set({ mode: "codex" }).mode).toBe("codex");
    expect(store.set({ mode: "claude-code" }).mode).toBe("claude-code");
  });

  it("ignores invalid modes", () => {
    const store = createAssistantAgentSettingsStore(readInitialAssistantAgentSettingsFromConfig({}, { cwd: "/repo" }));
    expect(store.set({ mode: "remote-agent" }).mode).toBe("local");
  });
});
```

- [ ] **Step 2: Implement persistent settings store**

Create `src/main/assistant-agent-settings.ts` with:

- `AssistantAgentSettingsUpdate`.
- `readInitialAssistantAgentSettingsFromConfig(env, defaults)`.
- `createAssistantAgentSettingsStore(initialSettings)`.
- Mode validation for exactly `local`, `codex`, `claude-code`.

Use `readInitialAssistantAgentSettings` from `src/main/assistant-agent.ts` for env/default parsing. Keep env-provided binary paths and cwd in the settings object.

- [ ] **Step 3: Add IPC and preload contracts**

In `src/main/main.ts`:

- Initialize `assistantAgentSettingsStore`.
- Use `assistantAgentSettingsStore.get()` inside `createAssistantAgentTaskTurn`.
- Add IPC handlers:

```ts
ipcMain.handle("skfiy:get-assistant-agent-settings", async () => ({
  settings: assistantAgentSettingsStore.get(),
  providers: await readAssistantAgentProviderStates(assistantAgentSettingsStore.get())
}));

ipcMain.handle("skfiy:set-assistant-agent-settings", async (_event, update: unknown) => ({
  settings: assistantAgentSettingsStore.set(update && typeof update === "object" ? update : {}),
  providers: await readAssistantAgentProviderStates(assistantAgentSettingsStore.get())
}));
```

In `src/main/preload.cts`, expose:

- `getAssistantAgentSettings()`
- `setAssistantAgentSettings(update)`

- [ ] **Step 4: Add Pet settings UI**

In `src/renderer/App.tsx`:

- Add `AssistantAgentSettingsResponse` and provider state types.
- Fetch assistant provider settings on startup and when opening settings.
- Add a settings section named `Background Agent`.
- Render three segmented choices: `Local`, `Codex`, `Claude Code`.
- Show readiness, selected provider, binary path, cwd, timeout, and last error.
- Keep `Computer Use planner` in a separate section labelled `Computer Use Planner`.

Copy rules:

- Use `Background Agent` for the chat provider.
- Use `Computer Use Planner` for desktop action planning.
- Do not say that Codex or Claude directly control the desktop from pet chat.

- [ ] **Step 5: Renderer tests**

Add tests in `src/renderer/App.test.tsx`:

```ts
it("shows background agent provider choices separately from Computer Use planner", async () => {
  const api = createMockDesktopApi({
    getAssistantAgentSettings: async () => createAssistantAgentFixture("local")
  });
  render(<App api={api} />);
  await userEvent.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: /skfiy pet/i }) });
  expect(await screen.findByText("Background Agent")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "选择 Codex background agent" })).toBeInTheDocument();
  expect(screen.getByText("Computer Use Planner")).toBeInTheDocument();
});
```

Add a test that selecting Codex calls `setAssistantAgentSettings({ mode: "codex" })`.

- [ ] **Step 6: Dashboard provider data**

In `src/main/dashboard-data.ts`, include selected Background Agent provider state from the same store. In `src/dashboard/contracts.ts`, keep provider contracts typed so Dashboard can show assistant and planner independently.

Add or update `src/main/dashboard-data.test.ts` to assert:

- assistant provider summary includes selected `codex`,
- raw env secrets are redacted,
- planner summary remains separate.

- [ ] **Step 7: Verification and commit**

Run:

```bash
npx vitest run src/main/assistant-agent-settings.test.ts src/main/assistant-agent.test.ts src/main/dashboard-data.test.ts src/renderer/App.test.tsx --reporter=dot
npm run typecheck -- --pretty false
```

Then commit:

```bash
git add src/main/assistant-agent-settings.ts src/main/assistant-agent-settings.test.ts src/main/assistant-agent.ts src/main/main.ts src/main/preload.cts src/renderer/App.tsx src/renderer/App.test.tsx src/main/dashboard-data.ts src/main/dashboard-data.test.ts src/dashboard/contracts.ts
git commit -m "feat: expose background agent provider settings"
```

---

## Task 4: Chrome Extension Page Context For Background Agent

**Files:**
- Create: `src/main/browser-page-context.ts`
- Create: `src/main/browser-page-context.test.ts`
- Modify: `src/main/assistant-agent.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/dashboard-data.ts`
- Modify: `src/main/dashboard-data.test.ts`
- Modify: `src/dashboard/contracts.ts`
- Modify: `src/dashboard/model.ts`
- Modify: `src/dashboard/DashboardApp.tsx`
- Modify: `docs/chrome-extension-setup.md`

- [ ] **Step 1: Write page-context tests**

Create `src/main/browser-page-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createBrowserPageContextPromptBlock, normalizeBrowserPageContext } from "./browser-page-context";

describe("browser page context", () => {
  it("creates a bounded prompt block from a ready page observation", () => {
    const context = normalizeBrowserPageContext({
      state: "ready",
      url: "https://example.test/form",
      title: "Example Form",
      visibleText: "Name Email Submit ".repeat(200),
      observedAt: "2026-06-23T00:00:00.000Z"
    });
    expect(context.state).toBe("ready");
    expect(createBrowserPageContextPromptBlock(context)).toContain("Current Chrome page");
    expect(createBrowserPageContextPromptBlock(context).length).toBeLessThan(3000);
  });

  it("returns a typed blocker when pageControl is not ready", () => {
    const context = normalizeBrowserPageContext({
      state: "blocked_by_chrome_host_permission",
      reason: "Chrome host permission missing",
      nextAction: "Grant site access"
    });
    expect(context.state).toBe("blocked_by_chrome_host_permission");
    expect(createBrowserPageContextPromptBlock(context)).toContain("Browser context unavailable");
  });
});
```

- [ ] **Step 2: Implement bounded page context module**

In `src/main/browser-page-context.ts`:

- Define `BrowserPageContextState`.
- Define `BrowserPageContext`.
- Implement `normalizeBrowserPageContext(raw)`.
- Implement `createBrowserPageContextPromptBlock(context)`.
- Limit visible text to 2000 characters.
- Include `url`, `title`, `observedAt`, `state`, and `reason`.

- [ ] **Step 3: Wire context into Background Agent prompt**

In `src/main/assistant-agent.ts`:

- Extend `RunAssistantAgentTurnInput` with optional `browserPageContext`.
- Add the prompt block after the system framing and before the user input.
- Keep Computer Use safety text unchanged.

In `src/main/main.ts`:

- Before running `runAssistantAgentTurn`, attempt to read latest Chrome pageControl observation from existing extension diagnostics.
- If unavailable, pass a typed unavailable context rather than throwing.
- Do not block normal pet chat when Chrome is not connected.

- [ ] **Step 4: Surface Browser context readiness**

In `src/main/dashboard-data.ts`:

- Add browser context state to runtime/provider snapshot.
- Include pageControl blocker reason and next action.

In `src/dashboard/model.ts` and `src/dashboard/DashboardApp.tsx`:

- Show whether Browser Context is ready, partial, blocked, stale, or missing.
- Show url/title when ready.
- Show next action when blocked.

- [ ] **Step 5: Documentation**

Update `docs/chrome-extension-setup.md` with a section named `Pet Agent Page Context`:

- The extension provides page context only for current `http` or `https` tabs.
- Host policy and Chrome optional host permission must be granted.
- Screenshot readiness is separate from DOM observation readiness.
- If context is blocked, pet chat still works without browser context.

- [ ] **Step 6: Verification and commit**

Run:

```bash
npx vitest run src/main/browser-page-context.test.ts src/main/assistant-agent.test.ts src/main/dashboard-data.test.ts --reporter=dot
npm run typecheck -- --pretty false
```

Then commit:

```bash
git add src/main/browser-page-context.ts src/main/browser-page-context.test.ts src/main/assistant-agent.ts src/main/main.ts src/main/dashboard-data.ts src/main/dashboard-data.test.ts src/dashboard/contracts.ts src/dashboard/model.ts src/dashboard/DashboardApp.tsx docs/chrome-extension-setup.md
git commit -m "feat: pass chrome page context to pet agent"
```

---

## Task 5: Dashboard MVP Polish And Useful Runtime Visibility

**Files:**
- Modify: `src/dashboard/DashboardApp.tsx`
- Modify: `src/dashboard/model.ts`
- Modify: `src/dashboard/contracts.ts`
- Modify: `src/main/dashboard-data.ts`
- Modify: `src/main/dashboard-data.test.ts`
- Modify: `src/dashboard/DashboardApp.test.tsx`

- [ ] **Step 1: Write dashboard view tests**

Add tests in `src/dashboard/DashboardApp.test.tsx`:

```ts
it("shows assistant provider, current turn, browser context, and latest blocker", async () => {
  render(<DashboardApp loadSnapshot={async () => createDashboardSnapshotFixture({
    assistantProvider: "Codex",
    currentTurnStatus: "failed",
    browserContextState: "blocked_by_chrome_host_permission",
    latestBlocker: "Chrome host permission missing"
  })} />);

  expect(await screen.findByText("Codex")).toBeInTheDocument();
  expect(screen.getByText("failed")).toBeInTheDocument();
  expect(screen.getByText("Chrome host permission missing")).toBeInTheDocument();
});
```

Use existing dashboard fixture helpers where available; if no helper exists, add a small local fixture in the test file.

- [ ] **Step 2: Improve dashboard hierarchy**

In `src/dashboard/DashboardApp.tsx`:

- Overview first row: Assistant Provider, Computer Use, Chrome Browser Context, Current Turn.
- Provider section: Background Agent and Computer Use Planner side by side.
- Browser section: Extension heartbeat, pageControl readiness, host policy, current page context.
- Activity section: current turn, latest replay, latest failure/blocker, latest smoke evidence.
- Keep raw JSON out of the primary scan path.

In `src/dashboard/model.ts`:

- Add view-model readers for `browserContext`, `assistantProvider`, and `latestTaskSignal`.
- Return stable labels and tones for ready/partial/blocked/missing states.

- [ ] **Step 3: Preserve useful controls**

Keep existing controls:

- Refresh dashboard.
- Chrome host policy actions.
- Chrome page actions: observe, screenshot, click, fill, submit, scroll.
- Planner provider settings.

Add assistant provider status display, but do not allow Dashboard to mutate assistant provider until Pet settings mutation is stable.

- [ ] **Step 4: Visual QA**

Run:

```bash
npm run build
./dist/skfiy dashboard --no-open --port 0 --json
```

Open the returned local URL. Verify:

- no nested-card clutter,
- no large marketing hero,
- no text overlap at desktop width,
- panels are scannable,
- current failure/blocker is visible without opening raw JSON.

- [ ] **Step 5: Verification and commit**

Run:

```bash
npx vitest run src/dashboard/DashboardApp.test.tsx src/main/dashboard-data.test.ts --reporter=dot
npm run typecheck -- --pretty false
npm run build
```

Then commit:

```bash
git add src/dashboard/DashboardApp.tsx src/dashboard/model.ts src/dashboard/contracts.ts src/main/dashboard-data.ts src/main/dashboard-data.test.ts src/dashboard/DashboardApp.test.tsx
git commit -m "feat: polish dashboard runtime overview"
```

---

## Task 6: End-To-End Product Validation

**Files:**
- Modify only when tests reveal real defects.
- Create smoke artifacts under `.skfiy-smoke/` when commands support `--output`.

- [ ] **Step 1: Run full unit and type gates**

```bash
git diff --check
npm run typecheck -- --pretty false
npx vitest run --reporter=dot
```

Expected:

- `git diff --check` exits 0.
- Typecheck exits 0.
- Vitest exits 0.

- [ ] **Step 2: Build packaged app**

```bash
npm run build
```

Expected:

- `dist/skfiy.app` exists.
- `dist/skfiy` exists.
- Known pre-existing CSS `calc(100%-...)` warnings can be recorded but must not be introduced by new code.

- [ ] **Step 3: Run product smoke gates**

```bash
npm run smoke:ui -- --output .skfiy-smoke/ui-product.json
npm run smoke:dashboard -- --output .skfiy-smoke/dashboard-product.json
./dist/skfiy status --json
./dist/skfiy chrome extension-info --json
```

If a smoke is blocked by local macOS permissions or Chrome environment, record the typed blocker and do not call the feature complete until the blocker is either resolved or explicitly accepted by the project owner.

- [ ] **Step 4: Manual acceptance checklist**

- Pet has no diamond marker.
- Pet click does not move the pet.
- Pet drag respects visible screen bounds at all four edges.
- Pet settings show Background Agent Provider choices.
- Selecting Codex changes the next background agent provider.
- Chrome extension state says whether page context is ready, blocked, stale, or missing.
- Pet agent can answer using current webpage context when extension pageControl is ready.
- Dashboard is visually clean and shows assistant, Computer Use, Chrome, current turn, latest blocker, and recent runtime evidence.

- [ ] **Step 5: Final commit or PR**

After all checks pass:

```bash
git status --short
git log --oneline -5
```

If the branch contains only this plan's work, open the integration path requested by the project owner. If no PR is requested, stop after the verified commits and report exact commands run plus any residual blockers.

---

## Residual Risks

- macOS may prevent a BrowserWindow from reaching pixels hidden behind the menu bar. The acceptance criterion is visible pet alignment to the usable display boundary reported by runtime evidence.
- Branded Google Chrome can block automated unpacked-extension loading. Use Chrome for Testing or Chromium for automated proof, and manual installed-extension proof for branded Chrome.
- Background Agent CLI providers are intentionally bounded and non-interactive. They must not bypass the Computer Use approval and policy layer.

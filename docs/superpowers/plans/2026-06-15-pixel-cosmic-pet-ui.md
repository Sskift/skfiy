# Pixel Cosmic Pet UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the current floating control card with an animated pixel-art cosmic robot desktop pet that opens controls only as a contextual bubble.

**Architecture:** Keep the existing Electron + React + preload IPC contract. The renderer becomes a pet-first overlay: a transparent stage, a CSS pixel robot, state-driven animation classes, and a speech/control bubble that appears on click, approval, or task activity.

**Tech Stack:** Electron, React, TypeScript, CSS pixel art, Vitest + Testing Library.

---

### Task 1: Renderer Behavior Tests

**Files:**
- Modify: `src/renderer/App.test.tsx`

- [x] Add tests that the default screen shows a cosmic pixel robot and hides command controls.
- [x] Add tests that clicking the robot opens command controls.
- [x] Add tests that task status events switch the robot animation state.
- [x] Add tests that approval events show Approve and Deny controls.
- [x] Run `npm test -- src/renderer/App.test.tsx --run` and verify the new tests fail before implementation.

Implemented evidence:
- `src/renderer/App.test.tsx` covers the default Codex-style pet overlay, hidden command controls, left-click voice entry, right-click settings, approval controls, task-status-to-animation mapping, drag movement, focus-box removal, and compact/expanded window mode.
- Current targeted renderer verification: `npm test -- src/renderer/App.test.tsx --run`.

### Task 2: Pixel Pet Renderer

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

- [x] Replace the card layout with a pet stage, pixel robot, status bubble, and contextual controls.
- [x] Implement state-to-animation mapping for idle, observing, executing, approval, completed, and failed.
- [x] Keep existing IPC calls for run, screenshot, stop, approve, and deny.
- [x] Add CSS keyframe animations for floating, antenna ping, eye blink, thruster flicker, thinking orbit, control pulse, success sparkle, and error shake.
- [x] Run renderer tests until they pass.

Implemented evidence:
- `src/renderer/App.tsx` renders the pet-first overlay with the atlas-backed pixel robot, contextual voice/settings/approval bubbles, and retained preload IPC calls for voice, approval, stop, screenshot, app policy, planner settings, replay, and window movement.
- `src/renderer/styles.css` keeps the transparent pet stage, pixelated sprite atlas animation, bobbing motion, waiting/running/failed state styling, compact contextual bubbles, permission/settings panels, and no visible command input on the default screen.

### Task 3: Electron Overlay Tuning

**Files:**
- Modify: `src/main/main.ts`

- [x] Resize the Electron window to a pet-stage footprint instead of a panel footprint.
- [x] Keep the window transparent, frameless, always-on-top, and skip-taskbar.
- [x] Preserve drag support through CSS app regions for now.
- [x] Run `npm run typecheck`.

Implemented evidence:
- `src/main/main.ts` defines compact and expanded pet window sizes, creates a transparent frameless always-on-top skip-taskbar `BrowserWindow`, and exposes `set-window-mode` plus `move-window-by` IPC for renderer-driven compact/expanded state and pointer drag movement.
- Current TypeScript verification: `npm run typecheck`.

### Task 4: Verification And Commit

**Files:**
- No additional files expected.

- [x] Run `npm test -- --run`.
- [x] Run `npm run build`.
- [x] Open the local renderer in the in-app browser and verify the pet is visible, animated, and not a card UI.
- [x] Commit and push directly to `main`.

Implemented evidence:
- Full verification is part of the release workflow and is tracked in `docs/release-evidence/latest-alpha.json`; current alpha `skfiy-alpha-e0381de` ran full tests, typecheck, build, UI/Ghostty/Chrome/Finder/voice packaged smokes, dogfood verifier, GitHub release publishing, and tracking issue sync.
- Product-path smoke evidence for the current alpha: `.skfiy-smoke/ui-e0381de.json`, `.skfiy-smoke/ghostty-e0381de.json`, `.skfiy-smoke/chrome-e0381de.json`, `.skfiy-smoke/finder-e0381de.json`, and `.skfiy-smoke/voice-e0381de.json`.
- Product-path UI evidence: `npm run smoke:ui -- --output .skfiy-smoke/ui-e0381de.json` launched `dist/skfiy.app` via LaunchServices, clicked the real renderer pet, recorded `petClicked=true`, permission onboarding rows, transparent pet product path, `runnerHasTmux=false`, and empty cleanup process lists.

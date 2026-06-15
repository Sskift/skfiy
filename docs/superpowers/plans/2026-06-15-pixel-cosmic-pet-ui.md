# Pixel Cosmic Pet UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current floating control card with an animated pixel-art cosmic robot desktop pet that opens controls only as a contextual bubble.

**Architecture:** Keep the existing Electron + React + preload IPC contract. The renderer becomes a pet-first overlay: a transparent stage, a CSS pixel robot, state-driven animation classes, and a speech/control bubble that appears on click, approval, or task activity.

**Tech Stack:** Electron, React, TypeScript, CSS pixel art, Vitest + Testing Library.

---

### Task 1: Renderer Behavior Tests

**Files:**
- Modify: `src/renderer/App.test.tsx`

- [ ] Add tests that the default screen shows a cosmic pixel robot and hides command controls.
- [ ] Add tests that clicking the robot opens command controls.
- [ ] Add tests that task status events switch the robot animation state.
- [ ] Add tests that approval events show Approve and Deny controls.
- [ ] Run `npm test -- src/renderer/App.test.tsx --run` and verify the new tests fail before implementation.

### Task 2: Pixel Pet Renderer

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

- [ ] Replace the card layout with a pet stage, pixel robot, status bubble, and contextual controls.
- [ ] Implement state-to-animation mapping for idle, observing, executing, approval, completed, and failed.
- [ ] Keep existing IPC calls for run, screenshot, stop, approve, and deny.
- [ ] Add CSS keyframe animations for floating, antenna ping, eye blink, thruster flicker, thinking orbit, control pulse, success sparkle, and error shake.
- [ ] Run renderer tests until they pass.

### Task 3: Electron Overlay Tuning

**Files:**
- Modify: `src/main/main.ts`

- [ ] Resize the Electron window to a pet-stage footprint instead of a panel footprint.
- [ ] Keep the window transparent, frameless, always-on-top, and skip-taskbar.
- [ ] Preserve drag support through CSS app regions for now.
- [ ] Run `npm run typecheck`.

### Task 4: Verification And Commit

**Files:**
- No additional files expected.

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Open the local renderer in the in-app browser and verify the pet is visible, animated, and not a card UI.
- [ ] Commit and push directly to `main`.

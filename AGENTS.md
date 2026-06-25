# skfiy Agent Workflow

This file is the working contract for agents developing this repository.

## Product North Star

skfiy is a local-first macOS desktop pet that fronts a Background Agent. The pet can answer normally, can ask skfiy to run permissioned Computer Use actions, can receive real Chrome page context when the extension bridge is ready, and exposes operator state through a local Dashboard.

## Active Plan

Use the single active plan:

- `docs/superpowers/plans/2026-06-23-pet-agent-browser-dashboard.md`

Old long-form plans were removed so this file is the planning source of truth. If future scope changes, update this active plan or replace it with exactly one newer active plan.

## Development Loop

1. Start from a clean worktree and a branch named `codex/<short-scope>`.
2. Read the active plan before editing code.
3. Pick one task from the plan and keep the commit scoped to that task.
4. Write or update focused tests before implementation for non-trivial behavior.
5. Implement the smallest change that satisfies the task and follows existing local patterns.
6. Run the task-specific verification from the plan.
7. Commit after the task passes.
8. Run full verification before reporting completion:

```bash
git diff --check
npm run typecheck -- --pretty false
npx vitest run --reporter=dot
npm run build
```

For product-facing UI or macOS behavior, also run the relevant smoke command:

```bash
npm run smoke:ui -- --output .skfiy-smoke/ui-product.json
npm run smoke:dashboard -- --output .skfiy-smoke/dashboard-product.json
```

## Subagent Supervision

Use subagents for long-running implementation tasks, not for tiny one-off edits. A supervised subagent assignment must include:

- the active plan path,
- exact task name,
- exact files likely to change,
- acceptance criteria,
- required verification commands,
- instruction to reuse existing structure instead of building a disconnected MVP.

The main agent remains responsible for review. Do not merge a subagent result until you inspect the diff, run the task verification, and confirm it fits the product architecture.

## Architecture Boundaries

- Pet renderer UI lives in `src/renderer/App.tsx` and `src/renderer/styles.css`.
- Electron main process owns OS state, windows, providers, and IPC in `src/main/main.ts`.
- Preload APIs in `src/main/preload.cts` must stay narrow and typed.
- Pure geometry belongs in `src/main/window-position.ts`.
- Background Agent provider logic belongs in `src/main/assistant-agent.ts` and related settings modules.
- Computer Use planner settings are separate from Background Agent provider settings.
- Chrome extension pageControl is an enhancement channel for browser context and browser actions. It does not replace macOS Accessibility or Screen Recording.
- Dashboard frontend lives in `src/dashboard/`; Dashboard backend snapshot assembly lives in `src/main/dashboard-data.ts`.

## Product Language

Use precise names in UI and docs:

- `Background Agent`: the selected chat/reasoning provider: Codex, Claude Code, or Hermes.
- `Computer Use`: the permissioned desktop/app-control tool layer.
- `Computer Use Planner`: the provider that plans desktop-control actions.
- `Browser Context`: bounded current-tab context from the Chrome extension pageControl bridge.

Do not describe Computer Use as a competing chat mode. Do not imply Codex, Claude Code, or Hermes directly control the desktop from the pet chat provider call.

## Safety Rules

- Do not silently broaden Chrome host permissions.
- Do not bypass macOS Screen Recording or Accessibility requirements.
- Do not let Background Agent CLI providers execute local mutations directly from pet chat.
- Do not claim screen-boundary fixes are complete without packaged-app visual evidence.
- Do not leave mixed half-working experiments uncommitted in the worktree. If an experiment is not accepted, revert it or isolate it in a named patch outside the repo.

## Commit Style

Use focused commits:

- `fix: stabilize pet bubble interaction`
- `fix: bound pet dragging to visible screen`
- `feat: expose background agent provider settings`
- `feat: pass chrome page context to pet agent`
- `feat: polish dashboard runtime overview`

Before final handoff, report:

- commits created,
- verification commands run,
- smoke artifacts produced,
- remaining blockers with exact typed reason.

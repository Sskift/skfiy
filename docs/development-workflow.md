# skfiy development workflow

skfiy is an agent-first macOS desktop pet. The pet is the lightweight surface; the background agent is the primary decision maker; Computer Use is a tool capability the agent invokes when an explicit app-control task needs observation, clicking, typing, scrolling, screenshots, or other desktop actions.

skfiy only handles agent requests and authorized desktop actions. OS-level input methods can still type wherever the user chooses, but they stay outside skfiy's product surface and test gates.

## Runtime Rules

- Run and test the compiled app bundle or binary, not a tmux-only backend or Vite-only renderer.
- Use lowercase `skfiy` for app names, bundle references, CLI names, release tags, and docs.
- Computer Use permissions are Screen Recording and Accessibility. Finder Automation and Chrome extension/native-host readiness are app-specific add-ons.
- The pet left click opens the agent surface. Right click opens lightweight pet settings. Larger configuration belongs in the dashboard.
- Computer Use must be routed through the agent/tool boundary. Chat, clarification, refusal, and planning are agent behavior; screenshots/clicks/typing are Computer Use tool behavior.

## Local Loop

1. Build the helper, app, CLI, dashboard, and extension pieces required by the touched surface.
2. Run `npm run typecheck -- --pretty false`.
3. Run focused Vitest suites for touched modules.
4. For UI changes, launch the packaged app and verify the real pet surface.
5. For Computer Use changes, run packaged smoke tests from a normal unlocked desktop session.

## Smoke Tests

Use these active smoke targets:

- `npm run smoke:ui -- --output .skfiy-smoke/ui-current.json`
- `npm run smoke:desktop-session -- --output .skfiy-smoke/desktop-session-current.json`
- `npm run smoke:ghostty -- --matrix --output .skfiy-smoke/ghostty-current.json`
- `npm run smoke:chrome -- --output .skfiy-smoke/chrome-current.json`
- `npm run smoke:finder -- --item-drag-drop --output .skfiy-smoke/finder-current.json`
- `npm run smoke:money-run -- --require-passed --output .skfiy-smoke/money-run-current.json`

`--require-passed` is only appropriate after `smoke:desktop-session` passes and Screen Recording plus Accessibility are granted to the packaged `skfiy.app` identity.

## Dogfood Flow

1. Build and package `dist/skfiy.app` plus `dist/skfiy`.
2. Run UI, Ghostty, Chrome, Finder, and optional money-run smokes.
3. Create the alpha artifact with `npm run alpha:artifact`, passing the active smoke artifact paths.
4. Verify with `npm run dogfood:verify -- --manifest <alpha-manifest>`.
5. Assign real testers with `npm run dogfood:tester`; it runs packaged-app smokes sequentially and creates a checked issue draft.
6. Maintainers review reports before adding `dogfood:accepted` and workflow labels.

Dogfood reports require UI/Ghostty/Chrome/Finder artifact paths, app bundle preflight, pet drag proof, panic stop evidence, Computer Use screenshots/actions when available, and accepted GitHub issue source metadata.

## Dashboard

The dashboard is user-facing, not developer-only. It should show:

- Agent provider connection and configuration state.
- Computer Use readiness: desktop session, Screen Recording, Accessibility, Finder, Chrome bridge.
- Current turn and replay timeline.
- Recent smoke evidence and dogfood readiness.
- Long-horizon money-run supervision status.

Do not add in-app audio input, input-method provider, or transcript panels.

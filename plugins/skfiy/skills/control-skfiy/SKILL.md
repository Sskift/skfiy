---
name: control-skfiy
description: Use when the user wants Codex to inspect or operate the installed skfiy desktop Computer Use runtime, check permissions, open diagnostics, or prepare a permissioned desktop-control turn through skfiy.
---

# Control skfiy

Use the installed `skfiy` product runtime. Do not launch skfiy from tmux, a source-tree dev server, or a loose helper binary when collecting product evidence.

## Readiness Checks

1. Run `skfiy status --json` to inspect app, helper, permission, desktop-session, Chrome Native Messaging, and dashboard state.
2. Run `skfiy doctor --json` when status reports missing permissions, stale packaging, desktop lock/sleep, Chrome host setup, or dashboard issues.
3. Use `skfiy mcp serve --stdio` only as the MCP server command from Codex plugin configuration.

## Safety Rules

- Do not run desktop control without explicit user approval.
- Do not treat this plugin as the skfiy runtime; it is only an adapter to the installed app and CLI.
- Do not bypass skfiy's app policy, host policy, permission preflight, approval prompts, or stop-turn behavior.
- Do not request sensitive browser or download path data unless the user explicitly confirms the request.

## Operator Commands

- `skfiy dashboard --no-open --json` starts the local dashboard without opening a browser.
- `skfiy chrome status --json` checks Chrome Native Messaging host state after an extension id is configured.
- `skfiy smoke <target> --output <path> --json` collects product-path evidence for supported smoke targets.

The expected successful path is always installed product runtime -> packaged CLI -> packaged app/helper -> replayable Computer Use evidence.

# Skfiy

Skfiy is a macOS desktop Computer Use prototype focused on Ghostty control,
screen observation, and explicit user approval.

The first version is intentionally narrow: observe the desktop, activate
Ghostty, type safe commands, capture screenshots, and show task state in a
floating desktop companion.

## MVP Scope

- Floating desktop companion with active and quiet modes.
- macOS helper for app listing, Ghostty activation, screenshots, clicks, text
  input, and key presses.
- Ghostty command flow with risk classification before execution.
- Explicit approval for commands that can modify local state.
- Local-only execution. The helper does not send screenshots or command output
  to a remote service by itself.

## macOS Permissions

The app needs two system permissions before it can behave like Computer Use:

- **Screen Recording**: allows screenshots of the desktop or target window.
- **Accessibility**: allows synthetic clicks, typing, key presses, and window
  focus changes.

Open **System Settings > Privacy & Security** and grant both permissions to the
terminal or app process running Skfiy during local development.

## Safety Model

Skfiy treats terminal control as higher risk than normal GUI automation.

- Read-only commands such as `pwd`, `ls`, `date`, and `whoami` can run without
  an extra approval pause.
- Local state changes such as `mkdir demo` pause for approval and require the
  Approve button before execution.
- Destructive, privileged, piped installer, or automation commands such as
  `rm -rf`, `sudo`, `curl ... | sh`, and `osascript` require explicit approval
  and should be denied by default in the MVP.

## Development

```bash
npm install
npm test -- --run
npm run typecheck
npm run build
npm run build:helper
npm start
```

For renderer iteration, run `npm run dev:renderer`, then launch the built main
process in another terminal with `npm run dev:electron`.

The Electron UI and TypeScript core are testable without granting macOS
permissions. The Swift helper requires macOS and may trigger permission prompts
when used against the real desktop.

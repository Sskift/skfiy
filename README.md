# skfiy

skfiy is a macOS desktop Computer Use prototype focused on Ghostty control,
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
terminal or app process running skfiy during local development.

## Doubao Dictation

Left-click the desktop pet to enter skfiy's dictation flow. Right-click the pet
for settings details. By default skfiy selects Doubao Input Method as the text
bridge and sends a skfiy-owned voice shortcut:
`Control+Option+Command+Shift+Space`. Configure Doubao Input Method's voice
shortcut to the same chord if you want Doubao's native speech recognition to
write into skfiy's transcript area.

Set `SKFIY_DOUBAO_VOICE_TRIGGER=none` to disable native shortcut triggering and
fall back to Chromium Web Speech. That browser engine can fail with a `network`
error in restricted environments even when microphone permission is already
granted. For local compatibility experiments only, launch with
`SKFIY_DOUBAO_VOICE_TRIGGER=fn-double-tap` to restore the legacy Fn double-tap
trigger.

## Safety Model

skfiy treats terminal control as higher risk than normal GUI automation.

- Read-only commands such as `pwd`, `ls`, `date`, and `whoami` can run without
  an extra approval pause.
- Local state changes such as `mkdir demo` pause for approval and require the
  Approve button before execution.
- Destructive, privileged, piped installer, or automation commands such as
  `rm -rf`, `sudo`, `curl ... | sh`, and `osascript` require explicit approval
  and should be denied by default in the MVP.

## Development

skfiy has a mandatory workflow contract for user-facing tests:
[docs/development-workflow.md](docs/development-workflow.md).

Important: `npm start`, Vite, direct Electron launches, `tmux`, and shell
background processes are development-only. A user-visible demo must run from a
compiled macOS app bundle with a stable permission identity.

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

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

The app needs three system permissions before it can behave like a voice Computer Use app:

- **Screen Recording**: allows screenshots of the desktop or target window.
- **Accessibility**: allows synthetic clicks, typing, key presses, and window
  focus changes.
- **Microphone**: allows voice turns when using a local speech provider.
- **Speech Recognition**: allows the macOS native speech provider to transcribe
  local voice commands.

Open **System Settings > Privacy & Security** and grant these permissions to the
compiled `skfiy.app` bundle used for local validation.

Right-click the pet to view the current Screen Recording, Accessibility,
Microphone, and Speech Recognition status, or to jump to the matching System
Settings pane.

## Doubao Dictation

Left-click the desktop pet to enter skfiy's dictation flow. Right-click the pet
for settings details and ASR provider switching. By default skfiy selects Doubao
Input Method as the text bridge and sends a skfiy-owned voice shortcut:
`Control+Option+Command+Shift+Space`. Configure Doubao Input Method's voice
shortcut to the same chord if you want Doubao's native speech recognition to
write into skfiy's transcript area.

Choose the browser provider in settings to skip Doubao triggering and use
Chromium Web Speech fallback for the next voice turn. Choose the macOS provider
to use skfiy's local one-shot Speech framework prototype; it listens until a
short silence timeout or a maximum duration, then streams the final transcript
back into the same Computer Use path.

Press `Escape` while the pet has focus, or `Control+Option+Shift+Escape`
globally, to stop the current voice or task turn.

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
npm run smoke:ui -- --output .skfiy-smoke/ui-permission-onboarding.json
npm run smoke:ghostty -- --output .skfiy-smoke/ghostty-smoke.json
npm run smoke:chrome -- --output .skfiy-smoke/chrome-page.json
npm run smoke:finder -- --item-drag-drop --output .skfiy-smoke/finder-item-drag-drop.json
npm run smoke:voice -- --output .skfiy-smoke/voice-native.json
npm run alpha:artifact -- \
  --ui-smoke-artifact .skfiy-smoke/ui-permission-onboarding.json \
  --smoke-artifact .skfiy-smoke/ghostty-smoke.json \
  --chrome-smoke-artifact .skfiy-smoke/chrome-page.json \
  --finder-smoke-artifact .skfiy-smoke/finder-item-drag-drop.json \
  --voice-smoke-artifact .skfiy-smoke/voice-native.json
npm run alpha:github-release -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --require-current-head
npm run dogfood:tracking-issue -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-<commit> \
  --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 \
  --output .skfiy-dogfood/tracking-issue-<commit>.md
npm run dogfood:prepare-alpha -- \
  --release-url https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-<commit> \
  --tester-id tester-a \
  --execute
npm run dogfood:handoff -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --app <path-to-unzipped-skfiy.app> \
  --tester-id tester-a \
  --output .skfiy-dogfood/handoffs/tester-a.md
npm run dogfood:tester -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --app <path-to-unzipped-skfiy.app> \
  --tester-id tester-a \
  --workflows coding-terminal,screenshot-inspection
npm run dogfood:review -- \
  --manifest .skfiy-alpha/skfiy-0.1.0-<commit>-macos-unsigned.json \
  --issue-url https://github.com/Sskift/skfiy/issues/<filed-dogfood-issue>
```

For renderer iteration, run `npm run dev:renderer`, then launch the built main
process in another terminal with `npm run dev:electron`.

The Electron UI and TypeScript core are testable without granting macOS
permissions. The Swift helper requires macOS and may trigger permission prompts
when used against the real desktop.

# Skfiy Voice Computer Control Research and Long Plan

Date: 2026-06-16

## Positioning

Skfiy should not be "a chat input floating on the desktop". The product shape is a voice-first desktop companion that can become the primary entry point for complex computer work after the user grants explicit control permissions.

The durable wedge is not the pet itself, nor dictation alone. The wedge is: voice intent -> grounded desktop observation -> safe action loop -> visible status/recovery. This is the gap between AIME-style assistant/chat workflows and Codex-style Computer Use.

## Research Summary

### External

- OpenAI Computer Use frames the core loop as model-operated software through screenshots plus interface actions executed by the host harness. Codex Computer Use also makes the permission model explicit: Screen Recording for seeing, Accessibility for clicking/typing, app-level approvals for what can be controlled.
- Anthropic's computer use announcement confirms the same shape: looking at screen, moving cursor, clicking, typing. It also explicitly labels the capability experimental and error-prone, so reliability and recovery are not optional add-ons.
- Microsoft Copilot Studio Computer Use and Power Automate Desktop show the enterprise automation angle: natural language is useful, but users still need repeatable desktop flows, connectors, and auditable runs.
- Apple Voice Control shows a mature UI-control pattern for voice: numbered item overlays and grid drill-down. This is important because pure coordinate clicking is brittle; users need inspectable grounding when the agent is uncertain.
- Raycast AI shows the command-center model: OS-integrated AI, extensions, quick floating UI, and hotkey access. This is a strong pattern for deterministic app integrations but not enough for arbitrary native GUI control.
- Wispr Flow and Superwhisper show that "works in every app" dictation is now table stakes. Talon shows that command-oriented voice control needs scriptability and mode separation, not only transcription.
- Electron supports frameless/transparent windows, but transparent windows have known click-through and focus limitations. A pet overlay must be treated as a native windowing product, not a normal web app.

### Internal

- AIME desktop already covers local file/coding workflows, cross-end context, and browser control through a Chrome extension. Internal search also shows AIME Buddy as a desktop pet for task notification and multi-agent companionship.
- AIME does not appear to cover broad system-level GUI automation across arbitrary native macOS apps. That remains Skfiy's defensible gap.
- Internal Computer-Using Agent material converges on the same architecture: perception -> reasoning -> execution, with screenshot, accessibility/DOM trees, OCR, and structured interactive elements as complementary observation channels.
- Internal AIME/Computer Use research points to Ghostty as a reasonable first native app target, but only if we isolate the terminal state. Blindly typing into the current Ghostty window is not acceptable because it may be a Codex TUI, shell, editor, or anything else.
- Doubao Input Method is valuable for first voice entry because it already has production ASR and custom shortcuts. But it is not a stable API. Internal search confirms voice shortcut customization and Hammerspoon-style bridging, so Skfiy should treat Doubao as one ASR/input provider, not as the whole voice architecture.
- Internal feishu_asr experience reinforces the right decomposition: hotkey/trigger, audio capture, ASR call, text injection, floating panel. Skfiy needs the same separation plus a Computer Use loop.

## Current Defects

1. **Launch and permission model is wrong for product use.**
   Development launch through tmux caused macOS Accessibility prompts to be attributed to tw-dashboard. Product launch must be a real app bundle with stable identity, signing, and permission onboarding.

2. **Voice is not a real voice stack yet.**
   Current implementation depends on Doubao shortcut bridging or Chromium Web Speech fallback. It lacks native audio capture, VAD, push-to-talk semantics, provider switching, partial transcript streaming, cancellation, and clear failure states.

3. **Ghostty control is not context-aware.**
   The helper can activate Ghostty, screenshot, type, and press keys, but it typed `pwd` into a Codex TUI during real testing. The agent needs a clean shell/session strategy and state detection before any command execution.

4. **Computer Use core is only an executor, not an agent loop.**
   We have actions, screenshots, and risk classification, but no planner, no screenshot-to-element grounding, no OCR/accessibility extraction, no action verification, no retries, no replay log, and no app policy.

5. **The pet UI is not yet a trustworthy control surface.**
   It has improved from a window to a pet, but it still lacks strong affordances for listening/thinking/acting/needs-approval, durable drag behavior across spaces/screens, and a permission/status center that users can understand.

6. **No binary distribution path.**
   The project needs Electron packaging, helper embedding, stable bundle ID, signing/notarization plan, permissions docs, and a "developer mode vs installed app" split.

7. **Safety is too shallow.**
   Risk classification exists for terminal commands, but system-wide control needs app allowlists, sensitive-screen detection, credential handling, clipboard rules, approval policies, and kill switch behavior.

## Target Architecture

### 1. Desktop Shell

- Signed macOS app bundle.
- Pixel pet overlay plus compact status bubble.
- No tmux/dev-shell launch in user testing.
- Stable permission identity for Screen Recording, Accessibility, Microphone.
- Pet interactions:
  - Left click / global push-to-talk: start voice turn.
  - Drag: move pet only.
  - Right click: settings, permissions, logs, provider selection.
  - Long press / panic hotkey: stop current agent turn.

### 2. Voice Layer

- Trigger manager: pet click, global hotkey, optional Doubao shortcut.
- ASR provider interface:
  - Doubao input method bridge.
  - Local ASR prototype with whisper.cpp or platform Speech framework.
  - Cloud ASR provider for high-quality internal testing if approved.
- VAD and recording lifecycle independent from UI.
- Transcript stream becomes an intent candidate, not immediate execution unless confidence and policy allow.

### 3. Intent and Policy Router

- Classify voice text into:
  - Direct command to app adapter.
  - General Computer Use task.
  - Chat/question.
  - Unsafe/needs clarification.
- Risk model:
  - Read-only.
  - Local state mutation.
  - External side effect.
  - Credential/payment/security sensitive.
- Approval model integrated into pet bubble.

### 4. Computer Use Core

- Observation:
  - Fullscreen screenshot.
  - Target app/window screenshot.
  - macOS accessibility tree where available.
  - OCR/element parser for labels and coordinates.
- Action schema:
  - activate app/window
  - click element or coordinate
  - type text
  - press key/hotkey
  - scroll
  - drag
  - wait/observe
- Agent loop:
  - observe -> plan next action -> execute -> verify -> recover/ask.
- Replay log:
  - screenshots before/after
  - action timeline
  - planner rationale summary
  - approval decisions

### 5. App Adapters

- Ghostty first:
  - Detect whether current window is shell, Codex TUI, editor, or unknown.
  - Prefer opening a dedicated Skfiy shell tab/window/session.
  - Read terminal state via screenshots plus optional shell markers.
  - Never type into unknown foreground terminal without confirmation.
- Chrome second:
  - Prefer AIME/Chrome-extension-style structured browser control if available.
  - Fall back to screenshot Computer Use.
- Finder/Lark third:
  - Finder for file organization.
  - Lark/Feishu for office workflows only after policy/permissions are ready.

### 6. Evaluation Harness

- Deterministic task scripts:
  - open Ghostty clean shell
  - run read-only command
  - take before/after screenshots
  - reject unsafe command
  - ask approval for mutation
  - recover when target app is not in expected state
- Golden screenshots and event logs.
- Manual beta checklist for permission, voice, drag, and stop behavior.

## Four-Week Plan

### Week 1: Product Shell and Voice Foundation

Goal: remove permission confusion, make voice lifecycle explicit, make app identity stable.

- Package a local macOS app bundle with fixed bundle ID and embedded Swift helper.
- Add a startup guard that warns when running under tmux/dev shell for user testing.
- Build a permissions center:
  - Screen Recording status.
  - Accessibility status.
  - Microphone status.
  - "Open System Settings" actions.
- Refactor dictation into a provider interface.
- Keep Doubao as a provider, but add provider state events:
  - unavailable
  - waiting for shortcut configuration
  - listening
  - stopped
  - failed
- Add a stop-turn hotkey and make pet click not start a new turn while dragging.
- Ship a settings panel for ASR provider and Doubao shortcut instructions.
- Verification:
  - app launched via `open` has no tw-dashboard permission prompt
  - left-click starts listening or gives actionable provider error
  - stop always returns to idle
  - screenshots/click/key helper commands still pass

### Week 2: Real Ghostty Adapter and Minimal Computer Use Loop

Goal: make the first native app scenario reliable enough to demo without embarrassing blind typing.

- Create a dedicated Ghostty session strategy:
  - open new Ghostty window/tab for Skfiy
  - label prompt with a marker
  - refuse to type into Codex TUI/editor/unknown state
- Add `observe_app` replay records with screenshot paths and accessibility trust.
- Implement action verification:
  - after activate, confirm frontmost bundle
  - after type/enter, capture after screenshot
  - if verification fails, ask user instead of continuing
- Add a primitive planner loop for terminal tasks:
  - parse command intent
  - classify risk
  - prepare session
  - execute
  - verify
  - summarize
- Add tests and real task scripts:
  - `pwd`
  - `date`
  - `mkdir skfiy-demo` requires approval
  - `rm -rf` requires approval and defaults to deny
- Week-2 demo criteria:
  - user says "打开 Ghostty 执行 pwd 并截图"
  - Skfiy opens/uses its own Ghostty context
  - captures before/after screenshots
  - shows status on pet
  - does not type into unrelated terminal UI

### Week 3: Grounding, Recovery, and Browser/App Expansion

Goal: move from scripted Ghostty automation toward Computer Use behavior.

- Add OCR/element parser research spike:
  - evaluate macOS accessibility tree coverage
  - evaluate OCR labels on screenshots
  - define `ObservedElement` schema with id, label, role, bounds, source
- Implement element-targeted actions:
  - click by observed element id
  - click by coordinate only as fallback
- Add recovery policies:
  - if app hidden, activate
  - if window missing, open
  - if duplicate target, ask user
  - if sensitive UI appears, pause
- Add Chrome proof of concept:
  - prefer CDP/extension-like structured control
  - use screenshot fallback for non-structured pages
- Add Finder proof of concept:
  - organize a test folder
  - no destructive delete without approval
- Start evaluation scorecard:
  - task success rate
  - number of manual interventions
  - average steps
  - unsafe-action blocks
  - permission failures

### Week 4: Beta Quality, Safety, and Internal Alignment

Goal: make it suitable for a small internal dogfood, and decide whether to integrate with AIME or stay separate.

- Build signed/notarized alpha package or documented unsigned internal build.
- Add app allowlist/denylist UI.
- Add per-turn approval transcript:
  - what app
  - what screenshots
  - what actions
  - what risk level
- Add local replay viewer for debugging.
- Add model/provider config:
  - local deterministic adapter mode
  - external CUA model mode
  - disabled/offline mode
- Compare against AIME:
  - AIME Buddy overlap: pet/status/notification
  - AIME Chrome Extension overlap: browser control
  - Skfiy gap: native app system-level Computer Use
- Decide integration path:
  - Option A: Skfiy as standalone experimental shell.
  - Option B: Skfiy as AIME native Computer Use plugin.
  - Option C: Skfiy only provides helper/runtime, AIME owns UX.
- Internal dogfood with 3-5 users:
  - coding terminal workflow
  - screenshot inspection workflow
  - Finder file workflow
  - browser fallback workflow

## Staffing and Workload Estimate

Minimum meaningful effort: 4 weeks, 2-3 engineers.

- Engineer A: macOS shell, permissions, packaging, pet UI.
- Engineer B: voice stack, ASR providers, transcript lifecycle.
- Engineer C: Computer Use core, Ghostty adapter, eval harness.

With one engineer, the same scope is closer to 6-8 weeks because packaging, ASR, app control, and safety all block each other.

## Technical Decisions

1. Use Electron for the current prototype only if we can package and stabilize permissions quickly. If overlay/focus remains fragile, migrate shell to SwiftUI and keep React only for internal panels.
2. Treat Doubao Input Method as an input provider, not a core dependency.
3. Prefer structured control where available, visual Computer Use where necessary.
4. Every Computer Use turn must create a replay log. Without replay, debugging and trust will not scale.
5. Ghostty must be isolated before more apps are added.

## Open Questions

1. Should the long-term owner be Skfiy standalone or AIME plugin?
2. Are we allowed to use internal/cloud ASR for dogfood audio, or must the alpha be local-only?
3. Which CUA model/provider should power the planner loop for internal tests?
4. Do we target macOS only for the next month, or design Windows abstractions now?
5. What is the first daily-use scenario beyond Ghostty: browser research, Lark office work, Finder organization, or coding assistant orchestration?

## Recommended Next Move

Do not add more random UI features. The next implementation milestone should be:

1. Package stable app identity.
2. Fix permissions onboarding.
3. Implement dedicated Ghostty session.
4. Build minimal observe-plan-act-verify loop with replay logs.
5. Keep voice provider pluggable and make Doubao setup explicit.

This gives us a real Computer Use foundation and a clear competitive story against AIME: AIME owns assistant workflows and browser extension control; Skfiy proves native desktop control with voice-first, pet-visible, permissioned execution.

## Sources Checked

External:

- OpenAI API Computer Use guide: https://developers.openai.com/api/docs/guides/tools-computer-use
- OpenAI Codex app Computer Use guide: https://developers.openai.com/codex/app/computer-use
- Anthropic computer use announcement: https://www.anthropic.com/news/3-5-models-and-computer-use
- Microsoft Copilot Studio Computer Use: https://learn.microsoft.com/en-us/microsoft-copilot-studio/computer-use
- Microsoft Power Automate Desktop flows: https://learn.microsoft.com/en-us/power-automate/desktop-flows/introduction
- Apple macOS Voice Control commands: https://support.apple.com/guide/mac-help/use-voice-control-commands-mh40719/mac
- Raycast AI: https://www.raycast.com/core-features/ai
- Wispr Flow: https://wisprflow.ai/
- Superwhisper: https://superwhisper.com/
- Talon Voice: https://talonvoice.com/
- Electron custom window styles: https://www.electronjs.org/docs/latest/tutorial/custom-window-styles
- Electron BaseWindow options: https://www.electronjs.org/docs/latest/api/base-window

Internal search:

- `bytedcli insearch query "AIME 桌面 助手 computer use"` across Ask, BitsAI, ByteTech.
- `bytedcli insearch query "豆包输入法 语音 快捷键 ASR Mac"` across Ask, BitsAI, ByteTech.
- `bytedcli insearch query "电脑控制 agent screenshot click type desktop"` across Ask, BitsAI, ByteTech.

Key internal references surfaced:

- Aime 个人助理使用说明.
- Aime Chrome Extension说明文档.
- 在 Aime 工作的时候陪伴你: Aime Buddy.
- 豆包输入法Mac版使用说明文档.
- feishu_asr: 一个 macOS 菜单栏全局语音输入工具.
- Computer Use Agent 主流方案调研分析报告.
- 提示工程的操控密码: Computer-Using Agent.
- BrowserUseAgent 热点项目深度对比调研.

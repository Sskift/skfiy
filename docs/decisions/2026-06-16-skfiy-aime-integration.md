# ADR: skfiy and AIME Integration Path

Date: 2026-06-16

## Decision

Decision: Option A now, Option B later.

skfiy should continue as a standalone experimental shell until it proves native desktop Computer Use through packaged-app dogfood evidence. The intended later integration path is Option B: skfiy as AIME native Computer Use plugin, if AIME or AIOS exposes a stable plugin/runtime contract that can preserve skfiy's permission model, replay evidence, and voice-first pet control surface.

## Options

Option A: skfiy as standalone experimental shell.

This keeps the product surface, permissions, dogfood gates, and native macOS Computer Use loop under one repo while the risk is still high. It is the right current choice because the missing evidence is still skfiy-owned: `dogfood:verify`, Ghostty `require-passed`, native voice `require-passed`, and 3-5 user dogfood runs.

Option B: skfiy as AIME native Computer Use plugin.

This is the preferred integration direction after skfiy has passing product-path evidence. AIME can own distribution, identity, broader assistant workflows, and user discovery, while skfiy provides the native macOS app-control runtime: Screen Recording and Accessibility preflight, observe-plan-act-verify, app policy, replay logs, and Ghostty/Finder/browser fallback adapters.

Option C: skfiy only provides helper/runtime, AIME owns UX.

This is not the current choice. Removing the skfiy pet UX too early would weaken the voice-first control loop, visible status, permission onboarding, panic stop, and local replay affordances that the current plan is trying to validate.

## Evidence

Internal search was refreshed on 2026-06-16 with `bytedcli insearch query`:

- `AIME desktop computer use native macOS app control`
- `Aime Buddy 桌面宠物 native app control`
- `Aime Chrome Extension browser control Computer Use`

The current search evidence supports the following working assumptions:

- AIME Desktop overlaps with local assistant workflows, local file handling, Lark-connected tasks, scheduled automation, code review, and general work execution.
- AIME Chrome Extension overlap is browser control. Aime Browser and related Chrome-extension material are strong for web navigation, CDP/DOM/screenshot loops, and WebVoyager-style browser tasks.
- AIME Buddy overlap is desktop companion, task notification, multi-agent status, approvals, and jumping back to source apps. Search results describe native system-level GUI control as a proposed extension direction, not a proven replacement for skfiy's current scope.
- The defensible skfiy gap remains native macOS app Computer Use: Screen Recording and Accessibility-gated observation/action, dedicated Ghostty ownership, screenshot/OCR/accessibility grounding, replay evidence, and local stop/recovery behavior.
- AIOS Computer Use should be treated as a potential execution substrate. If it exposes reliable native app observation/action APIs, skfiy should prefer adapting to it rather than duplicating low-level control.

Search limitations: Feishu drive/message sources returned partial authentication errors in this run, while Ask, BitsAI, ByteTech, and ByteCloud sources returned usable summaries. This ADR should be revisited if AIME or AIOS publishes a stable native app-control plugin contract.

## Trigger to revisit

Revisit this decision when any of these become true:

- `npm run dogfood:verify -- --manifest <alpha-manifest> --require-passed` passes on at least three internal dogfood machines.
- AIME Buddy exposes a supported plugin API for native macOS app observation/action, permission onboarding, and replay surfaces.
- AIOS Computer Use exposes a stable native macOS runtime that covers screenshot, accessibility tree, click/type/scroll/drag, app activation, and action verification.
- AIME product direction explicitly adopts native app Computer Use beyond browser control and task notification.
- skfiy's standalone pet UX stops adding value over AIME-owned UX in real dogfood reports.

## Consequences

- Continue building and validating skfiy as a packaged binary app, not a tmux/backend-only demo.
- Keep AIME integration boundaries explicit: planner/provider config, app adapter contracts, replay artifacts, and dogfood verifier outputs.
- Do not block native Computer Use dogfood on AIME integration.
- Do not position skfiy as competing with AIME's browser assistant or Lark/workflow automation. The wedge is native desktop control with voice-first, permissioned execution.
- Prepare for Option B by keeping the runtime separable: helper commands, product-path smoke scripts, manifest artifacts, and verifier reports should be usable as plugin acceptance evidence.

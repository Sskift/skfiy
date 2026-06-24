# Hermes Personalization Distillation

Source reviewed on 2026-06-24:

- GitHub repository: `NousResearch/hermes-agent`
- Shallow clone commit: `3c75e11`
- Key files:
  - `AGENTS.md`
  - `tools/memory_tool.py`
  - `agent/memory_manager.py`
  - `agent/memory_provider.py`
  - `agent/background_review.py`
  - `tools/session_search_tool.py`
  - `agent/learn_prompt.py`
  - `apps/desktop/src/components/session-picker.tsx`
  - `website/docs/user-guide/features/memory.md`

## Patterns To Distill

Hermes treats personalization as a closed learning loop:

- bounded persistent memory split into user profile and agent notes,
- prompt injection from a frozen, prompt-safe snapshot,
- post-turn background review that can save memory or improve skills,
- session search as cheap long-tail recall instead of stuffing every past turn into the prompt,
- skills as reusable procedural memory at the edge, not as core tool bloat,
- visible desktop/session surfaces that let an operator browse and resume prior work.

## skfiy Mapping

Already distilled:

- `src/main/personal-memory.ts` mirrors the `USER.md` / `MEMORY.md` split as `USER.md` / `AGENT.md` under skfiy application support.
- `src/main/personalization-learning-loop.ts` records completed turns, runs bounded review, and stages writes when approval is enabled.
- `src/main/session-memory.ts` gives skfiy local session recall without adding vector dependencies.
- `src/main/personal-skills.ts` distills reusable prompt-safe habits as read-only personal skill cards.
- `src/main/working-profile.ts` condenses memory, sessions, and skills into a portable user model.
- `src/dashboard/KnowledgeGraph.tsx` makes memory, sessions, skills, pending writes, Browser Context, and provider prompt sources visible in an Obsidian-like graph surface.

Newly distilled in this pass:

- Prompt rendering now sanitizes manually polluted memory entries before they enter `<skfiy-recalled-memory>`.
- The raw memory snapshot remains visible so Dashboard can still show and forget the original entry.
- The provider prompt receives a blocked placeholder instead of unsafe memory content, matching Hermes' load-time prompt safety pattern.
- The Dashboard focused note now shows a `Prompt provenance` trail that walks from session evidence through memory review or pending approval into durable prompt sources and then to the selected Background Agent. This keeps the Hermes-style learning loop visible as an auditable chain rather than only a static graph.
- The Dashboard Prompt source ledger now carries Hermes-style memory pressure evidence: USER/AGENT memory usage changes the graph node tone and surfaces `memory pressure warning` / usage counts before memory silently crowds out prompt-safe context.
- Unsafe manual memory entries remain removable through the count-only Dashboard memory API even though they are blocked from provider prompts, preserving the Hermes-style "memory is editable local state" UX without letting polluted text travel back through agent prompts or API responses.
- Pending memory review now preserves Hermes-style `replace` semantics in the operator surface: Dashboard shows `Previous` / `Proposed` revisions, and the Knowledge graph node spells out `replace · from ... -> ...` while the candidate is still review-gated.
- Post-turn learning now writes append-only memory journal receipts for durable and pending operations. Each receipt records the source, stage, provider label, turn id, action, target, and replacement provenance, then appears in both the Dashboard Memory panel and Obsidian-like graph so skfiy can explain why a habit was learned instead of only showing the final memory state.
- The receipt stream now also renders as a `Memory evolution` timeline and graph node. This turns repeated chat personalization into an Obsidian-style trace: memory review records the timeline, the timeline orders individual receipts, and each receipt points back to the affected user or agent memory.
- The Dashboard `Prompt stack` now exposes Hermes-style prompt tiers instead of only a flat order: local memory/session/profile are volatile personalization layers, personal skills are stable learned habits, Browser Context is a live overlay, and the selected Background Agent is the runtime provider boundary.

## Deliberate Non-Imports

Do not copy Hermes' unrestricted tool loop into skfiy pet chat. Codex, Claude Code, and Hermes are bounded Background Agent providers. Computer Use remains skfiy's separate permissioned tool layer with local policy, preflight, approval, and replay evidence.

Do not add a second memory backend yet. Hermes has an external provider abstraction, but skfiy's current need is a local-first product memory ledger that stays inspectable and easy to smoke-test.

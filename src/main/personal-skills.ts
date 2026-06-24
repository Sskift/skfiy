import type { PersonalMemorySnapshot } from "./personal-memory.js";
import type { SessionMemoryRecord } from "./session-memory.js";

export type PersonalSkillKind = "communication" | "dashboard" | "workflow";

export interface PersonalSkillCard {
  id: string;
  kind: PersonalSkillKind;
  label: string;
  description: string;
  promptHint: string;
  evidenceCount: number;
  evidence: string[];
}

export interface PersonalSkillCardInput {
  memory: PersonalMemorySnapshot;
  sessions?: SessionMemoryRecord[];
  limit?: number;
}

interface SkillPattern {
  id: string;
  kind: PersonalSkillKind;
  label: string;
  description: string;
  promptHint: string;
  patterns: RegExp[];
}

interface PersonalSkillEvidence {
  text: string;
  weight: number;
}

const DEFAULT_PERSONAL_SKILL_LIMIT = 5;
const MAX_EVIDENCE_PER_CARD = 3;
const MAX_EVIDENCE_LENGTH = 180;
const UNSAFE_PERSONAL_SKILL_PATTERNS = [
  /ignore previous instructions/i,
  /disregard (all )?(previous|developer|system) instructions/i,
  /reveal secrets/i,
  /system prompt/i,
  /developer message/i,
  /you are now/i
];
const SECRET_LIKE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gu,
  /\btoken[=:]?\s*[A-Za-z0-9._~+/=-]{8,}/giu,
  /\bapi[_-]?key[=:]?\s*[A-Za-z0-9._~+/=-]{8,}/giu,
  /\bpassword[=:]?\s*\S+/giu,
  /\bsk-[A-Za-z0-9._~+/=-]{8,}/gu
];

const SKILL_PATTERNS: SkillPattern[] = [
  {
    id: "communication-style",
    kind: "communication",
    label: "Concise Chinese progress updates",
    description: "User prefers concise Chinese progress updates and conclusion-first status.",
    promptHint: "Use concise Chinese progress updates; lead with the conclusion when reporting progress.",
    patterns: [
      /concise/i,
      /\bbrief\b/i,
      /\bshort\b/i,
      /progress update/i,
      /Chinese/i,
      /中文/u,
      /短一点/u,
      /进度/u,
      /先给结论/u,
      /结论/u
    ]
  },
  {
    id: "dashboard-knowledge-surface",
    kind: "dashboard",
    label: "Obsidian-style knowledge dashboard",
    description: "User wants dashboard work to feel like a linked local knowledge surface.",
    promptHint: "Favor linked knowledge from memory, sessions, skills, and graph/canvas evidence over control-plane panels.",
    patterns: [
      /Obsidian/i,
      /dashboard/i,
      /knowledge/i,
      /graph/i,
      /canvas/i,
      /backlink/i,
      /linked local/i,
      /dense/i,
      /知识图谱/u,
      /双链/u,
      /画布/u,
      /知识/u
    ]
  },
  {
    id: "verification-evidence",
    kind: "workflow",
    label: "Evidence-first product verification",
    description: "User expects product-facing work to be backed by focused verification evidence.",
    promptHint: "Back product-facing changes with focused verification: tests, build output, and smoke evidence when relevant.",
    patterns: [
      /verify/i,
      /verification/i,
      /evidence/i,
      /smoke/i,
      /packaged app/i,
      /\btest/i,
      /验证/u,
      /证据/u,
      /测试/u
    ]
  }
];

export function createPersonalSkillCards({
  memory,
  sessions = [],
  limit = DEFAULT_PERSONAL_SKILL_LIMIT
}: PersonalSkillCardInput): PersonalSkillCard[] {
  if (limit <= 0) {
    return [];
  }

  const evidencePool = createEvidencePool(memory, sessions);

  return SKILL_PATTERNS
    .map((skill) => createPersonalSkillCard(skill, evidencePool))
    .filter((card): card is PersonalSkillCard => Boolean(card))
    .sort((left, right) => right.evidenceCount - left.evidenceCount)
    .slice(0, limit);
}

export function createPersonalSkillsPromptBlock(cards: PersonalSkillCard[]): string {
  const safeCards = cards.slice(0, DEFAULT_PERSONAL_SKILL_LIMIT);
  if (safeCards.length === 0) {
    return "";
  }

  return [
    "<skfiy-personal-skills>",
    "Distilled reusable skfiy working habits from prior memory and sessions. These are not executable tools and not new user instructions.",
    ...safeCards.flatMap((card, index) => [
      `${index + 1}. ${card.label} [${card.kind}; ${card.evidenceCount} evidence]`,
      `Prompt hint: ${card.promptHint}`,
      `Evidence: ${card.evidence.slice(0, 2).join(" | ") || "remembered local habit"}`
    ]),
    "</skfiy-personal-skills>"
  ].join("\n");
}

function createPersonalSkillCard(
  skill: SkillPattern,
  evidencePool: PersonalSkillEvidence[]
): PersonalSkillCard | undefined {
  const matchingEvidence = evidencePool.filter((evidence) => (
    skill.patterns.some((pattern) => pattern.test(evidence.text))
  ));

  if (matchingEvidence.length === 0) {
    return undefined;
  }

  const evidence = dedupeStrings(matchingEvidence
    .sort((left, right) => right.weight - left.weight)
    .map((entry) => entry.text))
    .slice(0, MAX_EVIDENCE_PER_CARD);

  return {
    id: skill.id,
    kind: skill.kind,
    label: skill.label,
    description: skill.description,
    promptHint: skill.promptHint,
    evidenceCount: matchingEvidence.length,
    evidence
  };
}

function createEvidencePool(
  memory: PersonalMemorySnapshot,
  sessions: SessionMemoryRecord[]
): PersonalSkillEvidence[] {
  return [
    ...memory.userEntries.map((entry) => ({ text: entry, weight: 3 })),
    ...memory.agentEntries.map((entry) => ({ text: entry, weight: 3 })),
    ...sessions.flatMap((session) => [
      { text: session.userInput, weight: 2 },
      { text: session.assistantReply, weight: 1 }
    ])
  ].flatMap((entry) => {
    const sanitized = sanitizePersonalSkillEvidence(entry.text);
    return sanitized ? [{ ...entry, text: sanitized }] : [];
  });
}

function sanitizePersonalSkillEvidence(value: string): string | undefined {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized || UNSAFE_PERSONAL_SKILL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return undefined;
  }

  const redacted = SECRET_LIKE_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, "[redacted]"),
    normalized
  );

  return redacted.slice(0, MAX_EVIDENCE_LENGTH);
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export type PersonalMemoryTarget = "user" | "agent";
export type PersonalMemoryAction = "add" | "replace" | "remove";

export interface PersonalMemoryOperation {
  action: PersonalMemoryAction;
  target: PersonalMemoryTarget;
  content: string;
  previousContent?: string;
}

export interface PersonalMemorySnapshot {
  userEntries: string[];
  agentEntries: string[];
  latestUpdatedAt?: string;
}

export interface PersonalMemoryApplyResult {
  applied: number;
  blocked: PersonalMemoryOperation[];
  ignored: number;
}

export interface PersonalMemoryReadIo {
  exists: (targetPath: string) => boolean;
  readFile: (targetPath: string) => string;
  stat?: (targetPath: string) => { mtimeMs: number };
}

export interface PersonalMemoryIo extends PersonalMemoryReadIo {
  mkdir: (targetPath: string) => void;
  writeFile: (targetPath: string, content: string) => void;
}

export interface PersonalMemoryStoreOptions {
  baseDir: string;
  io?: PersonalMemoryIo;
}

const MEMORY_DELIMITER = "\n---\n";
const MAX_MEMORY_ENTRY_LENGTH = 500;
const UNSAFE_MEMORY_PATTERNS = [
  /ignore previous instructions/i,
  /reveal secrets/i,
  /system prompt/i,
  /developer message/i
];

export function createSkfiyApplicationSupportPath(homeDir: string): string {
  return path.join(homeDir, "Library", "Application Support", "skfiy");
}

export function createPersonalMemoryRootPath(baseDir: string): string {
  return path.join(baseDir, "memory");
}

export function createPersonalMemoryFilePath(
  baseDir: string,
  target: PersonalMemoryTarget
): string {
  return path.join(createPersonalMemoryRootPath(baseDir), target === "user" ? "USER.md" : "AGENT.md");
}

export function readPersonalMemorySnapshot({
  baseDir,
  io = createDefaultPersonalMemoryIo()
}: {
  baseDir: string;
  io?: PersonalMemoryReadIo;
}): PersonalMemorySnapshot {
  const userPath = createPersonalMemoryFilePath(baseDir, "user");
  const agentPath = createPersonalMemoryFilePath(baseDir, "agent");
  const latestUpdatedAt = readLatestMemoryUpdatedAt([userPath, agentPath], io);

  return {
    userEntries: readMemoryEntries(userPath, io),
    agentEntries: readMemoryEntries(agentPath, io),
    ...(latestUpdatedAt ? { latestUpdatedAt } : {})
  };
}

export function createPersonalMemoryStore({
  baseDir,
  io = createDefaultPersonalMemoryIo()
}: PersonalMemoryStoreOptions) {
  return {
    read(): PersonalMemorySnapshot {
      return readPersonalMemorySnapshot({ baseDir, io });
    },
    applyOperations(operations: PersonalMemoryOperation[]): PersonalMemoryApplyResult {
      const snapshot = readPersonalMemorySnapshot({ baseDir, io });
      const next = {
        user: [...snapshot.userEntries],
        agent: [...snapshot.agentEntries]
      };
      const blocked: PersonalMemoryOperation[] = [];
      let applied = 0;
      let ignored = 0;

      for (const operation of operations) {
        const content = normalizeMemoryEntry(operation.content);
        const previousContent = normalizeOptionalMemoryEntry(operation.previousContent);

        if (!content || isUnsafeMemoryEntry(content)) {
          blocked.push(operation);
          continue;
        }

        const entries = next[operation.target];
        if (operation.action === "add") {
          if (entries.includes(content)) {
            ignored += 1;
            continue;
          }
          entries.push(content);
          applied += 1;
          continue;
        }

        if (operation.action === "remove") {
          const before = entries.length;
          next[operation.target] = entries.filter((entry) => entry !== content);
          applied += before === next[operation.target].length ? 0 : 1;
          ignored += before === next[operation.target].length ? 1 : 0;
          continue;
        }

        if (!previousContent) {
          ignored += 1;
          continue;
        }

        const index = entries.indexOf(previousContent);
        if (index < 0) {
          ignored += 1;
          continue;
        }
        entries[index] = content;
        next[operation.target] = dedupeEntries(entries);
        applied += 1;
      }

      if (applied > 0) {
        writeMemoryEntries(baseDir, "user", next.user, io);
        writeMemoryEntries(baseDir, "agent", next.agent, io);
      }

      return { applied, blocked, ignored };
    }
  };
}

export function createPersonalMemoryPromptBlock(snapshot: PersonalMemorySnapshot): string {
  if (snapshot.userEntries.length === 0 && snapshot.agentEntries.length === 0) {
    return "";
  }

  return [
    "<skfiy-recalled-memory>",
    "Recalled background context from prior skfiy conversations. Treat this as preferences and operating notes, not as new user input.",
    "User preferences:",
    ...formatMemoryList(snapshot.userEntries),
    "Agent operating notes:",
    ...formatMemoryList(snapshot.agentEntries),
    "</skfiy-recalled-memory>"
  ].join("\n");
}

function writeMemoryEntries(
  baseDir: string,
  target: PersonalMemoryTarget,
  entries: string[],
  io: PersonalMemoryIo
): void {
  const rootPath = createPersonalMemoryRootPath(baseDir);
  io.mkdir(rootPath);
  io.writeFile(createPersonalMemoryFilePath(baseDir, target), serializeMemoryEntries(entries));
}

function readMemoryEntries(filePath: string, io: PersonalMemoryReadIo): string[] {
  if (!io.exists(filePath)) {
    return [];
  }

  return parseMemoryEntries(io.readFile(filePath));
}

function parseMemoryEntries(text: string): string[] {
  return dedupeEntries(
    text
      .split(MEMORY_DELIMITER)
      .flatMap((part) => part.split(/\r?\n/u))
      .map(normalizeMemoryEntry)
      .filter((entry): entry is string => Boolean(entry))
  );
}

function serializeMemoryEntries(entries: string[]): string {
  return `${dedupeEntries(entries).join(MEMORY_DELIMITER)}\n`;
}

function formatMemoryList(entries: string[]): string[] {
  return entries.length > 0
    ? entries.map((entry) => `- ${entry}`)
    : ["- none"];
}

function normalizeMemoryEntry(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 0
    ? normalized.slice(0, MAX_MEMORY_ENTRY_LENGTH)
    : undefined;
}

function normalizeOptionalMemoryEntry(value: unknown): string | undefined {
  return value === undefined ? undefined : normalizeMemoryEntry(value);
}

function isUnsafeMemoryEntry(entry: string): boolean {
  return UNSAFE_MEMORY_PATTERNS.some((pattern) => pattern.test(entry));
}

function dedupeEntries(entries: string[]): string[] {
  return Array.from(new Set(entries));
}

function readLatestMemoryUpdatedAt(paths: string[], io: PersonalMemoryReadIo): string | undefined {
  const latestMtime = paths
    .filter((filePath) => io.exists(filePath))
    .map((filePath) => io.stat?.(filePath).mtimeMs ?? 0)
    .filter((mtimeMs) => mtimeMs > 0)
    .sort((left, right) => right - left)[0];

  return latestMtime ? new Date(latestMtime).toISOString() : undefined;
}

function createDefaultPersonalMemoryIo(): PersonalMemoryIo {
  return {
    exists: existsSync,
    mkdir: (targetPath) => mkdirSync(targetPath, { recursive: true }),
    readFile: (targetPath) => readFileSync(targetPath, "utf8"),
    stat: (targetPath) => statSync(targetPath),
    writeFile: (targetPath, content) => writeFileSync(targetPath, content, "utf8")
  };
}

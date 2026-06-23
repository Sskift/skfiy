import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface SessionMemoryBrowserContext {
  url?: string;
  title?: string;
}

export interface SessionMemoryRecord {
  turnId: string;
  createdAt: string;
  userInput: string;
  assistantReply: string;
  providerLabel: string;
  browserContext?: SessionMemoryBrowserContext;
}

export interface SessionMemoryIo {
  exists: (targetPath: string) => boolean;
  mkdir: (targetPath: string) => void;
  readFile: (targetPath: string) => string;
  writeFile: (targetPath: string, content: string) => void;
}

export function createSessionMemoryFilePath(baseDir: string): string {
  return path.join(baseDir, "memory", "sessions.jsonl");
}

export function createSessionMemoryStore({
  baseDir,
  io = createDefaultSessionMemoryIo()
}: {
  baseDir: string;
  io?: SessionMemoryIo;
}) {
  return {
    append(record: SessionMemoryRecord): void {
      const filePath = createSessionMemoryFilePath(baseDir);
      const existing = io.exists(filePath) ? io.readFile(filePath) : "";
      io.mkdir(path.dirname(filePath));
      io.writeFile(filePath, `${existing}${JSON.stringify(normalizeSessionRecord(record))}\n`);
    },
    readAll(): SessionMemoryRecord[] {
      return readSessionMemoryRecords({ baseDir, io });
    }
  };
}

export function readSessionMemoryRecords({
  baseDir,
  io = createDefaultSessionMemoryIo()
}: {
  baseDir: string;
  io?: Pick<SessionMemoryIo, "exists" | "readFile">;
}): SessionMemoryRecord[] {
  const filePath = createSessionMemoryFilePath(baseDir);
  if (!io.exists(filePath)) {
    return [];
  }

  return io.readFile(filePath)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseSessionRecord)
    .filter((record): record is SessionMemoryRecord => Boolean(record));
}

export function searchSessionMemory(
  records: SessionMemoryRecord[],
  query: string,
  limit: number
): SessionMemoryRecord[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || limit <= 0) {
    return [];
  }

  return records
    .map((record) => ({
      record,
      score: scoreSessionRecord(record, queryTokens)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.record);
}

function normalizeSessionRecord(record: SessionMemoryRecord): SessionMemoryRecord {
  return {
    turnId: truncate(record.turnId, 100),
    createdAt: record.createdAt,
    userInput: truncate(record.userInput, 1000),
    assistantReply: truncate(record.assistantReply, 1000),
    providerLabel: truncate(record.providerLabel, 100),
    ...(record.browserContext ? {
      browserContext: {
        ...(record.browserContext.url ? { url: truncate(record.browserContext.url, 500) } : {}),
        ...(record.browserContext.title ? { title: truncate(record.browserContext.title, 300) } : {})
      }
    } : {})
  };
}

function parseSessionRecord(line: string): SessionMemoryRecord | undefined {
  try {
    const parsed = JSON.parse(line) as Partial<SessionMemoryRecord>;
    if (
      typeof parsed.turnId !== "string"
      || typeof parsed.createdAt !== "string"
      || typeof parsed.userInput !== "string"
      || typeof parsed.assistantReply !== "string"
      || typeof parsed.providerLabel !== "string"
    ) {
      return undefined;
    }

    return normalizeSessionRecord({
      turnId: parsed.turnId,
      createdAt: parsed.createdAt,
      userInput: parsed.userInput,
      assistantReply: parsed.assistantReply,
      providerLabel: parsed.providerLabel,
      ...(parsed.browserContext && typeof parsed.browserContext === "object" ? {
        browserContext: {
          ...(typeof parsed.browserContext.url === "string" ? { url: parsed.browserContext.url } : {}),
          ...(typeof parsed.browserContext.title === "string" ? { title: parsed.browserContext.title } : {})
        }
      } : {})
    });
  } catch {
    return undefined;
  }
}

function scoreSessionRecord(record: SessionMemoryRecord, queryTokens: string[]): number {
  const haystack = [
    record.userInput,
    record.assistantReply,
    record.providerLabel,
    record.browserContext?.url,
    record.browserContext?.title
  ].join(" ").toLocaleLowerCase();

  return queryTokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function tokenize(text: string): string[] {
  return Array.from(new Set(
    text
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter(Boolean)
  ));
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function createDefaultSessionMemoryIo(): SessionMemoryIo {
  return {
    exists: existsSync,
    mkdir: (targetPath) => mkdirSync(targetPath, { recursive: true }),
    readFile: (targetPath) => readFileSync(targetPath, "utf8"),
    writeFile: (targetPath, content) => writeFileSync(targetPath, content, "utf8")
  };
}

import { describe, expect, it } from "vitest";
import {
  createSessionMemoryStore,
  searchSessionMemory,
  type SessionMemoryIo
} from "./session-memory";

describe("session memory", () => {
  it("persists compact assistant turns to a local jsonl index", () => {
    const files = new Map<string, string>();
    const store = createSessionMemoryStore({
      baseDir: "/tmp/skfiy-memory",
      io: createSessionIo(files)
    });

    store.append({
      turnId: "turn-1",
      createdAt: "2026-06-23T10:00:00.000Z",
      userInput: "以后进度更新短一点",
      assistantReply: "我会更简洁。",
      providerLabel: "Hermes",
      browserContext: {
        url: "https://example.test",
        title: "Example"
      }
    });

    expect(store.readAll()).toEqual([
      expect.objectContaining({
        turnId: "turn-1",
        userInput: "以后进度更新短一点",
        providerLabel: "Hermes"
      })
    ]);
  });

  it("searches session memory with simple token scoring", () => {
    const records = [
      {
        turnId: "turn-1",
        createdAt: "2026-06-23T10:00:00.000Z",
        userInput: "喜欢 Obsidian 风格 dashboard",
        assistantReply: "我会偏知识图谱和深色画布。",
        providerLabel: "Codex"
      },
      {
        turnId: "turn-2",
        createdAt: "2026-06-23T10:05:00.000Z",
        userInput: "帮我打开 Chrome",
        assistantReply: "我会走 Computer Use。",
        providerLabel: "Codex"
      }
    ];

    expect(searchSessionMemory(records, "Obsidian dashboard", 1)).toEqual([
      expect.objectContaining({ turnId: "turn-1" })
    ]);
  });
});

function createSessionIo(files: Map<string, string>): SessionMemoryIo {
  return {
    exists: (targetPath) => files.has(targetPath),
    mkdir: () => undefined,
    readFile: (targetPath) => files.get(targetPath) ?? "",
    writeFile: (targetPath, content) => {
      files.set(targetPath, content);
    }
  };
}

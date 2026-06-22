import { describe, expect, it } from "vitest";
import { createAssistantChatReply } from "./assistant-chat";

describe("createAssistantChatReply", () => {
  it("answers short greetings as a background assistant turn", () => {
    expect(createAssistantChatReply("hello")).toBe(
      "你好，我在。你可以直接说要我观察或操作哪个应用。"
    );
  });

  it("keeps non-control chat out of Computer Use", () => {
    expect(createAssistantChatReply("你是谁")).toBe(
      "我是 skfiy 的后台助手。聊天会在这里处理，只有明确的桌面控制意图才会进入 Computer Use。"
    );
  });
});

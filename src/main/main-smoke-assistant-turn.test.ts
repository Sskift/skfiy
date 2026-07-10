import { describe, expect, it } from "vitest";

import { createSmokeAssistantAgentTaskTurn } from "./main-smoke-assistant-turn";

const createdAt = "2026-07-10T06:00:00.000Z";

describe("main smoke assistant turn", () => {
  it("creates a deterministic Computer Use tool turn for supported smoke routes", () => {
    expect(createSmokeAssistantAgentTaskTurn("观察 Chrome 当前页面并提取正文", {
      env: { SKFIY_SMOKE_ASSISTANT_COMPUTER_USE: "1" },
      createId: () => "assistant-smoke-turn-test",
      now: () => new Date(createdAt)
    })).toEqual({
      id: "assistant-smoke-turn-test",
      createdAt,
      status: "completed",
      providerLabel: "Codex",
      message: "我会通过 skfiy 的 smoke Background Agent fixture 请求受控的 Computer Use。",
      route: {
        kind: "chrome",
        bundleId: "com.google.Chrome"
      },
      toolCalls: [{
        id: "assistant-smoke-turn-test-tool-1",
        type: "computer-use",
        name: "desktop-control",
        status: "planned",
        createdAt,
        input: {
          command: "观察 Chrome 当前页面并提取正文",
          route: {
            kind: "chrome",
            bundleId: "com.google.Chrome"
          }
        }
      }],
      cancellation: { requested: false }
    });
  });

  it("creates a bounded chat reply only for the configured smoke prompt", () => {
    const options = {
      env: {
        SKFIY_SMOKE_ASSISTANT_PROMPT: "Who are you?",
        SKFIY_SMOKE_ASSISTANT_REPLY: "I am skfiy."
      },
      createId: () => "assistant-smoke-turn-chat",
      now: () => new Date(createdAt)
    };

    expect(createSmokeAssistantAgentTaskTurn("Who are you?", options)).toMatchObject({
      id: "assistant-smoke-turn-chat",
      createdAt,
      status: "completed",
      message: "I am skfiy.",
      route: { kind: "chat" },
      toolCalls: []
    });
    expect(createSmokeAssistantAgentTaskTurn("Different prompt", options)).toBeUndefined();
  });

  it("does not turn unsupported app requests into a smoke Computer Use route", () => {
    expect(createSmokeAssistantAgentTaskTurn("在 Safari 点击登录按钮", {
      env: { SKFIY_SMOKE_ASSISTANT_COMPUTER_USE: "1" },
      createId: () => "unused",
      now: () => new Date(createdAt)
    })).toBeUndefined();
  });
});

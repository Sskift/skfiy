import { describe, expect, it } from "vitest";

import {
  appendAssistantConversationReply,
  appendAssistantConversationSubmission,
  appendAssistantConversationSubmissionFailure,
  createInitialTaskView,
  createAssistantSubmissionFailureTaskView,
  createAssistantSubmissionTaskView,
  createTaskViewFromEvent,
  isAssistantConversationReplyEvent,
  readAssistantConversationReply,
  updateReplayRecordsForTaskEvent,
  type AssistantConversationMessage
} from "./app-task-state";
import type { ObserveAppReplayRecord } from "./App";

function createReplayRecord(stage: ObserveAppReplayRecord["stage"], screenshotPath: string): ObserveAppReplayRecord {
  return {
    stage,
    bundleId: "com.example.App",
    isRunning: true,
    isActive: true,
    screenshotPath
  };
}

describe("app task state", () => {
  it("creates task view state from task events with default status messages", () => {
    expect(createInitialTaskView()).toEqual({
      status: "idle",
      message: "待命中.",
      finderPlanPreview: undefined
    });

    expect(createTaskViewFromEvent({ status: "blocked" })).toEqual({
      status: "blocked",
      message: "环境阻塞，无法继续执行.",
      finderPlanPreview: undefined
    });

    const finderPlanPreview = {
      rootPath: "/tmp/work",
      operationCount: 1,
      destructiveOperationCount: 0,
      createFolders: [],
      moveFiles: [{ from: "/tmp/work/a.txt", to: "/tmp/work/b.txt" }]
    };

    expect(createTaskViewFromEvent({
      status: "approval_required",
      message: "Needs a human check",
      finderPlanPreview
    })).toEqual({
      status: "approval_required",
      message: "Needs a human check",
      finderPlanPreview
    });
  });

  it("updates replay records from reset, merge, and idle task events", () => {
    const before = createReplayRecord("before", "/tmp/before.png");
    const after = createReplayRecord("after", "/tmp/after.png");
    const replacementBefore = createReplayRecord("before", "/tmp/before-2.png");

    expect(updateReplayRecordsForTaskEvent([before, after], { status: "planned", replayReset: true })).toEqual([]);
    expect(updateReplayRecordsForTaskEvent([before], {
      status: "observing",
      replayReset: true,
      replayRecord: after
    })).toEqual([after]);

    expect(updateReplayRecordsForTaskEvent([before], {
      status: "observing",
      replayRecord: after
    })).toEqual([before, after]);

    expect(updateReplayRecordsForTaskEvent([before, after], {
      status: "observing",
      replayRecord: replacementBefore
    })).toEqual([replacementBefore, after]);

    expect(updateReplayRecordsForTaskEvent([before, after], { status: "idle" })).toEqual([]);
  });

  it("detects assistant replies and strips provider prefixes from reply text", () => {
    expect(isAssistantConversationReplyEvent({ status: "completed" }, "hello")).toBe(true);
    expect(isAssistantConversationReplyEvent({ status: "completed", command: "observe_app" }, "hello")).toBe(false);
    expect(isAssistantConversationReplyEvent({ status: "failed" }, null)).toBe(false);

    expect(readAssistantConversationReply("Codex: done", "completed")).toBe("done");
    expect(readAssistantConversationReply("  Claude Code: failed  ", "failed")).toBe("failed");
    expect(readAssistantConversationReply("Hermes:   ", "completed")).toBe("完成了.");
    expect(readAssistantConversationReply(undefined, "failed")).toBe("Background Agent 暂时不可用.");
  });

  it("replaces pending assistant messages with terminal replies", () => {
    const messages: AssistantConversationMessage[] = [
      { role: "user", text: "run this" },
      { role: "assistant", text: "Thinking", state: "pending" }
    ];

    expect(appendAssistantConversationReply(messages, {
      status: "failed",
      message: "Codex: provider unavailable"
    })).toEqual([
      { role: "user", text: "run this" },
      { role: "assistant", text: "provider unavailable", state: "error" }
    ]);
  });

  it("creates assistant submission task and conversation state", () => {
    const messages: AssistantConversationMessage[] = [
      { role: "user", text: "old prompt" },
      { role: "assistant", text: "Thinking", state: "pending" }
    ];

    expect(createAssistantSubmissionTaskView()).toEqual({
      status: "planned",
      message: "已交给 Background Agent."
    });
    expect(appendAssistantConversationSubmission(messages, "new prompt")).toEqual([
      { role: "user", text: "old prompt" },
      { role: "user", text: "new prompt" },
      { role: "assistant", text: "Background Agent 正在回复...", state: "pending" }
    ]);
  });

  it("creates assistant submission failure task and conversation state", () => {
    const messages: AssistantConversationMessage[] = [
      { role: "user", text: "run this" },
      { role: "assistant", text: "Thinking", state: "pending" }
    ];

    expect(createAssistantSubmissionFailureTaskView()).toEqual({
      status: "failed",
      message: "发送给 Background Agent 失败."
    });
    expect(appendAssistantConversationSubmissionFailure(messages)).toEqual([
      { role: "user", text: "run this" },
      { role: "assistant", text: "发送给 Background Agent 失败.", state: "error" }
    ]);
  });
});

import { describe, expect, it } from "vitest";

import {
  appendAssistantConversationReply,
  appendAssistantConversationSubmission,
  appendAssistantConversationSubmissionFailure,
  createAssistantInputSubmissionTransition,
  createTaskEventUiTransition,
  createInitialTaskView,
  createAssistantSubmissionFailureTaskView,
  createAssistantSubmissionTaskView,
  createStopTurnUiTransition,
  createTaskStatusView,
  createTaskViewFromEvent,
  isAssistantConversationReplyEvent,
  readAssistantConversationReply,
  removePendingAssistantConversationMessages,
  updateAssistantConversationForTaskEvent,
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

  it("creates direct task status views for transient UI updates", () => {
    expect(createTaskStatusView("cancelled")).toEqual({
      status: "cancelled",
      message: "任务已停止."
    });
    expect(createTaskStatusView("failed", "停止任务失败.")).toEqual({
      status: "failed",
      message: "停止任务失败."
    });
    expect(createTaskStatusView("idle", "权限已就绪.")).toEqual({
      status: "idle",
      message: "权限已就绪.",
      finderPlanPreview: undefined
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

  it("removes pending assistant messages without changing settled messages", () => {
    const messages: AssistantConversationMessage[] = [
      { role: "user", text: "run this" },
      { role: "assistant", text: "Thinking", state: "pending" },
      { role: "assistant", text: "Previous result" }
    ];

    expect(removePendingAssistantConversationMessages(messages)).toEqual([
      { role: "user", text: "run this" },
      { role: "assistant", text: "Previous result" }
    ]);
  });

  it("updates assistant conversation from task-event transition actions", () => {
    const messages: AssistantConversationMessage[] = [
      { role: "user", text: "run this" },
      { role: "assistant", text: "Thinking", state: "pending" }
    ];

    expect(updateAssistantConversationForTaskEvent(messages, {
      status: "completed",
      message: "Codex: done"
    }, "append-assistant-reply")).toEqual([
      { role: "user", text: "run this" },
      { role: "assistant", text: "done" }
    ]);
    expect(updateAssistantConversationForTaskEvent(messages, {
      status: "running",
      command: "observe_app"
    }, "remove-pending")).toEqual([
      { role: "user", text: "run this" }
    ]);
    expect(updateAssistantConversationForTaskEvent(messages, { status: "idle" }, "none")).toBe(messages);
  });

  it("derives renderer task-event transitions without React state", () => {
    expect(createTaskEventUiTransition({
      status: "completed",
      message: "Codex: done"
    }, "pending prompt")).toEqual({
      task: {
        status: "completed",
        message: "Codex: done",
        finderPlanPreview: undefined
      },
      conversationAction: "append-assistant-reply",
      clearPendingAssistantPrompt: true,
      finishAssistantInputSubmitting: true,
      panelAction: "assistant-reply"
    });

    expect(createTaskEventUiTransition({
      status: "running",
      command: "observe_app"
    }, "pending prompt")).toEqual({
      task: {
        status: "running",
        message: "正在运行.",
        finderPlanPreview: undefined
      },
      conversationAction: "remove-pending",
      clearPendingAssistantPrompt: true,
      finishAssistantInputSubmitting: false,
      panelAction: "non-idle-task-event"
    });

    expect(createTaskEventUiTransition({ status: "idle" }, "pending prompt")).toEqual({
      task: {
        status: "idle",
        message: "待命中.",
        finderPlanPreview: undefined
      },
      conversationAction: "none",
      clearPendingAssistantPrompt: false,
      finishAssistantInputSubmitting: false
    });
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

  it("derives stop-turn UI transition only for stoppable task states", () => {
    expect(createStopTurnUiTransition("running")).toEqual({
      task: {
        status: "cancelled",
        message: "任务已停止."
      },
      panelAction: "non-idle-task-event"
    });
    expect(createStopTurnUiTransition("approval_required")).toMatchObject({
      task: {
        status: "cancelled"
      }
    });
    expect(createStopTurnUiTransition("idle")).toBeNull();
    expect(createStopTurnUiTransition("completed")).toBeNull();
  });

  it("derives assistant input submission transitions from input and submitting state", () => {
    expect(createAssistantInputSubmissionTransition("", false)).toEqual({
      type: "blocked",
      focusInput: true
    });
    expect(createAssistantInputSubmissionTransition("  run it  ", true)).toEqual({
      type: "blocked",
      focusInput: true
    });
    expect(createAssistantInputSubmissionTransition("  run it  ", false)).toEqual({
      type: "submit",
      command: "run it",
      task: {
        status: "planned",
        message: "已交给 Background Agent."
      },
      panelAction: "open-assistant"
    });
  });
});

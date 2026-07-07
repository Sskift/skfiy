import type {
  FinderPlanPreview,
  ObserveAppReplayRecord,
  TaskEvent,
  TaskStatus
} from "./App";
import { canStopTurn } from "./app-view-model";

export interface TaskView {
  status: TaskStatus;
  message: string;
  finderPlanPreview?: FinderPlanPreview;
}

export interface AssistantConversationMessage {
  role: "user" | "assistant";
  text: string;
  state?: "pending" | "error";
}

export const STATUS_COPY: Record<TaskStatus, { label: string; message: string; pulse: string }> = {
  idle: {
    label: "Idle",
    message: "待命中.",
    pulse: "Tucked"
  },
  planned: {
    label: "Planned",
    message: "已规划，等待执行.",
    pulse: "Review"
  },
  observing: {
    label: "Observing",
    message: "正在看桌面.",
    pulse: "Review"
  },
  executing: {
    label: "Executing",
    message: "正在执行.",
    pulse: "Running"
  },
  running: {
    label: "Running",
    message: "正在运行.",
    pulse: "Running"
  },
  approval_required: {
    label: "Approval required",
    message: "需要确认.",
    pulse: "Waiting"
  },
  needs_confirmation: {
    label: "Needs confirmation",
    message: "需要人工确认.",
    pulse: "Waiting"
  },
  completed: {
    label: "Completed",
    message: "完成了.",
    pulse: "Waving"
  },
  denied: {
    label: "Denied",
    message: "请求已拒绝，未执行动作.",
    pulse: "Review"
  },
  blocked: {
    label: "Blocked",
    message: "环境阻塞，无法继续执行.",
    pulse: "Blocked"
  },
  failed: {
    label: "Failed",
    message: "执行失败.",
    pulse: "Fault"
  },
  cancelled: {
    label: "Cancelled",
    message: "任务已停止.",
    pulse: "Stopped"
  }
};

export function createInitialTaskView(): TaskView {
  return {
    status: "idle",
    message: STATUS_COPY.idle.message,
    finderPlanPreview: undefined
  };
}

export function createTaskStatusView(
  status: TaskStatus,
  message = STATUS_COPY[status].message
): TaskView {
  return {
    status,
    message,
    ...(status === "idle" ? { finderPlanPreview: undefined } : {})
  };
}

export function createTaskViewFromEvent(event: TaskEvent): TaskView {
  return {
    status: event.status,
    message: event.message ?? STATUS_COPY[event.status].message,
    finderPlanPreview: event.finderPlanPreview
  };
}

export function mergeReplayRecord(
  records: ObserveAppReplayRecord[],
  nextRecord: ObserveAppReplayRecord
): ObserveAppReplayRecord[] {
  const byStage = new Map<ObserveAppReplayRecord["stage"], ObserveAppReplayRecord>();

  for (const record of records) {
    byStage.set(record.stage, record);
  }

  byStage.set(nextRecord.stage, nextRecord);
  return ["before", "after"].flatMap((stage) => {
    const record = byStage.get(stage as ObserveAppReplayRecord["stage"]);
    return record ? [record] : [];
  });
}

export function updateReplayRecordsForTaskEvent(
  records: ObserveAppReplayRecord[],
  event: TaskEvent
): ObserveAppReplayRecord[] {
  if (event.replayReset) {
    return event.replayRecord ? [event.replayRecord] : [];
  }

  if (event.replayRecord) {
    return mergeReplayRecord(records, event.replayRecord);
  }

  return event.status === "idle" ? [] : records;
}

export function isAssistantConversationReplyEvent(
  event: TaskEvent,
  pendingPrompt: string | null
): boolean {
  return Boolean(pendingPrompt)
    && !event.command
    && (event.status === "completed" || event.status === "failed");
}

export function readAssistantConversationReply(message: string | undefined, status: TaskStatus): string {
  const fallback = status === "failed" ? "Background Agent 暂时不可用." : STATUS_COPY.completed.message;
  const text = message?.trim() || fallback;
  return text.replace(/^(?:Codex|Claude Code|Hermes):\s*/u, "").trim() || fallback;
}

export function appendAssistantConversationReply(
  messages: AssistantConversationMessage[],
  event: TaskEvent
): AssistantConversationMessage[] {
  return [
    ...messages.filter((message) => message.state !== "pending"),
    {
      role: "assistant",
      text: readAssistantConversationReply(event.message, event.status),
      ...(event.status === "failed" ? { state: "error" as const } : {})
    }
  ];
}

export function removePendingAssistantConversationMessages(
  messages: AssistantConversationMessage[]
): AssistantConversationMessage[] {
  return messages.filter((message) => message.state !== "pending");
}

export type TaskEventConversationAction =
  | "append-assistant-reply"
  | "remove-pending"
  | "none";

export type TaskEventPanelAction = "assistant-reply" | "non-idle-task-event";

export interface TaskEventUiTransition {
  task: TaskView;
  conversationAction: TaskEventConversationAction;
  clearPendingAssistantPrompt: boolean;
  finishAssistantInputSubmitting: boolean;
  panelAction?: TaskEventPanelAction;
}

export function createTaskEventUiTransition(
  event: TaskEvent,
  pendingPrompt: string | null
): TaskEventUiTransition {
  const task = createTaskViewFromEvent(event);

  if (isAssistantConversationReplyEvent(event, pendingPrompt)) {
    return {
      task,
      conversationAction: "append-assistant-reply",
      clearPendingAssistantPrompt: true,
      finishAssistantInputSubmitting: true,
      panelAction: "assistant-reply"
    };
  }

  if (event.status !== "idle") {
    return {
      task,
      conversationAction: event.command ? "remove-pending" : "none",
      clearPendingAssistantPrompt: Boolean(event.command),
      finishAssistantInputSubmitting: false,
      panelAction: "non-idle-task-event"
    };
  }

  return {
    task,
    conversationAction: "none",
    clearPendingAssistantPrompt: false,
    finishAssistantInputSubmitting: false
  };
}

export function updateAssistantConversationForTaskEvent(
  messages: AssistantConversationMessage[],
  event: TaskEvent,
  action: TaskEventConversationAction
): AssistantConversationMessage[] {
  if (action === "append-assistant-reply") {
    return appendAssistantConversationReply(messages, event);
  }

  if (action === "remove-pending") {
    return removePendingAssistantConversationMessages(messages);
  }

  return messages;
}

export function createAssistantSubmissionTaskView(): TaskView {
  return {
    status: "planned",
    message: "已交给 Background Agent."
  };
}

export function createAssistantSubmissionFailureTaskView(): TaskView {
  return {
    status: "failed",
    message: "发送给 Background Agent 失败."
  };
}

export function appendAssistantConversationSubmission(
  messages: AssistantConversationMessage[],
  command: string
): AssistantConversationMessage[] {
  return [
    ...messages.filter((message) => message.state !== "pending"),
    {
      role: "user",
      text: command
    },
    {
      role: "assistant",
      text: "Background Agent 正在回复...",
      state: "pending"
    }
  ];
}

export function appendAssistantConversationSubmissionFailure(
  messages: AssistantConversationMessage[]
): AssistantConversationMessage[] {
  return [
    ...messages.filter((message) => message.state !== "pending"),
    {
      role: "assistant",
      text: "发送给 Background Agent 失败.",
      state: "error"
    }
  ];
}

export interface StopTurnUiTransition {
  task: TaskView;
  panelAction: "non-idle-task-event";
}

export function createStopTurnUiTransition(status: TaskStatus): StopTurnUiTransition | null {
  if (!canStopTurn(status)) {
    return null;
  }

  return {
    task: createTaskStatusView("cancelled"),
    panelAction: "non-idle-task-event"
  };
}

export type AssistantInputSubmissionTransition =
  | {
    type: "blocked";
    focusInput: true;
  }
  | {
    type: "submit";
    command: string;
    task: TaskView;
    panelAction: "open-assistant";
  };

export function createAssistantInputSubmissionTransition(
  input: string,
  submitting: boolean
): AssistantInputSubmissionTransition {
  const command = input.trim();

  if (!command || submitting) {
    return {
      type: "blocked",
      focusInput: true
    };
  }

  return {
    type: "submit",
    command,
    task: createAssistantSubmissionTaskView(),
    panelAction: "open-assistant"
  };
}

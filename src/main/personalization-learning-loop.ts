import type {
  AssistantAgentTurnResult
} from "./assistant-agent.js";
import type { BrowserPageContext } from "./browser-page-context.js";
import type {
  PersonalMemoryApplyResult,
  PersonalMemoryOperation,
  PersonalMemorySnapshot
} from "./personal-memory.js";
import {
  createFallbackPersonalMemoryOperations,
  createPersonalMemoryReviewPrompt,
  parsePersonalMemoryReview
} from "./personal-memory-review.js";
import type {
  PendingPersonalMemoryStageResult
} from "./personal-memory-pending.js";
import type {
  SessionMemoryRecord
} from "./session-memory.js";

export interface PersonalizationMemoryStore {
  read: () => PersonalMemorySnapshot;
  applyOperations: (operations: PersonalMemoryOperation[]) => PersonalMemoryApplyResult;
}

export interface PersonalizationPendingMemoryStore {
  stageOperations: (
    operations: PersonalMemoryOperation[],
    options: { source?: "post-turn-review" | string }
  ) => PendingPersonalMemoryStageResult;
}

export interface PersonalizationSessionMemoryStore {
  append: (record: SessionMemoryRecord) => void;
}

export type PersonalizationReviewRunner = (
  prompt: string,
  options: { personalMemory: PersonalMemorySnapshot }
) => Promise<Pick<AssistantAgentTurnResult, "status" | "message">>;

export interface RecordCompletedAssistantTurnForPersonalizationOptions {
  userInput: string;
  turn: AssistantAgentTurnResult;
  browserPageContext: BrowserPageContext;
  memoryStore: PersonalizationMemoryStore;
  sessionMemoryStore: PersonalizationSessionMemoryStore;
  runReviewTurn: PersonalizationReviewRunner;
  memoryWriteApprovalEnabled?: boolean;
  pendingMemoryStore?: PersonalizationPendingMemoryStore;
}

export async function recordCompletedAssistantTurnForPersonalization({
  userInput,
  turn,
  browserPageContext,
  memoryStore,
  sessionMemoryStore,
  runReviewTurn,
  memoryWriteApprovalEnabled = false,
  pendingMemoryStore
}: RecordCompletedAssistantTurnForPersonalizationOptions): Promise<void> {
  recordSessionTurn({
    userInput,
    turn,
    browserPageContext,
    sessionMemoryStore
  });

  const existingMemory = memoryStore.read();
  const reviewPrompt = createPersonalMemoryReviewPrompt({
    userInput,
    assistantReply: turn.message,
    existingMemory
  });
  const applyOrStage = (operations: PersonalMemoryOperation[]) => {
    applyOrStagePersonalMemoryOperations(operations, {
      memoryStore,
      pendingMemoryStore,
      memoryWriteApprovalEnabled
    });
  };
  const applyFallbackMemory = () => {
    applyOrStage(createFallbackPersonalMemoryOperations({
      userInput,
      assistantReply: turn.message,
      existingMemory
    }));
  };

  try {
    const reviewTurn = await runReviewTurn(reviewPrompt, {
      personalMemory: existingMemory
    });
    if (reviewTurn.status !== "completed") {
      applyFallbackMemory();
      return;
    }

    const operations = parsePersonalMemoryReview(reviewTurn.message);
    if (operations.length > 0) {
      applyOrStage(operations);
      return;
    }

    applyFallbackMemory();
  } catch {
    applyFallbackMemory();
  }
}

function recordSessionTurn({
  userInput,
  turn,
  browserPageContext,
  sessionMemoryStore
}: {
  userInput: string;
  turn: AssistantAgentTurnResult;
  browserPageContext: BrowserPageContext;
  sessionMemoryStore: PersonalizationSessionMemoryStore;
}): void {
  try {
    sessionMemoryStore.append({
      turnId: turn.id,
      createdAt: turn.createdAt,
      userInput,
      assistantReply: turn.message,
      providerLabel: turn.providerLabel,
      ...((browserPageContext.url || browserPageContext.title) ? {
        browserContext: {
          ...(browserPageContext.url ? { url: browserPageContext.url } : {}),
          ...(browserPageContext.title ? { title: browserPageContext.title } : {})
        }
      } : {})
    });
  } catch {
    // Personalization is best-effort and must not interrupt the visible reply.
  }
}

function applyOrStagePersonalMemoryOperations(
  operations: PersonalMemoryOperation[],
  {
    memoryStore,
    pendingMemoryStore,
    memoryWriteApprovalEnabled
  }: {
    memoryStore: PersonalizationMemoryStore;
    pendingMemoryStore?: PersonalizationPendingMemoryStore;
    memoryWriteApprovalEnabled: boolean;
  }
): void {
  if (operations.length === 0) {
    return;
  }

  if (memoryWriteApprovalEnabled && pendingMemoryStore) {
    pendingMemoryStore.stageOperations(operations, { source: "post-turn-review" });
    return;
  }

  memoryStore.applyOperations(operations);
}

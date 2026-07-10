import { describe, expect, it } from "vitest";

import type { AssistantAgentTurnResult } from "./assistant-agent";
import {
  createAssistantComputerUseToolPlan,
  readAssistantComputerUseToolCall
} from "./main-assistant-computer-use-plan";
import {
  FINDER_BUNDLE_ID,
  GHOSTTY_BUNDLE_ID
} from "./task-routing";

function createTurn(
  overrides: Partial<AssistantAgentTurnResult> = {}
): AssistantAgentTurnResult {
  return {
    id: "turn-1",
    createdAt: "2026-07-07T00:00:00.000Z",
    status: "completed",
    providerLabel: "Codex",
    message: "done",
    route: {
      kind: "finder",
      bundleId: FINDER_BUNDLE_ID
    },
    toolCalls: [
      {
        id: "tool-1",
        type: "computer-use",
        name: "desktop-control",
        status: "planned",
        createdAt: "2026-07-07T00:00:01.000Z",
        input: {
          command: "organize Downloads",
          route: {
            kind: "finder",
            bundleId: FINDER_BUNDLE_ID
          }
        }
      }
    ],
    cancellation: { requested: false },
    ...overrides
  };
}

describe("main assistant Computer Use plan helpers", () => {
  it("creates Computer Use executor plan input from an assistant turn", () => {
    const turn = createTurn();

    expect(createAssistantComputerUseToolPlan(turn)).toEqual({
      identity: {
        turnId: "turn-1",
        toolCallId: "tool-1"
      },
      planInput: {
        turnId: "turn-1",
        toolCallId: "tool-1",
        command: "organize Downloads",
        route: {
          kind: "finder",
          bundleId: FINDER_BUNDLE_ID
        },
        createdAt: "2026-07-07T00:00:01.000Z"
      },
      toolCall: turn.toolCalls[0]
    });
  });

  it("keeps executable route details when planning terminal Computer Use", () => {
    expect(createAssistantComputerUseToolPlan(createTurn({
      toolCalls: [
        {
          id: "tool-ghostty",
          type: "computer-use",
          name: "desktop-control",
          status: "planned",
          createdAt: "2026-07-07T00:01:00.000Z",
          input: {
            command: "run npm test",
            route: {
              kind: "ghostty",
              bundleId: GHOSTTY_BUNDLE_ID
            }
          }
        }
      ]
    })).planInput).toEqual({
      turnId: "turn-1",
      toolCallId: "tool-ghostty",
      command: "run npm test",
      route: {
        kind: "ghostty",
        bundleId: GHOSTTY_BUNDLE_ID
      },
      createdAt: "2026-07-07T00:01:00.000Z"
    });
  });

  it("throws when the assistant turn did not plan a Computer Use tool call", () => {
    expect(() => readAssistantComputerUseToolCall(createTurn({ toolCalls: [] })))
      .toThrow("Assistant turn turn-1 did not plan a Computer Use tool call.");
    expect(() => createAssistantComputerUseToolPlan(createTurn({ toolCalls: [] })))
      .toThrow("Assistant turn turn-1 did not plan a Computer Use tool call.");
  });
});

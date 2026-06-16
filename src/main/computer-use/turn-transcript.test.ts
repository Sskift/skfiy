import { describe, expect, it } from "vitest";
import { createTurnTranscript } from "./turn-transcript";

describe("createTurnTranscript", () => {
  it("summarizes app, screenshots, actions, and risk for a Computer Use turn", () => {
    expect(createTurnTranscript([
      {
        type: "started",
        command: "pwd",
        risk: {
          level: "low",
          reason: "Read-only terminal command.",
          requiresApproval: false
        }
      },
      { type: "locating_app", appName: "Ghostty" },
      { type: "session_opened", appName: "Ghostty", title: "skfiy-shell", pid: 54502 },
      { type: "app_activated", appName: "Ghostty", bundleId: "com.mitchellh.ghostty", pid: 54502 },
      {
        type: "screenshot_before",
        path: "/tmp/before.png",
        observation: {
          bundleId: "com.mitchellh.ghostty",
          pid: 54502,
          isRunning: true,
          isActive: true,
          screenshotPath: "/tmp/before.png",
          accessibilityTrusted: true,
          windows: [
            {
              title: "skfiy-shell",
              layer: 0,
              bounds: { x: 10, y: 20, width: 640, height: 480 }
            }
          ]
        }
      },
      { type: "typing", command: "pwd" },
      { type: "submitted", key: "enter" },
      {
        type: "screenshot_after",
        path: "/tmp/after.png",
        observation: {
          bundleId: "com.mitchellh.ghostty",
          pid: 54502,
          isRunning: true,
          isActive: true,
          screenshotPath: "/tmp/after.png",
          accessibilityTrusted: true,
          windows: [
            {
              title: "skfiy-shell",
              layer: 0,
              bounds: { x: 10, y: 20, width: 640, height: 480 }
            }
          ]
        }
      },
      { type: "completed", command: "pwd", summary: "Command submitted to Ghostty." }
    ])).toEqual({
      command: "pwd",
      risk: {
        level: "low",
        reason: "Read-only terminal command.",
        requiresApproval: false
      },
      approvalRequired: false,
      apps: [
        {
          name: "Ghostty",
          bundleId: "com.mitchellh.ghostty",
          pid: 54502
        }
      ],
      screenshots: [
        {
          stage: "before",
          path: "/tmp/before.png",
          bundleId: "com.mitchellh.ghostty",
          pid: 54502,
          accessibilityTrusted: true,
          grounding: {
            bundleId: "com.mitchellh.ghostty",
            screenshotPath: "/tmp/before.png",
            recommendation: "structured_first",
            sources: [
              {
                source: "macos_accessibility",
                status: "covered",
                observedElementCount: 1,
                labelCount: 1,
                notes: ["Accessibility is trusted and produced 1 window-level element."]
              },
              {
                source: "screenshot_ocr",
                status: "missing",
                observedElementCount: 0,
                labelCount: 0,
                notes: ["OCR labels have not been parsed for this screenshot."]
              }
            ]
          }
        },
        {
          stage: "after",
          path: "/tmp/after.png",
          bundleId: "com.mitchellh.ghostty",
          pid: 54502,
          accessibilityTrusted: true,
          grounding: {
            bundleId: "com.mitchellh.ghostty",
            screenshotPath: "/tmp/after.png",
            recommendation: "structured_first",
            sources: [
              {
                source: "macos_accessibility",
                status: "covered",
                observedElementCount: 1,
                labelCount: 1,
                notes: ["Accessibility is trusted and produced 1 window-level element."]
              },
              {
                source: "screenshot_ocr",
                status: "missing",
                observedElementCount: 0,
                labelCount: 0,
                notes: ["OCR labels have not been parsed for this screenshot."]
              }
            ]
          }
        }
      ],
      actions: [
        { type: "open_session", appName: "Ghostty", pid: 54502 },
        { type: "activate_app", appName: "Ghostty", bundleId: "com.mitchellh.ghostty", pid: 54502 },
        { type: "type_text", text: "pwd" },
        { type: "press_key", key: "enter" }
      ],
      outcome: "completed"
    });
  });

  it("records approval context for risky commands", () => {
    expect(createTurnTranscript([
      {
        type: "started",
        command: "mkdir demo",
        risk: {
          level: "medium",
          reason: "Command can create or modify local state.",
          requiresApproval: true
        }
      },
      {
        type: "approval_required",
        command: "mkdir demo",
        risk: {
          level: "medium",
          reason: "Command can create or modify local state.",
          requiresApproval: true
        }
      }
    ])).toMatchObject({
      command: "mkdir demo",
      risk: {
        level: "medium"
      },
      approvalRequired: true,
      actions: [],
      outcome: "approval_required"
    });
  });

  it("records planner rationale before execution actions", () => {
    expect(createTurnTranscript([
      {
        type: "planner_resolved",
        providerLabel: "External CUA",
        input: "打开 Ghostty 执行 pwd 并截图",
        command: "pwd",
        rationale: "Read the current working directory."
      },
      {
        type: "started",
        command: "pwd",
        risk: {
          level: "low",
          reason: "Read-only terminal command.",
          requiresApproval: false
        }
      },
      { type: "typing", command: "pwd" }
    ])).toMatchObject({
      command: "pwd",
      planner: {
        providerLabel: "External CUA",
        input: "打开 Ghostty 执行 pwd 并截图",
        command: "pwd",
        rationale: "Read the current working directory."
      },
      actions: [
        {
          type: "plan",
          providerLabel: "External CUA",
          command: "pwd"
        },
        { type: "type_text", text: "pwd" }
      ]
    });
  });

  it("records action verification decisions as replay actions", () => {
    expect(createTurnTranscript([
      {
        type: "action_verified",
        actionType: "type_text",
        status: "passed",
        message: "type_text helper result accepted."
      },
      {
        type: "action_verified",
        actionType: "press_key",
        status: "needs_user_confirmation",
        reason: "Completion marker was not observed."
      }
    ])).toMatchObject({
      actions: [
        {
          type: "verify",
          actionType: "type_text",
          status: "passed",
          message: "type_text helper result accepted."
        },
        {
          type: "verify",
          actionType: "press_key",
          status: "needs_user_confirmation",
          reason: "Completion marker was not observed."
        }
      ],
      outcome: "verification_failed"
    });
  });

  it("records Finder semantic selection observations as replay actions", () => {
    expect(createTurnTranscript([
      {
        type: "finder_selection_observed",
        context: {
          source: "finder-applescript",
          frontmostBundleId: "com.apple.finder",
          targetPath: "/tmp/skfiy-finder-smoke",
          selection: [
            {
              path: "/tmp/skfiy-finder-smoke/photo.png",
              name: "photo.png",
              kind: "file"
            }
          ]
        }
      }
    ])).toMatchObject({
      actions: [
        {
          type: "observe_finder_selection",
          source: "finder-applescript",
          frontmostBundleId: "com.apple.finder",
          targetPath: "/tmp/skfiy-finder-smoke",
          selectedCount: 1
        }
      ]
    });
  });

  it("uses OCR labels as screenshot grounding when accessibility is blocked", () => {
    expect(createTurnTranscript([
      {
        type: "screenshot_before",
        path: "/tmp/before.png",
        observation: {
          bundleId: "com.mitchellh.ghostty",
          pid: 54502,
          isRunning: true,
          isActive: true,
          screenshotPath: "/tmp/before.png",
          accessibilityTrusted: false,
          windows: [],
          ocrLabels: [
            {
              text: "pwd",
              confidence: 0.88,
              bounds: { x: 36, y: 88, width: 42, height: 18 }
            }
          ]
        }
      }
    ] as never)).toMatchObject({
      screenshots: [
        {
          grounding: {
            recommendation: "ocr_fallback",
            sources: [
              {
                source: "macos_accessibility",
                status: "blocked"
              },
              {
                source: "screenshot_ocr",
                status: "covered",
                observedElementCount: 1,
                labelCount: 1
              }
            ]
          }
        }
      ]
    });
  });
});

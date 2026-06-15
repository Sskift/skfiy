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
          accessibilityTrusted: true
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
          accessibilityTrusted: true
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
          accessibilityTrusted: true
        },
        {
          stage: "after",
          path: "/tmp/after.png",
          bundleId: "com.mitchellh.ghostty",
          pid: 54502,
          accessibilityTrusted: true
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
});

import { describe, expect, it } from "vitest";
import {
  normalizeChromeBrowserMessage
} from "./chrome-browser-action-schema";

describe("Chrome browser action schema", () => {
  it("normalizes observe and safe page actions into extension-ready messages", () => {
    expect(normalizeChromeBrowserMessage({
      schemaVersion: 1,
      type: "skfiy.page.observe",
      requestId: "observe-1"
    })).toEqual({
      ok: true,
      message: {
        schemaVersion: 1,
        type: "skfiy.page.observe",
        requestId: "observe-1",
        payload: {
          mode: "current_page",
          include: ["title", "url", "visible_text", "forms", "interactive_elements"]
        }
      }
    });

    expect(normalizeChromeBrowserMessage({
      schemaVersion: 1,
      type: "skfiy.page.action",
      requestId: "action-1",
      payload: {
        action: {
          kind: "click",
          text: "Continue"
        }
      }
    })).toEqual({
      ok: true,
      message: {
        schemaVersion: 1,
        type: "skfiy.page.action",
        requestId: "action-1",
        payload: {
          action: {
            kind: "click",
            text: "Continue"
          }
        }
      }
    });
  });

  it("normalizes page screenshot and download status messages without exposing local paths by default", () => {
    expect(normalizeChromeBrowserMessage({
      schemaVersion: 1,
      type: "skfiy.page.screenshot",
      requestId: "screenshot-1"
    })).toEqual({
      ok: true,
      message: {
        schemaVersion: 1,
        type: "skfiy.page.screenshot",
        requestId: "screenshot-1",
        payload: {
          format: "png"
        }
      }
    });

    expect(normalizeChromeBrowserMessage({
      schemaVersion: 1,
      type: "skfiy.downloads.status",
      requestId: "downloads-1"
    })).toEqual({
      ok: true,
      message: {
        schemaVersion: 1,
        type: "skfiy.downloads.status",
        requestId: "downloads-1",
        payload: {
          limit: 20,
          includeFilePaths: false
        }
      }
    });

    expect(normalizeChromeBrowserMessage({
      schemaVersion: 1,
      type: "skfiy.downloads.status",
      requestId: "downloads-confirmed",
      payload: {
        includeFilePaths: true,
        confirmed: true,
        limit: 999
      }
    })).toEqual({
      ok: true,
      message: {
        schemaVersion: 1,
        type: "skfiy.downloads.status",
        requestId: "downloads-confirmed",
        payload: {
          limit: 50,
          includeFilePaths: true,
          confirmed: true
        }
      }
    });
  });

  it("rejects unsupported, incomplete, or unsafe browser actions before dispatch", () => {
    expect(normalizeChromeBrowserMessage({
      schemaVersion: 1,
      type: "skfiy.page.action",
      requestId: "missing-target",
      payload: {
        action: {
          kind: "click"
        }
      }
    })).toEqual({
      ok: false,
      result: "invalid",
      reason: "missing_action_target"
    });

    expect(normalizeChromeBrowserMessage({
      schemaVersion: 1,
      type: "skfiy.page.action",
      requestId: "unsafe-url",
      payload: {
        action: {
          kind: "navigate",
          url: "javascript:alert(1)"
        }
      }
    })).toEqual({
      ok: false,
      result: "blocked",
      reason: "unsafe_navigation_url"
    });

    expect(normalizeChromeBrowserMessage({
      schemaVersion: 1,
      type: "skfiy.page.action",
      requestId: "password-fill",
      payload: {
        action: {
          kind: "fill",
          selector: "#password",
          value: "hunter2"
        }
      }
    })).toEqual({
      ok: false,
      result: "blocked",
      reason: "sensitive_form_action"
    });

    expect(normalizeChromeBrowserMessage({
      schemaVersion: 1,
      type: "skfiy.page.action",
      requestId: "submit-click",
      payload: {
        action: {
          kind: "submit",
          selector: "form"
        }
      }
    })).toEqual({
      ok: false,
      result: "blocked",
      reason: "form_submission_requires_confirmation"
    });

    expect(normalizeChromeBrowserMessage({
      schemaVersion: 1,
      type: "skfiy.downloads.status",
      requestId: "downloads-paths",
      payload: {
        includeFilePaths: true
      }
    })).toEqual({
      ok: false,
      result: "blocked",
      reason: "download_path_exposure_requires_confirmation"
    });
  });
});

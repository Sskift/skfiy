import { describe, expect, it } from "vitest";
import {
  buildCdpCommand,
  selectBrowserControlMode
} from "./browser-control";

describe("selectBrowserControlMode", () => {
  it("prefers structured CDP control when an endpoint is available", () => {
    expect(selectBrowserControlMode({
      cdpEndpoint: "http://127.0.0.1:9222",
      screenshotFallbackAvailable: true
    })).toEqual({
      mode: "structured_cdp",
      reason: "Chrome DevTools Protocol endpoint is available."
    });
  });

  it("falls back to screenshot control when CDP is unavailable", () => {
    expect(selectBrowserControlMode({
      screenshotFallbackAvailable: true
    })).toEqual({
      mode: "screenshot_fallback",
      reason: "Structured browser control is unavailable; use screenshot Computer Use."
    });
  });

  it("reports unavailable when neither structured nor screenshot control can run", () => {
    expect(selectBrowserControlMode({
      screenshotFallbackAvailable: false
    })).toEqual({
      mode: "unavailable",
      reason: "No browser control channel is available."
    });
  });
});

describe("buildCdpCommand", () => {
  it("builds a Page.navigate command", () => {
    expect(buildCdpCommand({
      type: "navigate",
      url: "https://example.com"
    })).toEqual({
      method: "Page.navigate",
      params: {
        url: "https://example.com"
      }
    });
  });

  it("builds a selector click command", () => {
    expect(buildCdpCommand({
      type: "click_selector",
      selector: "button.primary"
    })).toEqual({
      method: "Runtime.evaluate",
      params: {
        awaitPromise: true,
        returnByValue: true,
        expression: expect.stringContaining("button.primary")
      }
    });
  });

  it("builds a text extraction command", () => {
    expect(buildCdpCommand({
      type: "extract_text",
      selector: "main"
    })).toEqual({
      method: "Runtime.evaluate",
      params: {
        awaitPromise: true,
        returnByValue: true,
        expression: expect.stringContaining("innerText")
      }
    });
  });
});

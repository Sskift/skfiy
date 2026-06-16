import { describe, expect, it, vi } from "vitest";
import {
  parseChromePageIntent,
  runChromePageTask,
  type ChromeTaskClient
} from "./chrome-task";

async function collectEvents(task: AsyncGenerator<{ type: string }>) {
  const events: Array<{ type: string }> = [];

  for await (const event of task) {
    events.push(event);
  }

  return events;
}

function createChromeClient(): ChromeTaskClient & {
  sendCdpCommand: ReturnType<typeof vi.fn>;
} {
  return {
    sendCdpCommand: vi.fn(async (command) => {
      if (command.method === "Page.navigate") {
        return { frameId: "frame-1" };
      }

      if (command.method === "Runtime.evaluate") {
        return {
          result: {
            type: "string",
            value: "skfiy chrome smoke ready"
          }
        };
      }

      return {};
    })
  };
}

describe("parseChromePageIntent", () => {
  it("accepts a constrained Chrome test-page command with an absolute URL", () => {
    expect(
      parseChromePageIntent("打开 Chrome 测试页面 file:///tmp/skfiy-chrome.html 并提取正文")
    ).toEqual({
      ok: true,
      url: "file:///tmp/skfiy-chrome.html"
    });
  });

  it("rejects non-test-page Chrome phrasing", () => {
    expect(parseChromePageIntent("打开 Chrome 搜索天气")).toMatchObject({
      ok: false,
      reason: expect.stringContaining("打开 Chrome 测试页面")
    });
  });
});

describe("runChromePageTask", () => {
  it("requires approval before changing Chrome browser state", async () => {
    const client = createChromeClient();

    const events = await collectEvents(
      runChromePageTask(
        "打开 Chrome 测试页面 file:///tmp/skfiy-chrome.html 并提取正文",
        client
      )
    );

    expect(events.map((event) => event.type)).toEqual(["started", "approval_required"]);
    expect(client.sendCdpCommand).not.toHaveBeenCalled();
  });

  it("navigates to the test page and extracts text after approval", async () => {
    const client = createChromeClient();

    const events = await collectEvents(
      runChromePageTask(
        "打开 Chrome 测试页面 file:///tmp/skfiy-chrome.html 并提取正文",
        client,
        { approved: true }
      )
    );

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "approval_required",
      "locating_app",
      "action_verified",
      "action_verified",
      "completed"
    ]);
    expect(client.sendCdpCommand).toHaveBeenNthCalledWith(1, {
      method: "Page.navigate",
      params: { url: "file:///tmp/skfiy-chrome.html" }
    });
    expect(client.sendCdpCommand).toHaveBeenNthCalledWith(2, {
      method: "Runtime.evaluate",
      params: expect.objectContaining({
        awaitPromise: true,
        returnByValue: true,
        expression: expect.stringContaining("document.body")
      })
    });
    expect(events.at(-1)).toMatchObject({
      type: "completed",
      summary: expect.stringContaining("skfiy chrome smoke ready")
    });
  });

  it("pauses instead of completing when extracted page text looks sensitive", async () => {
    const client = createChromeClient();
    client.sendCdpCommand.mockImplementation(async (command) => {
      if (command.method === "Page.navigate") {
        return { frameId: "frame-1" };
      }

      return {
        result: {
          type: "string",
          value: "Enter password and one-time code"
        }
      };
    });

    const events = await collectEvents(
      runChromePageTask(
        "打开 Chrome 测试页面 file:///tmp/skfiy-login.html 并提取正文",
        client,
        { approved: true }
      )
    );

    expect(events.map((event) => event.type)).toEqual([
      "started",
      "approval_required",
      "locating_app",
      "action_verified",
      "verification_failed"
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "verification_failed",
      stage: "sensitive",
      reason: "Sensitive UI text is visible."
    });
  });
});

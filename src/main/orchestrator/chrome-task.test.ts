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

  it("accepts a constrained Chrome test-form command", () => {
    expect(parseChromePageIntent(
      "填写 Chrome 测试表单 file:///tmp/skfiy-form.html 字段 #name=skfiy 点击 #submit 并提取正文"
    )).toEqual({
      ok: true,
      kind: "form",
      url: "file:///tmp/skfiy-form.html",
      fields: [
        { selector: "#name", value: "skfiy" }
      ],
      submitSelector: "#submit"
    });
  });

  it("accepts a constrained Chrome test-form command with multiple fields", () => {
    expect(parseChromePageIntent(
      "填写 Chrome 测试表单 file:///tmp/skfiy-form.html 字段 #name=skfiy; #email=agent@skfiy.test; #role=operator 点击 #submit 并提取正文"
    )).toEqual({
      ok: true,
      kind: "form",
      url: "file:///tmp/skfiy-form.html",
      fields: [
        { selector: "#name", value: "skfiy" },
        { selector: "#email", value: "agent@skfiy.test" },
        { selector: "#role", value: "operator" }
      ],
      submitSelector: "#submit"
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

  it("fills and submits a test form before extracting text", async () => {
    const client = createChromeClient();

    const events = await collectEvents(
      runChromePageTask(
        "填写 Chrome 测试表单 file:///tmp/skfiy-form.html 字段 #name=skfiy; #email=agent@skfiy.test; #role=operator 点击 #submit 并提取正文",
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
      "action_verified",
      "action_verified",
      "action_verified",
      "action_verified",
      "completed"
    ]);
    expect(client.sendCdpCommand).toHaveBeenNthCalledWith(1, {
      method: "Page.navigate",
      params: { url: "file:///tmp/skfiy-form.html" }
    });
    expect(client.sendCdpCommand).toHaveBeenNthCalledWith(2, {
      method: "Runtime.evaluate",
      params: expect.objectContaining({
        expression: expect.stringContaining("#name")
      })
    });
    expect(client.sendCdpCommand).toHaveBeenNthCalledWith(3, {
      method: "Runtime.evaluate",
      params: expect.objectContaining({
        expression: expect.stringContaining("#email")
      })
    });
    expect(client.sendCdpCommand).toHaveBeenNthCalledWith(4, {
      method: "Runtime.evaluate",
      params: expect.objectContaining({
        expression: expect.stringContaining("#role")
      })
    });
    expect(client.sendCdpCommand).toHaveBeenNthCalledWith(5, {
      method: "Runtime.evaluate",
      params: expect.objectContaining({
        expression: expect.stringContaining("#submit")
      })
    });
    expect(client.sendCdpCommand).toHaveBeenNthCalledWith(6, {
      method: "Runtime.evaluate",
      params: expect.objectContaining({
        expression: expect.stringContaining("document.body")
      })
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "action_verified",
        actionType: "fill_selector",
        message: "Filled #name."
      }),
      expect.objectContaining({
        type: "action_verified",
        actionType: "fill_selector",
        message: "Filled #email."
      }),
      expect.objectContaining({
        type: "action_verified",
        actionType: "fill_selector",
        message: "Filled #role."
      }),
      expect.objectContaining({
        type: "action_verified",
        actionType: "click_selector",
        message: "Clicked #submit."
      })
    ]));
  });

  it("reports form fill failures as interaction verification failures", async () => {
    const client = createChromeClient();
    client.sendCdpCommand.mockImplementation(async (command) => {
      if (command.method === "Page.navigate") {
        return { frameId: "frame-1" };
      }

      throw new Error("Selector not found: #name");
    });

    const events = await collectEvents(
      runChromePageTask(
        "填写 Chrome 测试表单 file:///tmp/skfiy-form.html 字段 #name=skfiy 点击 #submit 并提取正文",
        client,
        { approved: true }
      )
    );

    expect(events.at(-1)).toMatchObject({
      type: "verification_failed",
      stage: "interaction",
      reason: "Selector not found: #name"
    });
  });

  it("reports the failing selector when one field in a multi-field form fails", async () => {
    const client = createChromeClient();
    client.sendCdpCommand.mockImplementation(async (command) => {
      if (command.method === "Page.navigate") {
        return { frameId: "frame-1" };
      }

      if (
        command.method === "Runtime.evaluate"
        && typeof command.params?.expression === "string"
        && command.params.expression.includes("#email")
      ) {
        throw new Error("Selector not found: #email");
      }

      return {
        result: {
          type: "string",
          value: "skfiy chrome smoke ready"
        }
      };
    });

    const events = await collectEvents(
      runChromePageTask(
        "填写 Chrome 测试表单 file:///tmp/skfiy-form.html 字段 #name=skfiy; #email=agent@skfiy.test; #role=operator 点击 #submit 并提取正文",
        client,
        { approved: true }
      )
    );

    expect(events.at(-1)).toMatchObject({
      type: "verification_failed",
      stage: "interaction",
      reason: "Selector not found: #email"
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "action_verified",
        actionType: "fill_selector",
        message: "Filled #name."
      })
    ]));
  });
});

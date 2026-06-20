import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createChromeMock() {
  const listeners = [];
  return {
    listener: () => listeners[0],
    chrome: {
      runtime: {
        onMessage: {
          addListener: vi.fn((listener) => {
            listeners.push(listener);
          })
        },
        sendMessage: vi.fn()
      }
    }
  };
}

async function importContentScript() {
  const url = pathToFileURL(path.join(process.cwd(), "chrome-extension", "content-script.js"));
  url.search = `?test=${Date.now()}-${Math.random()}`;
  await import(url.href);
}

function sendContentMessage(listener, message) {
  const sendResponse = vi.fn();
  const keepChannelOpen = listener(message, {}, sendResponse);

  return {
    keepChannelOpen,
    response: sendResponse.mock.calls[0]?.[0]
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.title = "";
  globalThis.CSS = {
    escape: (value) => String(value).replace(/"/g, "\\\"")
  };
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    visibility: "visible",
    display: "block"
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 10,
    y: 20,
    width: 100,
    height: 30,
    top: 20,
    left: 10,
    right: 110,
    bottom: 50,
    toJSON: () => ({})
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.chrome;
});

describe("Chrome extension content script", () => {
  it("reports page control readiness and DOM action capabilities", async () => {
    const mock = createChromeMock();
    globalThis.chrome = mock.chrome;
    document.title = "Work queue";
    document.body.innerHTML = `
      <main>
        <form id="profile">
          <label>Email <input id="email" name="email" value=""></label>
          <button id="save">Save</button>
        </form>
        <a id="help" href="/help">Help</a>
      </main>
    `;

    await importContentScript();
    const listener = mock.listener();

    const diagnostics = sendContentMessage(listener, {
      type: "skfiy.page.diagnostics",
      requestId: "page-control"
    });

    expect(diagnostics.keepChannelOpen).toBe(true);
    expect(diagnostics.response).toMatchObject({
      type: "skfiy.page.diagnostics_result",
      requestId: "page-control",
      session: {
        state: "loaded",
        pageSafety: {
          state: "clear"
        },
        pageControl: {
          state: "ready",
          capabilities: {
            diagnostics: true,
            observe: true,
            domActions: true,
            click: true,
            fill: true,
            submit: true,
            scroll: true,
            screenshot: "background_required"
          },
          counts: {
            interactiveElements: 3,
            forms: 2,
            fillableForms: 1,
            sensitiveForms: 0
          },
          sensitivePause: {
            active: false
          }
        }
      }
    });
  });

  it("reports page-level sensitive risk and pauses unconfirmed destructive clicks", async () => {
    const mock = createChromeMock();
    globalThis.chrome = mock.chrome;
    document.title = "Account settings";
    document.body.innerHTML = `
      <main>
        <h1>Delete account</h1>
        <p>Enter password and one-time code before you permanently delete account.</p>
        <button id="delete-account">Delete account</button>
      </main>
    `;

    await importContentScript();
    const listener = mock.listener();

    const observed = sendContentMessage(listener, {
      type: "skfiy.page.observe",
      requestId: "observe-risk"
    });

    expect(observed.keepChannelOpen).toBe(true);
    expect(observed.response).toMatchObject({
      type: "skfiy.page.observe_result",
      requestId: "observe-risk",
      snapshot: {
        safety: {
          state: "needs_confirmation",
          findingCount: expect.any(Number),
          findings: expect.arrayContaining([
            expect.objectContaining({ reason: "credential_or_otp_prompt" }),
            expect.objectContaining({ reason: "account_deletion_flow" })
          ])
        }
      }
    });

    const clicked = sendContentMessage(listener, {
      type: "skfiy.page.action",
      requestId: "click-risk",
      payload: {
        action: {
          kind: "click",
          selector: "#delete-account"
        }
      }
    });

    expect(clicked.response).toMatchObject({
      type: "skfiy.page.action_result",
      requestId: "click-risk",
      result: "sensitive-paused",
      reason: "Sensitive page content requires confirmation",
      safety: {
        state: "needs_confirmation"
      }
    });
    expect(document.documentElement.getAttribute("data-skfiy-sensitive-paused")).toBe(
      "Sensitive page content requires confirmation"
    );
    expect(mock.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "skfiy.page.sensitive_pause",
      reason: "Sensitive page content requires confirmation",
      actionType: "click",
      safety: expect.objectContaining({
        state: "needs_confirmation"
      })
    }));
  });

  it("executes payload.action on safe pages and allows confirmed clicks on risky pages", async () => {
    const mock = createChromeMock();
    globalThis.chrome = mock.chrome;
    document.title = "Profile";
    document.body.innerHTML = `
      <label>Name <input id="name" value=""></label>
      <button id="save">Save</button>
    `;

    await importContentScript();
    const listener = mock.listener();

    const filled = sendContentMessage(listener, {
      type: "skfiy.page.action",
      requestId: "fill-name",
      payload: {
        action: {
          kind: "fill",
          selector: "#name",
          value: "skfiy"
        }
      }
    });

    expect(filled.response).toMatchObject({
      type: "skfiy.page.action_result",
      requestId: "fill-name",
      result: "passed",
      action: "fill"
    });
    expect(document.querySelector("#name").value).toBe("skfiy");

    document.body.innerHTML = `
      <p>Delete account requires password confirmation.</p>
      <button id="continue">Continue</button>
    `;
    const button = document.querySelector("#continue");
    const clickSpy = vi.spyOn(button, "click");
    const confirmed = sendContentMessage(listener, {
      type: "skfiy.page.action",
      requestId: "confirmed-risk",
      payload: {
        action: {
          kind: "click",
          selector: "#continue",
          confirmed: true
        }
      }
    });

    expect(confirmed.response).toMatchObject({
      type: "skfiy.page.action_result",
      requestId: "confirmed-risk",
      result: "passed",
      action: "click"
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});

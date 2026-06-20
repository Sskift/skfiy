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
  document.documentElement.removeAttribute("data-skfiy-sensitive-paused");
  document.documentElement.removeAttribute("data-skfiy-sensitive-pause-kind");
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
          capable: true,
          state: "ready",
          nextAction: "send_page_action",
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
          actions: {
            click: {
              capable: true,
              state: "available",
              nextAction: "send_page_action"
            },
            fill: {
              capable: true,
              state: "available",
              nextAction: "send_page_action"
            },
            submit: {
              capable: true,
              state: "available",
              nextAction: "send_page_action"
            },
            scroll: {
              capable: true,
              state: "available",
              nextAction: "send_page_action"
            }
          },
          forms: {
            total: 2,
            fillable: 1,
            sensitive: 0
          },
          sensitiveForms: [],
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

  it("responds to the page-control health protocol without background privileges", async () => {
    const mock = createChromeMock();
    globalThis.chrome = mock.chrome;
    document.title = "Work queue";
    document.body.innerHTML = `
      <main>
        <button id="save">Save</button>
        <input id="email" name="email" value="">
      </main>
    `;

    await importContentScript();
    const listener = mock.listener();

    const health = sendContentMessage(listener, {
      type: "skfiy.page_control.health",
      requestId: "content-health"
    });

    expect(health.keepChannelOpen).toBe(true);
    expect(health.response).toMatchObject({
      type: "skfiy.page_control.health_result",
      schemaVersion: 1,
      requestId: "content-health",
      protocol: {
        schemaVersion: 1,
        name: "skfiy.chrome.page-control.content-script",
        state: "loaded",
        messageTypes: {
          health: "skfiy.page_control.health",
          healthResult: "skfiy.page_control.health_result",
          diagnostics: "skfiy.page.diagnostics",
          observe: "skfiy.page.observe",
          action: "skfiy.page.action"
        },
        capabilities: {
          health: true,
          diagnostics: true,
          observe: true,
          domActions: true,
          click: true,
          fill: true,
          submit: true,
          scroll: true,
          screenshot: "background_required"
        }
      },
      session: {
        state: "loaded",
        pageControl: {
          state: "ready",
          capable: true,
          capabilities: {
            diagnostics: true,
            observe: true,
            domActions: true,
            click: true,
            fill: true,
            scroll: true,
            screenshot: "background_required"
          }
        }
      },
      pageControl: {
        state: "ready",
        capable: true
      },
      blockers: []
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

    const diagnostics = sendContentMessage(listener, {
      type: "skfiy.page.diagnostics",
      requestId: "diagnostics-risk"
    });

    expect(diagnostics.response).toMatchObject({
      type: "skfiy.page.diagnostics_result",
      requestId: "diagnostics-risk",
      session: {
        sensitivePaused: true,
        sensitivePauseReason: "Sensitive page content requires confirmation",
        pageControl: {
          capable: false,
          state: "sensitive-paused",
          reason: "Sensitive page content requires confirmation",
          nextAction: "confirm_sensitive_page",
          capabilities: {
            domActions: false,
            click: false,
            fill: false,
            submit: false,
            scroll: false
          },
          actions: {
            click: {
              capable: false,
              state: "blocked",
              reason: "Sensitive page content requires confirmation",
              nextAction: "confirm_sensitive_page"
            },
            fill: {
              capable: false,
              state: "blocked",
              nextAction: "confirm_sensitive_page"
            },
            submit: {
              capable: false,
              state: "blocked",
              nextAction: "confirm_sensitive_page"
            },
            scroll: {
              capable: false,
              state: "blocked",
              nextAction: "confirm_sensitive_page"
            }
          }
        }
      }
    });
  });

  it("reports sensitive form metadata without advertising executable actions", async () => {
    const mock = createChromeMock();
    globalThis.chrome = mock.chrome;
    document.title = "Sign in";
    document.body.innerHTML = `
      <main>
        <h1>Enter password and one-time code</h1>
        <form id="login">
          <input id="password" name="password" type="password" aria-label="Password">
          <input id="otp" name="otp" aria-label="One-time code">
          <button id="submit">Sign in</button>
        </form>
      </main>
    `;

    await importContentScript();
    const listener = mock.listener();

    const diagnostics = sendContentMessage(listener, {
      type: "skfiy.page.diagnostics",
      requestId: "sensitive-form"
    });

    expect(diagnostics.response).toMatchObject({
      session: {
        pageSafety: {
          state: "needs_confirmation"
        },
        pageControl: {
          capable: false,
          state: "needs_confirmation",
          reason: "Page safety requires confirmation before DOM actions.",
          nextAction: "confirm_sensitive_page",
          capabilities: {
            domActions: false,
            click: false,
            fill: false,
            submit: false,
            scroll: false
          },
          forms: {
            total: 3,
            fillable: 2,
            sensitive: 2
          },
          sensitiveForms: expect.arrayContaining([
            expect.objectContaining({
              id: "form-0",
              tag: "input",
              type: "password",
              label: "Password"
            }),
            expect.objectContaining({
              id: "form-1",
              tag: "input",
              label: "One-time code"
            })
          ])
        }
      }
    });
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

import { describe, expect, it } from "vitest";
import { createChromeCdpClient } from "./chrome-cdp-client";

describe("createChromeCdpClient", () => {
  it("sends CDP commands to the first page target", async () => {
    const sockets: FakeWebSocket[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      expect(String(url)).toBe("http://127.0.0.1:9444/json/list");
      return {
        ok: true,
        status: 200,
        async json() {
          return [
            {
              type: "page",
              webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/1"
            }
          ];
        }
      } as Response;
    };
    const WebSocketImpl = class extends FakeWebSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    };
    const client = createChromeCdpClient({
      endpoint: "http://127.0.0.1:9444",
      fetchImpl,
      WebSocketImpl: WebSocketImpl as unknown as typeof WebSocket
    });

    await expect(client.sendCdpCommand({
      method: "Page.navigate",
      params: { url: "file:///tmp/skfiy.html" }
    })).resolves.toEqual({ ok: true });

    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe("ws://127.0.0.1/devtools/page/1");
    expect(sockets[0].sentMessages).toEqual([
      JSON.stringify({
        id: 1,
        method: "Page.navigate",
        params: { url: "file:///tmp/skfiy.html" }
      })
    ]);
  });
});

class FakeWebSocket extends EventTarget {
  readonly sentMessages: string[] = [];

  constructor(readonly url: string) {
    super();
    queueMicrotask(() => {
      this.dispatchEvent(new Event("open"));
    });
  }

  send(message: string): void {
    this.sentMessages.push(message);
    queueMicrotask(() => {
      this.dispatchEvent(new MessageEvent("message", {
        data: JSON.stringify({
          id: 1,
          result: { ok: true }
        })
      }));
    });
  }

  close(): void {}
}

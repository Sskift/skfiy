import { describe, expect, it } from "vitest";
import { readChromeCdpEndpoint } from "./chrome-cdp-settings";

describe("readChromeCdpEndpoint", () => {
  it("prefers the packaged-app command line endpoint", () => {
    expect(readChromeCdpEndpoint({
      argv: [
        "skfiy",
        "--remote-debugging-port=9405",
        "--skfiy-chrome-cdp-endpoint=http://127.0.0.1:9444"
      ],
      env: {
        SKFIY_CHROME_CDP_ENDPOINT: "http://127.0.0.1:9222"
      }
    })).toBe("http://127.0.0.1:9444");
  });

  it("falls back to the environment endpoint", () => {
    expect(readChromeCdpEndpoint({
      argv: ["skfiy"],
      env: {
        SKFIY_CHROME_CDP_ENDPOINT: "http://127.0.0.1:9222"
      }
    })).toBe("http://127.0.0.1:9222");
  });
});

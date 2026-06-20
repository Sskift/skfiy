import { describe, expect, it } from "vitest";
import { createChromeHostPolicyStatePath } from "./chrome-host-policy";
import {
  applyApprovedChromeTaskHostPolicy,
  readChromeApprovalPolicyHost
} from "./chrome-approval-policy";
import type { CommandRoute } from "./task-routing";

describe("Chrome approval host policy", () => {
  function createMemoryChromeHostPolicyIo(files: Record<string, string> = {}) {
    const store = { ...files };

    return {
      files: store,
      exists: async (targetPath: string) => Object.hasOwn(store, targetPath),
      mkdir: async (targetPath: string) => {
        store[targetPath] = store[targetPath] ?? "__dir__";
      },
      readFile: async (targetPath: string) => store[targetPath],
      writeFile: async (targetPath: string, content: string) => {
        store[targetPath] = content;
      }
    };
  }

  const chromeRoute: CommandRoute = {
    kind: "chrome",
    bundleId: "com.google.Chrome"
  };

  it("extracts the normalized HTTP host from approved Chrome page commands", () => {
    expect(readChromeApprovalPolicyHost(
      "打开 Chrome 测试页面 https://Example.com:8443/docs 并提取正文"
    )).toBe("example.com:8443");
    expect(readChromeApprovalPolicyHost(
      "填写 Chrome 测试表单 https://Form.Example/path 字段 #name=skfiy 点击 #submit 并提取正文"
    )).toBe("form.example");
    expect(readChromeApprovalPolicyHost(
      "打开 Chrome 测试页面 file:///tmp/skfiy-chrome.html 并提取正文"
    )).toBeUndefined();
  });

  it("writes approved Chrome hosts as current-turn allow entries", async () => {
    const statePath = createChromeHostPolicyStatePath("/Users/tester");
    const io = createMemoryChromeHostPolicyIo();

    await expect(applyApprovedChromeTaskHostPolicy({
      command: "打开 Chrome 测试页面 https://Example.com/docs 并提取正文",
      route: chromeRoute,
      homeDir: "/Users/tester",
      io
    })).resolves.toMatchObject({
      status: "updated",
      host: "example.com",
      action: "allow_current_turn",
      state: {
        path: statePath,
        policy: {
          currentTurnAllowedHosts: ["example.com"]
        }
      }
    });

    expect(JSON.parse(io.files[statePath])).toEqual({
      schemaVersion: 1,
      policy: {
        defaultMode: "ask",
        allowedHosts: [],
        currentTurnAllowedHosts: ["example.com"],
        blockedHosts: []
      }
    });
  });

  it("does not downgrade an already always-allowed Chrome host", async () => {
    const statePath = createChromeHostPolicyStatePath("/Users/tester");
    const io = createMemoryChromeHostPolicyIo({
      [statePath]: JSON.stringify({
        schemaVersion: 1,
        policy: {
          defaultMode: "ask",
          allowedHosts: ["example.com"],
          currentTurnAllowedHosts: [],
          blockedHosts: []
        }
      })
    });

    await expect(applyApprovedChromeTaskHostPolicy({
      command: "打开 Chrome 测试页面 https://example.com/docs 并提取正文",
      route: chromeRoute,
      homeDir: "/Users/tester",
      io
    })).resolves.toEqual({
      status: "already_allowed",
      host: "example.com",
      scope: "always"
    });

    expect(JSON.parse(io.files[statePath]).policy).toMatchObject({
      allowedHosts: ["example.com"],
      currentTurnAllowedHosts: []
    });
  });

  it("does not let approval bypass blocked Chrome hosts", async () => {
    const statePath = createChromeHostPolicyStatePath("/Users/tester");
    const io = createMemoryChromeHostPolicyIo({
      [statePath]: JSON.stringify({
        schemaVersion: 1,
        policy: {
          defaultMode: "ask",
          allowedHosts: [],
          currentTurnAllowedHosts: [],
          blockedHosts: ["example.com"]
        }
      })
    });

    await expect(applyApprovedChromeTaskHostPolicy({
      command: "打开 Chrome 测试页面 https://example.com/docs 并提取正文",
      route: chromeRoute,
      homeDir: "/Users/tester",
      io
    })).resolves.toEqual({
      status: "blocked",
      host: "example.com",
      reason: "blocked_host"
    });
  });

  it("fails closed when the stored Chrome host policy is invalid", async () => {
    const statePath = createChromeHostPolicyStatePath("/Users/tester");
    const io = createMemoryChromeHostPolicyIo({
      [statePath]: "{"
    });

    await expect(applyApprovedChromeTaskHostPolicy({
      command: "打开 Chrome 测试页面 https://example.com/docs 并提取正文",
      route: chromeRoute,
      homeDir: "/Users/tester",
      io
    })).resolves.toEqual({
      status: "failed",
      host: "example.com",
      message: "Chrome host policy file is not valid JSON."
    });
    expect(io.files[statePath]).toBe("{");
  });

  it("skips non-Chrome routes and Chrome commands without an HTTP host", async () => {
    const io = createMemoryChromeHostPolicyIo();

    await expect(applyApprovedChromeTaskHostPolicy({
      command: "打开 Ghostty 执行 pwd 并截图",
      route: {
        kind: "ghostty",
        bundleId: "com.mitchellh.ghostty"
      },
      homeDir: "/Users/tester",
      io
    })).resolves.toEqual({
      status: "skipped",
      reason: "not_chrome_route"
    });

    await expect(applyApprovedChromeTaskHostPolicy({
      command: "观察 Chrome 当前页面并提取正文",
      route: chromeRoute,
      homeDir: "/Users/tester",
      io
    })).resolves.toEqual({
      status: "skipped",
      reason: "missing_http_host"
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  applyChromeHostPolicyAction,
  createChromeHostPolicyStatePath,
  createDefaultChromeHostPolicy,
  decideChromeBrowserDataExposure,
  decideChromeHostPolicy,
  normalizeChromeHostPolicy,
  readChromeHostPolicyState,
  resetChromeHostPolicyState,
  writeChromeHostPolicyState
} from "./chrome-host-policy";

describe("Chrome host policy", () => {
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
      },
      rm: async (targetPath: string) => {
        delete store[targetPath];
      }
    };
  }

  it("starts from ask-by-default and asks for hosts without an allow/block entry", () => {
    const policy = createDefaultChromeHostPolicy();

    expect(policy).toEqual({
      defaultMode: "ask",
      allowedHosts: [],
      currentTurnAllowedHosts: [],
      blockedHosts: []
    });
    expect(decideChromeHostPolicy(policy, "https://example.com/docs")).toEqual({
      decision: "ask",
      host: "example.com",
      reason: "default_ask"
    });
  });

  it("supports current-turn allow, always allow, and block with block taking priority", () => {
    let policy = createDefaultChromeHostPolicy();
    policy = applyChromeHostPolicyAction(policy, {
      action: "allow_current_turn",
      host: "Example.com"
    });
    policy = applyChromeHostPolicyAction(policy, {
      action: "always_allow",
      host: "docs.example.com"
    });

    expect(decideChromeHostPolicy(policy, "https://example.com/page")).toEqual({
      decision: "allow",
      host: "example.com",
      reason: "current_turn_allowed_host",
      scope: "current_turn"
    });
    expect(decideChromeHostPolicy(policy, "docs.example.com")).toEqual({
      decision: "allow",
      host: "docs.example.com",
      reason: "always_allowed_host",
      scope: "always"
    });

    const blockedPolicy = applyChromeHostPolicyAction(policy, {
      action: "block_host",
      host: "https://example.com/anything"
    });

    expect(blockedPolicy).toMatchObject({
      allowedHosts: ["docs.example.com"],
      currentTurnAllowedHosts: [],
      blockedHosts: ["example.com"]
    });
    expect(decideChromeHostPolicy(blockedPolicy, "example.com")).toEqual({
      decision: "block",
      host: "example.com",
      reason: "blocked_host"
    });
  });

  it("reads and writes the user-level Chrome host policy state", async () => {
    const statePath = createChromeHostPolicyStatePath("/Users/tester");
    const io = createMemoryChromeHostPolicyIo();

    await expect(readChromeHostPolicyState({
      homeDir: "/Users/tester",
      io
    })).resolves.toEqual({
      schemaVersion: 1,
      state: "default",
      path: statePath,
      policy: createDefaultChromeHostPolicy(),
      reason: "Chrome host policy has not been configured yet."
    });

    await expect(writeChromeHostPolicyState({
      homeDir: "/Users/tester",
      policy: {
        defaultMode: "ask",
        allowedHosts: ["Example.com", "bad host"],
        currentTurnAllowedHosts: ["https://Turn.Example/path"],
        blockedHosts: ["blocked.example"]
      },
      io
    })).resolves.toEqual({
      schemaVersion: 1,
      state: "configured",
      path: statePath,
      policy: {
        defaultMode: "ask",
        allowedHosts: ["example.com"],
        currentTurnAllowedHosts: ["turn.example"],
        blockedHosts: ["blocked.example"]
      }
    });
    expect(JSON.parse(io.files[statePath])).toEqual({
      schemaVersion: 1,
      policy: {
        defaultMode: "ask",
        allowedHosts: ["example.com"],
        currentTurnAllowedHosts: ["turn.example"],
        blockedHosts: ["blocked.example"]
      }
    });

    await expect(readChromeHostPolicyState({
      homeDir: "/Users/tester",
      io
    })).resolves.toMatchObject({
      schemaVersion: 1,
      state: "configured",
      path: statePath,
      policy: {
        allowedHosts: ["example.com"],
        currentTurnAllowedHosts: ["turn.example"],
        blockedHosts: ["blocked.example"]
      }
    });
  });

  it("resets the user-level Chrome host policy state back to the default file absence", async () => {
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

    await expect(resetChromeHostPolicyState({
      homeDir: "/Users/tester",
      io
    })).resolves.toEqual({
      schemaVersion: 1,
      state: "default",
      path: statePath,
      policy: createDefaultChromeHostPolicy(),
      reason: "Chrome host policy has been reset to the default ask mode."
    });
    expect(io.files[statePath]).toBeUndefined();
  });

  it("fails closed to ask-by-default when the host policy file is invalid", async () => {
    const statePath = createChromeHostPolicyStatePath("/Users/tester");
    const io = createMemoryChromeHostPolicyIo({
      [statePath]: "{"
    });

    await expect(readChromeHostPolicyState({
      homeDir: "/Users/tester",
      io
    })).resolves.toEqual({
      schemaVersion: 1,
      state: "invalid",
      path: statePath,
      policy: createDefaultChromeHostPolicy(),
      reason: "Chrome host policy file is not valid JSON."
    });
  });

  it("normalizes stored policy objects and drops malformed host entries", () => {
    expect(normalizeChromeHostPolicy({
      defaultMode: "allow",
      allowedHosts: ["Example.com", "bad host", "example.com"],
      currentTurnAllowedHosts: ["https://Turn.Example:8443/path"],
      blockedHosts: ["", "Blocked.Example"]
    })).toEqual({
      defaultMode: "ask",
      allowedHosts: ["example.com"],
      currentTurnAllowedHosts: ["turn.example:8443"],
      blockedHosts: ["blocked.example"]
    });
  });

  it("blocks browser history and download filename exposure without explicit confirmation", () => {
    expect(decideChromeBrowserDataExposure({
      exposure: "browser_history",
      confirmed: false
    })).toEqual({
      decision: "block",
      reason: "browser_history_exposure_requires_confirmation"
    });
    expect(decideChromeBrowserDataExposure({
      exposure: "download_filename"
    })).toEqual({
      decision: "block",
      reason: "download_filename_exposure_requires_confirmation"
    });
    expect(decideChromeBrowserDataExposure({
      exposure: "download_filename",
      confirmed: true
    })).toEqual({
      decision: "allow",
      reason: "explicitly_confirmed"
    });
  });
});

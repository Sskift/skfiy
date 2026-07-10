import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isChromePageControlSubcommand,
  normalizeChromePolicyHostForCli,
  normalizeCliCommand
} from "./cli-command-normalization";

describe("CLI command normalization", () => {
  it("keeps default smoke runs output-free unless an output path is explicit", () => {
    const result = normalizeCliCommand(["smoke", "dashboard", "--json"], {
      rootDir: "/repo"
    });

    expect(result).toEqual({
      ok: true,
      invocation: {
        kind: "smoke",
        path: "smoke dashboard",
        target: "dashboard",
        json: true,
        outputPath: "",
        options: {
          requirePassed: false,
          scriptPath: path.join("/repo", "scripts", "smoke-dashboard-product.mjs"),
          scriptArgs: []
        }
      }
    });
  });

  it("normalizes status paths and repeated extension ids", () => {
    const result = normalizeCliCommand([
      "status",
      "--extension-id",
      "one",
      "--extension-id",
      "two",
      "--cli",
      "dist/skfiy",
      "--dashboard-url",
      "http://127.0.0.1:3000"
    ], { rootDir: "/repo" });

    expect(result).toEqual({
      ok: true,
      invocation: {
        kind: "status",
        path: "status",
        json: false,
        options: {
          extensionIds: ["one", "two"],
          cliShimPath: path.join("/repo", "dist", "skfiy"),
          dashboardUrl: "http://127.0.0.1:3000"
        }
      }
    });
  });

  it("preserves Chrome page action validation errors", () => {
    expect(normalizeCliCommand(["chrome", "fill", "--text", "hello"])).toEqual({
      ok: false,
      error: {
        code: "missing-chrome-action-selector",
        message: "Chrome fill requires --selector <css>."
      }
    });
    expect(isChromePageControlSubcommand("observe")).toBe(true);
    expect(isChromePageControlSubcommand("status")).toBe(false);
  });

  it("normalizes Chrome policy hosts for dispatch", () => {
    expect(normalizeChromePolicyHostForCli("https://Example.com/path")).toBe("example.com");
    expect(normalizeChromePolicyHostForCli("   ")).toBeUndefined();
  });
});

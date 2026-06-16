import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("dogfood tester runner", () => {
  const modulePath = path.join(process.cwd(), "scripts", "run-dogfood-tester.mjs");
  const manifestPath = "/repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json";

  it("is exposed as an npm script for one-command real tester evidence collection", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "dogfood:tester": "node scripts/run-dogfood-tester.mjs"
    });
  });

  it("parses manifest, tester, workflow, artifact, and issue output arguments", async () => {
    const {
      createDefaultDogfoodTesterOptions,
      createDogfoodTesterHelpText,
      parseDogfoodTesterArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultDogfoodTesterOptions: (rootDir: string) => Record<string, unknown>;
      createDogfoodTesterHelpText: () => string;
      parseDogfoodTesterArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };
    const defaults = createDefaultDogfoodTesterOptions("/repo");

    expect(parseDogfoodTesterArgs([
      "--manifest",
      ".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json",
      "--tester-id",
      "tester-a",
      "--workflows",
      "coding-terminal,screenshot-inspection",
      "--artifacts-dir",
      ".skfiy-smoke/dogfood/tester-a",
      "--issue-output",
      ".skfiy-dogfood/issues/tester-a.md",
      "--summary",
      ".skfiy-dogfood/tester-a-summary.md",
      "--listen-ms",
      "1200",
      "--finder-target-dir",
      "~/Desktop/skfiy-finder-dogfood",
      "--chrome-current-page-endpoint",
      "http://127.0.0.1:9222",
      "--require-passed"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json"),
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      artifactsDir: path.resolve(".skfiy-smoke/dogfood/tester-a"),
      issueOutputPath: path.resolve(".skfiy-dogfood/issues/tester-a.md"),
      summaryPath: path.resolve(".skfiy-dogfood/tester-a-summary.md"),
      listenMs: 1200,
      finderTargetDir: path.join(os.homedir(), "Desktop/skfiy-finder-dogfood"),
      chromeCurrentPageEndpoint: "http://127.0.0.1:9222",
      requirePassed: true
    });
    expect(createDogfoodTesterHelpText()).toContain("dogfood:tester");
    expect(createDogfoodTesterHelpText()).toContain("packaged-app smokes sequentially");
    expect(createDogfoodTesterHelpText()).toContain("does not fabricate tester reports");
  });

  it("plans sequential packaged-app smokes and a checked dogfood issue draft", async () => {
    const { createDogfoodTesterPlan } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodTesterPlan: (input: Record<string, unknown>) => Record<string, unknown>;
    };

    const plan = createDogfoodTesterPlan({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      artifactsDir: "/repo/.skfiy-smoke/dogfood/tester-a",
      issueOutputPath: "/repo/.skfiy-dogfood/issues/tester-a.md",
      listenMs: 1200,
      requirePassed: false
    }) as {
      artifacts: Record<string, string>;
      issueOutputPath: string;
      commands: Array<{ id: string; command: string; args: string[] }>;
    };

    expect(plan.artifacts).toEqual({
      ui: "/repo/.skfiy-smoke/dogfood/tester-a/tester-a-ui.json",
      ghostty: "/repo/.skfiy-smoke/dogfood/tester-a/tester-a-ghostty.json",
      chrome: "/repo/.skfiy-smoke/dogfood/tester-a/tester-a-chrome.json",
      finder: "/repo/.skfiy-smoke/dogfood/tester-a/tester-a-finder.json",
      voice: "/repo/.skfiy-smoke/dogfood/tester-a/tester-a-voice.json"
    });
    expect(plan.commands.map((command) => command.id)).toEqual([
      "smoke:ui",
      "smoke:ghostty",
      "smoke:chrome",
      "smoke:finder",
      "smoke:voice",
      "dogfood:issue"
    ]);
    expect(plan.commands[1]).toMatchObject({
      command: "npm",
      args: [
        "run",
        "smoke:ghostty",
        "--",
        "--matrix",
        "--output",
        "/repo/.skfiy-smoke/dogfood/tester-a/tester-a-ghostty.json"
      ]
    });
    expect(plan.commands.at(-1)).toMatchObject({
      args: expect.arrayContaining([
        "dogfood:issue",
        "--manifest",
        manifestPath,
        "--tester-id",
        "tester-a",
        "--workflows",
        "coding-terminal,screenshot-inspection",
        "--check-report",
        "--ui-smoke-artifact",
        "/repo/.skfiy-smoke/dogfood/tester-a/tester-a-ui.json",
        "--voice-smoke-artifact",
        "/repo/.skfiy-smoke/dogfood/tester-a/tester-a-voice.json",
        "--output",
        "/repo/.skfiy-dogfood/issues/tester-a.md"
      ])
    });
  });

  it("runs planned commands, writes a local summary, and keeps blocked evidence explicit", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo();

    await expect(runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      artifactsDir: "/repo/.skfiy-smoke/dogfood/tester-a",
      issueOutputPath: "/repo/.skfiy-dogfood/issues/tester-a.md",
      summaryPath: "/repo/.skfiy-dogfood/tester-a-summary.md",
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "completed",
      issueOutputPath: "/repo/.skfiy-dogfood/issues/tester-a.md",
      commandResults: [
        { id: "smoke:ui", exitCode: 0 },
        { id: "smoke:ghostty", exitCode: 0 },
        { id: "smoke:chrome", exitCode: 0 },
        { id: "smoke:finder", exitCode: 0 },
        { id: "smoke:voice", exitCode: 0 },
        { id: "dogfood:issue", exitCode: 0 }
      ]
    });

    expect(io.commands.map((command) => command.args.slice(0, 2).join(" "))).toEqual([
      "run smoke:ui",
      "run smoke:ghostty",
      "run smoke:chrome",
      "run smoke:finder",
      "run smoke:voice",
      "run dogfood:issue"
    ]);
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "Result: completed"
    );
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "This runner did not file or accept a GitHub report."
    );
  });

  it("refuses to collect product evidence from tmux", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };

    await expect(runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal"],
      env: { TMUX: "/tmp/tmux" }
    }, createMemoryIo())).rejects.toThrow("dogfood:tester must not run from tmux");
  });
});

function createMemoryIo() {
  const commands: Array<{ command: string; args: string[]; options?: unknown }> = [];
  const textFiles: Record<string, string> = {};

  return {
    commands,
    textFiles,
    async mkdir() {},
    async writeText(filePath: string, text: string) {
      textFiles[filePath] = text;
    },
    async runCommand(command: string, args: string[], options?: unknown) {
      commands.push({ command, args, options });
      return {
        stdout: JSON.stringify({ result: args[1] === "smoke:voice" ? "blocked" : "passed" }),
        stderr: "",
        exitCode: 0
      };
    }
  };
}

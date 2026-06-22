import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("Ghostty product smoke script", () => {
  it("can set planner provider mode through the product preload API", async () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/smoke-ghostty-product.mjs"),
      "utf8"
    );
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");
    const {
      createDefaultSmokeOptions,
      formatLaunchCommand,
      parseSmokeArgs
    } = await import(pathToFileURL(modulePath).href) as {
      formatLaunchCommand: (options: Record<string, unknown>) => string;
      createDefaultSmokeOptions: (rootDir: string) => Record<string, unknown>;
      parseSmokeArgs: (argv: string[], defaults: Record<string, unknown>) => Record<string, unknown>;
    };
    const defaults = createDefaultSmokeOptions(process.cwd());

    expect(parseSmokeArgs(
      ["--planner-mode", "disabled"],
      defaults
    )).toMatchObject({
      plannerMode: "disabled"
    });
    expect(formatLaunchCommand(defaults)).toContain("--env SKFIY_BYPASS_APPROVAL=strict");
    expect(source).toContain("window.skfiy.setPlannerProviderSettings");
    expect(source).toContain("window.skfiy.getAppPolicySettings()");
    expect(source).toContain("acquireSmokeLock");
  });

  it("defines the Week 2 product-path task matrix as executable smoke runs", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      buildSmokeRunPlan,
      createDefaultSmokeOptions,
      createHelpText
    } = await import(pathToFileURL(modulePath).href) as {
      buildSmokeRunPlan: (options: Record<string, unknown>) => unknown;
      createDefaultSmokeOptions: (rootDir: string) => Record<string, unknown>;
      createHelpText: (defaults: Record<string, unknown>) => string;
    };
    const options = {
      ...createDefaultSmokeOptions(process.cwd()),
      matrix: true
    };

    expect(buildSmokeRunPlan(options)).toEqual([
      {
        id: "pwd-readonly",
        command: "打开 Ghostty 执行 pwd 并截图",
        expectedResults: ["passed", "blocked"]
      },
      {
        id: "date-readonly",
        command: "打开终端运行 date",
        expectedResults: ["passed", "blocked"]
      },
      {
        id: "mkdir-approval",
        command: "在 Ghostty 执行 mkdir skfiy-demo",
        expectedResults: ["needs-user-confirmation"]
      },
      {
        id: "clipboard-read-approval",
        command: "在 Ghostty 执行 pbpaste",
        expectedResults: ["needs-user-confirmation"]
      },
      {
        id: "clipboard-write-approval",
        command: "在 Ghostty 执行 echo skfiy | pbcopy",
        expectedResults: ["needs-user-confirmation"]
      },
      {
        id: "rm-rf-deny",
        command: "在 Ghostty 执行 rm -rf ~/Desktop",
        approvalAction: "deny",
        expectedResults: ["denied"]
      },
      {
        id: "chat-question-route-guard",
        command: "你是谁，能做什么",
        requiresComputerUseEvidence: false,
        expectedResults: ["answered-without-computer-use"]
      },
      {
        id: "unsupported-desktop-route-guard",
        command: "帮我整理一下桌面",
        requiresComputerUseEvidence: false,
        expectedResults: ["needs-user-confirmation"]
      }
    ]);
    expect(createHelpText(createDefaultSmokeOptions("/repo"))).toContain("route guards");
  });

  it("parses an output artifact path for persistent smoke evidence", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");
    const {
      createDefaultSmokeOptions,
      createHelpText,
      parseSmokeArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultSmokeOptions: (rootDir: string) => Record<string, unknown>;
      createHelpText: (defaults: Record<string, unknown>) => string;
      parseSmokeArgs: (argv: string[], defaults: Record<string, unknown>) => Record<string, unknown>;
    };
    const defaults = createDefaultSmokeOptions("/repo");

    expect(parseSmokeArgs(["--output", "artifacts/smoke.json"], defaults)).toMatchObject({
      outputPath: path.resolve("artifacts/smoke.json")
    });
    expect(createHelpText(defaults)).toContain("--output <path>");
  });

  it("writes persistent smoke evidence as formatted JSON and prepares its directory", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");
    const {
      writeSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      writeSmokeEvidence: (
        outputPath: string,
        evidence: Record<string, unknown>,
        io: {
          mkdir: (target: string, options: { recursive: boolean }) => Promise<void>;
          writeFile: (target: string, content: string) => Promise<void>;
        }
      ) => Promise<void>;
    };
    const calls: Array<{ name: string; target: string; content?: string }> = [];

    await writeSmokeEvidence("/tmp/skfiy/smoke/evidence.json", { result: "blocked" }, {
      async mkdir(target) {
        calls.push({ name: "mkdir", target });
      },
      async writeFile(target, content) {
        calls.push({ name: "writeFile", target, content });
      }
    });

    expect(calls).toEqual([
      { name: "mkdir", target: "/tmp/skfiy/smoke" },
      {
        name: "writeFile",
        target: "/tmp/skfiy/smoke/evidence.json",
        content: `${JSON.stringify({ result: "blocked" }, null, 2)}\n`
      }
    ]);
  });

  it("keeps the single-command product smoke path by default", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      buildSmokeRunPlan,
      createDefaultSmokeOptions
    } = await import(pathToFileURL(modulePath).href) as {
      buildSmokeRunPlan: (options: Record<string, unknown>) => unknown;
      createDefaultSmokeOptions: (rootDir: string) => Record<string, unknown>;
    };
    const options = createDefaultSmokeOptions(process.cwd());

    expect(buildSmokeRunPlan(options)).toEqual([
      {
        id: "single-command",
        command: "打开 Ghostty 执行 pwd 并截图",
        expectedResults: ["passed", "blocked", "needs-user-confirmation"]
      }
    ]);
  });

  it("classifies required Computer Use permission failures as blocked", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");
    const {
      classifySmokeResult
    } = await import(pathToFileURL(modulePath).href) as {
      classifySmokeResult: (
        events: Array<{ status: string; message?: string }>
      ) => string;
    };

    expect(classifySmokeResult([
      {
        status: "failed",
        message: "Computer Use permissions required: Screen Recording is denied."
      }
    ])).toBe("blocked");
    expect(classifySmokeResult([
      {
        status: "failed",
        message: "Computer Use permissions required: Accessibility is denied."
      }
    ])).toBe("blocked");
  });

  it("classifies locked or unavailable desktop sessions as blocked", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");
    const {
      classifySmokeResult
    } = await import(pathToFileURL(modulePath).href) as {
      classifySmokeResult: (
        events: Array<{ status: string; message?: string }>
      ) => string;
    };

    expect(classifySmokeResult([
      {
        status: "failed",
        message: "Desktop session is not controllable because loginwindow is frontmost. Unlock the Mac and keep the display awake, then try again."
      }
    ])).toBe("blocked");
  });

  it("collects blocked desktop preflight evidence before launching target apps", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-desktop-preflight.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      createDesktopSessionPreflightEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      createDesktopSessionPreflightEvidence: (options: {
        appPath: string;
        runner: (
          file: string,
          args: readonly string[]
        ) => Promise<{ stdout: string; stderr: string }>;
      }) => Promise<Record<string, unknown>>;
    };
    const calls: Array<{ file: string; args: readonly string[] }> = [];

    await expect(createDesktopSessionPreflightEvidence({
      appPath: "/Applications/skfiy.app",
      async runner(file, args) {
        calls.push({ file, args });
        return {
          stdout: JSON.stringify({
            ok: true,
            command: "desktop-session-status",
            data: {
              frontmostBundleId: "com.apple.loginwindow",
              frontmostLocalizedName: "loginwindow",
              frontmostProcessIdentifier: 88,
              mainDisplayAsleep: true,
              controllable: false
            }
          }),
          stderr: ""
        };
      }
    })).resolves.toMatchObject({
      result: "blocked",
      helperPath: "/Applications/skfiy.app/Contents/MacOS/skfiy-helper",
      frontmost: {
        bundleId: "com.apple.loginwindow",
        localizedName: "loginwindow",
        processIdentifier: 88
      },
      display: {
        mainDisplayAsleep: true
      },
      reason: "Main display is asleep before target app launch and frontmostBundleId=com.apple.loginwindow frontmostProcessIdentifier=88. Wake and unlock the Mac, then retry."
    });
    expect(calls).toEqual([
      {
        file: "/Applications/skfiy.app/Contents/MacOS/skfiy-helper",
        args: ["desktop-session-status"]
      }
    ]);
  });

  it("lets desktop preflight block Ghostty smoke classification", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");
    const {
      classifySmokeRunEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifySmokeRunEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifySmokeRunEvidence({
      desktopPreflight: {
        result: "blocked",
        reason: "Desktop session is not controllable because loginwindow is frontmost."
      },
      events: []
    })).toBe("blocked");
  });

  it("requires product-path screenshot and action verification evidence before classifying a completed run as passed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");
    const {
      classifySmokeRunEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifySmokeRunEvidence: (input: {
        events: Array<{ status: string; message?: string }>;
        screenshots?: Array<{ stage: string; exists: boolean; nonEmpty: boolean; bytes?: number }>;
        runnerHasTmux?: boolean;
        appLaunchViaOpen?: boolean;
        productPath?: string;
      }) => string;
    };
    const completedEvents = [{ status: "completed", message: "Command submitted to Ghostty." }];
    const verifiedEvents = [
      { status: "executing", message: "Verified type_text: type_text helper result accepted." },
      { status: "executing", message: "Verified press_key: press_key helper result accepted." },
      { status: "completed", message: "Command submitted to Ghostty." }
    ];

    expect(classifySmokeRunEvidence({
      events: completedEvents,
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper -> Ghostty",
      screenshots: []
    })).toBe("failed");
    expect(classifySmokeRunEvidence({
      events: completedEvents,
      appLaunchViaOpen: true,
      runnerHasTmux: true,
      productPath: "renderer -> preload -> main -> helper -> Ghostty",
      screenshots: [
        { stage: "before", exists: true, nonEmpty: true, bytes: 2048 },
        { stage: "after", exists: true, nonEmpty: true, bytes: 4096 }
      ]
    })).toBe("failed");
    expect(classifySmokeRunEvidence({
      events: completedEvents,
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper -> Ghostty",
      screenshots: [
        { stage: "before", exists: true, nonEmpty: true, bytes: 2048 },
        { stage: "after", exists: true, nonEmpty: true, bytes: 4096 }
      ]
    })).toBe("failed");
    expect(classifySmokeRunEvidence({
      events: verifiedEvents,
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> helper -> Ghostty",
      screenshots: [
        { stage: "before", exists: true, nonEmpty: true, bytes: 2048 },
        { stage: "after", exists: true, nonEmpty: true, bytes: 4096 }
      ]
    })).toBe("passed");
  });

  it("classifies completed non-Computer-Use route guards without requiring screenshots", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");
    const {
      classifySmokeRunEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifySmokeRunEvidence: (input: {
        events: Array<{ status: string; message?: string }>;
        requiresComputerUseEvidence?: boolean;
      }) => string;
    };

    expect(classifySmokeRunEvidence({
      requiresComputerUseEvidence: false,
      events: [
        {
          status: "completed",
          message: "我是 skfiy，可以把明确的桌面意图转成受控的 Computer Use 操作。"
        }
      ]
    })).toBe("answered-without-computer-use");
  });
});

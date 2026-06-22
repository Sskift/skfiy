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
      "--app",
      "/Applications/skfiy.app",
      "--finder-target-dir",
      "~/Desktop/skfiy-finder-dogfood",
      "--chrome-current-page-endpoint",
      "http://127.0.0.1:9222",
      "--tracking-issue-url",
      "https://github.com/Sskift/skfiy/issues/1",
      "--file-issue",
      "--require-passed",
      "--allow-synthetic-tester-id"
    ], defaults)).toMatchObject({
      manifestPath: path.resolve(".skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json"),
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      artifactsDir: path.resolve(".skfiy-smoke/dogfood/tester-a"),
      issueOutputPath: path.resolve(".skfiy-dogfood/issues/tester-a.md"),
      summaryPath: path.resolve(".skfiy-dogfood/tester-a-summary.md"),
      appPath: "/Applications/skfiy.app",
      finderTargetDir: path.join(os.homedir(), "Desktop/skfiy-finder-dogfood"),
      chromeCurrentPageEndpoint: "http://127.0.0.1:9222",
      trackingIssueUrl: "https://github.com/Sskift/skfiy/issues/1",
      fileIssue: true,
      requirePassed: true,
      allowSyntheticTesterId: true
    });
    expect(createDogfoodTesterHelpText()).toContain("dogfood:tester");
    expect(createDogfoodTesterHelpText()).toContain("packaged-app smokes sequentially");
    expect(createDogfoodTesterHelpText()).toContain("does not fabricate tester reports");
    expect(createDogfoodTesterHelpText()).toContain("By default it does not file GitHub issues");
    expect(createDogfoodTesterHelpText()).toContain("app bundle identity preflight");
    expect(createDogfoodTesterHelpText()).toContain("Computer Use permission preflight");
    expect(createDogfoodTesterHelpText()).toContain("--file-issue");
    expect(createDogfoodTesterHelpText()).toContain("--tracking-issue-url");
    expect(createDogfoodTesterHelpText()).toContain("Reserved tester id prefixes");
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
      appPath: "/Applications/skfiy.app",
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
      finder: "/repo/.skfiy-smoke/dogfood/tester-a/tester-a-finder.json"
    });
    expect(plan.commands.map((command) => command.id)).toEqual([
      "smoke:ui",
      "smoke:ghostty",
      "smoke:chrome",
      "smoke:finder",
      "dogfood:issue"
    ]);
    expect(plan.commands.slice(0, 4).every((command) =>
      command.args.includes("--app") && command.args.includes("/Applications/skfiy.app")
    )).toBe(true);
    expect(plan.commands[1]).toMatchObject({
      command: "npm",
      args: [
        "run",
        "smoke:ghostty",
        "--",
        "--app",
        "/Applications/skfiy.app",
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
        "--output",
        "/repo/.skfiy-dogfood/issues/tester-a.md"
      ])
    });
  });

  it("defaults to an explicit dist app bundle for product smokes", async () => {
    const { createDogfoodTesterPlan } = await import(pathToFileURL(modulePath).href) as {
      createDogfoodTesterPlan: (input: Record<string, unknown>) => Record<string, unknown>;
    };

    const plan = createDogfoodTesterPlan({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal"]
    }) as {
      appPath: string;
      commands: Array<{ id: string; command: string; args: string[] }>;
    };

    expect(plan.appPath).toBe("/repo/dist/skfiy.app");
    expect(plan.commands.slice(0, 4).every((command) =>
      command.args.includes("--app") && command.args.includes("/repo/dist/skfiy.app")
    )).toBe(true);
  });

  it("rejects a mismatched app bundle identity before running product smokes", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = {
      ...createMemoryIo(),
      async readText(filePath: string) {
        if (filePath !== "/Applications/Wrong.app/Contents/Info.plist") {
          throw new Error(`Unexpected read: ${filePath}`);
        }
        return [
          "<plist>",
          "<dict>",
          "<key>CFBundleIdentifier</key><string>com.example.wrong</string>",
          "<key>CFBundleName</key><string>Wrong</string>",
          "<key>CFBundleDisplayName</key><string>Wrong</string>",
          "<key>CFBundleExecutable</key><string>Wrong</string>",
          "</dict>",
          "</plist>"
        ].join("\n");
      }
    };

    await expect(runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      appPath: "/Applications/Wrong.app",
      summaryPath: "/repo/.skfiy-dogfood/tester-a-summary.md",
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).rejects.toThrow(
      "dogfood:tester app bundle preflight failed before product smokes"
    );

    expect(io.commands).toEqual([]);
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "Result: failed"
    );
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "## App Bundle Preflight"
    );
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "CFBundleIdentifier: com.example.wrong"
    );
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "expected com.sskift.skfiy"
    );
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
        { id: "dogfood:issue", exitCode: 0 }
      ]
    });

    expect(io.commands.map((command) => command.args.slice(0, 2).join(" "))).toEqual([
      "run smoke:ui",
      "run smoke:ghostty",
      "run smoke:chrome",
      "run smoke:finder",
      "run dogfood:issue"
    ]);
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "Result: completed"
    );
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "This runner did not file or accept a GitHub report."
    );
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "gh issue create --repo Sskift/skfiy --title \"skfiy dogfood report: tester-a\" --body-file /repo/.skfiy-dogfood/issues/tester-a.md"
    );
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "Do not add `dogfood:accepted` or `workflow:*` labels yourself."
    );
  });

  it("summarizes smoke results, product paths, and permission states in the tester summary", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      "smoke:ui": {
        stdout: JSON.stringify({
          result: "no-onboarding",
          productPath: "LaunchServices -> renderer DOM -> React permission onboarding",
          permissions: {
            screenRecording: { state: "granted" },
            accessibility: { state: "granted" }
          }
        })
      },
      "smoke:ghostty": {
        stdout: JSON.stringify({
          result: "blocked",
          productPath: "renderer -> preload -> main -> helper -> Ghostty",
          permissions: {
            screenRecording: { state: "denied" },
            accessibility: { state: "granted" }
          }
        })
      },
      "smoke:chrome": {
        stdout: [
          "> skfiy@0.1.0 smoke:chrome",
          "> node scripts/smoke-chrome-product.mjs",
          JSON.stringify({
            result: "passed",
            productPath: "renderer -> preload -> main -> CDP -> Chrome",
            permissions: {
              screenRecording: { state: "granted" }
            }
          }, null, 2)
        ].join("\n")
      }
    });

    await runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      artifactsDir: "/repo/.skfiy-smoke/dogfood/tester-a",
      issueOutputPath: "/repo/.skfiy-dogfood/issues/tester-a.md",
      summaryPath: "/repo/.skfiy-dogfood/tester-a-summary.md",
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    const summary = io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"];
    expect(summary).toContain("## Smoke Results");
    expect(summary).toContain("| smoke:ui | no-onboarding | LaunchServices -> renderer DOM -> React permission onboarding | screenRecording=granted, accessibility=granted |");
    expect(summary).toContain("| smoke:ghostty | blocked | renderer -> preload -> main -> helper -> Ghostty | screenRecording=denied, accessibility=granted |");
    expect(summary).toContain("| smoke:chrome | passed | renderer -> preload -> main -> CDP -> Chrome | screenRecording=granted |");
  });

  it("adds a Computer Use scorecard from smoke event logs to the tester summary", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      "smoke:ghostty": {
        stdout: JSON.stringify({
          result: "blocked",
          productPath: "renderer -> preload -> main -> helper -> Ghostty",
          events: [
            { status: "executing", message: "Risk medium: create a file." },
            { status: "approval_required", message: "Approval required." }
          ]
        })
      },
      "smoke:chrome": {
        stdout: JSON.stringify({
          result: "passed",
          productPath: "renderer -> preload -> main -> CDP -> Chrome",
          events: [
            { status: "observing", message: "Captured page text." },
            { status: "completed", message: "Chrome task completed." }
          ]
        })
      },
      "smoke:finder": {
        stdout: JSON.stringify({
          result: "blocked",
          productPath: "renderer -> preload -> main -> helper -> Finder",
          permissions: {
            screenRecording: { state: "denied" },
            accessibility: { state: "granted" }
          },
          events: [
            { status: "failed", message: "Screen Recording permission is required." }
          ]
        })
      }
    });

    await runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      artifactsDir: "/repo/.skfiy-smoke/dogfood/tester-a",
      issueOutputPath: "/repo/.skfiy-dogfood/issues/tester-a.md",
      summaryPath: "/repo/.skfiy-dogfood/tester-a-summary.md",
      now: () => "2026-06-16T12:00:00.000Z"
    }, io);

    const summary = io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"];
    expect(summary).toContain("## Computer Use Scorecard");
    expect(summary).toContain("| total runs | 3 |");
    expect(summary).toContain("| successful runs | 1 |");
    expect(summary).toContain("| task success rate | 33.3% |");
    expect(summary).toContain("| manual interventions | 1 |");
    expect(summary).toContain("| average steps | 1.67 |");
    expect(summary).toContain("| unsafe action blocks | 1 |");
    expect(summary).toContain("| permission failures | 1 |");
  });

  it("optionally files the generated report issue without accepting it", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      "create": {
        stdout: "https://github.com/Sskift/skfiy/issues/211\n",
        exitCode: 0
      }
    });

    await expect(runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      issueOutputPath: "/repo/.skfiy-dogfood/issues/tester-a.md",
      summaryPath: "/repo/.skfiy-dogfood/tester-a-summary.md",
      trackingIssueUrl: "https://github.com/Sskift/skfiy/issues/1",
      fileIssue: true,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "completed",
      filedIssue: {
        issueUrl: "https://github.com/Sskift/skfiy/issues/211"
      }
    });

    expect(io.commands.at(-1)).toMatchObject({
      command: "gh",
      args: [
        "issue",
        "create",
        "--repo",
        "Sskift/skfiy",
        "--title",
        "skfiy dogfood report: tester-a",
        "--body-file",
        "/repo/.skfiy-dogfood/issues/tester-a.md"
      ]
    });
    expect(io.commands.at(-1)?.args).not.toContain("--label");
    const summary = io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"];
    expect(summary).toContain(
      "Filed GitHub report: https://github.com/Sskift/skfiy/issues/211"
    );
    expect(summary).toContain(
      "Maintainer review command:"
    );
    expect(summary).toContain(
      "npm run dogfood:review -- --manifest /repo/.skfiy-alpha/skfiy-0.1.0-abc123-macos-unsigned.json --issue-url https://github.com/Sskift/skfiy/issues/211 --tracking-issue-url https://github.com/Sskift/skfiy/issues/1 --summary /repo/.skfiy-dogfood/reviews/tester-a.md"
    );
    expect(summary).not.toContain(
      "gh issue create --repo Sskift/skfiy --title \"skfiy dogfood report: tester-a\""
    );
    expect(summary).toContain(
      "This runner did not accept the report, add labels, edit the tracking issue, or count it toward the cohort."
    );
  });

  it("stops after UI preflight when strict passed evidence is missing required permissions", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      "smoke:ui": {
        stdout: JSON.stringify({
          result: "passed",
          permissions: {
            screenRecording: { state: "denied" },
            accessibility: { state: "granted" }
          }
        }),
        exitCode: 0
      }
    });

    await expect(runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      artifactsDir: "/repo/.skfiy-smoke/dogfood/tester-a",
      issueOutputPath: "/repo/.skfiy-dogfood/issues/tester-a.md",
      summaryPath: "/repo/.skfiy-dogfood/tester-a-summary.md",
      requirePassed: true,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).rejects.toThrow(
      "dogfood:tester permission preflight failed before strict passed smokes"
    );

    expect(io.commands.map((command) => command.args.slice(0, 2).join(" "))).toEqual([
      "run smoke:ui"
    ]);
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "Result: failed"
    );
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "screenRecording: denied"
    );
  });

  it("only blocks strict passed evidence on Computer Use permission state", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      "smoke:ui": {
        stdout: JSON.stringify({
          result: "passed",
          permissions: {
            screenRecording: { state: "granted" },
            accessibility: { state: "granted" }
          }
        }),
        exitCode: 0
      }
    });

    await expect(runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      artifactsDir: "/repo/.skfiy-smoke/dogfood/tester-a",
      issueOutputPath: "/repo/.skfiy-dogfood/issues/tester-a.md",
      summaryPath: "/repo/.skfiy-dogfood/tester-a-summary.md",
      requirePassed: true,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).resolves.toMatchObject({
      result: "completed"
    });

    expect(io.commands.map((command) => command.args.slice(0, 2).join(" "))).toEqual([
      "run smoke:ui",
      "run smoke:ghostty",
      "run smoke:chrome",
      "run smoke:finder",
      "run dogfood:issue"
    ]);
  });

  it("stops strict passed evidence after UI smoke when the desktop session is locked", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      "smoke:ui": {
        stdout: JSON.stringify({
          result: "no-onboarding",
          permissions: {
            screenRecording: { state: "granted" },
            accessibility: { state: "granted" }
          },
          desktopSessionDiagnostics: {
            state: "blocked",
            reason: "Desktop console is locked (IOConsoleLocked=true, CGSessionScreenIsLocked=true) and loginwindow is active (pid 591).",
            status: {
              frontmostBundleId: "com.apple.loginwindow",
              frontmostProcessIdentifier: 591,
              ioConsoleLocked: true,
              cgSessionScreenIsLocked: true,
              mainDisplayAsleep: true
            }
          }
        }),
        exitCode: 0
      }
    });

    await expect(runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal", "screenshot-inspection"],
      artifactsDir: "/repo/.skfiy-smoke/dogfood/tester-a",
      issueOutputPath: "/repo/.skfiy-dogfood/issues/tester-a.md",
      summaryPath: "/repo/.skfiy-dogfood/tester-a-summary.md",
      requirePassed: true,
      now: () => "2026-06-16T12:00:00.000Z"
    }, io)).rejects.toThrow(
      "dogfood:tester desktop session preflight failed before strict passed smokes"
    );

    expect(io.commands.map((command) => command.args.slice(0, 2).join(" "))).toEqual([
      "run smoke:ui"
    ]);
    const summary = io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"];
    expect(summary).toContain("## Desktop Session Preflight");
    expect(summary).toContain("Result: failed");
    expect(summary).toContain("frontmostBundleId: com.apple.loginwindow");
    expect(summary).toContain("frontmostProcessIdentifier: 591");
    expect(summary).toContain("ioConsoleLocked: true");
    expect(summary).toContain("cgSessionScreenIsLocked: true");
    expect(summary).toContain("mainDisplayAsleep: true");
    expect(summary).toContain("Desktop console is locked");
  });

  it("records a passed app bundle preflight when strict permission preflight fails", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = {
      ...createMemoryIo({
        "smoke:ui": {
          stdout: JSON.stringify({
            result: "passed",
            permissions: {
              screenRecording: { state: "denied" },
              accessibility: { state: "granted" }
            }
          }),
          exitCode: 0
        }
      }),
      async readText() {
        return [
          "<plist>",
          "<dict>",
          "<key>CFBundleIdentifier</key><string>com.sskift.skfiy</string>",
          "<key>CFBundleName</key><string>skfiy</string>",
          "<key>CFBundleDisplayName</key><string>skfiy</string>",
          "<key>CFBundleExecutable</key><string>skfiy</string>",
          "</dict>",
          "</plist>"
        ].join("\n");
      }
    };

    await expect(runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal"],
      appPath: "/Applications/skfiy.app",
      summaryPath: "/repo/.skfiy-dogfood/tester-a-summary.md",
      requirePassed: true
    }, io)).rejects.toThrow("permission preflight failed");

    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "## App Bundle Preflight"
    );
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "Result: passed"
    );
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "App: /Applications/skfiy.app"
    );
  });

  it("rejects an app bundle with an invalid code signature before running product smokes", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo();
    io.preflightCommandOverrides["codesign --verify --deep --strict --verbose=2 /Applications/skfiy.app"] = {
      stderr: "code object is not signed at all",
      exitCode: 1
    };

    await expect(runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal"],
      appPath: "/Applications/skfiy.app",
      summaryPath: "/repo/.skfiy-dogfood/tester-a-summary.md"
    }, io)).rejects.toThrow(
      "dogfood:tester app bundle preflight failed before product smokes"
    );

    expect(io.preflightCommands).toContainEqual({
      command: "codesign",
      args: ["--verify", "--deep", "--strict", "--verbose=2", "/Applications/skfiy.app"]
    });
    expect(io.commands).toEqual([]);
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "codesign.verify: code object is not signed at all"
    );
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "expected codesign --verify --deep --strict exits 0"
    );
  });

  it("parses npm-wrapped UI smoke stdout for the strict permission preflight", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      "smoke:ui": {
        stdout: [
          "",
          "> skfiy@0.1.0 smoke:ui",
          "> node scripts/smoke-ui-product.mjs",
          "",
          JSON.stringify({
            result: "passed",
            permissions: {
              screenRecording: { state: "denied" },
              accessibility: { state: "denied" }
            }
          }, null, 2)
        ].join("\n"),
        exitCode: 0
      }
    });

    await expect(runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "tester-a",
      workflows: ["coding-terminal"],
      summaryPath: "/repo/.skfiy-dogfood/tester-a-summary.md",
      requirePassed: true
    }, io)).rejects.toThrow("screenRecording=denied");

    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "screenRecording: denied"
    );
    expect(io.textFiles["/repo/.skfiy-dogfood/tester-a-summary.md"]).toContain(
      "accessibility: denied"
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

  it("rejects reserved synthetic tester id prefixes before collecting local artifacts", async () => {
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
      testerId: "Local-smoke",
      workflows: ["coding-terminal"]
    }, io)).rejects.toThrow("Reserved dogfood tester id prefix");

    expect(io.commands).toEqual([]);
    expect(io.textFiles).toEqual({});
  });

  it("allows reserved tester id prefixes only for explicit maintainer preflight runs", async () => {
    const { runDogfoodTester } = await import(pathToFileURL(modulePath).href) as {
      runDogfoodTester: (
        input: Record<string, unknown>,
        io?: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
    const io = createMemoryIo({
      "smoke:ui": {
        stdout: JSON.stringify({
          result: "passed",
          permissions: {
            screenRecording: { state: "denied" },
            accessibility: { state: "denied" }
          }
        }),
        exitCode: 0
      }
    });

    await expect(runDogfoodTester({
      rootDir: "/repo",
      manifestPath,
      testerId: "preflight-abc123",
      workflows: ["coding-terminal"],
      requirePassed: true,
      allowSyntheticTesterId: true,
      summaryPath: "/repo/.skfiy-dogfood/preflight-abc123-summary.md"
    }, io)).rejects.toThrow("permission preflight failed");

    expect(io.commands.map((command) => command.args.slice(0, 2).join(" "))).toEqual([
      "run smoke:ui"
    ]);
    expect(io.textFiles["/repo/.skfiy-dogfood/preflight-abc123-summary.md"]).toContain(
      "Tester: preflight-abc123"
    );
  });
});

function createMemoryIo(
  commandOverrides: Record<string, { stdout?: string; stderr?: string; exitCode?: number }> = {}
) {
  const commands: Array<{ command: string; args: string[]; options?: unknown }> = [];
  const preflightCommands: Array<{ command: string; args: string[] }> = [];
  const preflightCommandOverrides: Record<
    string,
    { stdout?: string; stderr?: string; exitCode?: number }
  > = {};
  const textFiles: Record<string, string> = {};

  return {
    commands,
    preflightCommands,
    preflightCommandOverrides,
    textFiles,
    async mkdir() {},
    async writeText(filePath: string, text: string) {
      textFiles[filePath] = text;
    },
    async readText() {
      return [
        "<plist>",
        "<dict>",
        "<key>CFBundleIdentifier</key><string>com.sskift.skfiy</string>",
        "<key>CFBundleName</key><string>skfiy</string>",
        "<key>CFBundleDisplayName</key><string>skfiy</string>",
        "<key>CFBundleExecutable</key><string>skfiy</string>",
        "</dict>",
        "</plist>"
      ].join("\n");
    },
    async runPreflightCommand(command: string, args: string[]) {
      preflightCommands.push({ command, args });
      const override = preflightCommandOverrides[[command, ...args].join(" ")];
      if (override) {
        return {
          stdout: override.stdout ?? "",
          stderr: override.stderr ?? "",
          exitCode: override.exitCode ?? 0
        };
      }
      if (command === "codesign" && args[0] === "-dr") {
        return {
          stdout: "",
          stderr: 'Executable=/Applications/skfiy.app/Contents/MacOS/skfiy\ndesignated => identifier "com.sskift.skfiy"',
          exitCode: 0
        };
      }
      return {
        stdout: "",
        stderr: "",
        exitCode: 0
      };
    },
    async runCommand(command: string, args: string[], options?: unknown) {
      commands.push({ command, args, options });
      const override = commandOverrides[String(args[1])];
      if (override) {
        return {
          stdout: override.stdout ?? "",
          stderr: override.stderr ?? "",
          exitCode: override.exitCode ?? 0
        };
      }
      return {
        stdout: JSON.stringify({ result: "passed" }),
        stderr: "",
        exitCode: 0
      };
    }
  };
}

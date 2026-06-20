import zlib from "node:zlib";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("desktop session preflight script", () => {
  it("marks permission reads as direct-helper scoped", async () => {
    const {
      runDesktopSessionPreflight
    } = await importPreflightScript();
    const screenshotPath = "/tmp/skfiy-session.png";

    const evidence = await runDesktopSessionPreflight({
      appPath: "/repo/dist/skfiy.app",
      helperPath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy-helper",
      outputPath: "/repo/.skfiy-smoke/session.json",
      screenshotOutputPath: screenshotPath
    }, {
      exists() {
        return true;
      },
      async mkdir() {},
      async execFile(_file: string, args: string[]) {
        switch (args[0]) {
          case "permissions-status":
            return {
              stdout: JSON.stringify({
                ok: true,
                command: "permissions-status",
                data: {
                  screenRecording: { status: "authorized", granted: true },
                  accessibility: { status: "authorized", granted: true },
                  microphone: { status: "authorized", granted: true },
                  speechRecognition: { status: "notDetermined", granted: false }
                }
              }),
              stderr: ""
            };
          case "desktop-session-status":
            return {
              stdout: JSON.stringify({
                ok: true,
                command: "desktop-session-status",
                data: {
                  controllable: true,
                  frontmostBundleId: "com.openai.codex",
                  frontmostLocalizedName: "Codex",
                  frontmostProcessIdentifier: 4744,
                  mainDisplayAsleep: false
                }
              }),
              stderr: ""
            };
          case "screenshot":
            return {
              stdout: JSON.stringify({
                ok: true,
                command: "screenshot",
                data: { output: screenshotPath }
              }),
              stderr: ""
            };
          default:
            throw new Error(`unexpected helper command: ${args[0]}`);
        }
      },
      async stat() {
        return { size: 1200 };
      },
      async readFile() {
        return createPng({
          width: 1,
          height: 1,
          rgba: [[255, 255, 255, 255]]
        });
      }
    });

    expect(evidence).toMatchObject({
      permissionProbe: {
        scope: "direct-helper",
        speechRecognitionStatusSource: "direct-helper",
        appScopedSpeechRecognitionStatusSource: "smoke:ui permissionDiagnostics.active",
        defaultExternalDoubaoRequiredPermissions: ["screenRecording", "accessibility"],
        nonAuthoritativeForAppScopedPermissionChecks: ["speechRecognition"]
      },
      permissionInterpretation: {
        defaultExternalDoubaoReady: true,
        blockers: [],
        nonAuthoritative: [
          {
            permission: "speechRecognition",
            status: "notDetermined",
            reason: "Direct helper Speech Recognition status can differ from app-scoped status; use smoke:ui permissionDiagnostics.active for app-scoped speech evidence."
          }
        ]
      },
      result: "passed"
    });
  });

  it("creates generic desktop app capability readiness for smoke evidence", async () => {
    const {
      createGenericDesktopCapabilityReadiness
    } = await importSmokePreflightScript();

    const readiness = createGenericDesktopCapabilityReadiness({
      permissions: {
        screenRecording: { state: "granted" },
        accessibility: { state: "denied" }
      },
      desktopSession: {
        controllable: false,
        frontmostBundleId: "com.apple.loginwindow",
        frontmostProcessIdentifier: 591
      }
    });

    expect(readiness).toMatchObject({
      target: "generic-desktop-app",
      status: "blocked"
    });
    expect(readiness.capabilities).toHaveLength(5);
    expect(readiness.capabilities[0]).toMatchObject({
      id: "observe_screenshot",
      status: "blocked",
      blockers: [
        {
          type: "desktop_session",
          reason: "loginwindow"
        }
      ]
    });
    expect(readiness.capabilities[1]).toMatchObject({
      id: "observe_accessibility",
      status: "blocked",
      blockers: [
        {
          type: "desktop_session",
          reason: "loginwindow"
        },
        {
          type: "permission",
          permission: "accessibility",
          state: "denied"
        }
      ]
    });
  });

  it("classifies loginwindow as blocked even when a screenshot exists", async () => {
    const {
      classifyDesktopSessionPreflightEvidence,
      explainDesktopSessionPreflightEvidence
    } = await importPreflightScript();

    const evidence = {
      activeApp: { bundleId: "com.apple.loginwindow", pid: 591 },
      desktopSessionStatus: { mainDisplayAsleep: true },
      screenshot: {
        exists: true,
        bytes: 1200,
        png: { isLikelyBlack: false }
      }
    };

    expect(classifyDesktopSessionPreflightEvidence(evidence)).toBe("blocked");
    expect(explainDesktopSessionPreflightEvidence(evidence)).toBe(
      "Main display is asleep and loginwindow is active (pid 591). Wake and unlock the Mac, then retry."
    );
  });

  it("classifies a console-locked session as blocked even when frontmost app is visible", async () => {
    const {
      classifyDesktopSessionPreflightEvidence,
      explainDesktopSessionPreflightEvidence
    } = await importPreflightScript();

    const evidence = {
      activeApp: { bundleId: "com.openai.codex", name: "Codex", pid: 4744 },
      desktopSessionStatus: {
        frontmostBundleId: "com.openai.codex",
        frontmostLocalizedName: "Codex",
        frontmostProcessIdentifier: 4744,
        mainDisplayAsleep: false,
        ioConsoleLocked: true,
        cgSessionScreenIsLocked: true
      },
      display: { mainDisplayAsleep: false },
      screenshot: {
        exists: true,
        bytes: 1200,
        png: { isLikelyBlack: false }
      }
    };

    expect(classifyDesktopSessionPreflightEvidence(evidence)).toBe("blocked");
    expect(explainDesktopSessionPreflightEvidence(evidence)).toBe(
      "Desktop console is locked. Unlock the Mac and keep the display awake, then retry."
    );
  });

  it("classifies an all-black screenshot as blocked", async () => {
    const {
      analyzePngImage,
      classifyDesktopSessionPreflightEvidence
    } = await importPreflightScript();
    const analysis = analyzePngImage(createPng({
      width: 2,
      height: 1,
      rgba: [
        [0, 0, 0, 255],
        [0, 0, 0, 255]
      ]
    }));

    expect(analysis).toMatchObject({
      width: 2,
      height: 1,
      isLikelyBlack: true,
      nonBlackCount: 0
    });
    expect(classifyDesktopSessionPreflightEvidence({
      activeApp: { bundleId: "com.openai.codex", pid: 4744 },
      screenshot: {
        exists: true,
        bytes: 1200,
        png: analysis
      }
    })).toBe("blocked");
  });

  it("passes a non-black screenshot when loginwindow is not active", async () => {
    const {
      analyzePngImage,
      classifyDesktopSessionPreflightEvidence
    } = await importPreflightScript();
    const analysis = analyzePngImage(createPng({
      width: 2,
      height: 1,
      rgba: [
        [0, 0, 0, 255],
        [255, 255, 255, 255]
      ]
    }));

    expect(analysis.isLikelyBlack).toBe(false);
    expect(classifyDesktopSessionPreflightEvidence({
      activeApp: { bundleId: "com.openai.codex", pid: 4744 },
      screenshot: {
        exists: true,
        bytes: 1200,
        png: analysis
      }
    })).toBe("passed");
  });
});

async function importPreflightScript() {
  return await import(
    pathToFileURL(path.join(process.cwd(), "scripts", "desktop-session-preflight.mjs")).href
  ) as {
    analyzePngImage: (buffer: Buffer) => {
      width: number;
      height: number;
      isLikelyBlack: boolean;
      nonBlackCount: number;
    };
    classifyDesktopSessionPreflightEvidence: (evidence: Record<string, unknown>) => string;
    explainDesktopSessionPreflightEvidence: (evidence: Record<string, unknown>) => string;
    runDesktopSessionPreflight: (options: {
      appPath: string;
      helperPath: string;
      outputPath?: string;
      screenshotOutputPath: string;
    }, io: {
      mkdir: (path: string, options: { recursive: boolean }) => Promise<void>;
      execFile: (file: string, args: string[], options: { maxBuffer: number }) => Promise<{
        stdout: string;
        stderr: string;
      }>;
      exists: (path: string) => boolean;
      stat: (path: string) => Promise<{ size: number }>;
      readFile: (path: string) => Promise<Buffer>;
    }) => Promise<Record<string, unknown>>;
  };
}

async function importSmokePreflightScript() {
  return await import(
    pathToFileURL(path.join(process.cwd(), "scripts", "smoke-desktop-preflight.mjs")).href
  ) as {
    createGenericDesktopCapabilityReadiness: (input: Record<string, unknown>) => {
      target: string;
      status: string;
      capabilities: Array<{
        id: string;
        status: string;
        blockers: Array<Record<string, unknown>>;
      }>;
    };
  };
}

function createPng({
  width,
  height,
  rgba
}: {
  width: number;
  height: number;
  rgba: Array<[number, number, number, number]>;
}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const rowBytes = [];
  for (let y = 0; y < height; y += 1) {
    rowBytes.push(0);
    for (let x = 0; x < width; x += 1) {
      const pixel = rgba[(y * width) + x];
      rowBytes.push(...pixel);
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(Buffer.from(rowBytes))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([
    length,
    Buffer.from(type, "ascii"),
    data,
    Buffer.alloc(4)
  ]);
}

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("smoke v2 runner", () => {
  it("is exposed as an npm script with a stable product entry point", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "smoke:v2": "node scripts/smoke-v2-product.mjs"
    });
  });

  it("builds layered release and field scenario plans", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-v2-plan.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      createDefaultSmokeV2Options,
      createSmokeV2Plan
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultSmokeV2Options: (rootDir?: string) => Record<string, unknown>;
      createSmokeV2Plan: (options: Record<string, unknown>) => Array<Record<string, unknown>>;
    };

    const defaults = createDefaultSmokeV2Options("/repo");
    expect(defaults.profile).toBe("silent");
    expect(defaults.artifactsDir).toBe(path.join("/repo", ".skfiy-smoke", "v2"));
    expect(createSmokeV2Plan({
      profile: "silent",
      artifactsDir: defaults.artifactsDir,
      appPath: "dist/skfiy.app"
    }).map((scenario) => ({
      id: scenario.id,
      stealsFocus: scenario.stealsFocus
    }))).toEqual([
      { id: "cli-basic", stealsFocus: false },
      { id: "dashboard-product", stealsFocus: false }
    ]);
    expect(createSmokeV2Plan({
      profile: "silent",
      artifactsDir: defaults.artifactsDir,
      appPath: "dist/skfiy.app",
      dashboardTimeoutMs: 30000
    }).find((scenario) => scenario.id === "dashboard-product")?.command).toContain("30000");
    expect(createSmokeV2Plan({
      profile: "release",
      artifactsDir: defaults.artifactsDir,
      appPath: "dist/skfiy.app"
    }).map((scenario) => path.dirname(String(scenario.artifactPath)))).toEqual([
      path.join("/repo", ".skfiy-smoke", "v2"),
      path.join("/repo", ".skfiy-smoke", "v2"),
      path.join("/repo", ".skfiy-smoke", "v2")
    ]);

    expect(createSmokeV2Plan({
      profile: "release",
      artifactsDir: ".skfiy-smoke",
      appPath: "dist/skfiy.app"
    }).map((scenario) => scenario.id)).toEqual([
      "cli-basic",
      "ui-product",
      "dashboard-product"
    ]);
    expect(createSmokeV2Plan({
      profile: "release",
      artifactsDir: ".skfiy-smoke",
      appPath: "dist/skfiy.app"
    }).map((scenario) => ({
      id: scenario.id,
      focusMode: scenario.focusMode,
      stealsFocus: scenario.stealsFocus
    }))).toEqual([
      { id: "cli-basic", focusMode: "none", stealsFocus: false },
      { id: "ui-product", focusMode: "hidden-window", stealsFocus: false },
      { id: "dashboard-product", focusMode: "hidden-window", stealsFocus: false }
    ]);
    expect(createSmokeV2Plan({
      profile: "release",
      artifactsDir: ".skfiy-smoke",
      appPath: "dist/skfiy.app"
    }).map((scenario) => path.basename(String(scenario.artifactPath)))).toEqual([
      "cli-v2-basic.json",
      "ui-v2-product.json",
      "dashboard-v2-product.json"
    ]);

    expect(createSmokeV2Plan({
      profile: "field",
      artifactsDir: ".skfiy-smoke",
      appPath: "dist/skfiy.app",
      extensionId: "plcpkkhlcacihjfohlojdknnkademlno",
      extensionChromeApp: "Chromium"
    }).map((scenario) => scenario.layer)).toEqual([
      "field",
      "field",
      "field",
      "field",
      "field",
      "field"
    ]);
  });

  it("normalizes scenario artifacts into typed blockers", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-v2-plan.mjs");
    const {
      classifySmokeV2Scenario
    } = await import(pathToFileURL(modulePath).href) as {
      classifySmokeV2Scenario: (input: Record<string, unknown>) => Record<string, unknown>;
    };

    expect(classifySmokeV2Scenario({
      id: "ghostty-matrix",
      layer: "field",
      focusMode: "frontmost-app",
      stealsFocus: true,
      acceptedResults: ["passed", "blocked"],
      rawArtifact: {
        result: "blocked",
        desktopPreflight: {
          result: "blocked",
          reason: "Main display is asleep."
        }
      },
      exitCode: 0
    })).toMatchObject({
      id: "ghostty-matrix",
      layer: "field",
      result: "blocked",
      focusMode: "frontmost-app",
      stealsFocus: true,
      blockerCode: "desktop-session-blocked"
    });

    expect(classifySmokeV2Scenario({
      id: "money-run",
      layer: "field",
      acceptedResults: ["passed"],
      rawArtifact: {
        result: "needs_attention",
        tmuxSupervisionReport: {
          status: "needs_attention",
          recommendation: {
            action: "inspect_output",
            mutatesSession: false
          }
        }
      },
      exitCode: 2
    })).toMatchObject({
      result: "needs_attention",
      blockerCode: "money-run-needs-attention",
      mutatesSession: false
    });

    expect(classifySmokeV2Scenario({
      id: "finder-selected-folder",
      layer: "field",
      acceptedResults: ["passed", "blocked", "needs-user-confirmation"],
      rawArtifact: {
        result: "needs_confirmation"
      },
      exitCode: 0
    })).toMatchObject({
      result: "needs-user-confirmation",
      accepted: true,
      blockerCode: "needs-user-confirmation"
    });

    expect(classifySmokeV2Scenario({
      id: "chrome-browser-context",
      layer: "field",
      acceptedResults: ["passed", "blocked"],
      rawArtifact: {
        result: "passed",
        pageControl: {
          state: "blocked_by_host_policy"
        }
      },
      exitCode: 0
    })).toMatchObject({
      result: "passed",
      accepted: true,
      blockerCode: "browser-context-host-policy-blocked"
    });
  });

  it("classifies aggregate release and field evidence differently", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-v2-plan.mjs");
    const {
      classifySmokeV2Evidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifySmokeV2Evidence: (
        scenarios: Array<Record<string, unknown>>,
        options?: Record<string, unknown>
      ) => string;
    };

    expect(classifySmokeV2Evidence([
      { result: "passed" },
      { result: "blocked" }
    ], { requirePassed: false })).toBe("blocked");

    expect(classifySmokeV2Evidence([
      { result: "passed" },
      { result: "blocked" }
    ], { requirePassed: true })).toBe("failed");

    expect(classifySmokeV2Evidence([
      { result: "passed" },
      { result: "passed" }
    ], { requirePassed: true })).toBe("passed");
  });

  it("creates a schema-versioned aggregate artifact", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-v2-plan.mjs");
    const {
      createSmokeV2Evidence
    } = await import(pathToFileURL(modulePath).href) as {
      createSmokeV2Evidence: (input: Record<string, unknown>) => Record<string, unknown>;
    };

    expect(createSmokeV2Evidence({
      profile: "release",
      startedAt: "2026-06-26T00:00:00.000Z",
      finishedAt: "2026-06-26T00:00:02.000Z",
      scenarios: [
        { id: "cli-basic", layer: "contract", result: "passed" },
        {
          id: "dashboard-product",
          layer: "packaged",
          result: "blocked",
          blockerCode: "stale-dashboard-build-mismatch"
        }
      ],
      requirePassed: false
    })).toMatchObject({
      schemaVersion: 2,
      kind: "skfiy-smoke-v2",
      profile: "release",
      result: "blocked",
      blockers: [
        {
          scenarioId: "dashboard-product",
          code: "stale-dashboard-build-mismatch"
        }
      ]
    });
  });
});

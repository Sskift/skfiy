import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("mac release signing and notarization scripts", () => {
  async function loadPlanModule() {
    const modulePath = path.join(process.cwd(), "scripts/sign-notarize-macos-plan.mjs");
    return await import(pathToFileURL(modulePath).href) as {
      createMacReleasePlan: (input: {
        rootDir: string;
        appPath?: string;
        outputDir?: string;
        zipPath?: string;
      }) => {
        appPath: string;
        outputDir: string;
        zipPath: string;
        entitlementsPath: string;
        bundleIdentifier: string;
      };
      createDefaultMacReleaseOptions: (input: {
        rootDir: string;
        env: Record<string, string | undefined>;
      }) => {
        plan: {
          appPath: string;
          outputDir: string;
          zipPath: string;
          entitlementsPath: string;
          bundleIdentifier: string;
        };
        signingIdentity?: string;
        appleId?: string;
        appleTeamId?: string;
        applePassword?: string;
        keychainProfile?: string;
        dryRun: boolean;
        sign: boolean;
        notarize: boolean;
      };
      createCodeSignCommand: (input: {
        appPath: string;
        identity: string;
        entitlementsPath?: string;
      }) => { command: string; args: string[] };
      createNotarySubmitCommand: (input: {
        zipPath: string;
        appleId?: string;
        appleTeamId?: string;
        applePassword?: string;
        keychainProfile?: string;
      }) => { command: string; args: string[] };
      createMacReleaseReadinessReport: (input: {
        signingIdentity?: string;
        appleId?: string;
        appleTeamId?: string;
        applePassword?: string;
        keychainProfile?: string;
      }) => {
        ready: boolean;
        missing: string[];
        signing: { ready: boolean; missing: string[] };
        notarization: { ready: boolean; missing: string[] };
      };
      createMacReleaseSteps: (input: {
        plan: {
          appPath: string;
          outputDir: string;
          zipPath: string;
          entitlementsPath: string;
          bundleIdentifier: string;
        };
        signingIdentity?: string;
        appleId?: string;
        appleTeamId?: string;
        applePassword?: string;
        keychainProfile?: string;
        dryRun: boolean;
        sign: boolean;
        notarize: boolean;
      }) => Array<{
        name: string;
        command: { command: string; args: string[] };
      }>;
      parseMacReleaseArgs: (
        argv: string[],
        defaults: {
          plan: {
            appPath: string;
            outputDir: string;
            zipPath: string;
            bundleIdentifier: string;
          };
          signingIdentity?: string;
          appleId?: string;
          appleTeamId?: string;
          applePassword?: string;
          keychainProfile?: string;
          dryRun: boolean;
          sign: boolean;
          notarize: boolean;
        }
      ) => {
        plan: {
          appPath: string;
          outputDir: string;
          zipPath: string;
          entitlementsPath: string;
          bundleIdentifier: string;
        };
        signingIdentity?: string;
        appleId?: string;
        appleTeamId?: string;
        applePassword?: string;
        keychainProfile?: string;
        dryRun: boolean;
        sign: boolean;
        notarize: boolean;
      };
    };
  }

  it("plans default product app and notary zip paths", async () => {
    const { createMacReleasePlan } = await loadPlanModule();

    expect(createMacReleasePlan({ rootDir: "/repo" })).toEqual({
      appPath: "/repo/dist/skfiy.app",
      outputDir: "/repo/.skfiy-alpha",
      zipPath: "/repo/.skfiy-alpha/skfiy-macos-notarization.zip",
      entitlementsPath: "/repo/release/skfiy.entitlements.plist",
      bundleIdentifier: "com.sskift.skfiy"
    });
  });

  it("creates hardened runtime codesign and notarytool commands", async () => {
    const { createCodeSignCommand, createNotarySubmitCommand } = await loadPlanModule();

    expect(createCodeSignCommand({
      appPath: "/repo/dist/skfiy.app",
      identity: "Developer ID Application: Example Corp (TEAMID)",
      entitlementsPath: "/repo/release/skfiy.entitlements.plist"
    })).toEqual({
      command: "codesign",
      args: [
        "--force",
        "--deep",
        "--options",
        "runtime",
        "--timestamp",
        "--entitlements",
        "/repo/release/skfiy.entitlements.plist",
        "--sign",
        "Developer ID Application: Example Corp (TEAMID)",
        "/repo/dist/skfiy.app"
      ]
    });

    expect(createNotarySubmitCommand({
      zipPath: "/repo/.skfiy-alpha/skfiy-macos-notarization.zip",
      keychainProfile: "skfiy-notary"
    })).toEqual({
      command: "xcrun",
      args: [
        "notarytool",
        "submit",
        "/repo/.skfiy-alpha/skfiy-macos-notarization.zip",
        "--wait",
        "--keychain-profile",
        "skfiy-notary"
      ]
    });
  });

  it("reports missing Developer ID and notarization credentials without executing", async () => {
    const {
      createDefaultMacReleaseOptions,
      createMacReleaseReadinessReport
    } = await loadPlanModule();

    const options = createDefaultMacReleaseOptions({
      rootDir: "/repo",
      env: {}
    });

    expect(options).toMatchObject({
      dryRun: true,
      sign: false,
      notarize: false,
      plan: {
        appPath: "/repo/dist/skfiy.app",
        zipPath: "/repo/.skfiy-alpha/skfiy-macos-notarization.zip"
      }
    });

    expect(createMacReleaseReadinessReport(options)).toEqual({
      ready: false,
      missing: [
        "SKFIY_DEVELOPER_ID_APPLICATION",
        "APPLE_ID",
        "APPLE_TEAM_ID",
        "APPLE_APP_SPECIFIC_PASSWORD or APPLE_KEYCHAIN_PROFILE"
      ],
      signing: {
        ready: false,
        missing: ["SKFIY_DEVELOPER_ID_APPLICATION"]
      },
      notarization: {
        ready: false,
        missing: [
          "APPLE_ID",
          "APPLE_TEAM_ID",
          "APPLE_APP_SPECIFIC_PASSWORD or APPLE_KEYCHAIN_PROFILE"
        ]
      }
    });
  });

  it("parses execution flags and explicit credentials", async () => {
    const {
      createDefaultMacReleaseOptions,
      parseMacReleaseArgs
    } = await loadPlanModule();

    const options = parseMacReleaseArgs([
      "--sign",
      "--notarize",
      "--execute",
      "--identity",
      "Developer ID Application: Example Corp (TEAMID)",
      "--apple-id",
      "dev@example.com",
      "--team-id",
      "TEAMID",
      "--password",
      "app-specific-password",
      "--app",
      "dist/custom.app",
      "--zip",
      ".skfiy-alpha/custom.zip"
    ], createDefaultMacReleaseOptions({
      rootDir: "/repo",
      env: {}
    }));

    expect(options).toMatchObject({
      signingIdentity: "Developer ID Application: Example Corp (TEAMID)",
      appleId: "dev@example.com",
      appleTeamId: "TEAMID",
      applePassword: "app-specific-password",
      dryRun: false,
      sign: true,
      notarize: true,
      plan: {
        appPath: path.resolve("dist/custom.app"),
        zipPath: path.resolve(".skfiy-alpha/custom.zip")
      }
    });
  });

  it("treats notarization as requiring signing in the planned workflow", async () => {
    const {
      createDefaultMacReleaseOptions,
      parseMacReleaseArgs
    } = await loadPlanModule();

    const options = parseMacReleaseArgs([
      "--notarize"
    ], createDefaultMacReleaseOptions({
      rootDir: "/repo",
      env: {}
    }));

    expect(options).toMatchObject({
      sign: true,
      notarize: true
    });
  });

  it("uses readable placeholders in planned commands when credentials are missing", async () => {
    const {
      createDefaultMacReleaseOptions,
      createMacReleaseSteps,
      parseMacReleaseArgs
    } = await loadPlanModule();

    const options = parseMacReleaseArgs([
      "--sign",
      "--notarize"
    ], createDefaultMacReleaseOptions({
      rootDir: "/repo",
      env: {}
    }));

    expect(createMacReleaseSteps(options).map((step) => step.command.args)).toEqual([
      [
        "--force",
        "--deep",
        "--options",
        "runtime",
        "--timestamp",
        "--entitlements",
        "/repo/release/skfiy.entitlements.plist",
        "--sign",
        "<SKFIY_DEVELOPER_ID_APPLICATION>",
        "/repo/dist/skfiy.app"
      ],
      ["--verify", "--deep", "--strict", "--verbose=2", "/repo/dist/skfiy.app"],
      ["--assess", "--type", "execute", "--verbose", "/repo/dist/skfiy.app"],
      ["-c", "-k", "--keepParent", "/repo/dist/skfiy.app", "/repo/.skfiy-alpha/skfiy-macos-notarization.zip"],
      [
        "notarytool",
        "submit",
        "/repo/.skfiy-alpha/skfiy-macos-notarization.zip",
        "--wait",
        "--apple-id",
        "<APPLE_ID>",
        "--team-id",
        "<APPLE_TEAM_ID>",
        "--password",
        "<APPLE_APP_SPECIFIC_PASSWORD>"
      ],
      ["stapler", "staple", "/repo/dist/skfiy.app"]
    ]);
  });

  it("exposes npm release scripts", async () => {
    const packageJson = JSON.parse(
      await import("node:fs/promises").then((fs) => fs.readFile(
        path.join(process.cwd(), "package.json"),
        "utf8"
      ))
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "release:mac:check": "node scripts/sign-notarize-macos.mjs --dry-run",
      "release:mac:sign": "node scripts/sign-notarize-macos.mjs --sign --execute",
      "release:mac:notarize": "node scripts/sign-notarize-macos.mjs --sign --notarize --execute"
    });
  });
});

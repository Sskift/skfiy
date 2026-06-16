import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("Electron build wiring", () => {
  it("loads the preload script as CommonJS so contextBridge is exposed in sandboxed windows", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const tsconfig = readFileSync(path.join(process.cwd(), "tsconfig.electron.json"), "utf8");

    expect(mainSource).toContain('"preload.cjs"');
    expect(tsconfig).toContain('"src/main/**/*.cts"');
  });

  it("defines a real macOS app bundle package plan for user-facing testing", async () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts: Record<string, string> };
    const packagingModuleUrl = pathToFileURL(
      path.join(process.cwd(), "scripts/package-macos-app.mjs")
    ).href;
    const packaging = await import(packagingModuleUrl) as {
      ELECTRON_APP_COPY_OPTIONS: {
        recursive: boolean;
        verbatimSymlinks: boolean;
      };
      createPackagePlan: (options: {
        rootDir: string;
        electronAppPath: string;
      }) => {
        appBundlePath: string;
        bundleIdentifier: string;
        bundledAppPath: string;
        bundledExecutablePath: string;
        bundledHelperPath: string;
      };
      setInfoPlistString: (plist: string, key: string, value: string) => string;
    };

    expect(packageJson.scripts["package:mac"]).toBe("node scripts/package-macos-app.mjs");
    expect(packageJson.scripts["alpha:artifact"]).toBe("node scripts/create-alpha-artifact.mjs");
    expect(packageJson.scripts.build).toContain("npm run package:mac");
    expect(packaging.ELECTRON_APP_COPY_OPTIONS).toMatchObject({
      recursive: true,
      verbatimSymlinks: true
    });
    expect(
      packaging.createPackagePlan({
        rootDir: "/repo",
        electronAppPath: "/repo/node_modules/electron/dist/Electron.app"
      })
    ).toMatchObject({
      appBundlePath: "/repo/dist/skfiy.app",
      bundleIdentifier: "com.sskift.skfiy",
      bundledAppPath: "/repo/dist/skfiy.app/Contents/Resources/app",
      bundledExecutablePath: "/repo/dist/skfiy.app/Contents/MacOS/skfiy",
      bundledHelperPath: "/repo/dist/skfiy.app/Contents/Resources/skfiy-helper"
    });
  });

  it("keeps the packaged app identity lowercase across bundle metadata and executable name", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { name: string };
    const packagingScript = readFileSync(
      path.join(process.cwd(), "scripts/package-macos-app.mjs"),
      "utf8"
    );

    expect(packageJson.name).toBe("skfiy");
    expect(packagingScript).toContain('setInfoPlistString(current, "CFBundleExecutable", "skfiy")');
    expect(packagingScript).toContain('name: "skfiy"');
    expect(packagingScript).toContain('path.join(plan.appBundlePath, "Contents", "MacOS", "Electron")');
    expect(packagingScript).toContain("await fs.rename(electronExecutablePath, plan.bundledExecutablePath)");
  });

  it("sets the Electron app name to lowercase skfiy before creating windows", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");

    expect(mainSource).toContain('app.setName("skfiy")');
  });

  it("adds microphone and speech usage descriptions to the packaged app identity", () => {
    const packagingScript = readFileSync(
      path.join(process.cwd(), "scripts/package-macos-app.mjs"),
      "utf8"
    );

    expect(packagingScript).toContain("NSMicrophoneUsageDescription");
    expect(packagingScript).toContain("NSSpeechRecognitionUsageDescription");
  });

  it("inserts new Info.plist strings at the root dictionary instead of nested dictionaries", async () => {
    const packagingModuleUrl = pathToFileURL(
      path.join(process.cwd(), "scripts/package-macos-app.mjs")
    ).href;
    const packaging = await import(packagingModuleUrl) as {
      setInfoPlistString: (plist: string, key: string, value: string) => string;
    };
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>Nested</key>
\t<dict>
\t\t<key>hash</key>
\t\t<string>abc</string>
\t</dict>
</dict>
</plist>
`;

    const next = packaging.setInfoPlistString(
      plist,
      "NSSpeechRecognitionUsageDescription",
      "speech"
    );

    expect(next).toContain(
      "<key>hash</key>\n\t\t<string>abc</string>\n\t</dict>\n\t<key>NSSpeechRecognitionUsageDescription</key>"
    );
  });
});

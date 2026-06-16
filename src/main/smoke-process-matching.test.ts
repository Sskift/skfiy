import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("smoke process matching", () => {
  const modulePath = path.join(process.cwd(), "scripts", "skfiy-process-matching.mjs");

  it("matches real skfiy app bundle processes without matching runner command arguments", async () => {
    const { filterSkfiyAppProcessLines } = await import(pathToFileURL(modulePath).href) as {
      filterSkfiyAppProcessLines: (lines: string[]) => string[];
    };

    expect(filterSkfiyAppProcessLines([
      "80605 npm run dogfood:tester -- --app /repo/dist/skfiy.app --tester-id local",
      "80673 node scripts/smoke-ui-product.mjs --app /repo/dist/skfiy.app --output ui.json",
      "80749 /repo/dist/skfiy.app/Contents/MacOS/skfiy --remote-debugging-port=9310",
      "80750 /repo/dist/skfiy.app/Contents/Frameworks/Electron Helper (GPU).app/Contents/MacOS/Electron Helper (GPU)"
    ])).toEqual([
      "80749 /repo/dist/skfiy.app/Contents/MacOS/skfiy --remote-debugging-port=9310",
      "80750 /repo/dist/skfiy.app/Contents/Frameworks/Electron Helper (GPU).app/Contents/MacOS/Electron Helper (GPU)"
    ]);
  });

  it("keeps product smoke scripts off the broad dist/skfiy.app process pattern", () => {
    const productScripts = [
      "smoke-ui-product.mjs",
      "smoke-ghostty-product.mjs",
      "smoke-chrome-product.mjs",
      "smoke-finder-product.mjs",
      "smoke-voice-product.mjs"
    ];

    for (const scriptName of productScripts) {
      const source = readFileSync(path.join(process.cwd(), "scripts", scriptName), "utf8");
      expect(source).toContain("SKFIY_APP_PROCESS_PATTERN");
      expect(source).not.toContain("dist/skfiy.app|/skfiy.app/Contents/MacOS|Electron.*skfiy");
    }
  });
});

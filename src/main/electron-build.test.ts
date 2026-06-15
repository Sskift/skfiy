import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Electron build wiring", () => {
  it("loads the preload script as CommonJS so contextBridge is exposed in sandboxed windows", () => {
    const mainSource = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");
    const tsconfig = readFileSync(path.join(process.cwd(), "tsconfig.electron.json"), "utf8");

    expect(mainSource).toContain('"preload.cjs"');
    expect(tsconfig).toContain('"src/main/**/*.cts"');
  });
});

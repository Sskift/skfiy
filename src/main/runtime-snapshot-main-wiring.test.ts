import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("runtime snapshot main-process wiring", () => {
  it("persists turn replay changes from the Electron runtime", () => {
    const source = readFileSync(path.join(process.cwd(), "src/main/main.ts"), "utf8");

    expect(source).toContain("writeRuntimeSnapshot");
    expect(source).toContain("onReplayChanged");
    expect(source).toContain("persistRuntimeSnapshot");
    expect(source).toContain("os.homedir()");
    expect(source).toContain("createTurnReplayStore({");
  });
});

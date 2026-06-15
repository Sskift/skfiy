import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("vite config", () => {
  it("uses relative asset URLs so Electron loadFile can render production builds", () => {
    const configSource = readFileSync(path.join(process.cwd(), "vite.config.ts"), "utf8");

    expect(configSource).toContain('base: "./"');
  });
});

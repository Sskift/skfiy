import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Ghostty product smoke script", () => {
  it("can set planner provider mode through the product preload API", () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/smoke-ghostty-product.mjs"),
      "utf8"
    );

    expect(source).toContain("--planner-mode");
    expect(source).toContain("plannerMode");
    expect(source).toContain("window.skfiy.setPlannerProviderSettings");
  });
});

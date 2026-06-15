import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("Ghostty product smoke script", () => {
  it("can set planner provider mode through the product preload API", async () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/smoke-ghostty-product.mjs"),
      "utf8"
    );
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");
    const {
      createDefaultSmokeOptions,
      parseSmokeArgs
    } = await import(pathToFileURL(modulePath).href) as {
      createDefaultSmokeOptions: (rootDir: string) => Record<string, unknown>;
      parseSmokeArgs: (argv: string[], defaults: Record<string, unknown>) => Record<string, unknown>;
    };

    expect(parseSmokeArgs(
      ["--planner-mode", "disabled"],
      createDefaultSmokeOptions(process.cwd())
    )).toMatchObject({
      plannerMode: "disabled"
    });
    expect(source).toContain("window.skfiy.setPlannerProviderSettings");
  });

  it("defines the Week 2 product-path task matrix as executable smoke runs", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      buildSmokeRunPlan,
      createDefaultSmokeOptions
    } = await import(pathToFileURL(modulePath).href) as {
      buildSmokeRunPlan: (options: Record<string, unknown>) => unknown;
      createDefaultSmokeOptions: (rootDir: string) => Record<string, unknown>;
    };
    const options = {
      ...createDefaultSmokeOptions(process.cwd()),
      matrix: true
    };

    expect(buildSmokeRunPlan(options)).toEqual([
      {
        id: "pwd-readonly",
        command: "打开 Ghostty 执行 pwd 并截图",
        expectedResults: ["passed", "blocked"]
      },
      {
        id: "date-readonly",
        command: "打开终端运行 date",
        expectedResults: ["passed", "blocked"]
      },
      {
        id: "mkdir-approval",
        command: "创建 skfiy-demo 文件夹",
        expectedResults: ["needs-user-confirmation"]
      },
      {
        id: "rm-rf-deny",
        command: "rm -rf ~/Desktop",
        approvalAction: "deny",
        expectedResults: ["denied"]
      }
    ]);
  });

  it("keeps the single-command product smoke path by default", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-ghostty-plan.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      buildSmokeRunPlan,
      createDefaultSmokeOptions
    } = await import(pathToFileURL(modulePath).href) as {
      buildSmokeRunPlan: (options: Record<string, unknown>) => unknown;
      createDefaultSmokeOptions: (rootDir: string) => Record<string, unknown>;
    };
    const options = createDefaultSmokeOptions(process.cwd());

    expect(buildSmokeRunPlan(options)).toEqual([
      {
        id: "single-command",
        command: "打开 Ghostty 执行 pwd 并截图",
        expectedResults: ["passed", "blocked", "needs-user-confirmation"]
      }
    ]);
  });
});

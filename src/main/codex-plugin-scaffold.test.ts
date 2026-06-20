import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

describe("repo-local Codex plugin scaffold", () => {
  const pluginRoot = path.join(process.cwd(), "plugins", "skfiy");
  const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
  const mcpPath = path.join(pluginRoot, ".mcp.json");
  const skillPath = path.join(pluginRoot, "skills", "control-skfiy", "SKILL.md");

  it("defines a valid skfiy plugin manifest with skills and MCP config", () => {
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = readJsonFile<Record<string, unknown>>(manifestPath);

    expect(manifest).toMatchObject({
      name: "skfiy",
      version: "0.1.0",
      description: expect.stringContaining("Computer Use"),
      author: {
        name: "Sskift"
      },
      homepage: "https://github.com/Sskift/skfiy",
      repository: "https://github.com/Sskift/skfiy",
      license: "UNLICENSED",
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      interface: {
        displayName: "skfiy",
        developerName: "Sskift",
        category: "Productivity",
        capabilities: ["Interactive", "Read"],
        composerIcon: "./assets/skfiy-composer.svg",
        logo: "./assets/skfiy-logo.svg"
      }
    });
    expect(manifest).not.toHaveProperty("hooks");
    expect(manifest).not.toHaveProperty("apps");
    expect(JSON.stringify(manifest)).not.toContain("[TODO");
    expect(existsSync(path.join(pluginRoot, "assets", "skfiy-composer.svg"))).toBe(true);
    expect(existsSync(path.join(pluginRoot, "assets", "skfiy-logo.svg"))).toBe(true);
  });

  it("points Codex MCP integration at the installed skfiy binary command", () => {
    expect(existsSync(mcpPath)).toBe(true);
    const config = readJsonFile<Record<string, unknown>>(mcpPath);

    expect(config).toEqual({
      mcpServers: {
        skfiy: {
          command: "skfiy",
          args: ["mcp", "serve", "--stdio"],
          env: {
            SKFIY_MCP_SOURCE: "codex-plugin"
          }
        }
      }
    });
  });

  it("documents a plugin skill that uses skfiy as the installed product runtime", () => {
    expect(existsSync(skillPath)).toBe(true);
    const skill = readFileSync(skillPath, "utf8");

    expect(skill).toContain("name: control-skfiy");
    expect(skill).toContain("skfiy status --json");
    expect(skill).toContain("skfiy doctor --json");
    expect(skill).toContain("skfiy mcp serve --stdio");
    expect(skill).toContain("Do not launch skfiy from tmux");
    expect(skill).toContain("Do not run desktop control without explicit user approval");
    expect(skill).not.toContain("[TODO");
  });
});

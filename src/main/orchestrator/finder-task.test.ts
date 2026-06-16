import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runFinderOrganizationTask } from "./finder-task";
import type { DesktopActionResult, DesktopExecutableAction } from "../computer-use/types";

async function collectEvents(task: AsyncGenerator<{ type: string }>) {
  const events: Array<{ type: string }> = [];

  for await (const event of task) {
    events.push(event);
  }

  return events;
}

async function createFixture() {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "skfiy-finder-task-"));
  await writeFile(path.join(rootPath, "photo.png"), "image");
  await writeFile(path.join(rootPath, "notes.pdf"), "document");
  await writeFile(path.join(rootPath, "script.ts"), "code");

  return rootPath;
}

describe("runFinderOrganizationTask", () => {
  it("requires approval before reading the selected Finder folder", async () => {
    const events = await collectEvents(
      runFinderOrganizationTask("整理 Finder 选中文件夹")
    );

    expect(events).toEqual([
      {
        type: "started",
        command: "Finder selected folder",
        risk: expect.objectContaining({
          level: "medium",
          requiresApproval: true
        })
      },
      {
        type: "approval_required",
        command: "Finder selected folder",
        risk: expect.objectContaining({
          level: "medium",
          requiresApproval: true
        })
      }
    ]);
  });

  it("requires approval before reading the current Finder folder", async () => {
    const events = await collectEvents(
      runFinderOrganizationTask("整理 Finder 当前文件夹")
    );

    expect(events).toEqual([
      {
        type: "started",
        command: "Finder current folder",
        risk: expect.objectContaining({
          level: "medium",
          requiresApproval: true
        })
      },
      {
        type: "approval_required",
        command: "Finder current folder",
        risk: expect.objectContaining({
          level: "medium",
          requiresApproval: true
        })
      }
    ]);
  });

  it("requires approval before organizing files", async () => {
    const rootPath = await createFixture();

    try {
      const events = await collectEvents(
        runFinderOrganizationTask(`整理 Finder 测试文件夹 ${rootPath}`)
      );

      expect(events.map((event) => event.type)).toEqual(["started", "approval_required"]);
      expect(await readdir(rootPath)).toEqual(["notes.pdf", "photo.png", "script.ts"]);
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });

  it("organizes a test folder after approval without deleting files", async () => {
    const rootPath = await createFixture();

    try {
      const events = await collectEvents(
        runFinderOrganizationTask(`整理 Finder 测试文件夹 ${rootPath}`, { approved: true })
      );

      expect(events.map((event) => event.type)).toEqual([
        "started",
        "approval_required",
        "locating_app",
        "action_verified",
        "action_verified",
        "action_verified",
        "action_verified",
        "action_verified",
        "action_verified",
        "completed"
      ]);
      await expect(readFile(path.join(rootPath, "Images", "photo.png"), "utf8"))
        .resolves.toBe("image");
      await expect(readFile(path.join(rootPath, "Documents", "notes.pdf"), "utf8"))
        .resolves.toBe("document");
      await expect(readFile(path.join(rootPath, "Code", "script.ts"), "utf8"))
        .resolves.toBe("code");
      await expect(stat(path.join(rootPath, "photo.png"))).rejects.toThrow();
      await expect(stat(path.join(rootPath, "notes.pdf"))).rejects.toThrow();
      await expect(stat(path.join(rootPath, "script.ts"))).rejects.toThrow();
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });

  it("organizes one selected Finder folder from semantic selection", async () => {
    const rootPath = await createFixture();
    const parentPath = path.dirname(rootPath);
    const desktopClient = {
      async executeAction(action: DesktopExecutableAction): Promise<DesktopActionResult> {
        if (action.type === "observe_app") {
          return {
            bundleId: "com.apple.finder",
            isRunning: true,
            isActive: true,
            screenshotPath: action.screenshotOutputPath,
            frontmostBundleId: "com.apple.finder",
            accessibilityTrusted: true,
            windows: [
              {
                title: path.basename(parentPath),
                layer: 0,
                bounds: { x: 10, y: 20, width: 640, height: 480 }
              }
            ]
          };
        }

        return { ok: true };
      },
      async getFinderSelection() {
        return {
          source: "finder-applescript" as const,
          frontmostBundleId: "com.apple.finder",
          targetPath: parentPath,
          selection: [
            {
              path: rootPath,
              name: path.basename(rootPath),
              kind: "directory" as const
            }
          ]
        };
      }
    };

    try {
      const events = await collectEvents(
        runFinderOrganizationTask("整理 Finder 选中文件夹", {
          approved: true,
          desktopClient,
          createScreenshotPath: () => "/tmp/skfiy-finder-before.png"
        })
      );

      expect(events.map((event) => event.type)).toEqual([
        "started",
        "approval_required",
        "locating_app",
        "app_activated",
        "screenshot_before",
        "finder_selection_observed",
        "action_verified",
        "action_verified",
        "action_verified",
        "action_verified",
        "action_verified",
        "action_verified",
        "completed"
      ]);
      expect(events.find((event) => event.type === "finder_selection_observed")).toMatchObject({
        type: "finder_selection_observed",
        context: {
          targetPath: parentPath,
          selection: [
            {
              path: rootPath,
              kind: "directory"
            }
          ]
        }
      });
      await expect(readFile(path.join(rootPath, "Images", "photo.png"), "utf8"))
        .resolves.toBe("image");
      await expect(readFile(path.join(rootPath, "Documents", "notes.pdf"), "utf8"))
        .resolves.toBe("document");
      await expect(readFile(path.join(rootPath, "Code", "script.ts"), "utf8"))
        .resolves.toBe("code");
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });

  it("fails closed when selected Finder folder grounding has zero or multiple folders", async () => {
    const rootPath = await createFixture();
    const otherPath = await mkdtemp(path.join(os.tmpdir(), "skfiy-finder-other-"));
    const desktopClient = {
      async executeAction(action: DesktopExecutableAction): Promise<DesktopActionResult> {
        if (action.type === "observe_app") {
          return {
            bundleId: "com.apple.finder",
            isRunning: true,
            isActive: true,
            screenshotPath: action.screenshotOutputPath,
            frontmostBundleId: "com.apple.finder",
            accessibilityTrusted: true,
            windows: []
          };
        }

        return { ok: true };
      },
      async getFinderSelection() {
        return {
          source: "finder-applescript" as const,
          frontmostBundleId: "com.apple.finder",
          targetPath: path.dirname(rootPath),
          selection: [
            {
              path: rootPath,
              name: path.basename(rootPath),
              kind: "directory" as const
            },
            {
              path: otherPath,
              name: path.basename(otherPath),
              kind: "directory" as const
            }
          ]
        };
      }
    };

    try {
      const events = await collectEvents(
        runFinderOrganizationTask("整理 Finder 选中文件夹", {
          approved: true,
          desktopClient
        })
      );

      expect(events.at(-1)).toMatchObject({
        type: "verification_failed",
        stage: "selection",
        reason: "Finder selected-folder organization needs exactly one selected folder."
      });
      expect(await readdir(rootPath)).toEqual(["notes.pdf", "photo.png", "script.ts"]);
    } finally {
      await rm(rootPath, { recursive: true, force: true });
      await rm(otherPath, { recursive: true, force: true });
    }
  });

  it("organizes the current Finder folder from semantic Finder context", async () => {
    const rootPath = await createFixture();
    const actions: DesktopExecutableAction[] = [];
    const desktopClient = {
      async executeAction(action: DesktopExecutableAction): Promise<DesktopActionResult> {
        actions.push(action);

        if (action.type === "observe_app") {
          return {
            bundleId: "com.apple.finder",
            isRunning: true,
            isActive: true,
            screenshotPath: action.screenshotOutputPath,
            frontmostBundleId: "com.apple.finder",
            accessibilityTrusted: true,
            windows: [
              {
                title: path.basename(rootPath),
                layer: 0,
                bounds: { x: 10, y: 20, width: 640, height: 480 }
              }
            ]
          };
        }

        return { ok: true };
      },
      async getFinderSelection() {
        return {
          source: "finder-applescript" as const,
          frontmostBundleId: "com.apple.finder",
          targetPath: rootPath,
          selection: []
        };
      }
    };

    try {
      const events = await collectEvents(
        runFinderOrganizationTask("整理 Finder 当前文件夹", {
          approved: true,
          desktopClient,
          createScreenshotPath: () => "/tmp/skfiy-finder-before.png"
        })
      );

      expect(actions.slice(0, 2)).toEqual([
        { type: "activate_app", bundleId: "com.apple.finder" },
        {
          type: "observe_app",
          bundleId: "com.apple.finder",
          screenshotOutputPath: "/tmp/skfiy-finder-before.png"
        }
      ]);
      expect(events.map((event) => event.type)).toEqual([
        "started",
        "approval_required",
        "locating_app",
        "app_activated",
        "screenshot_before",
        "finder_selection_observed",
        "action_verified",
        "action_verified",
        "action_verified",
        "action_verified",
        "action_verified",
        "action_verified",
        "completed"
      ]);
      expect(events.find((event) => event.type === "finder_selection_observed")).toMatchObject({
        type: "finder_selection_observed",
        context: {
          targetPath: rootPath,
          selection: []
        }
      });
      await expect(readFile(path.join(rootPath, "Images", "photo.png"), "utf8"))
        .resolves.toBe("image");
      await expect(readFile(path.join(rootPath, "Documents", "notes.pdf"), "utf8"))
        .resolves.toBe("document");
      await expect(readFile(path.join(rootPath, "Code", "script.ts"), "utf8"))
        .resolves.toBe("code");
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });

  it("fails closed when the current Finder folder cannot be grounded semantically", async () => {
    const rootPath = await createFixture();
    const desktopClient = {
      async executeAction(action: DesktopExecutableAction): Promise<DesktopActionResult> {
        if (action.type === "observe_app") {
          return {
            bundleId: "com.apple.finder",
            isRunning: true,
            isActive: true,
            screenshotPath: action.screenshotOutputPath,
            frontmostBundleId: "com.apple.finder",
            accessibilityTrusted: true,
            windows: []
          };
        }

        return { ok: true };
      },
      async getFinderSelection() {
        return {
          source: "finder-applescript" as const,
          frontmostBundleId: "com.apple.finder",
          selection: []
        };
      }
    };

    try {
      const events = await collectEvents(
        runFinderOrganizationTask("整理 Finder 当前文件夹", {
          approved: true,
          desktopClient
        })
      );

      expect(events.at(-1)).toMatchObject({
        type: "verification_failed",
        stage: "selection",
        reason: "Finder current-folder organization needs a Finder window target path or one selected folder."
      });
      expect(await readdir(rootPath)).toEqual(["notes.pdf", "photo.png", "script.ts"]);
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });

  it("activates and observes Finder before moving files when a desktop client is available", async () => {
    const rootPath = await createFixture();
    const actions: DesktopExecutableAction[] = [];
    const desktopClient = {
      async executeAction(action: DesktopExecutableAction): Promise<DesktopActionResult> {
        actions.push(action);

        if (action.type === "observe_app") {
          return {
            bundleId: "com.apple.finder",
            isRunning: true,
            isActive: true,
            screenshotPath: action.screenshotOutputPath,
            frontmostBundleId: "com.apple.finder",
            accessibilityTrusted: true,
            windows: [
              {
                title: "skfiy-finder-smoke",
                layer: 0,
                bounds: { x: 10, y: 20, width: 640, height: 480 }
              }
            ]
          };
        }

        return { ok: true };
      }
    };

    try {
      const events = await collectEvents(
        runFinderOrganizationTask(`整理 Finder 测试文件夹 ${rootPath}`, {
          approved: true,
          desktopClient,
          createScreenshotPath: () => "/tmp/skfiy-finder-before.png"
        })
      );

      expect(actions.slice(0, 2)).toEqual([
        { type: "activate_app", bundleId: "com.apple.finder" },
        {
          type: "observe_app",
          bundleId: "com.apple.finder",
          screenshotOutputPath: "/tmp/skfiy-finder-before.png"
        }
      ]);
      expect(events.map((event) => event.type)).toEqual([
        "started",
        "approval_required",
        "locating_app",
        "app_activated",
        "screenshot_before",
        "action_verified",
        "action_verified",
        "action_verified",
        "action_verified",
        "action_verified",
        "action_verified",
        "completed"
      ]);
      expect(events[4]).toMatchObject({
        type: "screenshot_before",
        path: "/tmp/skfiy-finder-before.png",
        observation: {
          bundleId: "com.apple.finder",
          frontmostBundleId: "com.apple.finder",
          accessibilityTrusted: true
        }
      });
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });

  it("emits Finder semantic selection context when the desktop client can read it", async () => {
    const rootPath = await createFixture();
    const desktopClient = {
      async executeAction(action: DesktopExecutableAction): Promise<DesktopActionResult> {
        if (action.type === "observe_app") {
          return {
            bundleId: "com.apple.finder",
            isRunning: true,
            isActive: true,
            screenshotPath: action.screenshotOutputPath,
            frontmostBundleId: "com.apple.finder",
            accessibilityTrusted: true,
            windows: [
              {
                title: "skfiy-finder-smoke",
                layer: 0,
                bounds: { x: 10, y: 20, width: 640, height: 480 }
              }
            ]
          };
        }

        return { ok: true };
      },
      async getFinderSelection() {
        return {
          source: "finder-applescript" as const,
          frontmostBundleId: "com.apple.finder",
          targetPath: rootPath,
          selection: [
            {
              path: path.join(rootPath, "photo.png"),
              name: "photo.png",
              kind: "file" as const
            }
          ]
        };
      }
    };

    try {
      const events = await collectEvents(
        runFinderOrganizationTask(`整理 Finder 测试文件夹 ${rootPath}`, {
          approved: true,
          desktopClient,
          createScreenshotPath: () => "/tmp/skfiy-finder-before.png"
        })
      );

      expect(events.find((event) => event.type === "finder_selection_observed")).toMatchObject({
        type: "finder_selection_observed",
        context: {
          source: "finder-applescript",
          frontmostBundleId: "com.apple.finder",
          targetPath: rootPath,
          selection: [
            {
              name: "photo.png",
              kind: "file"
            }
          ]
        }
      });
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });

  it("fails closed instead of overwriting an existing destination file", async () => {
    const rootPath = await createFixture();

    try {
      await mkdir(path.join(rootPath, "Images"), { recursive: true });
      await writeFile(path.join(rootPath, "Images", "photo.png"), "existing");

      const events = await collectEvents(
        runFinderOrganizationTask(`整理 Finder 测试文件夹 ${rootPath}`, { approved: true })
      );

      expect(events.at(-1)).toMatchObject({
        type: "verification_failed",
        stage: "file_operation",
        reason: expect.stringContaining("Destination already exists")
      });
      await expect(readFile(path.join(rootPath, "Images", "photo.png"), "utf8"))
        .resolves.toBe("existing");
      await expect(readFile(path.join(rootPath, "photo.png"), "utf8"))
        .resolves.toBe("image");
    } finally {
      await rm(rootPath, { recursive: true, force: true });
    }
  });
});

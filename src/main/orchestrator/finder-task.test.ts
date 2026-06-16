import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runFinderOrganizationTask } from "./finder-task";

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

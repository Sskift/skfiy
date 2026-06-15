import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function acquireSmokeLock({ rootDir, scriptName }) {
  const lockDir = path.join(rootDir, ".skfiy-smoke", "product-smoke.lock");

  await mkdir(path.dirname(lockDir), { recursive: true });

  try {
    await mkdir(lockDir, { recursive: false });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      throw new Error(
        `Another packaged-app smoke run is already active at ${lockDir}. `
          + "Run product smokes sequentially so cleanup evidence cannot be contaminated."
      );
    }

    throw error;
  }

  await writeFile(
    path.join(lockDir, "owner.json"),
    `${JSON.stringify({
      scriptName,
      pid: process.pid,
      acquiredAt: new Date().toISOString()
    }, null, 2)}\n`
  );

  return {
    lockPath: lockDir,
    async release() {
      await rm(lockDir, { force: true, recursive: true });
    }
  };
}

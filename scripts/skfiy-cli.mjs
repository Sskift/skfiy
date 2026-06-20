#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builtSurfacePath = path.join(rootDir, "dist/main/cli-command-surface.js");

if (!existsSync(builtSurfacePath)) {
  console.error(
    "skfiy-cli requires built main artifacts at dist/main/cli-command-surface.js. Run npm run build before using this source-tree shim."
  );
  process.exitCode = 1;
} else {
  try {
    const {
      runSkfiyCli
    } = await import(pathToFileURL(builtSurfacePath).href);
    process.exitCode = await runSkfiyCli({
      argv: process.argv.slice(2),
      rootDir,
      stdout: process.stdout,
      stderr: process.stderr
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const binPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(binPath), "..");
const builtCliRelativePath = "dist/main/cli-command-surface.js";
const builtCliPath = path.join(repoRoot, ...builtCliRelativePath.split("/"));

if (!existsSync(builtCliPath)) {
  process.stderr.write(
    "skfiy CLI is not built yet. Run `npm run build` from the skfiy repository, then retry.\n"
  );
  process.exitCode = 1;
} else {
  const cli = await import(pathToFileURL(builtCliPath).href);
  if (typeof cli.runSkfiyCli !== "function") {
    process.stderr.write("skfiy CLI build is missing runSkfiyCli(). Rebuild the app and retry.\n");
    process.exitCode = 1;
  } else {
    const exitCode = await cli.runSkfiyCli({
      argv: process.argv.slice(2),
      rootDir: repoRoot,
      stdout: process.stdout,
      stderr: process.stderr
    });
    process.exitCode = typeof exitCode === "number" ? exitCode : 0;
  }
}

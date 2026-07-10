import path from "node:path";
import {
  createChromeExtensionInfoOutputForRoot
} from "./cli-chrome-command-runner.js";
import {
  createCliOutputSkeleton
} from "./cli-output-skeleton.js";
import type {
  CliCommandInvocation
} from "./cli-command-normalization.js";

export interface CreateCliOutputOptions {
  generatedAt?: string;
}

export function createCliOutput(
  invocation: CliCommandInvocation,
  options: CreateCliOutputOptions = {}
): Record<string, unknown> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  return createCliOutputSkeleton(invocation, {
    generatedAt,
    createChromeExtensionInfoOutput: ({ invocation, generatedAt }) => createChromeExtensionInfoOutputForRoot({
      invocation,
      generatedAt,
      rootDir: inferRootDirFromCliShimPath(invocation.options.cliShimPath)
    })
  });
}

function inferRootDirFromCliShimPath(cliShimPath: string): string {
  const cliDir = path.dirname(cliShimPath);

  return path.basename(cliDir) === "dist"
    ? path.dirname(cliDir)
    : process.cwd();
}

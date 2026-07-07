import {
  parseSmokeJson,
  type SmokeRunnerInput,
  type SmokeRunnerResult
} from "./cli-smoke-command.js";
import type { CliCommandInvocation } from "./cli-command-normalization.js";
import { createCliOutputSkeleton } from "./cli-output-skeleton.js";

export interface SmokeCommandIo {
  write: (chunk: string) => unknown;
}

export async function runSmokeCli({
  invocation,
  generatedAt,
  rootDir,
  smokeRunner,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "smoke" }>;
  generatedAt?: string;
  rootDir: string;
  smokeRunner: (input: SmokeRunnerInput) => Promise<SmokeRunnerResult>;
  stdout: SmokeCommandIo;
  stderr: SmokeCommandIo;
}): Promise<number> {
  let smokeResult: SmokeRunnerResult;

  try {
    smokeResult = await smokeRunner({
      target: invocation.target,
      cwd: rootDir,
      scriptPath: invocation.options.scriptPath,
      args: invocation.options.scriptArgs
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    stderr.write(`${message}\n`);
    stdout.write(`${JSON.stringify({
      ...createSmokeFallbackOutput(invocation, generatedAt),
      result: "error",
      exitCode: 1,
      error: message
    }, null, 2)}\n`);
    return 1;
  }

  const smoke = parseSmokeJson(smokeResult.stdout);
  const result = typeof smoke?.result === "string"
    ? smoke.result
    : smokeResult.exitCode === 0 ? "completed" : "failed";

  stdout.write(`${JSON.stringify({
    ...createSmokeFallbackOutput(invocation, generatedAt),
    result,
    exitCode: smokeResult.exitCode,
    smoke,
    smokeStderr: smokeResult.stderr
  }, null, 2)}\n`);

  return smokeResult.exitCode;
}

function createSmokeFallbackOutput(
  invocation: Extract<CliCommandInvocation, { kind: "smoke" }>,
  generatedAt: string | undefined
): Record<string, unknown> {
  return createCliOutputSkeleton(invocation, {
    generatedAt: generatedAt ?? new Date().toISOString(),
    createChromeExtensionInfoOutput: () => {
      throw new Error("Chrome extension-info output is not used by smoke commands.");
    }
  });
}

import { createDoctorOutput } from "./cli-doctor-output.js";
import {
  createOperatorStatusOutput
} from "./cli-operator-status-output.js";
import { createCliOutputSkeleton } from "./cli-output-skeleton.js";
import { readErrorMessage } from "./cli-record-utils.js";
import {
  createCliStatusReadinessSummary,
  withStatusReadiness
} from "./cli-status-capabilities.js";
import { withCliStatusEvidence } from "./cli-status-evidence.js";
import { formatStatusTextOutput } from "./cli-status-output.js";
import {
  createStatusReaderInput,
  type StatusReaderInput
} from "./cli-status-reader-input.js";
import type { CliCommandInvocation } from "./cli-command-normalization.js";

export interface StatusCommandIo {
  write: (chunk: string) => unknown;
}

export type StatusReader = (input: StatusReaderInput) => Promise<Record<string, unknown>>;

export interface SignatureReaderInput {
  appPath: string;
}

export interface SignatureStatus {
  state: "valid" | "invalid" | "unknown";
  reason?: string;
}

export type SignatureReader = (input: SignatureReaderInput) => Promise<SignatureStatus>;

export async function runStatusCli({
  invocation,
  generatedAt,
  rootDir,
  homeDir,
  statusReader,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "status" }>;
  generatedAt?: string;
  rootDir: string;
  homeDir: string;
  statusReader: StatusReader;
  stdout: StatusCommandIo;
  stderr: StatusCommandIo;
}): Promise<number> {
  const input = createStatusReaderInput({
    rootDir,
    homeDir,
    invocation
  });

  try {
    const effectiveGeneratedAt = generatedAt ?? new Date().toISOString();
    const status = withCliStatusEvidence(
      withStatusReadiness(await statusReader(input), input),
      {
        ...input,
        generatedAt: effectiveGeneratedAt
      }
    );
    const output = {
      schemaVersion: 1,
      command: "status",
      generatedAt: effectiveGeneratedAt,
      ...status
    };

    stdout.write(invocation.json
      ? `${JSON.stringify(output, null, 2)}\n`
      : formatStatusTextOutput(output));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    stderr.write(`${message}\n`);
    stdout.write(`${JSON.stringify({
      ...createStatusCommandFallbackOutput(invocation, generatedAt),
      result: "error",
      error: message
    }, null, 2)}\n`);
    return 1;
  }
}

export async function runDoctorCli({
  invocation,
  generatedAt,
  rootDir,
  homeDir,
  statusReader,
  signatureReader,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "doctor" }>;
  generatedAt?: string;
  rootDir: string;
  homeDir: string;
  statusReader: StatusReader;
  signatureReader: SignatureReader;
  stdout: StatusCommandIo;
  stderr: StatusCommandIo;
}): Promise<number> {
  const input = createStatusReaderInput({
    rootDir,
    homeDir,
    invocation
  });

  try {
    const [status, signature] = await Promise.all([
      statusReader(input),
      signatureReader({ appPath: input.appPath })
    ]);
    const doctor = createDoctorOutput({
      status,
      signature,
      statusInput: input
    });

    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: "doctor",
      generatedAt: generatedAt ?? new Date().toISOString(),
      ...doctor
    }, null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = readErrorMessage(error);

    stderr.write(`${message}\n`);
    stdout.write(`${JSON.stringify({
      ...createStatusCommandFallbackOutput(invocation, generatedAt),
      result: "error",
      error: message
    }, null, 2)}\n`);
    return 1;
  }
}

export async function runOperatorStatusCli({
  invocation,
  generatedAt,
  rootDir,
  homeDir,
  statusReader,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "operator-status" }>;
  generatedAt?: string;
  rootDir: string;
  homeDir: string;
  statusReader: StatusReader;
  stdout: StatusCommandIo;
  stderr: StatusCommandIo;
}): Promise<number> {
  const input = createStatusReaderInput({
    rootDir,
    homeDir,
    invocation
  });

  try {
    const effectiveGeneratedAt = generatedAt ?? new Date().toISOString();
    const status = withCliStatusEvidence(
      withStatusReadiness(await statusReader(input), input),
      {
        ...input,
        generatedAt: effectiveGeneratedAt
      }
    );
    const output = createOperatorStatusOutput({
      invocation,
      generatedAt: effectiveGeneratedAt,
      status,
      result: "probed",
      createReadinessSummary: createCliStatusReadinessSummary
    });

    stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return invocation.options.requireReady && output.result !== "ready" ? 1 : 0;
  } catch (error) {
    const message = readErrorMessage(error);

    stderr.write(`${message}\n`);
    stdout.write(`${JSON.stringify({
      ...createStatusCommandFallbackOutput(invocation, generatedAt),
      result: "error",
      error: message
    }, null, 2)}\n`);
    return 1;
  }
}

function createStatusCommandFallbackOutput(
  invocation: Extract<CliCommandInvocation, { kind: "status" | "doctor" | "operator-status" }>,
  generatedAt: string | undefined
): Record<string, unknown> {
  return createCliOutputSkeleton(invocation, {
    generatedAt: generatedAt ?? new Date().toISOString(),
    createChromeExtensionInfoOutput: () => {
      throw new Error("Chrome extension-info output is not used by status commands.");
    }
  });
}

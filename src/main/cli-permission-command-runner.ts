import { spawn } from "node:child_process";
import type { CliCommandInvocation } from "./cli-command-normalization.js";
import {
  createPermissionSettingsOpenOutput,
  createPermissionSettingsOpenUrl
} from "./cli-permission-settings-output.js";
import { readErrorMessage } from "./cli-record-utils.js";

export interface PermissionCommandIo {
  write: (chunk: string) => unknown;
}

export type PermissionSettingsOpener = (url: string) => Promise<void>;

export async function runPermissionSettingsOpenCli({
  invocation,
  generatedAt,
  permissionSettingsOpener,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "permissions-open" }>;
  generatedAt?: string;
  permissionSettingsOpener: PermissionSettingsOpener;
  stdout: PermissionCommandIo;
  stderr: PermissionCommandIo;
}): Promise<number> {
  const effectiveGeneratedAt = generatedAt ?? new Date().toISOString();
  const url = createPermissionSettingsOpenUrl(invocation.target);

  try {
    await permissionSettingsOpener(url);
    stdout.write(`${JSON.stringify(createPermissionSettingsOpenOutput({
      invocation,
      generatedAt: effectiveGeneratedAt,
      result: "opened"
    }), null, 2)}\n`);
    return 0;
  } catch (error) {
    const message = readErrorMessage(error);

    stderr.write(`${message}\n`);
    stdout.write(`${JSON.stringify(createPermissionSettingsOpenOutput({
      invocation,
      generatedAt: effectiveGeneratedAt,
      result: "error",
      error: message
    }), null, 2)}\n`);
    return 1;
  }
}

export function openPermissionSettingsUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("open", [url], {
      stdio: "ignore"
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`open exited with code ${code ?? "null"}.`));
      }
    });
  });
}

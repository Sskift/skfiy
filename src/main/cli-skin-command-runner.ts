import type { CliCommandInvocation } from "./cli-command-normalization.js";
import { readErrorMessage } from "./cli-record-utils.js";
import { importPetSkin } from "./pet-skin.js";

export interface SkinCommandIo {
  write: (chunk: string) => unknown;
}

export async function runSkinImportCli({
  invocation,
  generatedAt,
  homeDir,
  stdout,
  stderr
}: {
  invocation: Extract<CliCommandInvocation, { kind: "skin-import" }>;
  generatedAt?: string;
  homeDir: string;
  stdout: SkinCommandIo;
  stderr: SkinCommandIo;
}): Promise<number> {
  if (!homeDir) {
    stderr.write("Home directory is required to import a pet skin.\n");
    return 2;
  }

  try {
    const importResult = await importPetSkin({
      homeDir,
      sourcePath: invocation.options.sourcePath,
      slug: invocation.options.slug,
      displayName: invocation.options.displayName,
      licenseSource: invocation.options.licenseSource,
      importedAt: generatedAt
    });

    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: invocation.path,
      generatedAt: generatedAt ?? new Date().toISOString(),
      plannedMutation: true,
      executesSystemMutation: true,
      ...importResult
    }, null, 2)}\n`);
    return 0;
  } catch (error) {
    stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      command: invocation.path,
      generatedAt: generatedAt ?? new Date().toISOString(),
      plannedMutation: true,
      executesSystemMutation: true,
      result: "blocked",
      sourcePath: invocation.options.sourcePath,
      reason: "pet-skin-import-failed",
      error: readErrorMessage(error),
      nextAction: "Export a local PNG, GIF, WebP, SVG, or JPEG from an authorized Luo Xiaohei source, then retry `skfiy skin import --source <path>`."
    }, null, 2)}\n`);
    return 1;
  }
}

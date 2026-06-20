#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { chmod, cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const BUNDLE_IDENTIFIER = "com.sskift.skfiy";
const DOGFOOD_EVIDENCE = [
  "npm run smoke:ui -- --output <path>",
  "npm run smoke:ghostty -- --output <path>",
  "npm run smoke:chrome -- --output <path>",
  "npm run smoke:finder -- --output <path>",
  "npm run smoke:voice -- --output <path>",
  "npm run smoke:money-run -- --json-output <path>",
  "skfiy status --json",
  "skfiy doctor",
  "skfiy dashboard --no-open --json",
  "Permission settings direct links",
  "Panic stop runtime hotkey evidence",
  "Panic stop product-path behavior evidence",
  "Screen Recording permission state",
  "Accessibility permission state",
  "Microphone or ASR provider state",
  "External Doubao voice transcript-to-task evidence",
  "External Doubao voice Ghostty turn replay evidence",
  "External Doubao voice no-transcript/cancellation evidence",
  "Accepted GitHub dogfood issue source",
  "before/after screenshot paths when Computer Use passes",
  "action verification events when Computer Use passes",
  "Ghostty app policy settings",
  "clipboard read/write approval runs",
  "non-terminal voice route guard runs",
  "Chrome app policy settings",
  "Chrome test-page extraction evidence",
  "Chrome Native Messaging heartbeat evidence",
  "Chrome current-page observation evidence",
  "Chrome sensitive-page pause evidence",
  "Chrome form action evidence",
  "Chrome screenshot fallback evidence",
  "Chrome fallback switching evidence",
  "Finder app policy settings",
  "Finder observe_app screenshot or permission-blocked evidence",
  "Finder semantic selection evidence",
  "Finder plan preview evidence",
  "Finder plan confirmation evidence",
  "Finder test-folder organization evidence",
  "Finder item drag/drop evidence",
  "Long-horizon money-run supervision evidence"
];

export function createAlphaArtifactPlan({
  rootDir,
  version,
  commitSha,
  appPath = path.join(rootDir, "dist", "skfiy.app"),
  cliShimPath = path.join(rootDir, "dist", "skfiy"),
  outputDir = path.join(rootDir, ".skfiy-alpha")
}) {
  const shortSha = commitSha.slice(0, 7) || "unknown";
  const artifactBaseName = `skfiy-${version}-${shortSha}-macos-unsigned`;

  return {
    appPath,
    cliShimPath,
    outputDir,
    artifactBaseName,
    stagingDir: path.join(outputDir, artifactBaseName),
    zipPath: path.join(outputDir, `${artifactBaseName}.zip`),
    manifestPath: path.join(outputDir, `${artifactBaseName}.json`),
    bundleIdentifier: BUNDLE_IDENTIFIER
  };
}

export function createZipCommand({ stagingDir, zipPath }) {
  return {
    command: "ditto",
    args: ["-c", "-k", "--keepParent", stagingDir, zipPath]
  };
}

export function createAlphaManifest({
  plan,
  version,
  commitSha,
  createdAt,
  sha256,
  zipBytes,
  uiSmokeArtifactPath,
  smokeArtifactPath,
  chromeSmokeArtifactPath,
  finderSmokeArtifactPath,
  voiceSmokeArtifactPath,
  moneyRunSmokeArtifactPath
}) {
  validateCurrentAlphaSmokeArtifactPaths({
    commitSha,
    uiSmokeArtifactPath,
    smokeArtifactPath,
    chromeSmokeArtifactPath,
    finderSmokeArtifactPath,
    voiceSmokeArtifactPath,
    moneyRunSmokeArtifactPath
  });

  return {
    schemaVersion: 1,
    appName: "skfiy",
    version,
    commitSha,
    bundleIdentifier: plan.bundleIdentifier,
    signed: false,
    notarized: false,
    createdAt,
    appPath: plan.appPath,
    cliShimPath: plan.cliShimPath,
    artifactBaseName: plan.artifactBaseName,
    manifestPath: plan.manifestPath,
    zip: {
      path: plan.zipPath,
      bytes: zipBytes,
      sha256
    },
    uiSmokeArtifactPath,
    smokeArtifactPath,
    chromeSmokeArtifactPath,
    finderSmokeArtifactPath,
    voiceSmokeArtifactPath,
    moneyRunSmokeArtifactPath,
    requiredDogfoodEvidence: DOGFOOD_EVIDENCE
  };
}

function validateCurrentAlphaSmokeArtifactPaths({
  commitSha,
  uiSmokeArtifactPath,
  smokeArtifactPath,
  chromeSmokeArtifactPath,
  finderSmokeArtifactPath,
  voiceSmokeArtifactPath,
  moneyRunSmokeArtifactPath
}) {
  const shortSha = commitSha.slice(0, 7);
  for (const [key, artifactPath] of Object.entries({
    uiSmokeArtifactPath,
    smokeArtifactPath,
    chromeSmokeArtifactPath,
    finderSmokeArtifactPath,
    voiceSmokeArtifactPath,
    moneyRunSmokeArtifactPath
  })) {
    if (typeof artifactPath !== "string" || artifactPath.trim().length === 0) {
      continue;
    }
    if (!path.basename(artifactPath).includes(`-${shortSha}`)) {
      throw new Error(
        `alpha manifest ${key} must reference current alpha ${shortSha}; got ${artifactPath}.`
      );
    }
  }
}

export function parseAlphaArtifactArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--app":
        options.appPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--output-dir":
        options.outputDir = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--smoke-artifact":
        options.smokeArtifactPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--chrome-smoke-artifact":
        options.chromeSmokeArtifactPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--finder-smoke-artifact":
        options.finderSmokeArtifactPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--ui-smoke-artifact":
        options.uiSmokeArtifactPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--voice-smoke-artifact":
        options.voiceSmokeArtifactPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--money-run-smoke-artifact":
        options.moneyRunSmokeArtifactPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function createHelpText(defaults) {
  return `Usage: npm run alpha:artifact -- [options]

Creates an unsigned local dogfood artifact from the packaged skfiy.app.

Options:
  --app <path>              App bundle path. Default: ${defaults.appPath}
  --output-dir <path>       Artifact directory. Default: ${defaults.outputDir}
  --ui-smoke-artifact <path>
                            UI permission onboarding smoke JSON artifact to reference in the manifest.
  --smoke-artifact <path>   Smoke JSON artifact to reference in the manifest.
  --chrome-smoke-artifact <path>
                            Chrome smoke JSON artifact to reference in the manifest.
  --finder-smoke-artifact <path>
                            Finder smoke JSON artifact to reference in the manifest.
  --voice-smoke-artifact <path>
                            Voice smoke JSON artifact to reference in the manifest.
  --money-run-smoke-artifact <path>
                            Long-horizon money-run supervision smoke JSON artifact to reference in the manifest.
  -h, --help                Show this help.
`;
}

export async function createAlphaArtifact({
  rootDir = DEFAULT_ROOT_DIR,
  now = () => new Date().toISOString(),
  io = createDefaultIo()
} = {}) {
  const version = readPackageVersion(rootDir);
  const commitSha = await readGitCommitSha(rootDir, io);
  const defaults = createAlphaArtifactPlan({ rootDir, version, commitSha });
  const options = parseAlphaArtifactArgs(process.argv.slice(2), {
    appPath: defaults.appPath,
    outputDir: defaults.outputDir,
    uiSmokeArtifactPath: undefined,
    smokeArtifactPath: undefined,
    chromeSmokeArtifactPath: undefined,
    finderSmokeArtifactPath: undefined,
    voiceSmokeArtifactPath: undefined,
    moneyRunSmokeArtifactPath: undefined,
    help: false
  });

  if (options.help) {
    process.stdout.write(createHelpText(defaults));
    return undefined;
  }

  const plan = createAlphaArtifactPlan({
    rootDir,
    version,
    commitSha,
    appPath: options.appPath,
    outputDir: options.outputDir
  });

  if (!io.exists(plan.appPath)) {
    throw new Error(`App bundle is missing at ${plan.appPath}. Run npm run build first.`);
  }
  if (!io.exists(plan.cliShimPath)) {
    throw new Error(`CLI shim is missing at ${plan.cliShimPath}. Run npm run build first.`);
  }

  await io.mkdir(plan.outputDir, { recursive: true });
  await io.rm(plan.stagingDir, { force: true, recursive: true });
  await io.mkdir(plan.stagingDir, { recursive: true });
  await io.cp(plan.appPath, path.join(plan.stagingDir, "skfiy.app"), {
    recursive: true,
    verbatimSymlinks: true
  });
  await io.cp(plan.cliShimPath, path.join(plan.stagingDir, "skfiy"));
  await io.chmod(path.join(plan.stagingDir, "skfiy"), 0o755);
  const zipCommand = createZipCommand(plan);
  await io.execFile(zipCommand.command, zipCommand.args);
  const zipStats = await io.stat(plan.zipPath);
  const sha256 = await io.sha256File(plan.zipPath);
  const manifest = createAlphaManifest({
    plan,
    version,
    commitSha,
    createdAt: now(),
    sha256,
    zipBytes: zipStats.size,
    uiSmokeArtifactPath: options.uiSmokeArtifactPath,
    smokeArtifactPath: options.smokeArtifactPath,
    chromeSmokeArtifactPath: options.chromeSmokeArtifactPath,
    finderSmokeArtifactPath: options.finderSmokeArtifactPath,
    voiceSmokeArtifactPath: options.voiceSmokeArtifactPath,
    moneyRunSmokeArtifactPath: options.moneyRunSmokeArtifactPath
  });
  await io.writeFile(plan.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function createDefaultIo() {
  return {
    exists: existsSync,
    mkdir,
    rm,
    cp,
    chmod,
    stat,
    writeFile,
    execFile: execFileAsync,
    sha256File
  };
}

function readPackageVersion(rootDir) {
  const packageJsonPath = path.join(rootDir, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
}

async function readGitCommitSha(rootDir, io) {
  try {
    const { stdout } = await io.execFile("git", ["rev-parse", "HEAD"], { cwd: rootDir });
    const sha = String(stdout).trim();
    return sha || "unknown";
  } catch {
    return "unknown";
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function readValue(argv, index, name) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const manifest = await createAlphaArtifact();
    if (manifest) {
      process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

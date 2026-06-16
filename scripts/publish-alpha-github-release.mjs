#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_REPO = "Sskift/skfiy";
const DEFAULT_TRACKING_ISSUE_URL = "https://github.com/Sskift/skfiy/issues/1";

export function createDefaultGitHubAlphaReleaseOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    manifestPath: undefined,
    repo: DEFAULT_REPO,
    trackingIssueUrl: DEFAULT_TRACKING_ISSUE_URL,
    notesPath: undefined,
    dryRun: true,
    draft: false,
    requireCurrentHead: false,
    help: false
  };
}

export function parseGitHubAlphaReleaseArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--manifest":
        options.manifestPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--repo":
        options.repo = readValue(argv, index, arg);
        index += 1;
        break;
      case "--tracking-issue-url":
        options.trackingIssueUrl = readValue(argv, index, arg);
        index += 1;
        break;
      case "--notes":
        options.notesPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--draft":
        options.draft = true;
        break;
      case "--require-current-head":
        options.requireCurrentHead = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--execute":
        options.dryRun = false;
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

export async function runGitHubAlphaRelease(options, io = createDefaultIo()) {
  validateOptions(options);

  const manifest = await io.readJson(options.manifestPath);
  validateManifest(manifest);
  if (options.requireCurrentHead) {
    const currentHead = typeof options.currentHeadSha === "string"
      ? options.currentHeadSha
      : await io.readCurrentHead(options.rootDir ?? DEFAULT_ROOT_DIR);
    if (manifest.commitSha !== currentHead) {
      throw new Error(`manifest commitSha ${manifest.commitSha} does not match current HEAD ${currentHead}.`);
    }
  }

  await assertReadableFile(options.manifestPath, "alpha manifest", io);
  await assertReadableFile(manifest.zip.path, "alpha zip", io);
  await assertZipIntegrity(manifest, io);

  const plan = createGitHubAlphaReleasePlan({
    manifest,
    manifestPath: options.manifestPath,
    repo: options.repo,
    trackingIssueUrl: options.trackingIssueUrl,
    notesPath: options.notesPath,
    draft: options.draft
  });
  const notes = createGitHubAlphaReleaseNotes({
    manifest,
    manifestPath: options.manifestPath,
    trackingIssueUrl: options.trackingIssueUrl,
    releaseUrl: plan.releaseUrl
  });

  await io.mkdir(path.dirname(plan.notesPath), { recursive: true });
  await io.writeText(plan.notesPath, notes);

  const report = {
    status: options.dryRun ? "planned" : "published",
    dryRun: options.dryRun,
    releaseUrl: plan.releaseUrl,
    plan: redactPlan(plan)
  };

  if (!options.dryRun) {
    await io.execFile(plan.command.command, plan.command.args);
  }

  return report;
}

export function createGitHubAlphaReleasePlan({
  manifest,
  manifestPath,
  repo = DEFAULT_REPO,
  trackingIssueUrl = DEFAULT_TRACKING_ISSUE_URL,
  notesPath,
  draft = false
}) {
  validateManifest(manifest);

  const shortSha = manifest.commitSha.slice(0, 7);
  const tagName = `skfiy-alpha-${shortSha}`;
  const title = `skfiy alpha ${manifest.version} ${shortSha}`;
  const releaseUrl = `https://github.com/${repo}/releases/tag/${tagName}`;
  const selectedNotesPath = typeof notesPath === "string"
    ? notesPath
    : path.join(path.dirname(manifestPath), `${tagName}-notes.md`);
  const uploadAssets = [manifest.zip.path, manifestPath];
  const args = [
    "release",
    "create",
    tagName,
    ...uploadAssets,
    "--repo",
    repo,
    "--target",
    manifest.commitSha,
    "--title",
    title,
    "--notes-file",
    selectedNotesPath,
    "--prerelease",
    ...(draft ? ["--draft"] : [])
  ];

  return {
    tagName,
    title,
    releaseUrl,
    repo,
    trackingIssueUrl,
    notesPath: selectedNotesPath,
    uploadAssets,
    command: {
      command: "gh",
      args
    }
  };
}

export function createGitHubAlphaReleaseNotes({
  manifest,
  manifestPath,
  trackingIssueUrl = DEFAULT_TRACKING_ISSUE_URL,
  releaseUrl
}) {
  const shortSha = manifest.commitSha.slice(0, 7);

  return [
    `# skfiy alpha ${manifest.version} ${shortSha}`,
    "",
    "Unsigned internal dogfood build.",
    "",
    "## Identity",
    "",
    `- Release: ${releaseUrl ?? "not published yet"}`,
    `- App name: \`${manifest.appName}\``,
    `- Bundle id: \`${manifest.bundleIdentifier}\``,
    `- Commit: \`${manifest.commitSha}\``,
    `- Manifest: \`${path.basename(manifestPath)}\``,
    `- Zip: \`${path.basename(manifest.zip.path)}\``,
    `- Zip bytes: \`${manifest.zip.bytes}\``,
    `- Zip SHA256: \`${manifest.zip.sha256}\``,
    `- Signed: \`${manifest.signed === true}\``,
    `- Notarized: \`${manifest.notarized === true}\``,
    "",
    "## Dogfood Rules",
    "",
    "- Do not run dogfood from tmux, `npm start`, Vite, or direct Electron.",
    "- Use the packaged app from this release so macOS permissions attach to `skfiy.app`.",
    "- Grant Screen Recording, Accessibility, Microphone, and Speech Recognition before expecting passed Computer Use or voice evidence.",
    "- Permission-blocked reports are acceptable only when they preserve the real packaged-app artifact chain.",
    "",
    "## Tester Setup",
    "",
    "```bash",
    "npm run dogfood:prepare-alpha -- \\",
    `  --release-url ${releaseUrl ?? "https://github.com/Sskift/skfiy/releases/tag/skfiy-alpha-<commit>"} \\`,
    "  --tester-id <stable-tester-id> \\",
    "  --execute",
    "```",
    "",
    "The prepare command downloads this release, verifies the zip SHA256 against the manifest, extracts `skfiy.app`, and creates a handoff that points `dogfood:tester` at the extracted app bundle.",
    "",
    "## Maintainer Handoff",
    "",
    "```bash",
    "npm run dogfood:handoff -- \\",
    `  --manifest .skfiy-alpha/${path.basename(manifestPath)} \\`,
    ...(releaseUrl ? [`  --release-url ${releaseUrl} \\`] : []),
    "  --app <path-to-unzipped-skfiy.app> \\",
    "  --tester-id <stable-tester-id> \\",
    "  --output .skfiy-dogfood/handoffs/<stable-tester-id>.md",
    "```",
    "",
    "## Maintainer Collection",
    "",
    "```bash",
    "npm run dogfood:status -- \\",
    `  --manifest .skfiy-alpha/${path.basename(manifestPath)} \\`,
    `  --tracking-issue-url ${trackingIssueUrl} \\`,
    `  --summary .skfiy-dogfood/status-${shortSha}.md`,
    "",
    "npm run dogfood:collect -- \\",
    `  --manifest .skfiy-alpha/${path.basename(manifestPath)} \\`,
    `  --tracking-issue-url ${trackingIssueUrl} \\`,
    "  --reports-dir .skfiy-dogfood/reports \\",
    "  --cohort .skfiy-dogfood/internal-alpha-cohort.json \\",
    "  --summary .skfiy-dogfood/internal-alpha-summary.md",
    "",
    "npm run dogfood:cohort -- \\",
    "  --cohort .skfiy-dogfood/internal-alpha-cohort.json \\",
    "  --summary .skfiy-dogfood/internal-alpha-summary.md",
    "",
    "npm run dogfood:cohort -- \\",
    "  --cohort .skfiy-dogfood/internal-alpha-cohort.json \\",
    "  --summary .skfiy-dogfood/internal-alpha-summary-strict.md \\",
    "  --require-passed",
    "```",
    "",
    "`dogfood:collect` reads accepted dogfood report issue URLs from the tracking issue slots, then `dogfood:cohort --require-passed` enforces the real-tester and workflow gates.",
    "",
    `Track accepted reports in ${trackingIssueUrl}.`,
    ""
  ].join("\n");
}

export function createGitHubAlphaReleaseHelpText() {
  return [
    "Usage: npm run alpha:github-release -- --manifest <alpha-manifest> [--repo owner/name] [--execute]",
    "",
    "Publishes an unsigned skfiy alpha zip and manifest as a GitHub pre-release.",
    "By default this is a dry-run: it validates the manifest, writes release notes,",
    "and prints the gh release command without uploading anything.",
    "Pass --execute to run gh release create.",
    "",
    "Options:",
    "  --tracking-issue-url <url>  Dogfood tracking issue to mention in release notes.",
    "  --notes <path>              Release notes path. Defaults beside the alpha manifest.",
    "  --draft                     Create the GitHub release as a draft when executing.",
    "  --require-current-head      Fail when manifest commitSha differs from local HEAD."
  ].join("\n");
}

function validateOptions(options) {
  if (typeof options.manifestPath !== "string") {
    throw new Error("Missing --manifest <path>.");
  }
  if (typeof options.repo !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(options.repo)) {
    throw new Error("--repo must be in owner/name form.");
  }
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("alpha manifest must be an object.");
  }
  if (manifest.appName !== "skfiy") {
    throw new Error("alpha manifest appName must be skfiy.");
  }
  if (typeof manifest.version !== "string" || manifest.version.trim().length === 0) {
    throw new Error("alpha manifest version is required.");
  }
  if (typeof manifest.commitSha !== "string" || manifest.commitSha.length < 7) {
    throw new Error("alpha manifest commitSha is required.");
  }
  if (manifest.bundleIdentifier !== "com.sskift.skfiy") {
    throw new Error("alpha manifest bundleIdentifier must be com.sskift.skfiy.");
  }
  if (typeof manifest.zip?.path !== "string" || manifest.zip.path.trim().length === 0) {
    throw new Error("alpha manifest zip.path is required.");
  }
  if (typeof manifest.zip?.sha256 !== "string" || manifest.zip.sha256.trim().length === 0) {
    throw new Error("alpha manifest zip.sha256 is required.");
  }
}

async function assertReadableFile(filePath, label, io) {
  const fileStat = await io.statFile(filePath);
  if (!Number.isFinite(fileStat?.size) || fileStat.size <= 0) {
    throw new Error(`${label} is empty: ${filePath}`);
  }
}

async function assertZipIntegrity(manifest, io) {
  const zipStat = await io.statFile(manifest.zip.path);
  if (Number.isFinite(manifest.zip.bytes) && zipStat.size !== manifest.zip.bytes) {
    throw new Error(
      `alpha zip size mismatch: expected ${manifest.zip.bytes}, got ${zipStat.size}.`
    );
  }

  const actualSha256 = await sha256File(manifest.zip.path, io);
  if (actualSha256 !== manifest.zip.sha256) {
    throw new Error(
      `alpha zip SHA256 mismatch: expected ${manifest.zip.sha256}, got ${actualSha256}.`
    );
  }
}

async function sha256File(filePath, io) {
  const bytes = typeof io.readFile === "function"
    ? await io.readFile(filePath)
    : await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

function redactPlan(plan) {
  return {
    tagName: plan.tagName,
    title: plan.title,
    releaseUrl: plan.releaseUrl,
    repo: plan.repo,
    notesPath: plan.notesPath,
    uploadAssets: plan.uploadAssets,
    command: plan.command
  };
}

function readValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}

function createDefaultIo() {
  return {
    async readJson(filePath) {
      return JSON.parse(await readFile(filePath, "utf8"));
    },
    async statFile(filePath) {
      return await stat(filePath);
    },
    readFile,
    async mkdir(dirPath, options) {
      await mkdir(dirPath, options);
    },
    async writeText(filePath, value) {
      await writeFile(filePath, value);
    },
    async execFile(command, args) {
      return await execFileAsync(command, args);
    },
    async readCurrentHead(rootDir) {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd: rootDir
      });
      return stdout.trim();
    }
  };
}

async function runCli() {
  const defaults = createDefaultGitHubAlphaReleaseOptions(DEFAULT_ROOT_DIR);
  const options = parseGitHubAlphaReleaseArgs(process.argv.slice(2), defaults);

  if (options.help) {
    console.log(createGitHubAlphaReleaseHelpText());
    return;
  }

  const result = await runGitHubAlphaRelease(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

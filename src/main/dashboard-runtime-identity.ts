import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const DASHBOARD_BUILD_IDENTITY_SCHEMA_VERSION = 1;
export const STALE_DASHBOARD_BUILD_MISMATCH_CODE = "stale-dashboard-build-mismatch";

export interface DashboardBuildIdentity {
  schemaVersion: typeof DASHBOARD_BUILD_IDENTITY_SCHEMA_VERSION;
  rootDir?: string;
  packageVersion?: string;
  gitCommit?: string;
  distSkfiyMtimeMs?: number;
  distMainBundleMtimeMs?: number;
  fingerprint: string;
}

export interface DashboardBuildIdentityIo {
  exists: (targetPath: string) => boolean;
  readFile: (targetPath: string) => string;
  stat: (targetPath: string) => { mtimeMs: number };
  gitHead?: (rootDir: string) => Record<string, unknown>;
}

export interface DashboardRuntimeIdentityStatus {
  state: "matched" | "mismatch";
  code?: typeof STALE_DASHBOARD_BUILD_MISMATCH_CODE;
  reason: string;
  currentBuildIdentity: DashboardBuildIdentity;
  descriptorBuildIdentity?: DashboardBuildIdentity;
  stateBuildIdentity?: DashboardBuildIdentity;
}

export function createDashboardBuildIdentity({
  rootDir,
  io = createDefaultDashboardBuildIdentityIo()
}: {
  rootDir?: string;
  io?: DashboardBuildIdentityIo;
}): DashboardBuildIdentity {
  const normalizedRootDir = rootDir ? path.resolve(rootDir) : undefined;
  const packageVersion = normalizedRootDir
    ? readPackageVersion(normalizedRootDir, io)
    : undefined;
  const gitCommit = normalizedRootDir
    ? readGitCommit(normalizedRootDir, io)
    : undefined;
  const distSkfiyMtimeMs = normalizedRootDir
    ? readMtimeMs(path.join(normalizedRootDir, "dist", "skfiy"), io)
    : undefined;
  const distMainBundleMtimeMs = normalizedRootDir
    ? readFirstMtimeMs([
      path.join(normalizedRootDir, "dist", "main", "main.js"),
      path.join(normalizedRootDir, "dist", "main", "cli-command-surface.js")
    ], io)
    : undefined;

  const identityWithoutFingerprint = compactRecord({
    schemaVersion: DASHBOARD_BUILD_IDENTITY_SCHEMA_VERSION,
    rootDir: normalizedRootDir,
    packageVersion,
    gitCommit,
    distSkfiyMtimeMs,
    distMainBundleMtimeMs
  });

  return {
    ...identityWithoutFingerprint,
    schemaVersion: DASHBOARD_BUILD_IDENTITY_SCHEMA_VERSION,
    fingerprint: createIdentityFingerprint(identityWithoutFingerprint)
  };
}

export function normalizeDashboardBuildIdentity(value: unknown): DashboardBuildIdentity | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== DASHBOARD_BUILD_IDENTITY_SCHEMA_VERSION
    || typeof record.fingerprint !== "string"
    || record.fingerprint.trim().length === 0
  ) {
    return undefined;
  }

  return {
    schemaVersion: DASHBOARD_BUILD_IDENTITY_SCHEMA_VERSION,
    ...(typeof record.rootDir === "string" ? { rootDir: record.rootDir } : {}),
    ...(typeof record.packageVersion === "string" ? { packageVersion: record.packageVersion } : {}),
    ...(typeof record.gitCommit === "string" ? { gitCommit: record.gitCommit } : {}),
    ...(typeof record.distSkfiyMtimeMs === "number" && Number.isFinite(record.distSkfiyMtimeMs)
      ? { distSkfiyMtimeMs: record.distSkfiyMtimeMs }
      : {}),
    ...(typeof record.distMainBundleMtimeMs === "number" && Number.isFinite(record.distMainBundleMtimeMs)
      ? { distMainBundleMtimeMs: record.distMainBundleMtimeMs }
      : {}),
    fingerprint: record.fingerprint
  };
}

export function compareDashboardRuntimeIdentity({
  currentBuildIdentity,
  descriptorBuildIdentity,
  stateBuildIdentity
}: {
  currentBuildIdentity: DashboardBuildIdentity;
  descriptorBuildIdentity?: DashboardBuildIdentity;
  stateBuildIdentity?: DashboardBuildIdentity;
}): DashboardRuntimeIdentityStatus {
  if (!descriptorBuildIdentity) {
    return {
      state: "mismatch",
      code: STALE_DASHBOARD_BUILD_MISMATCH_CODE,
      reason: "Reachable Dashboard did not report a build identity for the current skfiy build.",
      currentBuildIdentity,
      ...(descriptorBuildIdentity ? { descriptorBuildIdentity } : {}),
      ...(stateBuildIdentity ? { stateBuildIdentity } : {})
    };
  }

  if (descriptorBuildIdentity.fingerprint !== currentBuildIdentity.fingerprint) {
    return {
      state: "mismatch",
      code: STALE_DASHBOARD_BUILD_MISMATCH_CODE,
      reason: "Reachable Dashboard is serving a different skfiy build than this CLI.",
      currentBuildIdentity,
      ...(descriptorBuildIdentity ? { descriptorBuildIdentity } : {}),
      ...(stateBuildIdentity ? { stateBuildIdentity } : {})
    };
  }

  return {
    state: "matched",
    reason: "Reachable Dashboard build identity matches the current skfiy build.",
    currentBuildIdentity,
    ...(descriptorBuildIdentity ? { descriptorBuildIdentity } : {}),
    ...(stateBuildIdentity ? { stateBuildIdentity } : {})
  };
}

function readPackageVersion(rootDir: string, io: DashboardBuildIdentityIo): string | undefined {
  const packageJsonPath = path.join(rootDir, "package.json");
  if (!io.exists(packageJsonPath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(io.readFile(packageJsonPath)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const version = (parsed as Record<string, unknown>).version;
      return typeof version === "string" ? version : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function readGitCommit(rootDir: string, io: DashboardBuildIdentityIo): string | undefined {
  const provided = io.gitHead?.(rootDir);
  const providedCommit = provided && typeof provided.commitSha === "string"
    ? provided.commitSha
    : undefined;
  if (providedCommit) {
    return providedCommit;
  }

  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    return undefined;
  }

  const commit = result.stdout.trim();
  return commit.length > 0 ? commit : undefined;
}

function readFirstMtimeMs(paths: string[], io: DashboardBuildIdentityIo): number | undefined {
  for (const targetPath of paths) {
    const mtimeMs = readMtimeMs(targetPath, io);
    if (mtimeMs !== undefined) {
      return mtimeMs;
    }
  }
  return undefined;
}

function readMtimeMs(targetPath: string, io: DashboardBuildIdentityIo): number | undefined {
  if (!io.exists(targetPath)) {
    return undefined;
  }

  try {
    const mtimeMs = io.stat(targetPath).mtimeMs;
    return Number.isFinite(mtimeMs) ? Math.trunc(mtimeMs) : undefined;
  } catch {
    return undefined;
  }
}

function createIdentityFingerprint(identity: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex")
    .slice(0, 16);
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

function createDefaultDashboardBuildIdentityIo(): DashboardBuildIdentityIo {
  return {
    exists: fs.existsSync,
    readFile: (targetPath) => fs.readFileSync(targetPath, "utf8"),
    stat: (targetPath) => fs.statSync(targetPath)
  };
}

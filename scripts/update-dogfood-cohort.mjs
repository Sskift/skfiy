#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REQUIRED_DOGFOOD_WORKFLOWS } from "./verify-dogfood-cohort.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_COHORT_NAME = "internal-alpha";

export function createDefaultDogfoodReportOptions(rootDir = DEFAULT_ROOT_DIR) {
  return {
    rootDir,
    reportPath: undefined,
    cohortPath: path.join(rootDir, ".skfiy-dogfood", "internal-alpha-cohort.json"),
    cohortName: DEFAULT_COHORT_NAME,
    help: false
  };
}

export function parseDogfoodReportArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--report":
        options.reportPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--cohort":
        options.cohortPath = path.resolve(readValue(argv, index, arg));
        index += 1;
        break;
      case "--cohort-name":
        options.cohortName = readValue(argv, index, arg);
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

export async function updateDogfoodCohort(options, io = createDefaultIo()) {
  if (typeof options.reportPath !== "string") {
    throw new Error("Missing --report <path>.");
  }
  if (typeof options.cohortPath !== "string") {
    throw new Error("Missing --cohort <path>.");
  }

  const report = await io.readJson(options.reportPath);
  const reportTesterId = readTesterId(report);
  const reportManifestPath = readManifestPath(report);
  const cohortExists = await io.exists(options.cohortPath);
  const existingCohort = cohortExists ? await io.readJson(options.cohortPath) : undefined;
  const reports = Array.isArray(existingCohort?.reports) ? [...existingCohort.reports] : [];
  const cohortManifestPath = typeof existingCohort?.manifestPath === "string"
    ? existingCohort.manifestPath
    : reportManifestPath;

  if (path.resolve(cohortManifestPath) !== path.resolve(reportManifestPath)) {
    throw new Error("Report manifestPath must match cohort manifestPath.");
  }

  const existingReportIndex = reports.findIndex((item) => readTesterId(item) === reportTesterId);
  const action = existingReportIndex >= 0 ? "replaced" : "appended";

  if (existingReportIndex >= 0) {
    reports[existingReportIndex] = report;
  } else {
    reports.push(report);
  }

  const cohort = {
    schemaVersion: 1,
    cohortName: typeof options.cohortName === "string" && options.cohortName.trim().length > 0
      ? options.cohortName
      : DEFAULT_COHORT_NAME,
    generatedAt: typeof options.now === "function" ? options.now() : new Date().toISOString(),
    manifestPath: cohortManifestPath,
    reports
  };

  await io.mkdir(path.dirname(options.cohortPath), { recursive: true });
  await io.writeJson(options.cohortPath, cohort);

  return {
    result: "updated",
    action,
    cohortPath: options.cohortPath,
    reportTesterId,
    summary: createCollectionSummary(reports)
  };
}

export function createDogfoodReportHelpText() {
  return [
    "Usage: npm run dogfood:report -- --report <path> [--cohort <path>]",
    "",
    "Adds or replaces one real single-user dogfood report in a cohort JSON file.",
    "This is an incremental collection helper; it does not claim dogfood completion.",
    "",
    "After collecting 3-5 distinct testers and all required workflows, run:",
    "  npm run dogfood:cohort -- --cohort .skfiy-dogfood/internal-alpha-cohort.json",
    "",
    "Required workflows:",
    ...REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => `  - ${workflow}`)
  ].join("\n");
}

function createCollectionSummary(reports) {
  const testerIds = collectDistinctTesterIds(reports);
  const requiredWorkflowCoverage = Object.fromEntries(
    REQUIRED_DOGFOOD_WORKFLOWS.map((workflow) => [
      workflow,
      reports.some((report) => Array.isArray(report?.workflows) && report.workflows.includes(workflow))
    ])
  );
  const coverageComplete = Object.values(requiredWorkflowCoverage).every(Boolean);

  return {
    totalReports: reports.length,
    distinctTesters: testerIds.size,
    cohortReady: testerIds.size >= 3 && testerIds.size <= 5 && coverageComplete,
    requiredWorkflowCoverage
  };
}

function collectDistinctTesterIds(reports) {
  return new Set(
    reports
      .map((report) => {
        try {
          return readTesterId(report);
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  );
}

function readTesterId(report) {
  if (typeof report?.testerId !== "string" || report.testerId.trim().length === 0) {
    throw new Error("Report testerId is required.");
  }

  return report.testerId.trim();
}

function readManifestPath(report) {
  if (typeof report?.manifestPath !== "string" || !path.isAbsolute(report.manifestPath)) {
    throw new Error("Report manifestPath must be an absolute path.");
  }

  return report.manifestPath;
}

function createDefaultIo() {
  return {
    async exists(filePath) {
      return existsSync(filePath);
    },
    mkdir,
    async readJson(filePath) {
      return JSON.parse(await readFile(filePath, "utf8"));
    },
    async writeJson(filePath, value) {
      await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
    }
  };
}

function readValue(argv, index, arg) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${arg} requires a value`);
  }

  return value;
}

async function runCli() {
  const defaults = createDefaultDogfoodReportOptions(DEFAULT_ROOT_DIR);
  const options = parseDogfoodReportArgs(process.argv.slice(2), defaults);

  if (options.help) {
    console.log(createDogfoodReportHelpText());
    return;
  }

  const result = await updateDogfoodCohort(options);
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

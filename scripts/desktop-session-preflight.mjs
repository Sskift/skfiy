import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";

const execFileAsync = promisify(execFile);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const LOGINWINDOW_BUNDLE_ID = "com.apple.loginwindow";
const BLACK_PIXEL_THRESHOLD = 8;
const NON_BLACK_RATIO_THRESHOLD = 0.002;

export function createDefaultDesktopSessionPreflightOptions(rootDir) {
  const appPath = path.join(rootDir, "dist", "skfiy.app");
  return {
    appPath,
    helperPath: path.join(appPath, "Contents", "MacOS", "skfiy-helper"),
    outputPath: undefined,
    screenshotOutputPath: path.join(
      os.tmpdir(),
      "skfiy",
      `desktop-session-${Date.now()}.png`
    ),
    requirePassed: false,
    help: false
  };
}

export function parseDesktopSessionPreflightArgs(argv, defaults) {
  const options = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--app":
        options.appPath = readValue(argv, index, arg);
        options.helperPath = path.join(options.appPath, "Contents", "MacOS", "skfiy-helper");
        index += 1;
        break;
      case "--helper":
        options.helperPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--screenshot-output":
        options.screenshotOutputPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--output":
        options.outputPath = readValue(argv, index, arg);
        index += 1;
        break;
      case "--require-passed":
        options.requirePassed = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown desktop-session preflight option: ${arg}`);
    }
  }

  return options;
}

export function createDesktopSessionPreflightHelpText(defaults) {
  return [
    "Usage: npm run smoke:desktop-session -- [options]",
    "",
    "Checks whether the active macOS desktop session is controllable before product smokes.",
    "It uses the packaged skfiy helper to read permissions, active app, and a screenshot,",
    "then classifies loginwindow/black-screen states as environment-blocked.",
    "",
    "Options:",
    `  --app <path>                 Packaged app bundle. Default: ${defaults.appPath}`,
    "  --helper <path>              Override helper path.",
    "  --screenshot-output <path>   Screenshot path for the probe.",
    "  --output <path>              JSON evidence path.",
    "  --require-passed             Exit 2 unless the desktop session preflight passes.",
    "  --help                       Show this help."
  ].join("\n");
}

export async function runDesktopSessionPreflight(options, io = defaultIo) {
  assertDesktopSessionPreflightReady(options, io);

  const evidence = {
    timestamp: new Date().toISOString(),
    appPath: options.appPath,
    helperPath: options.helperPath,
    runnerHasTmux: Boolean(process.env.TMUX),
    productPath: "packaged helper -> permissions-status/desktop-session-status/screenshot",
    artifactPath: options.outputPath,
    screenshotOutputPath: options.screenshotOutputPath,
    permissions: undefined,
    activeApp: undefined,
    screenshot: undefined,
    result: "not-run"
  };

  await io.mkdir(path.dirname(options.screenshotOutputPath), { recursive: true });
  evidence.permissions = await runHelperJson(options.helperPath, ["permissions-status"], io);
  const desktopSessionStatus = await runHelperJson(
    options.helperPath,
    ["desktop-session-status"],
    io
  );
  evidence.desktopSessionStatus = desktopSessionStatus;
  evidence.activeApp = readActiveAppFromDesktopSessionStatus(desktopSessionStatus);
  const screenshotPayload = await runHelperJson(
    options.helperPath,
    ["screenshot", "--output", options.screenshotOutputPath],
    io
  );
  const screenshotPath = readScreenshotOutput(screenshotPayload, options.screenshotOutputPath);
  const screenshotStats = await io.stat(screenshotPath);
  const screenshotBuffer = await io.readFile(screenshotPath);
  const pngAnalysis = analyzePngImage(screenshotBuffer);

  evidence.screenshot = {
    path: screenshotPath,
    exists: true,
    bytes: screenshotStats.size,
    png: pngAnalysis
  };
  evidence.result = classifyDesktopSessionPreflightEvidence(evidence);

  return evidence;
}

export function classifyDesktopSessionPreflightEvidence(evidence) {
  if (evidence.activeApp?.bundleId === LOGINWINDOW_BUNDLE_ID) {
    return "blocked";
  }

  if (evidence.screenshot?.png?.isLikelyBlack === true) {
    return "blocked";
  }

  if (evidence.screenshot?.exists === true && evidence.screenshot?.bytes > 0) {
    return "passed";
  }

  return "blocked";
}

export function explainDesktopSessionPreflightEvidence(evidence) {
  if (evidence.activeApp?.bundleId === LOGINWINDOW_BUNDLE_ID) {
    const pid = Number.isInteger(evidence.activeApp.pid) ? ` (pid ${evidence.activeApp.pid})` : "";
    return `Desktop session is not controllable because loginwindow is active${pid}. Unlock the Mac and keep the display awake, then retry.`;
  }

  if (evidence.screenshot?.png?.isLikelyBlack === true) {
    return "Desktop screenshot is effectively black even though a screenshot file was produced. Keep the display awake/unlocked and retry.";
  }

  if (evidence.result === "passed") {
    return "Desktop session preflight passed.";
  }

  return "Desktop session preflight did not produce a usable screenshot.";
}

export function analyzePngImage(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("PNG analysis expects a Buffer.");
  }

  const png = readPng(buffer);
  const bytesPerPixel = readBytesPerPixel(png);
  const stride = png.width * bytesPerPixel;
  const rawRows = zlib.inflateSync(Buffer.concat(png.idatChunks));
  const rows = [];
  let offset = 0;
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < png.height; y += 1) {
    const filter = rawRows[offset];
    offset += 1;
    const encoded = rawRows.subarray(offset, offset + stride);
    offset += stride;
    const decoded = decodePngFilter(filter, encoded, previous, bytesPerPixel);
    rows.push(decoded);
    previous = decoded;
  }

  const sampleStep = Math.max(1, Math.floor(Math.sqrt((png.width * png.height) / 20000)));
  let sampleCount = 0;
  let nonBlackCount = 0;

  for (let y = 0; y < png.height; y += sampleStep) {
    const row = rows[y];
    for (let x = 0; x < png.width; x += sampleStep) {
      const index = x * bytesPerPixel;
      const pixel = readPixel(row, index, png.colorType);
      sampleCount += 1;

      if (Math.max(pixel.r, pixel.g, pixel.b) > BLACK_PIXEL_THRESHOLD) {
        nonBlackCount += 1;
      }
    }
  }

  const nonBlackRatio = sampleCount === 0 ? 0 : nonBlackCount / sampleCount;

  return {
    width: png.width,
    height: png.height,
    bitDepth: png.bitDepth,
    colorType: png.colorType,
    sampleCount,
    nonBlackCount,
    nonBlackRatio,
    isLikelyBlack: nonBlackRatio < NON_BLACK_RATIO_THRESHOLD
  };
}

async function runHelperJson(helperPath, args, io) {
  const result = await io.execFile(helperPath, args, { maxBuffer: 1024 * 1024 * 8 });

  if (result.stderr.trim().length > 0) {
    throw new Error(`skfiy-helper ${args[0]} wrote stderr: ${result.stderr.trim()}`);
  }

  const parsed = JSON.parse(result.stdout);
  if (parsed?.ok !== true) {
    throw new Error(`skfiy-helper ${args[0]} failed: ${result.stdout}`);
  }

  return parsed.data;
}

function assertDesktopSessionPreflightReady(options, io) {
  if (!io.exists(options.appPath)) {
    throw new Error(`App bundle is missing at ${options.appPath}. Run npm run build first.`);
  }

  if (!io.exists(options.helperPath)) {
    throw new Error(`Packaged helper is missing at ${options.helperPath}. Run npm run build first.`);
  }
}

function readActiveAppFromDesktopSessionStatus(status) {
  return {
    bundleId: typeof status?.frontmostBundleId === "string"
      ? status.frontmostBundleId
      : undefined,
    name: typeof status?.frontmostLocalizedName === "string"
      ? status.frontmostLocalizedName
      : undefined,
    pid: Number.isInteger(status?.frontmostProcessIdentifier)
      ? status.frontmostProcessIdentifier
      : undefined,
    controllable: status?.controllable === true
  };
}

function readScreenshotOutput(payload, fallback) {
  return typeof payload?.output === "string" && payload.output.length > 0
    ? payload.output
    : fallback;
}

function readPng(buffer) {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Screenshot is not a PNG image.");
  }

  let offset = 8;
  let header;
  const idatChunks = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd + 4 > buffer.length) {
      throw new Error(`PNG chunk ${type} exceeds file length.`);
    }

    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12]
      };
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (!header) {
    throw new Error("PNG is missing IHDR.");
  }

  if (header.width <= 0 || header.height <= 0) {
    throw new Error("PNG has invalid dimensions.");
  }

  if (header.bitDepth !== 8) {
    throw new Error(`Unsupported PNG bit depth: ${header.bitDepth}.`);
  }

  if (header.interlace !== 0) {
    throw new Error("Interlaced PNG screenshots are not supported.");
  }

  if (idatChunks.length === 0) {
    throw new Error("PNG is missing IDAT data.");
  }

  return { ...header, idatChunks };
}

function readBytesPerPixel({ colorType }) {
  switch (colorType) {
    case 0:
      return 1;
    case 2:
      return 3;
    case 4:
      return 2;
    case 6:
      return 4;
    default:
      throw new Error(`Unsupported PNG color type: ${colorType}.`);
  }
}

function decodePngFilter(filter, encoded, previous, bytesPerPixel) {
  const decoded = Buffer.alloc(encoded.length);

  for (let index = 0; index < encoded.length; index += 1) {
    const left = index >= bytesPerPixel ? decoded[index - bytesPerPixel] : 0;
    const up = previous[index] ?? 0;
    const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] ?? 0 : 0;
    let predictor = 0;

    switch (filter) {
      case 0:
        predictor = 0;
        break;
      case 1:
        predictor = left;
        break;
      case 2:
        predictor = up;
        break;
      case 3:
        predictor = Math.floor((left + up) / 2);
        break;
      case 4:
        predictor = paeth(left, up, upperLeft);
        break;
      default:
        throw new Error(`Unsupported PNG row filter: ${filter}.`);
    }

    decoded[index] = (encoded[index] + predictor) & 0xff;
  }

  return decoded;
}

function paeth(left, up, upperLeft) {
  const p = left + up - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upperLeft);

  if (pa <= pb && pa <= pc) {
    return left;
  }

  return pb <= pc ? up : upperLeft;
}

function readPixel(row, index, colorType) {
  switch (colorType) {
    case 0:
      return { r: row[index], g: row[index], b: row[index] };
    case 2:
      return { r: row[index], g: row[index + 1], b: row[index + 2] };
    case 4:
      return { r: row[index], g: row[index], b: row[index] };
    case 6:
      return { r: row[index], g: row[index + 1], b: row[index + 2] };
    default:
      throw new Error(`Unsupported PNG color type: ${colorType}.`);
  }
}

function readValue(argv, index, name) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

const defaultIo = {
  exists: existsSync,
  execFile: execFileAsync,
  mkdir,
  readFile,
  stat,
  writeFile
};

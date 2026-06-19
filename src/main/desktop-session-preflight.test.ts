import zlib from "node:zlib";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("desktop session preflight script", () => {
  it("classifies loginwindow as blocked even when a screenshot exists", async () => {
    const { classifyDesktopSessionPreflightEvidence } = await importPreflightScript();

    expect(classifyDesktopSessionPreflightEvidence({
      activeApp: { bundleId: "com.apple.loginwindow", pid: 591 },
      screenshot: {
        exists: true,
        bytes: 1200,
        png: { isLikelyBlack: false }
      }
    })).toBe("blocked");
  });

  it("classifies an all-black screenshot as blocked", async () => {
    const {
      analyzePngImage,
      classifyDesktopSessionPreflightEvidence
    } = await importPreflightScript();
    const analysis = analyzePngImage(createPng({
      width: 2,
      height: 1,
      rgba: [
        [0, 0, 0, 255],
        [0, 0, 0, 255]
      ]
    }));

    expect(analysis).toMatchObject({
      width: 2,
      height: 1,
      isLikelyBlack: true,
      nonBlackCount: 0
    });
    expect(classifyDesktopSessionPreflightEvidence({
      activeApp: { bundleId: "com.openai.codex", pid: 4744 },
      screenshot: {
        exists: true,
        bytes: 1200,
        png: analysis
      }
    })).toBe("blocked");
  });

  it("passes a non-black screenshot when loginwindow is not active", async () => {
    const {
      analyzePngImage,
      classifyDesktopSessionPreflightEvidence
    } = await importPreflightScript();
    const analysis = analyzePngImage(createPng({
      width: 2,
      height: 1,
      rgba: [
        [0, 0, 0, 255],
        [255, 255, 255, 255]
      ]
    }));

    expect(analysis.isLikelyBlack).toBe(false);
    expect(classifyDesktopSessionPreflightEvidence({
      activeApp: { bundleId: "com.openai.codex", pid: 4744 },
      screenshot: {
        exists: true,
        bytes: 1200,
        png: analysis
      }
    })).toBe("passed");
  });
});

async function importPreflightScript() {
  return await import(
    pathToFileURL(path.join(process.cwd(), "scripts", "desktop-session-preflight.mjs")).href
  ) as {
    analyzePngImage: (buffer: Buffer) => {
      width: number;
      height: number;
      isLikelyBlack: boolean;
      nonBlackCount: number;
    };
    classifyDesktopSessionPreflightEvidence: (evidence: Record<string, unknown>) => string;
  };
}

function createPng({
  width,
  height,
  rgba
}: {
  width: number;
  height: number;
  rgba: Array<[number, number, number, number]>;
}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const rowBytes = [];
  for (let y = 0; y < height; y += 1) {
    rowBytes.push(0);
    for (let x = 0; x < width; x += 1) {
      const pixel = rgba[(y * width) + x];
      rowBytes.push(...pixel);
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(Buffer.from(rowBytes))),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([
    length,
    Buffer.from(type, "ascii"),
    data,
    Buffer.alloc(4)
  ]);
}

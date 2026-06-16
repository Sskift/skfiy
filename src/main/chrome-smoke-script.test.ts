import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

describe("Chrome product smoke script", () => {
  it("is exposed as an npm script and uses the product preload API", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    const source = readFileSync(
      path.join(process.cwd(), "scripts/smoke-chrome-product.mjs"),
      "utf8"
    );

    expect(packageJson.scripts).toMatchObject({
      "smoke:chrome": "node scripts/smoke-chrome-product.mjs"
    });
    expect(source).toContain("window.skfiy.runCommand");
    expect(source).toContain("window.skfiy.approveTask()");
    expect(source).toContain("window.skfiy.getAppPolicySettings()");
  });

  it("defines a Chrome product path, CDP port, and output option", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-chrome-plan.mjs");

    expect(existsSync(modulePath)).toBe(true);

    const {
      FALLBACK_PRODUCT_PATH,
      FALLBACK_SWITCH_PRODUCT_PATH,
      classifyChromeFallbackSmokeEvidence,
      classifyChromeFallbackSwitchEvidence,
      PRODUCT_PATH,
      createDefaultChromeSmokeOptions,
      createHelpText,
      parseChromeSmokeArgs
    } = await import(pathToFileURL(modulePath).href) as {
      FALLBACK_PRODUCT_PATH: string;
      FALLBACK_SWITCH_PRODUCT_PATH: string;
      classifyChromeFallbackSmokeEvidence: (input: Record<string, unknown>) => string;
      classifyChromeFallbackSwitchEvidence: (input: Record<string, unknown>) => string;
      PRODUCT_PATH: string;
      createDefaultChromeSmokeOptions: (rootDir: string) => Record<string, unknown>;
      createHelpText: (defaults: Record<string, unknown>) => string;
      parseChromeSmokeArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
    };

    expect(PRODUCT_PATH).toBe("renderer -> preload -> main -> CDP -> Chrome");
    expect(FALLBACK_PRODUCT_PATH).toBe(
      "renderer -> preload -> main -> helper observe_app -> Chrome screenshot fallback"
    );
    expect(FALLBACK_SWITCH_PRODUCT_PATH).toBe(
      "renderer -> preload -> main -> CDP failure -> helper observe_app -> Chrome screenshot fallback"
    );
    expect(parseChromeSmokeArgs(
      ["--output", ".skfiy-smoke/chrome.json", "--chrome-port", "9444"],
      createDefaultChromeSmokeOptions("/repo")
    )).toMatchObject({
      outputPath: path.resolve(".skfiy-smoke/chrome.json"),
      chromePort: 9444
    });
    expect(createHelpText(createDefaultChromeSmokeOptions("/repo"))).toContain("smoke:chrome");
    expect(classifyChromeFallbackSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: FALLBACK_PRODUCT_PATH,
      events: [
        { status: "executing", message: "Verified app_activated: Activated Chrome." },
        {
          status: "observing",
          message: "Captured before screenshot: /tmp/chrome-fallback.png",
          replayRecord: {
            stage: "before",
            bundleId: "com.google.Chrome",
            isRunning: true,
            isActive: true,
            screenshotPath: "/tmp/chrome-fallback.png"
          }
        },
        {
          status: "needs_confirmation",
          message: "Verification failed (connection): Chrome CDP endpoint is not configured; screenshot fallback observation captured: /tmp/chrome-fallback.png"
        }
      ]
    })).toBe("fallback-observed");
    expect(classifyChromeFallbackSmokeEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: FALLBACK_PRODUCT_PATH,
      events: [
        {
          status: "needs_confirmation",
          message: "Verification failed (connection): Chrome CDP endpoint is not configured; screenshot fallback failed: Screen Recording permission is required"
        }
      ]
    })).toBe("fallback-blocked");
    expect(classifyChromeFallbackSwitchEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: FALLBACK_SWITCH_PRODUCT_PATH,
      configuredEndpoint: "http://127.0.0.1:65530",
      events: [
        {
          status: "executing",
          message: "Switching Chrome control from CDP to screenshot_fallback (navigation): Chrome CDP navigation failed: fetch failed"
        },
        {
          status: "needs_confirmation",
          message: "Verification failed (navigation): Chrome CDP navigation failed: fetch failed screenshot fallback failed: Screen Recording permission is required"
        }
      ]
    })).toBe("fallback-switched-blocked");
    expect(classifyChromeFallbackSwitchEvidence({
      appLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: FALLBACK_SWITCH_PRODUCT_PATH,
      configuredEndpoint: "http://127.0.0.1:65530",
      events: [
        {
          status: "executing",
          message: "Switching Chrome control from cdp to screenshot_fallback (navigation): Chrome CDP navigation failed: fetch failed"
        },
        {
          status: "needs_confirmation",
          message: "Verification failed (navigation): Chrome CDP navigation failed: fetch failed screenshot fallback activation failed: Accessibility permission is required"
        }
      ]
    })).toBe("fallback-switched-blocked");
  });

  it("records a configured-CDP failure switch run in the product smoke source", () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/smoke-chrome-product.mjs"),
      "utf8"
    );

    expect(source).toContain("fallbackSwitchRun");
    expect(source).toContain("runChromeFallbackSwitchProductCommand");
    expect(source).toContain("classifyChromeFallbackSwitchEvidence");
  });

  it("classifies a completed Chrome extraction with expected text as passed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-chrome-plan.mjs");
    const {
      classifyChromeSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyChromeSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyChromeSmokeEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> CDP -> Chrome",
      extractedText: "skfiy chrome smoke ready",
      events: [{ status: "completed", message: "Chrome test page extracted: skfiy chrome smoke ready" }]
    })).toBe("passed");
  });

  it("classifies a completed Chrome form action with expected text as passed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-chrome-plan.mjs");
    const {
      FORM_EXPECTED_TEXT,
      classifyChromeSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      FORM_EXPECTED_TEXT: string;
      classifyChromeSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyChromeSmokeEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> CDP -> Chrome",
      expectedText: FORM_EXPECTED_TEXT,
      extractedText: FORM_EXPECTED_TEXT,
      events: [
        { status: "executing", message: "Verified navigate: Navigated to: file:///tmp/form.html" },
        { status: "executing", message: "Verified fill_selector: Filled #name." },
        { status: "executing", message: "Verified fill_selector: Filled #email." },
        { status: "executing", message: "Verified fill_selector: Filled #role." },
        { status: "executing", message: "Verified click_selector: Clicked #submit." },
        { status: "executing", message: `Verified extract_text: Extracted text: ${FORM_EXPECTED_TEXT}` },
        { status: "completed", message: `Chrome test page extracted: ${FORM_EXPECTED_TEXT}` }
      ]
    })).toBe("passed");
  });

  it("classifies a Chrome sensitive-page pause as safety evidence", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-chrome-plan.mjs");
    const {
      classifyChromeSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      classifyChromeSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyChromeSmokeEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> CDP -> Chrome",
      extractedText: "",
      events: [
        {
          status: "executing",
          message: "Verified navigate: Navigated to: file:///tmp/skfiy-login.html"
        },
        {
          status: "needs_confirmation",
          message: "Verification failed (sensitive): Sensitive UI text is visible."
        }
      ]
    })).toBe("sensitive-paused");
  });
});

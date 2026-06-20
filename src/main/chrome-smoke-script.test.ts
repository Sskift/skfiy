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
      classifyChromeBringYourOwnCurrentPageEvidence,
      classifyChromeCurrentPageSmokeEvidence,
      classifyChromeFallbackSmokeEvidence,
      classifyChromeFallbackSwitchEvidence,
      PRODUCT_PATH,
      createDefaultChromeSmokeOptions,
      createHelpText,
      parseChromeSmokeArgs,
      selectInstalledExtensionChromeApp
    } = await import(pathToFileURL(modulePath).href) as {
      FALLBACK_PRODUCT_PATH: string;
      FALLBACK_SWITCH_PRODUCT_PATH: string;
      classifyChromeBringYourOwnCurrentPageEvidence: (input: Record<string, unknown>) => string;
      classifyChromeCurrentPageSmokeEvidence: (input: Record<string, unknown>) => string;
      classifyChromeFallbackSmokeEvidence: (input: Record<string, unknown>) => string;
      classifyChromeFallbackSwitchEvidence: (input: Record<string, unknown>) => string;
      PRODUCT_PATH: string;
      createDefaultChromeSmokeOptions: (rootDir: string) => Record<string, unknown>;
      createHelpText: (defaults: Record<string, unknown>) => string;
      parseChromeSmokeArgs: (
        argv: string[],
        defaults: Record<string, unknown>
      ) => Record<string, unknown>;
      selectInstalledExtensionChromeApp: (input: Record<string, unknown>) => Record<string, unknown>;
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
    expect(parseChromeSmokeArgs(
      [
        "--current-page-endpoint",
        "http://127.0.0.1:9222",
        "--output",
        ".skfiy-smoke/chrome-real-page.json"
      ],
      createDefaultChromeSmokeOptions("/repo")
    )).toMatchObject({
      currentPageEndpoint: "http://127.0.0.1:9222",
      outputPath: path.resolve(".skfiy-smoke/chrome-real-page.json")
    });
    expect(parseChromeSmokeArgs(
      [
        "--extension-chrome-app",
        "Google Chrome for Testing",
        "--output",
        ".skfiy-smoke/chrome-cft.json"
      ],
      createDefaultChromeSmokeOptions("/repo")
    )).toMatchObject({
      extensionChromeAppName: "Google Chrome for Testing",
      outputPath: path.resolve(".skfiy-smoke/chrome-cft.json")
    });
    expect(selectInstalledExtensionChromeApp({
      chromeAppName: "Google Chrome",
      availableAppNames: ["Google Chrome for Testing", "Google Chrome"]
    })).toMatchObject({
      chromeAppName: "Google Chrome for Testing",
      source: "auto-discovered-loadable-browser",
      loadExtensionFriendly: true
    });
    expect(selectInstalledExtensionChromeApp({
      chromeAppName: "Google Chrome",
      extensionChromeAppName: "Chromium",
      availableAppNames: ["Google Chrome for Testing"]
    })).toMatchObject({
      chromeAppName: "Chromium",
      source: "explicit-extension-chrome-app"
    });
    expect(selectInstalledExtensionChromeApp({
      chromeAppName: "Google Chrome"
    })).toMatchObject({
      chromeAppName: "Google Chrome",
      source: "fallback-primary-browser",
      recommendedBrowser: "Chrome for Testing or Chromium"
    });
    expect(createHelpText(createDefaultChromeSmokeOptions("/repo"))).toContain("smoke:chrome");
    expect(createHelpText(createDefaultChromeSmokeOptions("/repo"))).toContain(
      "--current-page-endpoint"
    );
    expect(createHelpText(createDefaultChromeSmokeOptions("/repo"))).toContain(
      "--extension-chrome-app"
    );
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
    expect(classifyChromeCurrentPageSmokeEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: PRODUCT_PATH,
      pageSnapshot: {
        url: "file:///tmp/skfiy-chrome.html",
        title: "skfiy chrome smoke",
        text: "skfiy chrome smoke ready"
      },
      events: [
        {
          status: "executing",
          message: "Verified current_page_snapshot: Observed current page: skfiy chrome smoke (file:///tmp/skfiy-chrome.html)"
        },
        {
          status: "completed",
          message: "Chrome current page extracted: skfiy chrome smoke ready"
        }
      ]
    })).toBe("passed");
    expect(classifyChromeBringYourOwnCurrentPageEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: false,
      runnerHasTmux: false,
      productPath: PRODUCT_PATH,
      chromeEndpoint: "http://127.0.0.1:9222",
      pageSnapshot: {
        url: "https://example.bytedance.net/workspace",
        title: "internal workspace",
        text: "logged in workspace ready"
      },
      events: [
        {
          status: "executing",
          message: "Verified current_page_snapshot: Observed current page: internal workspace (https://example.bytedance.net/workspace)"
        },
        {
          status: "completed",
          message: "Chrome current page extracted: logged in workspace ready"
        }
      ]
    })).toBe("passed");
    expect(classifyChromeBringYourOwnCurrentPageEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: false,
      runnerHasTmux: false,
      productPath: PRODUCT_PATH,
      chromeEndpoint: "http://127.0.0.1:9222",
      pageSnapshot: {
        url: "https://example.bytedance.net/workspace",
        title: "internal workspace",
        text: "logged in workspace ready"
      },
      events: [
        {
          status: "executing",
          message: "Verified navigate: Navigated to: https://example.bytedance.net/workspace"
        },
        {
          status: "completed",
          message: "Chrome current page extracted: logged in workspace ready"
        }
      ]
    })).toBe("failed");
    expect(classifyChromeBringYourOwnCurrentPageEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: false,
      runnerHasTmux: false,
      productPath: PRODUCT_PATH,
      chromeEndpoint: "http://127.0.0.1:65530",
      events: [
        {
          status: "needs_confirmation",
          message: "Verification failed (extraction): Chrome CDP current page snapshot failed: endpoint unavailable screenshot fallback failed: Screen Recording permission is required"
        }
      ]
    })).toBe("blocked");
    expect(classifyChromeBringYourOwnCurrentPageEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: false,
      runnerHasTmux: false,
      productPath: PRODUCT_PATH,
      chromeEndpoint: "http://127.0.0.1:65530",
      events: [
        {
          status: "needs_confirmation",
          message: "Verification failed (extraction): Chrome CDP current page snapshot failed: fetch failed screenshot fallback activation failed: Accessibility permission is required"
        }
      ]
    })).toBe("blocked");
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

  it("records a sensitive Chrome form prefill pause run in the product smoke source", () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/smoke-chrome-product.mjs"),
      "utf8"
    );

    expect(source).toContain("sensitiveFormRun");
    expect(source).toContain("sensitiveFormCommand");
    expect(source).toContain("SENSITIVE_FORM_FIELDS");
    expect(source).toContain("#password");
    expect(source).toContain("formatFormAssignments(SENSITIVE_FORM_FIELDS)");
  });

  it("records a current Chrome page observation run in the product smoke source", () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/smoke-chrome-product.mjs"),
      "utf8"
    );

    expect(source).toContain("currentPageRun");
    expect(source).toContain("realCurrentPageRun");
    expect(source).toContain("观察 Chrome 当前页面并提取正文");
    expect(source).toContain("runChromeBringYourOwnCurrentPageCommand");
    expect(source).toContain("currentPageEndpoint");
    expect(source).toContain("classifyChromeCurrentPageSmokeEvidence");
    expect(source).toContain("classifyChromeBringYourOwnCurrentPageEvidence");
  });

  it("records an installed Chrome extension Native Messaging run in the product smoke source", () => {
    const source = readFileSync(
      path.join(process.cwd(), "scripts/smoke-chrome-product.mjs"),
      "utf8"
    );

    expect(source).toContain("installedExtensionRun");
    expect(source).toContain("runInstalledChromeExtensionSmoke");
    expect(source).toContain("--load-extension=");
    expect(source).toContain("chrome.runtime.connectNative");
    expect(source).toContain("selectInstalledExtensionChromeApp");
    expect(source).toContain("discoverInstalledExtensionChromeAppNames");
    expect(source).toContain("browserSelection");
    expect(source).toContain("findSkfiyExtensionWorker");
    expect(source).toContain("hostPolicyResponse");
    expect(source).toContain("skfiy.host_policy.request");
    expect(source).toContain("branded_chrome_load_extension_removed");
    expect(source).toContain("Chrome for Testing");
    expect(source).toContain("chrome-smoke-installed-extension");
    expect(source).toContain("heartbeatReadError");
  });

  it("classifies a completed Chrome extraction with expected text as passed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-chrome-plan.mjs");
    const {
      INSTALLED_EXTENSION_PRODUCT_PATH,
      classifyChromeSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      INSTALLED_EXTENSION_PRODUCT_PATH: string;
      classifyChromeSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyChromeSmokeEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> CDP -> Chrome",
      nativeHostBridgeRun: createPassingNativeHostBridgeRun(),
      installedExtensionRun: createPassingInstalledExtensionRun(INSTALLED_EXTENSION_PRODUCT_PATH),
      extractedText: "skfiy chrome smoke ready",
      events: [{ status: "completed", message: "Chrome test page extracted: skfiy chrome smoke ready" }]
    })).toBe("passed");
    expect(classifyChromeSmokeEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> CDP -> Chrome",
      nativeHostBridgeRun: createPassingNativeHostBridgeRun(),
      installedExtensionRun: createBlockedInstalledExtensionRun(INSTALLED_EXTENSION_PRODUCT_PATH),
      extractedText: "skfiy chrome smoke ready",
      events: [{ status: "completed", message: "Chrome test page extracted: skfiy chrome smoke ready" }]
    })).toBe("passed");
    expect(classifyChromeSmokeEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> CDP -> Chrome",
      extractedText: "skfiy chrome smoke ready",
      events: [{ status: "completed", message: "Chrome test page extracted: skfiy chrome smoke ready" }]
    })).toBe("failed");
    expect(classifyChromeSmokeEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> CDP -> Chrome",
      nativeHostBridgeRun: createPassingNativeHostBridgeRun(),
      extractedText: "skfiy chrome smoke ready",
      events: [{ status: "completed", message: "Chrome test page extracted: skfiy chrome smoke ready" }]
    })).toBe("failed");
  });

  it("classifies a completed Chrome form action with expected text as passed", async () => {
    const modulePath = path.join(process.cwd(), "scripts/smoke-chrome-plan.mjs");
    const {
      FORM_EXPECTED_TEXT,
      INSTALLED_EXTENSION_PRODUCT_PATH,
      classifyChromeSmokeEvidence
    } = await import(pathToFileURL(modulePath).href) as {
      FORM_EXPECTED_TEXT: string;
      INSTALLED_EXTENSION_PRODUCT_PATH: string;
      classifyChromeSmokeEvidence: (input: Record<string, unknown>) => string;
    };

    expect(classifyChromeSmokeEvidence({
      appLaunchViaOpen: true,
      chromeLaunchViaOpen: true,
      runnerHasTmux: false,
      productPath: "renderer -> preload -> main -> CDP -> Chrome",
      nativeHostBridgeRun: createPassingNativeHostBridgeRun(),
      installedExtensionRun: createPassingInstalledExtensionRun(INSTALLED_EXTENSION_PRODUCT_PATH),
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
      nativeHostBridgeRun: createPassingNativeHostBridgeRun(),
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

  it("classifies a Chrome sensitive-form prefill pause as safety evidence", async () => {
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
      nativeHostBridgeRun: createPassingNativeHostBridgeRun(),
      extractedText: "",
      events: [
        {
          status: "needs_confirmation",
          message: "Verification failed (sensitive): Sensitive form input is not allowed for Chrome Computer Use."
        }
      ]
    })).toBe("sensitive-paused");
  });
});

function createPassingNativeHostBridgeRun() {
  return {
    result: "passed",
    productPath: "dist/skfiy -> Chrome Native Messaging heartbeat",
    command: [
      "/repo/dist/skfiy",
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop/"
    ],
    response: {
      schemaVersion: 1,
      type: "skfiy.native.response",
      requestId: "chrome-smoke-native-host",
      result: "accepted"
    },
    hostPolicyResponse: {
      schemaVersion: 1,
      type: "skfiy.native.response",
      requestId: "chrome-smoke-host-policy",
      result: "accepted",
      hostPolicy: {
        schemaVersion: 1,
        state: "default",
        path: "/repo/.skfiy-smoke/chrome-native-home/Library/Application Support/skfiy/chrome-host-policy.json",
        policy: {
          defaultMode: "ask",
          allowedHosts: [],
          currentTurnAllowedHosts: [],
          blockedHosts: []
        }
      }
    },
    heartbeat: {
      schemaVersion: 1,
      hostName: "com.sskift.skfiy",
      launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
      messageType: "skfiy.page.observe",
      requestId: "chrome-smoke-native-host"
    },
    heartbeatPath: "/repo/.skfiy-smoke/chrome-native-home/Library/Application Support/skfiy/chrome-extension-connection.json"
  };
}

function createPassingInstalledExtensionRun(productPath: string) {
  return {
    result: "passed",
    productPath,
    extensionId: "abcdefghijklmnopabcdefghijklmnop",
    launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
    response: {
      schemaVersion: 1,
      type: "skfiy.native.response",
      requestId: "chrome-smoke-installed-extension",
      result: "accepted"
    },
    heartbeat: {
      schemaVersion: 1,
      hostName: "com.sskift.skfiy",
      launchOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop/",
      messageType: "skfiy.page.observe",
      requestId: "chrome-smoke-installed-extension"
    },
    heartbeatPath: "/tmp/skfiy-extension-home/Library/Application Support/skfiy/chrome-extension-connection.json"
  };
}

function createBlockedInstalledExtensionRun(productPath: string) {
  return {
    result: "blocked",
    productPath,
    blockedReason: "branded_chrome_load_extension_removed",
    chromeVersion: "Chrome/146.0.7680.80",
    extensionPath: "/repo/chrome-extension",
    recommendedBrowser: "Chrome for Testing or Chromium"
  };
}

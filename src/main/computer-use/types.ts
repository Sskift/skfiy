export interface DesktopHelperProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ProcessRunner = (
  command: string,
  args: readonly string[]
) => Promise<DesktopHelperProcessResult>;

export interface DesktopHelperClientOptions {
  helperPath?: string;
  runner?: ProcessRunner;
}

export interface DesktopAppInfo {
  bundleId: string;
  name: string;
  pid?: number;
}

export type DesktopAction =
  | { type: "screenshot"; outputPath: string }
  | { type: "click"; x: number; y: number }
  | { type: "type_text"; text: string }
  | { type: "press_key"; key: string }
  | { type: "activate_app"; bundleId: string }
  | { type: "observe_app"; bundleId: string; screenshotOutputPath: string };

export interface ScreenshotResult {
  outputPath: string;
}

export interface DesktopHelperActionResult {
  ok: boolean;
  message?: string;
}

export interface DesktopAppState {
  bundleId: string;
  isRunning: boolean;
  isActive: boolean;
  screenshotPath: string;
}

export type DesktopActionResult =
  | ScreenshotResult
  | DesktopHelperActionResult
  | DesktopAppState;

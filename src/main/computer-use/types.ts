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

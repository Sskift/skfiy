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

export type DesktopExecutableAction =
  | { type: "screenshot"; outputPath: string }
  | { type: "click"; x: number; y: number }
  | { type: "type_text"; text: string }
  | { type: "press_key"; key: string }
  | { type: "activate_app"; bundleId: string }
  | { type: "observe_app"; bundleId: string; screenshotOutputPath: string };

export interface WaitAction {
  type: "wait";
  ms: number;
}

export type DesktopAction = DesktopExecutableAction | WaitAction;

export interface ScreenshotResult {
  outputPath: string;
}

export interface DesktopHelperActionResult {
  ok: boolean;
  message?: string;
}

export type PermissionState = "granted" | "denied" | "not-determined" | "unknown";

export type PermissionSettingsTarget =
  | "screen-recording"
  | "accessibility"
  | "microphone";

export interface PermissionStatus {
  state: PermissionState;
}

export interface PermissionSummary {
  screenRecording: PermissionStatus;
  accessibility: PermissionStatus;
  microphone: PermissionStatus;
}

export interface DesktopAppState {
  bundleId: string;
  isRunning: boolean;
  isActive: boolean;
  screenshotPath: string;
  frontmostBundleId?: string;
  accessibilityTrusted?: boolean;
  windows?: DesktopWindowInfo[];
}

export interface DesktopWindowInfo {
  title?: string;
  layer: number;
  bounds: DesktopWindowBounds;
}

export interface DesktopWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WaitResult {
  ok: true;
  waitedMs: number;
}

export type DesktopActionResult =
  | ScreenshotResult
  | DesktopHelperActionResult
  | DesktopAppState
  | WaitResult;

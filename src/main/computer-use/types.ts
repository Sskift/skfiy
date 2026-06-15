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
  | { type: "drag"; from: DesktopPoint; to: DesktopPoint; durationMs?: number }
  | { type: "scroll"; deltaX: number; deltaY: number }
  | { type: "type_text"; text: string }
  | { type: "press_key"; key: string }
  | { type: "hotkey"; key: string; modifiers: readonly string[] }
  | { type: "activate_app"; bundleId: string; pid?: number }
  | { type: "open_ghostty_session"; title: string; workingDirectory?: string }
  | { type: "observe_app"; bundleId: string; pid?: number; screenshotOutputPath: string };

export interface WaitAction {
  type: "wait";
  ms: number;
}

export type DesktopAction = DesktopExecutableAction | WaitAction;

export interface ScreenshotResult {
  outputPath: string;
}

export interface OcrLabelObservation {
  text: string;
  confidence: number;
  bounds: DesktopWindowBounds;
}

export interface OcrImageResult {
  labels: OcrLabelObservation[];
}

export interface SpeechStatusResult {
  locale: string;
  recognizerAvailable: boolean;
  speechRecognition: PermissionStatus;
  microphone: PermissionStatus;
}

export interface NativeSpeechTranscriptionOptions {
  locale: string;
  maxDurationMs: number;
  silenceTimeoutMs: number;
}

export interface NativeSpeechTranscriptionResult {
  text: string;
  isFinal: boolean;
  confidence?: number;
  durationMs: number;
  silenceTimedOut: boolean;
}

export interface DesktopHelperActionResult {
  ok: boolean;
  message?: string;
}

export interface OpenGhosttySessionResult {
  bundleId: string;
  title: string;
  pid: number;
  opened: true;
  workingDirectory?: string;
  appURL?: string;
  arguments?: string[];
}

export type PermissionState = "granted" | "denied" | "not-determined" | "unknown";

export type PermissionSettingsTarget =
  | "screen-recording"
  | "accessibility"
  | "microphone"
  | "speech-recognition";

export interface PermissionStatus {
  state: PermissionState;
}

export interface PermissionSummary {
  screenRecording: PermissionStatus;
  accessibility: PermissionStatus;
  microphone: PermissionStatus;
  speechRecognition: PermissionStatus;
}

export interface DesktopAppState {
  bundleId: string;
  pid?: number;
  isRunning: boolean;
  isActive: boolean;
  screenshotPath: string;
  frontmostBundleId?: string;
  accessibilityTrusted?: boolean;
  windows?: DesktopWindowInfo[];
  ocrLabels?: OcrLabelObservation[];
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

export interface DesktopPoint {
  x: number;
  y: number;
}

export interface WaitResult {
  ok: true;
  waitedMs: number;
}

export type DesktopActionResult =
  | ScreenshotResult
  | OcrImageResult
  | SpeechStatusResult
  | NativeSpeechTranscriptionResult
  | DesktopHelperActionResult
  | OpenGhosttySessionResult
  | DesktopAppState
  | WaitResult;

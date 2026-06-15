import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

/*
 JSON output contract:

 The helper writes exactly one JSON object to stdout for every invocation.
 Successful commands exit 0 and use:
 {
   "ok": true,
   "command": "<command-name>",
   "data": { ... command-specific payload ... }
 }

 Failed commands exit non-zero and use:
 {
   "ok": false,
   "command": "<command-name-or-unknown>",
   "error": {
     "code": "<stable_machine_code>",
     "message": "<human-readable message>",
     "details": { ... optional structured context ... }
   }
 }

 Command payloads:
 - list-apps:
   data.apps[] = {
     bundleId: String | null,
     localizedName: String | null,
     processIdentifier: Number,
     isActive: Boolean,
     activationPolicy: "regular" | "accessory" | "prohibited" | "unknown"
   }
 - activate-app --bundle-id <id>:
   data = { bundleId: String, activated: Boolean }
 - screenshot --output <path>:
   data = { output: String }
 - click --x <n> --y <n>:
   data = { x: Number, y: Number }
 - type-text --text <text>:
   data = { textLength: Number }
 - press-key --key enter|escape|space:
   data = { key: String }
 - get-app-state --bundle-id <id> --screenshot-output <path>:
   data = {
     app: <same shape as list-apps item>,
     frontmostBundleId: String | null,
     accessibilityTrusted: Boolean,
     screenshot: { output: String },
     windows: [{
       title: String | null,
       layer: Number,
       bounds: { x: Number, y: Number, width: Number, height: Number }
     }]
   }

 Security contract:
 - This helper never executes shell commands.
 - The only subprocess it starts is /usr/sbin/screencapture, and only for
   screenshot capture.
 */

let supportedCommands = [
    "list-apps",
    "activate-app",
    "screenshot",
    "click",
    "type-text",
    "press-key",
    "get-app-state"
]

enum JSONValue: Encodable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case strings([String])

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .string(let value):
            try container.encode(value)
        case .int(let value):
            try container.encode(value)
        case .double(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .strings(let value):
            try container.encode(value)
        }
    }
}

struct HelperFailure: Error {
    let code: String
    let message: String
    let details: [String: JSONValue]

    init(_ code: String, _ message: String, details: [String: JSONValue] = [:]) {
        self.code = code
        self.message = message
        self.details = details
    }
}

struct SuccessResponse<Payload: Encodable>: Encodable {
    let ok = true
    let command: String
    let data: Payload
}

struct FailureResponse: Encodable {
    let ok = false
    let command: String
    let error: FailurePayload
}

struct FailurePayload: Encodable {
    let code: String
    let message: String
    let details: [String: JSONValue]?
}

struct AppInfo: Encodable {
    let bundleId: String?
    let localizedName: String?
    let processIdentifier: Int
    let isActive: Bool
    let activationPolicy: String
}

struct ListAppsPayload: Encodable {
    let apps: [AppInfo]
}

struct ActivateAppPayload: Encodable {
    let bundleId: String
    let activated: Bool
}

struct ScreenshotPayload: Encodable {
    let output: String
}

struct ClickPayload: Encodable {
    let x: Double
    let y: Double
}

struct TypeTextPayload: Encodable {
    let textLength: Int
}

struct PressKeyPayload: Encodable {
    let key: String
}

struct WindowBounds: Encodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct WindowInfo: Encodable {
    let title: String?
    let layer: Int
    let bounds: WindowBounds
}

struct AppStatePayload: Encodable {
    let app: AppInfo
    let frontmostBundleId: String?
    let accessibilityTrusted: Bool
    let screenshot: ScreenshotPayload
    let windows: [WindowInfo]
}

func writeJSON<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]

    do {
        let data = try encoder.encode(value)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    } catch {
        let fallback = #"{"command":"unknown","error":{"code":"json_encoding_failed","message":"Failed to encode helper response."},"ok":false}"# + "\n"
        FileHandle.standardOutput.write(Data(fallback.utf8))
    }
}

func succeed<Payload: Encodable>(command: String, data: Payload) -> Never {
    writeJSON(SuccessResponse(command: command, data: data))
    exit(EXIT_SUCCESS)
}

func fail(command: String, failure: HelperFailure) -> Never {
    let details = failure.details.isEmpty ? nil : failure.details
    let error = FailurePayload(code: failure.code, message: failure.message, details: details)
    writeJSON(FailureResponse(command: command, error: error))
    exit(EXIT_FAILURE)
}

func parseOptions(_ rawArguments: ArraySlice<String>, allowed: Set<String>) throws -> [String: String] {
    var options: [String: String] = [:]
    var index = rawArguments.startIndex

    while index < rawArguments.endIndex {
        let option = rawArguments[index]
        guard option.hasPrefix("--") else {
            throw HelperFailure("unexpected_argument", "Unexpected positional argument.", details: ["argument": .string(option)])
        }

        guard allowed.contains(option) else {
            throw HelperFailure("unknown_option", "Unknown option for command.", details: ["option": .string(option)])
        }

        let valueIndex = rawArguments.index(after: index)
        guard valueIndex < rawArguments.endIndex else {
            throw HelperFailure("missing_option_value", "Missing value for option.", details: ["option": .string(option)])
        }

        guard options[option] == nil else {
            throw HelperFailure("duplicate_option", "Option was provided more than once.", details: ["option": .string(option)])
        }

        options[option] = rawArguments[valueIndex]
        index = rawArguments.index(after: valueIndex)
    }

    return options
}

func requiredOption(_ name: String, in options: [String: String]) throws -> String {
    guard let value = options[name], !value.isEmpty else {
        throw HelperFailure("missing_required_option", "Missing required option.", details: ["option": .string(name)])
    }
    return value
}

func requiredDoubleOption(_ name: String, in options: [String: String]) throws -> Double {
    let rawValue = try requiredOption(name, in: options)
    guard let value = Double(rawValue), value.isFinite else {
        throw HelperFailure(
            "invalid_number",
            "Expected a finite numeric option value.",
            details: ["option": .string(name), "value": .string(rawValue)]
        )
    }
    return value
}

func absolutePath(_ path: String) -> String {
    let expanded = (path as NSString).expandingTildeInPath
    if expanded.hasPrefix("/") {
        return expanded
    }

    return URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        .appendingPathComponent(expanded)
        .standardizedFileURL
        .path
}

func activationPolicyName(_ policy: NSApplication.ActivationPolicy) -> String {
    switch policy {
    case .regular:
        return "regular"
    case .accessory:
        return "accessory"
    case .prohibited:
        return "prohibited"
    @unknown default:
        return "unknown"
    }
}

func appInfo(_ app: NSRunningApplication) -> AppInfo {
    AppInfo(
        bundleId: app.bundleIdentifier,
        localizedName: app.localizedName,
        processIdentifier: Int(app.processIdentifier),
        isActive: app.isActive,
        activationPolicy: activationPolicyName(app.activationPolicy)
    )
}

func findRunningApp(bundleId: String) throws -> NSRunningApplication {
    if let app = NSWorkspace.shared.runningApplications.first(where: { $0.bundleIdentifier == bundleId }) {
        return app
    }

    throw HelperFailure("app_not_found", "No running application found for bundle id.", details: ["bundleId": .string(bundleId)])
}

func requireAccessibilityTrust(for action: String) throws {
    guard AXIsProcessTrusted() else {
        throw HelperFailure(
            "accessibility_permission_required",
            "Accessibility permission is required for this action.",
            details: ["action": .string(action)]
        )
    }
}

func focusAppWindows(_ app: NSRunningApplication) throws {
    try requireAccessibilityTrust(for: "activate-app")

    let appElement = AXUIElementCreateApplication(app.processIdentifier)
    AXUIElementSetAttributeValue(appElement, kAXFrontmostAttribute as CFString, kCFBooleanTrue)

    var rawWindows: CFTypeRef?
    let windowsResult = AXUIElementCopyAttributeValue(appElement, kAXWindowsAttribute as CFString, &rawWindows)
    guard windowsResult == .success, let windows = rawWindows as? [AXUIElement] else {
        return
    }

    for window in windows.prefix(3) {
        AXUIElementPerformAction(window, kAXRaiseAction as CFString)
        AXUIElementSetAttributeValue(window, kAXMainAttribute as CFString, kCFBooleanTrue)
        AXUIElementSetAttributeValue(window, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    }
}

func waitForFrontmost(bundleId: String, timeoutSeconds: TimeInterval = 1.5) -> Bool {
    let deadline = Date().addingTimeInterval(timeoutSeconds)

    while Date() < deadline {
        if NSWorkspace.shared.frontmostApplication?.bundleIdentifier == bundleId {
            return true
        }

        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
    }

    return NSWorkspace.shared.frontmostApplication?.bundleIdentifier == bundleId
}

func captureScreenshot(outputPath: String) throws -> String {
    let resolvedOutputPath = absolutePath(outputPath)
    let outputURL = URL(fileURLWithPath: resolvedOutputPath)
    let parentURL = outputURL.deletingLastPathComponent()

    do {
        try FileManager.default.createDirectory(at: parentURL, withIntermediateDirectories: true)
    } catch {
        throw HelperFailure(
            "output_directory_failed",
            "Failed to create screenshot output directory.",
            details: ["output": .string(resolvedOutputPath), "underlyingError": .string(String(describing: error))]
        )
    }

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    process.arguments = ["-x", resolvedOutputPath]

    let errorPipe = Pipe()
    process.standardError = errorPipe

    do {
        try process.run()
    } catch {
        throw HelperFailure(
            "screenshot_process_failed",
            "Failed to start screencapture.",
            details: ["underlyingError": .string(String(describing: error))]
        )
    }

    process.waitUntilExit()

    guard process.terminationStatus == 0 else {
        let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
        let errorText = String(data: errorData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        throw HelperFailure(
            "screenshot_failed",
            "screencapture exited with a non-zero status.",
            details: ["status": .int(Int(process.terminationStatus)), "stderr": .string(errorText)]
        )
    }

    guard FileManager.default.fileExists(atPath: resolvedOutputPath) else {
        throw HelperFailure(
            "screenshot_missing_output",
            "screencapture completed but no output file was created.",
            details: ["output": .string(resolvedOutputPath)]
        )
    }

    return resolvedOutputPath
}

func postMouseClick(x: Double, y: Double) throws {
    try requireAccessibilityTrust(for: "click")

    let point = CGPoint(x: x, y: y)
    let source = CGEventSource(stateID: .hidSystemState)
    guard
        let mouseDown = CGEvent(mouseEventSource: source, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
        let mouseUp = CGEvent(mouseEventSource: source, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
    else {
        throw HelperFailure("event_creation_failed", "Failed to create mouse click events.")
    }

    mouseDown.post(tap: .cghidEventTap)
    mouseUp.post(tap: .cghidEventTap)
}

func postText(_ text: String) throws {
    try requireAccessibilityTrust(for: "type-text")

    if text.isEmpty {
        return
    }

    let pasteboard = NSPasteboard.general
    let previousString = pasteboard.string(forType: .string)

    pasteboard.clearContents()
    guard pasteboard.setString(text, forType: .string) else {
        throw HelperFailure("pasteboard_failed", "Failed to prepare text for paste.")
    }

    try postModifiedKey(virtualKey: 9, modifiers: .maskCommand)
    usleep(120_000)

    pasteboard.clearContents()
    if let previousString {
        pasteboard.setString(previousString, forType: .string)
    }
}

func postModifiedKey(virtualKey: CGKeyCode, modifiers: CGEventFlags = []) throws {
    let source = CGEventSource(stateID: .hidSystemState)
    guard
        let keyDown = CGEvent(keyboardEventSource: source, virtualKey: virtualKey, keyDown: true),
        let keyUp = CGEvent(keyboardEventSource: source, virtualKey: virtualKey, keyDown: false)
    else {
        throw HelperFailure("event_creation_failed", "Failed to create keyboard events.")
    }

    keyDown.flags = modifiers
    keyUp.flags = modifiers
    keyDown.post(tap: .cghidEventTap)
    keyUp.post(tap: .cghidEventTap)
}

func postKey(_ key: String) throws {
    try requireAccessibilityTrust(for: "press-key")

    let keyCode: CGKeyCode
    switch key {
    case "enter":
        keyCode = 36
    case "escape":
        keyCode = 53
    case "space":
        keyCode = 49
    default:
        throw HelperFailure("unsupported_key", "Unsupported key.", details: ["key": .string(key), "supportedKeys": .strings(["enter", "escape", "space"])])
    }

    let source = CGEventSource(stateID: .hidSystemState)
    guard
        let keyDown = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true),
        let keyUp = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false)
    else {
        throw HelperFailure("event_creation_failed", "Failed to create keyboard events.")
    }

    keyDown.post(tap: .cghidEventTap)
    keyUp.post(tap: .cghidEventTap)
}

func intValue(_ value: Any?) -> Int? {
    if let int = value as? Int {
        return int
    }
    if let number = value as? NSNumber {
        return number.intValue
    }
    return nil
}

func doubleValue(_ value: Any?) -> Double {
    if let double = value as? Double {
        return double
    }
    if let int = value as? Int {
        return Double(int)
    }
    if let number = value as? NSNumber {
        return number.doubleValue
    }
    return 0
}

func windowInfos(for app: NSRunningApplication) -> [WindowInfo] {
    let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let rawWindows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
        return []
    }

    let targetPID = Int(app.processIdentifier)
    var windows: [WindowInfo] = []

    for window in rawWindows {
        guard intValue(window[kCGWindowOwnerPID as String]) == targetPID else {
            continue
        }

        let rawBounds = window[kCGWindowBounds as String] as? [String: Any]
        let bounds = WindowBounds(
            x: doubleValue(rawBounds?["X"]),
            y: doubleValue(rawBounds?["Y"]),
            width: doubleValue(rawBounds?["Width"]),
            height: doubleValue(rawBounds?["Height"])
        )

        let info = WindowInfo(
            title: window[kCGWindowName as String] as? String,
            layer: intValue(window[kCGWindowLayer as String]) ?? 0,
            bounds: bounds
        )
        windows.append(info)
    }

    return windows
}

func handleListApps(_ arguments: ArraySlice<String>) throws -> ListAppsPayload {
    _ = try parseOptions(arguments, allowed: [])
    let apps = NSWorkspace.shared.runningApplications
        .filter { $0.bundleIdentifier != nil }
        .map(appInfo)
        .sorted { left, right in
            let leftName = left.localizedName ?? left.bundleId ?? ""
            let rightName = right.localizedName ?? right.bundleId ?? ""
            return leftName.localizedCaseInsensitiveCompare(rightName) == .orderedAscending
        }

    return ListAppsPayload(apps: apps)
}

func handleActivateApp(_ arguments: ArraySlice<String>) throws -> ActivateAppPayload {
    let options = try parseOptions(arguments, allowed: ["--bundle-id"])
    let bundleId = try requiredOption("--bundle-id", in: options)
    let app = try findRunningApp(bundleId: bundleId)
    let requested = app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
    try focusAppWindows(app)
    let activated = requested && waitForFrontmost(bundleId: bundleId)
    return ActivateAppPayload(bundleId: bundleId, activated: activated)
}

func handleScreenshot(_ arguments: ArraySlice<String>) throws -> ScreenshotPayload {
    let options = try parseOptions(arguments, allowed: ["--output"])
    let output = try requiredOption("--output", in: options)
    return ScreenshotPayload(output: try captureScreenshot(outputPath: output))
}

func handleClick(_ arguments: ArraySlice<String>) throws -> ClickPayload {
    let options = try parseOptions(arguments, allowed: ["--x", "--y"])
    let x = try requiredDoubleOption("--x", in: options)
    let y = try requiredDoubleOption("--y", in: options)
    try postMouseClick(x: x, y: y)
    return ClickPayload(x: x, y: y)
}

func handleTypeText(_ arguments: ArraySlice<String>) throws -> TypeTextPayload {
    let options = try parseOptions(arguments, allowed: ["--text"])
    let text = try requiredOption("--text", in: options)
    try postText(text)
    return TypeTextPayload(textLength: text.count)
}

func handlePressKey(_ arguments: ArraySlice<String>) throws -> PressKeyPayload {
    let options = try parseOptions(arguments, allowed: ["--key"])
    let key = try requiredOption("--key", in: options)
    try postKey(key)
    return PressKeyPayload(key: key)
}

func handleGetAppState(_ arguments: ArraySlice<String>) throws -> AppStatePayload {
    let options = try parseOptions(arguments, allowed: ["--bundle-id", "--screenshot-output"])
    let bundleId = try requiredOption("--bundle-id", in: options)
    let screenshotOutput = try requiredOption("--screenshot-output", in: options)
    let app = try findRunningApp(bundleId: bundleId)
    let output = try captureScreenshot(outputPath: screenshotOutput)

    return AppStatePayload(
        app: appInfo(app),
        frontmostBundleId: NSWorkspace.shared.frontmostApplication?.bundleIdentifier,
        accessibilityTrusted: AXIsProcessTrusted(),
        screenshot: ScreenshotPayload(output: output),
        windows: windowInfos(for: app)
    )
}

let rawArguments = CommandLine.arguments.dropFirst()
let command = rawArguments.first ?? "unknown"

do {
    guard let commandName = rawArguments.first else {
        throw HelperFailure("missing_command", "No command was provided.")
    }

    let arguments = rawArguments.dropFirst()

    switch commandName {
    case "list-apps":
        succeed(command: commandName, data: try handleListApps(arguments))
    case "activate-app":
        succeed(command: commandName, data: try handleActivateApp(arguments))
    case "screenshot":
        succeed(command: commandName, data: try handleScreenshot(arguments))
    case "click":
        succeed(command: commandName, data: try handleClick(arguments))
    case "type-text":
        succeed(command: commandName, data: try handleTypeText(arguments))
    case "press-key":
        succeed(command: commandName, data: try handlePressKey(arguments))
    case "get-app-state":
        succeed(command: commandName, data: try handleGetAppState(arguments))
    default:
        throw HelperFailure(
            "unknown_command",
            "Unknown command.",
            details: ["command": .string(commandName), "supportedCommands": .strings(supportedCommands)]
        )
    }
} catch let failure as HelperFailure {
    fail(command: command, failure: failure)
} catch {
    fail(
        command: command,
        failure: HelperFailure("unhandled_error", "Unhandled helper error.", details: ["underlyingError": .string(String(describing: error))])
    )
}

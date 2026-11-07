import Foundation

/// Append-only launch trace for the Intel wide viewport job. Written to `/tmp` so CI can read it
/// without XCTest AX queries (watchdog copies the file during test stalls).
public enum WideViewportUITestTrace {
    public static let tracePath = "/tmp/compass-wide-uitest-trace.ndjson"

    public static func resetIfNeeded() {
        guard UITestLaunchPolicy.meetingLinkWideViewport else { return }
        let url = URL(fileURLWithPath: tracePath)
        try? FileManager.default.removeItem(at: url)
        record("trace_reset", fields: ["pid": "\(ProcessInfo.processInfo.processIdentifier)"])
    }

    public static func record(_ event: String, fields: [String: String] = [:]) {
        guard UITestLaunchPolicy.meetingLinkWideViewport else { return }
        var payload: [String: String] = [
            "t": ISO8601DateFormatter().string(from: Date()),
            "uptime": String(format: "%.3f", ProcessInfo.processInfo.systemUptime),
            "event": event,
        ]
        for (key, value) in fields { payload[key] = value }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let line = String(data: data, encoding: .utf8)
        else { return }
        let url = URL(fileURLWithPath: tracePath)
        let lineData = (line + "\n").data(using: .utf8) ?? Data()
        DispatchQueue.global(qos: .utility).async {
            if FileManager.default.fileExists(atPath: tracePath) {
                if let handle = try? FileHandle(forWritingTo: url) {
                    defer { try? handle.close() }
                    try? handle.seekToEnd()
                    try? handle.write(contentsOf: lineData)
                }
            } else {
                try? lineData.write(to: url, options: .atomic)
            }
        }
    }
}

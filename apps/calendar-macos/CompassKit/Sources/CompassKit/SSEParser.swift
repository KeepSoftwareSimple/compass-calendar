import Foundation

/// One logical SSE dispatch after a blank line terminates the event block.
public struct SSEMessage: Equatable, Sendable {
    public var event: String?
    public var data: String
    public var retryMilliseconds: Int?

    public init(event: String? = nil, data: String = "", retryMilliseconds: Int? = nil) {
        self.event = event
        self.data = data
        self.retryMilliseconds = retryMilliseconds
    }
}

/// Incremental parser for the SSE wire format (`event:`, `data:`, `retry:`, comments).
public struct SSEParser: Sendable {
    private var pendingEvent: String?
    private var pendingDataLines: [String] = []
    private var pendingRetry: Int?

    public init() {}

    public mutating func feed(line: String) -> [SSEMessage] {
        var completed: [SSEMessage] = []
        if line.isEmpty {
            if let message = finishCurrentMessage() {
                completed.append(message)
            }
            return completed
        }

        if line.hasPrefix(":") {
            return completed
        }

        if line.hasPrefix("event:") {
            pendingEvent = stripFieldValue(line.dropFirst("event:".count))
            return completed
        }

        if line.hasPrefix("data:") {
            pendingDataLines.append(stripFieldValue(line.dropFirst("data:".count)))
            return completed
        }

        if line.hasPrefix("retry:") {
            let raw = stripFieldValue(line.dropFirst("retry:".count))
            pendingRetry = Int(raw)
            return completed
        }

        return completed
    }

    public mutating func finish() -> SSEMessage? {
        finishCurrentMessage()
    }

    private mutating func finishCurrentMessage() -> SSEMessage? {
        guard pendingEvent != nil || !pendingDataLines.isEmpty || pendingRetry != nil else {
            return nil
        }
        let message = SSEMessage(
            event: pendingEvent,
            data: pendingDataLines.joined(separator: "\n"),
            retryMilliseconds: pendingRetry
        )
        pendingEvent = nil
        pendingDataLines = []
        pendingRetry = nil
        return message
    }

    private func stripFieldValue(_ slice: Substring) -> String {
        var value = String(slice)
        if value.first == " " {
            value.removeFirst()
        }
        if value.hasSuffix("\r") {
            value.removeLast()
        }
        return value
    }
}

extension SSEParser {
    /// Parses a full SSE payload by splitting on `\n` (handles `\r\n` via line trimming).
    public static func parse(_ text: String) -> [SSEMessage] {
        var parser = SSEParser()
        var messages: [SSEMessage] = []
        for rawLine in text.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = rawLine.hasSuffix("\r")
                ? String(rawLine.dropLast())
                : String(rawLine)
            messages.append(contentsOf: parser.feed(line: line))
        }
        if let tail = parser.finish() {
            messages.append(tail)
        }
        return messages
    }
}

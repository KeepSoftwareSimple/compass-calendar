import CompassKit
import Foundation

public enum ServerEventStreamError: Error, Equatable {
    case missingSession
    case transport(String)
    case decodeFailed
}

public struct ServerEventStreamConfiguration: Sendable {
    public var streamLifetime: Duration
    public var reconnectBase: Duration
    public var reconnectMax: Duration
    public var defaultRetryHint: Duration

    public init(
        streamLifetime: Duration = .seconds(20 * 60),
        reconnectBase: Duration = .seconds(1),
        reconnectMax: Duration = .seconds(30),
        defaultRetryHint: Duration = .seconds(5)
    ) {
        self.streamLifetime = streamLifetime
        self.reconnectBase = reconnectBase
        self.reconnectMax = reconnectMax
        self.defaultRetryHint = defaultRetryHint
    }
}

public struct ServerEventStreamSchedule: Sendable, Equatable {
    public let delay: Duration
    public let reason: String

    public init(delay: Duration, reason: String) {
        self.delay = delay
        self.reason = reason
    }
}

public enum ServerEventStreamScheduleReason {
    public static let retryHint = "retry-hint"
    public static let streamLifetime = "stream-lifetime"
    public static let transportError = "transport-error"
}

/// Computes reconnect delays with exponential backoff and jitter (web parity).
public enum ServerEventStreamBackoff {
    public static func delay(
        errorCount: Int,
        retryHint: Duration?,
        config: ServerEventStreamConfiguration,
        randomUnit: Double
    ) -> Duration {
        if let retryHint {
            return retryHint
        }
        let n = max(0, errorCount - 1)
        let baseMs = min(
            durationMilliseconds(config.reconnectMax),
            durationMilliseconds(config.reconnectBase) * (1 << min(n, 10))
        )
        let jitter = Double(baseMs) * 0.2 * (randomUnit * 2 - 1)
        let total = max(0, Int((Double(baseMs) + jitter).rounded()))
        return .milliseconds(total)
    }

    private static func durationMilliseconds(_ duration: Duration) -> Int {
        let components = duration.components
        return components.seconds * 1000 + components.attoseconds / 1_000_000_000_000_000
    }
}

public actor ServerEventStream {
    public typealias MessageHandler = @Sendable (ServerMessage) -> Void
    public typealias ReopenHandler = @Sendable () -> Void
    public typealias Sleep = @Sendable (Duration) async -> Void

    private let client: CompassAPIClient
    private let urlSession: URLSession
    private let config: ServerEventStreamConfiguration
    private let sleep: Sleep
    private let randomUnit: @Sendable () -> Double

    private var task: Task<Void, Never>?
    private var retryHint: Duration?
    private var errorCount = 0

    public init(
        client: CompassAPIClient,
        urlSession: URLSession = .shared,
        config: ServerEventStreamConfiguration = ServerEventStreamConfiguration(),
        sleep: @escaping Sleep = { duration in
            try? await Task.sleep(for: duration)
        },
        randomUnit: @escaping @Sendable () -> Double = { Double.random(in: 0 ... 1) }
    ) {
        self.client = client
        self.urlSession = urlSession
        self.config = config
        self.sleep = sleep
        self.randomUnit = randomUnit
    }

    public func start(
        onMessage: @escaping MessageHandler,
        onReopen: @escaping ReopenHandler = {}
    ) {
        stop()
        task = Task {
            await runLoop(onMessage: onMessage, onReopen: onReopen)
        }
    }

    public func stop() {
        task?.cancel()
        task = nil
    }

    public func nextReconnectSchedule(errorCount: Int) -> ServerEventStreamSchedule {
        let delay = ServerEventStreamBackoff.delay(
            errorCount: errorCount,
            retryHint: retryHint,
            config: config,
            randomUnit: randomUnit()
        )
        let reason = retryHint == nil
            ? ServerEventStreamScheduleReason.transportError
            : ServerEventStreamScheduleReason.retryHint
        return ServerEventStreamSchedule(delay: delay, reason: reason)
    }

    private func runLoop(onMessage: @escaping MessageHandler, onReopen: @escaping ReopenHandler) async {
        while !Task.isCancelled {
            do {
                try await consumeOnce(onMessage: onMessage, onReopen: onReopen)
                errorCount = 0
            } catch is CancellationError {
                return
            } catch {
                errorCount += 1
                let schedule = nextReconnectSchedule(errorCount: errorCount)
                retryHint = nil
                await sleep(schedule.delay)
            }
        }
    }

    private func consumeOnce(onMessage: @escaping MessageHandler, onReopen: @escaping ReopenHandler) async throws {
        guard let tokens = try await client.currentSession() else {
            throw ServerEventStreamError.missingSession
        }
        let streamURL = await client.baseURL.appending(path: "events/stream")
        var request = URLRequest(url: streamURL)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue(SessionHeader.headerModeValue, forHTTPHeaderField: SessionHeader.authMode)
        request.setValue("Bearer \(tokens.accessToken)", forHTTPHeaderField: "Authorization")

        let (bytes, response) = try await urlSession.bytes(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw ServerEventStreamError.transport("Non-200 stream response")
        }

        onReopen()
        errorCount = 0

        let lifetimeTask = Task {
            try await Task.sleep(for: config.streamLifetime)
        }

        var parser = SSEParser()
        for try await line in bytes.lines {
            if Task.isCancelled { break }
            try handle(messages: parser.feed(line: line), onMessage: onMessage)
        }
        if let tail = parser.finish() {
            try handle(messages: [tail], onMessage: onMessage)
        }

        lifetimeTask.cancel()
        if !Task.isCancelled {
            retryHint = config.defaultRetryHint
            throw ServerEventStreamError.transport(ServerEventStreamScheduleReason.streamLifetime)
        }
    }

    private func handle(messages: [SSEMessage], onMessage: MessageHandler) throws {
        for message in messages {
            if let retryMs = message.retryMilliseconds {
                retryHint = .milliseconds(retryMs)
            }
            guard message.event == nil || message.event == "message" else {
                continue
            }
            guard !message.data.isEmpty else { continue }
            guard let data = message.data.data(using: .utf8) else {
                throw ServerEventStreamError.decodeFailed
            }
            let decoded = try JSONDecoder().decode(ServerMessage.self, from: data)
            onMessage(decoded)
        }
    }
}

import Foundation

public struct PostHogQueuedCapture: Sendable, Equatable {
    public let event: String
    public let distinctId: String
    public let properties: ProductEventProperties

    public init(event: String, distinctId: String, properties: ProductEventProperties) {
        self.event = event
        self.distinctId = distinctId
        self.properties = properties
    }
}

public struct PostHogCaptureConfiguration: Sendable, Equatable {
    public let apiKey: String
    public let host: String
    public let lib: String

    public init(apiKey: String, host: String, lib: String) {
        self.apiKey = apiKey
        self.host = host.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        self.lib = lib
    }

    public var captureURL: URL {
        URL(string: "\(host)/i/v0/e/")!
    }
}

public enum PostHogBatchClientError: Error, Sendable {
    case notConfigured
    case missingDistinctId
    case httpStatus(Int)
}

public struct PostHogBatchTransport: Sendable {
    public var send: @Sendable (URLRequest) async throws -> (Int, Data)

    public init(send: @escaping @Sendable (URLRequest) async throws -> (Int, Data)) {
        self.send = send
    }

    public static let unavailable = PostHogBatchTransport { _ in
        throw PostHogBatchClientError.notConfigured
    }
}

/// Queues PostHog capture payloads and flushes them sequentially with retry.
public struct PostHogBatchClient: Sendable {
    private let configuration: PostHogCaptureConfiguration?
    private let transport: PostHogBatchTransport
    private let platform: String
    private var queue: [PostHogQueuedCapture] = []
    private var distinctId: String?
    public private(set) var pendingRetryCount = 0

    public init(
        configuration: PostHogCaptureConfiguration?,
        transport: PostHogBatchTransport = .unavailable,
        platform: String = "desktop"
    ) {
        self.configuration = configuration
        self.transport = transport
        self.platform = platform
    }

    public mutating func setDistinctId(_ distinctId: String?) {
        self.distinctId = distinctId
    }

    public var queuedCount: Int {
        queue.count
    }

    public mutating func enqueue(
        event: String,
        properties: ProductEventProperties = [:]
    ) throws {
        guard configuration != nil else { return }
        guard let distinctId else {
            throw PostHogBatchClientError.missingDistinctId
        }
        queue.append(PostHogQueuedCapture(event: event, distinctId: distinctId, properties: properties))
    }

    public mutating func flush(maxAttempts: Int = 3) async throws {
        guard let configuration else {
            queue.removeAll()
            return
        }
        while !queue.isEmpty {
            let next = queue[0]
            var attempt = 0
            var delivered = false
            while attempt < maxAttempts {
                attempt += 1
                do {
                    try await send(next, configuration: configuration)
                    delivered = true
                    break
                } catch PostHogBatchClientError.httpStatus {
                    pendingRetryCount += 1
                    try await Task.sleep(for: .milliseconds(50 * attempt))
                }
            }
            if !delivered {
                throw PostHogBatchClientError.httpStatus(-1)
            }
            queue.removeFirst()
        }
    }

    private func send(
        _ capture: PostHogQueuedCapture,
        configuration: PostHogCaptureConfiguration
    ) async throws {
        var properties = capture.properties.posthogJSON()
        properties["platform"] = platform
        properties["$lib"] = configuration.lib

        let body: [String: Any] = [
            "api_key": configuration.apiKey,
            "distinct_id": capture.distinctId,
            "event": capture.event,
            "properties": properties,
        ]
        let data = try JSONSerialization.data(withJSONObject: body)
        var request = URLRequest(url: configuration.captureURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = data

        let (status, _) = try await transport.send(request)
        guard (200 ..< 300).contains(status) else {
            throw PostHogBatchClientError.httpStatus(status)
        }
    }
}

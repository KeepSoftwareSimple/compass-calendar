import XCTest
@testable import CompassKit

final class PostHogBatchClientTests: XCTestCase {
    func testFlushDeliversQueuedCapturesInOrder() async throws {
        let delivered = LockedBox<[String]>([])
        var client = PostHogBatchClient(
            configuration: PostHogCaptureConfiguration(
                apiKey: "phc_test",
                host: "https://us.i.posthog.com",
                lib: "compass-macos-test"),
            transport: PostHogBatchTransport { request in
                let body = try XCTUnwrap(request.httpBody)
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                let event = try XCTUnwrap(json["event"] as? String)
                delivered.withLock { $0.append(event) }
                return (200, Data())
            })
        try client.enqueue(
            event: "shortcut_invoked",
            distinctId: "user-1",
            sessionId: "session-1",
            properties: ["shortcut_id": .string("nav-next")])
        try client.enqueue(
            event: "shortcut_level_up",
            distinctId: "user-1",
            sessionId: "session-1",
            properties: ["level": .int(2)])
        try await client.flush()
        XCTAssertEqual(delivered.withLock { $0 }, ["shortcut_invoked", "shortcut_level_up"])
    }

    func testEnqueueAddsSessionIdProperty() async throws {
        let payloads = LockedBox<[[String: Any]]>([])
        var client = PostHogBatchClient(
            configuration: PostHogCaptureConfiguration(
                apiKey: "phc_test",
                host: "https://us.i.posthog.com",
                lib: "compass-macos-test"),
            transport: PostHogBatchTransport { request in
                let body = try XCTUnwrap(request.httpBody)
                let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                let properties = try XCTUnwrap(json["properties"] as? [String: Any])
                payloads.withLock { $0.append(properties) }
                return (200, Data())
            })
        try client.enqueue(
            event: "shortcut_invoked",
            distinctId: "anon-1",
            sessionId: "session-abc",
            properties: [:])
        try await client.flush()
        let properties = try XCTUnwrap(payloads.withLock { $0.first })
        XCTAssertEqual(properties["$session_id"] as? String, "session-abc")
    }

    func testFlushRetriesTransientFailures() async throws {
        let attempts = LockedBox(0)
        var client = PostHogBatchClient(
            configuration: PostHogCaptureConfiguration(
                apiKey: "phc_test",
                host: "https://us.i.posthog.com",
                lib: "compass-macos-test"),
            transport: PostHogBatchTransport { _ in
                let count = attempts.withLock { value in
                    value += 1
                    return value
                }
                if count == 1 {
                    return (503, Data())
                }
                return (200, Data())
            })
        try client.enqueue(
            event: "login_completed",
            distinctId: "user-1",
            sessionId: nil)
        try await client.flush(maxAttempts: 3)
        XCTAssertGreaterThanOrEqual(attempts.withLock { $0 }, 2)
    }
}

private final class LockedBox<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: T

    init(_ value: T) {
        self.value = value
    }

    func withLock<R>(_ body: (inout T) -> R) -> R {
        lock.lock()
        defer { lock.unlock() }
        return body(&value)
    }
}

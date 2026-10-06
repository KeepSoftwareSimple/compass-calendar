import CompassKit
import Foundation

/// Serves bundled JSON fixtures so XCUITest runs signed-in flows without a server.
public final class FixtureTransport: URLProtocol, @unchecked Sendable {
    public enum Mode: Sendable {
        case demo(DemoSeedFixture)
    }

    nonisolated(unsafe) private static var mode: Mode?

    public static func install(_ mode: Mode) -> URLSession {
        Self.mode = mode
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [FixtureTransport.self]
        return URLSession(configuration: config)
    }

    public static func clear() {
        mode = nil
    }

    override public class func canInit(with request: URLRequest) -> Bool {
        mode != nil
    }

    override public class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override public func startLoading() {
        guard let mode = Self.mode, let url = request.url else {
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        do {
            let response = try Self.response(for: url, mode: mode)
            let http = HTTPURLResponse(
                url: url,
                statusCode: response.statusCode,
                httpVersion: nil,
                headerFields: response.headers
            )!
            client?.urlProtocol(self, didReceive: http, cacheStoragePolicy: .notAllowed)
            if !response.body.isEmpty {
                client?.urlProtocol(self, didLoad: response.body)
            }
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override public func stopLoading() {}

    private struct HTTPPayload {
        var statusCode: Int
        var headers: [String: String]
        var body: Data
    }

    private static func response(for url: URL, mode: Mode) throws -> HTTPPayload {
        let path = url.path
        switch mode {
        case let .demo(fixture):
            if path.hasSuffix("/event") {
                let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
                let start = items.first(where: { $0.name == "start" })?.value ?? ""
                let end = items.first(where: { $0.name == "end" })?.value ?? ""
                let events = fixture.events(inRangeStart: start, end: end)
                let body = try JSONEncoder().encode(EventListResponse(events: events))
                return HTTPPayload(
                    statusCode: 200,
                    headers: ["Content-Type": "application/json"],
                    body: body
                )
            }
            if path.hasSuffix("/calendars") {
                let calendar = fixture.calendarListItem()
                let data = try JSONEncoder().encode(CalendarListResponse(calendars: [calendar]))
                return HTTPPayload(
                    statusCode: 200,
                    headers: ["Content-Type": "application/json"],
                    body: data
                )
            }
            if path.hasSuffix("/events/stream") {
                let body = Data(": fixture keepalive\n\n".utf8)
                return HTTPPayload(
                    statusCode: 200,
                    headers: [
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                    ],
                    body: body
                )
            }
            if path.hasSuffix("/config") {
                let body = Data("{}".utf8)
                return HTTPPayload(
                    statusCode: 200,
                    headers: ["Content-Type": "application/json"],
                    body: body
                )
            }
            if path.hasSuffix("/user/hidden-events") {
                let body = try JSONEncoder().encode(HiddenEventIdsResponse(hiddenEventIds: []))
                return HTTPPayload(
                    statusCode: 200,
                    headers: ["Content-Type": "application/json"],
                    body: body
                )
            }
        }
        return HTTPPayload(statusCode: 404, headers: [:], body: Data())
    }
}

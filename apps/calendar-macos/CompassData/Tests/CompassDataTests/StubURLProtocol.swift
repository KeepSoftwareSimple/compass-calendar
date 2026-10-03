import Foundation

enum StubURLProtocol {
    struct Response {
        var statusCode: Int
        var headers: [String: String]
        var body: Data

        init(statusCode: Int, headers: [String: String] = [:], body: Data = Data()) {
            self.statusCode = statusCode
            self.headers = headers
            self.body = body
        }
    }

    private static let sessionHandlerKey = "StubURLProtocolSessionHandlerID"

    private final class SessionHandlerRegistry: @unchecked Sendable {
        static let shared = SessionHandlerRegistry()
        private let lock = NSLock()
        private var handlers: [String: @Sendable (URLRequest) throws -> Response] = [:]

        func register(id: String, handler: @escaping @Sendable (URLRequest) throws -> Response) {
            lock.lock()
            defer { lock.unlock() }
            handlers[id] = handler
        }

        func handler(for id: String) -> (@Sendable (URLRequest) throws -> Response)? {
            lock.lock()
            defer { lock.unlock() }
            return handlers[id]
        }
    }

    final class Handler: URLProtocol, @unchecked Sendable {
        nonisolated(unsafe) static var requestHandler: (@Sendable (URLRequest) throws -> Response)?

        override class func canInit(with request: URLRequest) -> Bool {
            guard let scheme = request.url?.scheme?.lowercased() else { return false }
            return scheme == "https" || scheme == "http"
        }

        override class func canonicalRequest(for request: URLRequest) -> URLRequest {
            request
        }

        override func startLoading() {
            let handler: (@Sendable (URLRequest) throws -> Response)?
            if let id = property(forKey: StubURLProtocol.sessionHandlerKey) as? String {
                handler = SessionHandlerRegistry.shared.handler(for: id)
            } else {
                handler = Self.requestHandler
            }
            guard let handler else {
                client?.urlProtocolDidFinishLoading(self)
                return
            }
            do {
                let response = try handler(request)
                let http = HTTPURLResponse(
                    url: request.url!,
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

        override func stopLoading() {}
    }

    static func makeSession(
        handler: (@Sendable (URLRequest) throws -> Response)? = nil
    ) -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [Handler.self]
        if let handler {
            let id = UUID().uuidString
            SessionHandlerRegistry.shared.register(id: id, handler: handler)
            config.protocolProperties = [sessionHandlerKey: id]
        }
        return URLSession(configuration: config)
    }
}

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

    final class Handler: URLProtocol, @unchecked Sendable {
        nonisolated(unsafe) static var requestHandler: (@Sendable (URLRequest) throws -> Response)?

        override class func canInit(with request: URLRequest) -> Bool {
            guard requestHandler != nil else { return false }
            guard let scheme = request.url?.scheme?.lowercased() else { return false }
            return scheme == "https" || scheme == "http"
        }

        override class func canonicalRequest(for request: URLRequest) -> URLRequest {
            request
        }

        override func startLoading() {
            StubURLProtocol.finishLoading(
                client: client,
                instance: self,
                request: request,
                handler: Self.requestHandler)
        }

        override func stopLoading() {}
    }

    static func makeSession(
        handler: (@Sendable (URLRequest) throws -> Response)? = nil
    ) -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        if let handler {
            // Each call defines a new nested type so static handler storage is per session.
            final class IsolatedHandler: URLProtocol, @unchecked Sendable {
                nonisolated(unsafe) private static var requestHandler: (@Sendable (URLRequest) throws -> Response)?

                static func bind(_ handler: @escaping @Sendable (URLRequest) throws -> Response) {
                    requestHandler = handler
                }

                override class func canInit(with request: URLRequest) -> Bool {
                    guard requestHandler != nil else { return false }
                    guard let scheme = request.url?.scheme?.lowercased() else { return false }
                    return scheme == "https" || scheme == "http"
                }

                override class func canonicalRequest(for request: URLRequest) -> URLRequest {
                    request
                }

                override func startLoading() {
                    StubURLProtocol.finishLoading(
                        client: client,
                        instance: self,
                        request: request,
                        handler: Self.requestHandler)
                }

                override func stopLoading() {}
            }
            IsolatedHandler.bind(handler)
            config.protocolClasses = [IsolatedHandler.self]
        } else {
            config.protocolClasses = [Handler.self]
        }
        return URLSession(configuration: config)
    }

    fileprivate static func finishLoading(
        client: URLProtocolClient?,
        instance: URLProtocol,
        request: URLRequest,
        handler: (@Sendable (URLRequest) throws -> Response)?
    ) {
        guard let handler else {
            client?.urlProtocolDidFinishLoading(instance)
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
            client?.urlProtocol(instance, didReceive: http, cacheStoragePolicy: .notAllowed)
            if !response.body.isEmpty {
                client?.urlProtocol(instance, didLoad: response.body)
            }
            client?.urlProtocolDidFinishLoading(instance)
        } catch {
            client?.urlProtocol(instance, didFailWithError: error)
        }
    }
}

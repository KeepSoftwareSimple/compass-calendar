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
            requestHandler != nil
        }

        override class func canonicalRequest(for request: URLRequest) -> URLRequest {
            request
        }

        override func startLoading() {
            guard let handler = Self.requestHandler else {
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

    static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [Handler.self]
        return URLSession(configuration: config)
    }
}

import CompassKit
import Foundation

public enum AdminGetBookingPageResult: Sendable, Hashable {
    case saved(AdminGetBookingPageResponse)
    case setup(AdminGetBookingPageSetupResponse)

    public var isSaved: Bool {
        if case .saved = self { return true }
        return false
    }
}

public struct BookingAPI: Sendable {
    private let client: CompassAPIClient

    public init(client: CompassAPIClient) {
        self.client = client
    }

    public func getPage() async throws -> AdminGetBookingPageResult {
        let payload = try await client.sendRaw(method: "GET", path: "booking/page")
        return try parsePagePayload(payload.body)
    }

    public func getPageStatus() async throws -> BookingPageStatusResponse {
        try await client.sendDecodable(method: "GET", path: "booking/page/status")
    }

    public func putPage(_ input: AdminPutBookingPageInput) async throws -> AdminGetBookingPageResult {
        let payload = try await client.sendRaw(
            method: "PUT",
            path: "booking/page",
            bodyData: try JSONEncoder().encode(input)
        )
        return try parsePagePayload(payload.body)
    }

    private func parsePagePayload(_ body: Data) throws -> AdminGetBookingPageResult {
        let object = try JSONSerialization.jsonObject(with: body)
        guard let dictionary = object as? [String: Any] else {
            throw CompassAPIError.decodeFailed
        }
        if dictionary["bookingUrl"] != nil {
            return .saved(try JSONDecoder().decode(AdminGetBookingPageResponse.self, from: body))
        }
        return .setup(try JSONDecoder().decode(AdminGetBookingPageSetupResponse.self, from: body))
    }
}

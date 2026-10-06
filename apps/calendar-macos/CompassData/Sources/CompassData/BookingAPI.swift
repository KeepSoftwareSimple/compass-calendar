import CompassKit
import Foundation

public struct BookingAPI: Sendable {
    private let client: CompassAPIClient

    public init(client: CompassAPIClient) {
        self.client = client
    }

    public func getPage() async throws -> AdminBookingPage {
        let payload = try await client.sendRaw(method: "GET", path: "booking/page")
        guard (200 ..< 300).contains(payload.statusCode) else {
            throw CompassAPIError.httpStatus(payload.statusCode, body: payload.body)
        }
        return try parsePagePayload(Data(payload.body.utf8))
    }

    public func getPageStatus() async throws -> BookingPageStatusResponse {
        try await client.sendDecodable(method: "GET", path: "booking/page/status")
    }

    public func putPage(_ input: AdminPutBookingPageInput) async throws -> AdminBookingPage {
        let payload = try await client.sendRaw(
            method: "PUT",
            path: "booking/page",
            bodyData: try JSONEncoder().encode(input)
        )
        guard (200 ..< 300).contains(payload.statusCode) else {
            throw CompassAPIError.httpStatus(payload.statusCode, body: payload.body)
        }
        return try parsePagePayload(Data(payload.body.utf8))
    }

    private func parsePagePayload(_ body: Data) throws -> AdminBookingPage {
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

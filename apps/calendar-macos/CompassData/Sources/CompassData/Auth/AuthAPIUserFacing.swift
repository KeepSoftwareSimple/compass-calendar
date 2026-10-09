import Foundation

/// SuperTokens and Compass HTTP bodies share this JSON shape for field and
/// credential errors. Billing reuses it so stores do not depend on AuthStore
/// just to read a message.
enum AuthAPIUserFacing {
    static func message(from body: String, fallback: String) -> String {
        guard let data = body.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return fallback
        }
        if let status = json["status"] as? String, status == "WRONG_CREDENTIALS_ERROR" {
            return "Incorrect email or password."
        }
        if let fields = json["formFields"] as? [[String: Any]],
           let first = fields.first,
           let message = first["error"] as? String
        {
            return message
        }
        if let reason = json["reason"] as? String {
            return reason
        }
        return fallback
    }

    static func connectionMessage(fallback: String, detail: String) -> String {
        if detail.localizedCaseInsensitiveContains("offline")
            || detail.localizedCaseInsensitiveContains("network")
            || detail.localizedCaseInsensitiveContains("internet")
        {
            return "We can't reach Compass right now. Please check your connection and try again."
        }
        return fallback
    }
}

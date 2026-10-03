import Foundation

public enum AuthEmailPasswordOutcome: Sendable, Equatable {
    case success
    case wrongCredentials
    case fieldError(String)
    case notAllowed(String)
    case invalidResetToken
    case missingSession
    case httpError(Int, String)
    case transport(String)
}

/// Parses SuperTokens email/password responses for native header sessions.
public struct AuthEmailPasswordClient: Sendable {
    private let client: CompassAPIClient

    init(client: CompassAPIClient) {
        self.client = client
    }

    public func signUp(name: String, email: String, password: String) async -> AuthEmailPasswordOutcome {
        await postForm(
            path: "signup",
            fields: [
                AuthFormField(id: "name", value: name),
                AuthFormField(id: "email", value: email),
                AuthFormField(id: "password", value: password),
            ],
            expectsSession: true)
    }

    public func signIn(email: String, password: String) async -> AuthEmailPasswordOutcome {
        await postForm(
            path: "signin",
            fields: [
                AuthFormField(id: "email", value: email),
                AuthFormField(id: "password", value: password),
            ],
            expectsSession: true)
    }

    public func sendPasswordResetEmail(email: String) async -> AuthEmailPasswordOutcome {
        await postForm(
            path: "user/password/reset/token",
            fields: [AuthFormField(id: "email", value: email)],
            expectsSession: false)
    }

    public func resetPassword(token: String, password: String) async -> AuthEmailPasswordOutcome {
        await postForm(
            path: "user/password/reset",
            fields: [
                AuthFormField(id: "password", value: password),
                AuthFormField(id: "token", value: token),
            ],
            expectsSession: false)
    }

    private func postForm(
        path: String,
        fields: [AuthFormField],
        expectsSession: Bool
    ) async -> AuthEmailPasswordOutcome {
        let body = AuthFormBody(formFields: fields)
        do {
            let payload = try await client.sendRaw(
                method: "POST",
                path: path,
                bodyData: try JSONEncoder().encode(body),
                auth: .headerSession,
                allowRefresh: false)
            if (200 ..< 300).contains(payload.statusCode) {
                if expectsSession {
                    do {
                        try await storeSession(from: payload)
                        return .success
                    } catch {
                        return parsedOutcome(from: payload.body) ?? .missingSession
                    }
                }
                return .success
            }
            return parsedOutcome(from: payload.body)
                ?? .httpError(payload.statusCode, payload.body)
        } catch let error as CompassAPIError {
            switch error {
            case let .httpStatus(code, body):
                return parsedOutcome(from: body) ?? .httpError(code, body)
            case let .transport(message):
                return .transport(message)
            case .sessionExpired:
                return .notAllowed("Your session expired. Log in again.")
            default:
                return .transport(String(describing: error))
            }
        } catch {
            return .transport(error.localizedDescription)
        }
    }

    private func storeSession(from payload: HTTPResponsePayload) async throws {
        var headers = [String: String]()
        for (key, value) in payload.headers {
            headers[key] = value
        }
        let response = HTTPURLResponse(
            url: URL(string: "https://compasscalendar.com")!,
            statusCode: payload.statusCode,
            httpVersion: nil,
            headerFields: headers
        )!
        try await client.storeSessionHeaders(from: response)
    }

    private func parsedOutcome(from body: String) -> AuthEmailPasswordOutcome? {
        guard let data = body.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let status = json["status"] as? String
        else {
            return nil
        }
        switch status {
        case "OK":
            return .success
        case "WRONG_CREDENTIALS_ERROR":
            return .wrongCredentials
        case "FIELD_ERROR":
            if let fields = json["formFields"] as? [[String: Any]],
               let first = fields.first,
               let message = first["error"] as? String
            {
                return .fieldError(message)
            }
            return .fieldError("Request failed")
        case "SIGN_IN_NOT_ALLOWED", "SIGN_UP_NOT_ALLOWED", "PASSWORD_RESET_NOT_ALLOWED":
            if let reason = json["reason"] as? String {
                return .notAllowed(reason)
            }
            return .notAllowed("Request not allowed")
        case "RESET_PASSWORD_INVALID_TOKEN_ERROR":
            return .invalidResetToken
        default:
            return nil
        }
    }
}

private struct AuthFormBody: Encodable, Sendable {
    let formFields: [AuthFormField]
}

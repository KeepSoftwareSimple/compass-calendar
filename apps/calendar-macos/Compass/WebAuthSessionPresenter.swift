import AuthenticationServices
import CompassData
import Foundation

@MainActor
final class WebAuthSessionPresenter: NSObject, WebAuthSessionPresenting {
    private var activeSession: ASWebAuthenticationSession?

    func present(url: URL, callbackURLScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackURLScheme)
            { callbackURL, error in
                if let error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionErrorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue
                    {
                        continuation.resume(throwing: WebAuthSessionError.userCancelled)
                    } else {
                        continuation.resume(throwing: WebAuthSessionError.failed)
                    }
                    return
                }
                guard let callbackURL else {
                    continuation.resume(throwing: WebAuthSessionError.failed)
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            activeSession = session
            if !session.start() {
                continuation.resume(throwing: WebAuthSessionError.failed)
            }
        }
    }
}

extension WebAuthSessionPresenter: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApp.keyWindow ?? NSApp.windows.first ?? ASPresentationAnchor()
    }
}

import AppKit
import AuthenticationServices
import CompassData
import Foundation

@MainActor
final class WebAuthSessionPresenter: NSObject, HostedBillingSessionPresenting {
    private var activeSession: ASWebAuthenticationSession?

    func presentHostedSession(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: "compass"
            ) { [weak self] callbackURL, error in
                self?.activeSession = nil
                if let error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionError.errorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue
                    {
                        continuation.resume(throwing: HostedBillingSessionError.userCanceled)
                    } else {
                        continuation.resume(throwing: error)
                    }
                    return
                }
                guard let callbackURL else {
                    continuation.resume(throwing: HostedBillingSessionError.userCanceled)
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            activeSession = session
            if !session.start() {
                activeSession = nil
                continuation.resume(throwing: HostedBillingSessionError.presenterUnavailable)
            }
        }
    }
}

extension WebAuthSessionPresenter: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApp.keyWindow ?? NSApp.mainWindow ?? NSWindow()
    }
}

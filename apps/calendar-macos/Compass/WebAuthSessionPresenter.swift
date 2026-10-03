import AppKit
import AuthenticationServices
import CompassData
import Foundation

@MainActor
final class WebAuthSessionPresenter: NSObject, HostedBillingSessionPresenting, WebAuthSessionPresenting {
    private var activeSession: ASWebAuthenticationSession?

    func presentHostedSession(url: URL) async throws -> URL {
        try await runSession(url: url, callbackURLScheme: "compass", forBilling: true)
    }

    func present(url: URL, callbackURLScheme: String) async throws -> URL {
        try await runSession(
            url: url,
            callbackURLScheme: callbackURLScheme,
            forBilling: false)
    }

    private func runSession(
        url: URL,
        callbackURLScheme: String,
        forBilling: Bool
    ) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackURLScheme
            ) { [weak self] callbackURL, error in
                self?.activeSession = nil
                if let error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionError.errorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue
                    {
                        if forBilling {
                            continuation.resume(throwing: HostedBillingSessionError.userCanceled)
                        } else {
                            continuation.resume(throwing: WebAuthSessionError.userCancelled)
                        }
                    } else if forBilling {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(throwing: WebAuthSessionError.failed)
                    }
                    return
                }
                guard let callbackURL else {
                    if forBilling {
                        continuation.resume(throwing: HostedBillingSessionError.userCanceled)
                    } else {
                        continuation.resume(throwing: WebAuthSessionError.failed)
                    }
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            activeSession = session
            if !session.start() {
                activeSession = nil
                if forBilling {
                    continuation.resume(throwing: HostedBillingSessionError.presenterUnavailable)
                } else {
                    continuation.resume(throwing: WebAuthSessionError.failed)
                }
            }
        }
    }
}

extension WebAuthSessionPresenter: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApp.keyWindow ?? NSApp.mainWindow ?? NSWindow()
    }
}

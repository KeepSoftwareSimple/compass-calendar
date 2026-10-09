// Mirrors `billing.query.ts`, checkout/card panels, and gate behavior on the web.

import CompassKit
import Foundation

@MainActor
@Observable
public final class BillingStore {
    public private(set) var status: BillingStatusResponse?
    public private(set) var subscription: BillingSubscriptionResponse?
    public private(set) var isLoadingStatus = false
    public private(set) var statusLoadFailed = false
    public private(set) var isLoadingSubscription = false
    public private(set) var subscriptionLoadFailed = false
    public private(set) var isSubmitting = false
    public private(set) var actionError: String?
    public var isUpgradeConfirmationPresented = false
    public var isCancelConfirmationPresented = false
    public private(set) var isOpeningHostedSession = false
    public private(set) var didShowGateAnalytics = false

    private let billingAPI: BillingAPI
    private let configStore: ConfigStore
    private let analytics: ProductAnalyticsClient
    private let sessionPresenter: any HostedBillingSessionPresenting
    private var authenticated = false
    private var statusPollTask: Task<Void, Never>?
    private weak var settingsStore: SettingsStore?

    public init(
        apiClient: CompassAPIClient,
        configStore: ConfigStore,
        analytics: ProductAnalyticsClient = NoOpProductAnalyticsClient(),
        sessionPresenter: any HostedBillingSessionPresenting = UnavailableHostedBillingSessionPresenter()
    ) {
        billingAPI = BillingAPI(client: apiClient)
        self.configStore = configStore
        self.analytics = analytics
        self.sessionPresenter = sessionPresenter
    }

    public var appAccess: BillingAppAccess {
        BillingAppAccessResolver.resolve(
            .init(
                authenticated: authenticated,
                enforcement: configStore.config?.billing.enforcement,
                billingConfigured: configStore.config?.billing.isConfigured,
                configLoadFailed: configStore.loadError != nil,
                status: status,
                statusPending: isLoadingStatus && status == nil,
                statusLoadFailed: statusLoadFailed
            ))
    }

    public var gateStatus: SubscriptionStatusEnum? {
        BillingAppAccessResolver.gateStatus(access: appAccess)
    }

    public func setAuthenticated(_ value: Bool) {
        authenticated = value
        if !value {
            status = nil
            subscription = nil
            statusLoadFailed = false
            subscriptionLoadFailed = false
            stopStatusPoll()
        }
    }

    public func refreshAfterSignIn() async {
        await refreshStatus()
    }

    public func refreshStatus() async {
        guard authenticated, shouldLoadBilling else { return }
        isLoadingStatus = true
        statusLoadFailed = false
        defer { isLoadingStatus = false }
        do {
            status = try await billingAPI.getStatus()
        } catch {
            statusLoadFailed = true
        }
    }

    public func refreshSubscriptionDetails() async {
        guard authenticated, shouldLoadBilling else { return }
        if case .open = appAccess { return }
        isLoadingSubscription = true
        subscriptionLoadFailed = false
        defer { isLoadingSubscription = false }
        do {
            subscription = try await billingAPI.getSubscription()
        } catch {
            subscriptionLoadFailed = true
        }
    }

    public func attach(settingsStore: SettingsStore) {
        self.settingsStore = settingsStore
    }

    public func openSettings() {
        settingsStore?.open(page: .billing)
        Task { await refreshSubscriptionDetails() }
    }

    public func closeSettings() {
        settingsStore?.close()
        isCancelConfirmationPresented = false
    }

    public func trackGateShownIfNeeded() {
        guard let gateStatus, !didShowGateAnalytics else { return }
        didShowGateAnalytics = true
        analytics.track(
            .billingGateShown,
            properties: ["status": .string(gateStatus.rawValue)])
    }

    public func openCheckoutFromGate() {
        analytics.track(
            .billingGateCtaClicked,
            properties: ["cta": .string("checkout")])
        Task { await openHostedCheckout() }
    }

    public func openCheckoutFromPastDueBanner() {
        analytics.track(
            .billingGateCtaClicked,
            properties: ["cta": .string("past_due_update_card")])
        openSettings()
        Task { await openHostedPaymentMethodUpdate() }
    }

    public func openHostedCheckout() async {
        await presentHostedSession(
            url: { try await billingAPI.createCheckoutSession().url },
            refreshSubscriptionDetails: false,
            trackCardUpdate: false,
            fallback: "Couldn't start billing. Please try again in a moment."
        )
    }

    public func openHostedPaymentMethodUpdate() async {
        await presentHostedSession(
            url: { try await billingAPI.createPaymentMethodSession().url },
            refreshSubscriptionDetails: true,
            trackCardUpdate: true,
            fallback: "Couldn't update your card."
        )
    }

    public func handleBillingCheckoutDeepLink(
        _ urlString: String,
        refreshSubscriptionDetails: Bool = false,
        trackCardUpdate: Bool = false
    ) {
        guard DesktopDeepLinkParser.parseBillingCheckout(from: urlString) != nil else { return }
        if trackCardUpdate {
            analytics.track(.billingCardUpdateCompleted, properties: [:])
        }
        startStatusPoll(alsoRefreshSubscriptionDetails: refreshSubscriptionDetails)
    }

    public func startStatusPoll(alsoRefreshSubscriptionDetails: Bool = false) {
        stopStatusPoll()
        statusPollTask = Task { [weak self] in
            guard let self else { return }
            let deadline = Date().addingTimeInterval(15)
            while !Task.isCancelled, Date() < deadline {
                await refreshStatus()
                if alsoRefreshSubscriptionDetails {
                    await refreshSubscriptionDetails()
                }
                try? await Task.sleep(for: .milliseconds(1500))
            }
        }
    }

    public func stopStatusPoll() {
        statusPollTask?.cancel()
        statusPollTask = nil
    }

    public func endTrialEarly() async {
        await runSubmitting {
            _ = try await billingAPI.endTrial()
            await refreshStatus()
            await refreshSubscriptionDetails()
            isUpgradeConfirmationPresented = false
        }
    }

    public func cancelSubscriptionAtPeriodEnd() async {
        await runSubmitting {
            _ = try await billingAPI.cancelSubscription()
            analytics.track(.billingCancelScheduled, properties: [:])
            await refreshStatus()
            await refreshSubscriptionDetails()
            isCancelConfirmationPresented = false
        }
    }

    public func resumeSubscription() async {
        await runSubmitting {
            _ = try await billingAPI.resumeSubscription()
            analytics.track(.billingResumed, properties: [:])
            await refreshStatus()
            await refreshSubscriptionDetails()
        }
    }

    public func resetForTests() {
        status = nil
        subscription = nil
        isLoadingStatus = false
        statusLoadFailed = false
        isLoadingSubscription = false
        subscriptionLoadFailed = false
        isSubmitting = false
        actionError = nil
        isUpgradeConfirmationPresented = false
        isCancelConfirmationPresented = false
        isOpeningHostedSession = false
        didShowGateAnalytics = false
        authenticated = false
        stopStatusPoll()
    }

    private func presentHostedSession(
        url fetchURL: () async throws -> String?,
        refreshSubscriptionDetails: Bool,
        trackCardUpdate: Bool,
        fallback: String
    ) async {
        actionError = nil
        isOpeningHostedSession = true
        defer { isOpeningHostedSession = false }
        do {
            guard let urlString = try await fetchURL(), let url = URL(string: urlString) else {
                throw HostedBillingSessionError.missingHostedURL
            }
            let callback = try await sessionPresenter.presentHostedSession(url: url)
            handleBillingCheckoutDeepLink(
                callback.absoluteString,
                refreshSubscriptionDetails: refreshSubscriptionDetails,
                trackCardUpdate: trackCardUpdate
            )
        } catch HostedBillingSessionError.userCanceled {
            return
        } catch {
            actionError = billingActionMessage(error, fallback: fallback)
        }
    }

    private var shouldLoadBilling: Bool {
        guard BillingAppAccessResolver.isBillingEnforced(config: configStore.config) else {
            return false
        }
        return configStore.config?.billing.isConfigured == true
    }

    private func runSubmitting(_ work: () async throws -> Void) async {
        isSubmitting = true
        actionError = nil
        defer { isSubmitting = false }
        do {
            try await work()
        } catch {
            actionError = billingActionMessage(error, fallback: "Something went wrong. Try again.")
        }
    }

    private func billingActionMessage(_ error: Error, fallback: String) -> String {
        if let api = error as? CompassAPIError, case let .httpStatus(_, body) = api, !body.isEmpty {
            return AuthAPIUserFacing.message(from: body, fallback: fallback)
        }
        return fallback
    }
}

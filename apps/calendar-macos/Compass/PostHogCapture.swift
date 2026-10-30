import CompassData
import CompassKit
import Foundation

actor PostHogCapture {
    static let shared = PostHogCapture()

    private var client = PostHogBatchClient(configuration: nil)
    private var identityController = PostHogIdentityController()
    private var sessionController = PostHogSessionController()
    private var flushTask: Task<Void, Never>?
    private var environmentLabel = PosthogEnvironment.resolve(hostname: nil)
    private let lib = "compass-macos"

    func setEnvironment(hostname: String?) {
        environmentLabel = PosthogEnvironment.resolve(hostname: hostname)
    }

    func disableCapture() {
        client = PostHogBatchClient(configuration: nil)
    }

    func configure(posthog: AppConfigPosthog?) {
        guard UITestLaunchPolicy.capturesProductAnalytics else {
            disableCapture()
            return
        }
        guard let posthog else {
            client = PostHogBatchClient(configuration: nil)
            return
        }
        applyConfiguration(
            PostHogCaptureConfiguration(
                apiKey: posthog.key,
                host: posthog.host,
                lib: lib))
    }

    func configureFromBundle() async {
        guard UITestLaunchPolicy.capturesProductAnalytics else {
            disableCapture()
            return
        }
        let key = Bundle.main.object(forInfoDictionaryKey: "COMPASS_POSTHOG_KEY") as? String
        let host = Bundle.main.object(forInfoDictionaryKey: "COMPASS_POSTHOG_HOST") as? String
        guard let key, let host, !key.isEmpty, !host.isEmpty else {
            client = PostHogBatchClient(configuration: nil)
            return
        }
        configure(posthog: AppConfigPosthog(host: host, key: key))
    }

    func identify(distinctId: String) {
        if let aliasEvent = identityController.identify(userId: distinctId) {
            enqueueAliasIfNeeded(aliasEvent)
        }
    }

    func resetIdentity() {
        _ = identityController.resetSignedOutIdentity()
        sessionController.resetSession()
    }

    func capture(_ event: ProductEvent, properties: ProductEventProperties = [:]) {
        guard UITestLaunchPolicy.capturesProductAnalytics else { return }
        let distinctId = identityController.distinctIdForCapture()
        let sessionId = sessionController.touchSessionId()
        var merged = properties
        merged["environment"] = .string(environmentLabel)
        merged["version"] = .string(AppBuildInfo.marketingVersion)
        do {
            try client.enqueue(
                event: event.rawValue,
                distinctId: distinctId,
                sessionId: sessionId,
                properties: merged)
            scheduleFlush()
        } catch {
            // Analytics must never interrupt product actions.
        }
    }

    func submitFeedback(details: String, appView: String) async throws {
        guard client.isConfigured else {
            throw PostHogBatchClientError.notConfigured
        }
        let distinctId = identityController.distinctIdForCapture()
        let sessionId = sessionController.touchSessionId()
        let properties: ProductEventProperties = [
            "$survey_id": .string(DesktopFeedbackSurvey.surveyId),
            "$survey_name": .string(DesktopFeedbackSurvey.surveyName),
            "$survey_response": .string(details),
            "$survey_response_\(DesktopFeedbackSurvey.questionId)": .string(details),
            "$survey_completed": .bool(true),
            "app_version": .string(AppBuildInfo.marketingVersion),
            "app_view": .string(appView),
            "feedback_source": .string("help_menu"),
            "feedback_type": .string("feedback"),
        ]
        try client.enqueue(
            event: "survey sent",
            distinctId: distinctId,
            sessionId: sessionId,
            properties: properties)
        await flushQueuedEvents()
    }

    func flushNow() async {
        flushTask?.cancel()
        flushTask = nil
        await flushQueuedEvents()
    }

    private func applyConfiguration(_ configuration: PostHogCaptureConfiguration) {
        client = PostHogBatchClient(
            configuration: configuration,
            transport: PostHogBatchTransport { request in
                let (data, response) = try await URLSession.shared.data(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode ?? -1
                return (status, data)
            })
    }

    private func enqueueAliasIfNeeded(_ event: PostHogIdentityEvent) {
        guard case let .alias(previousAnonymousId, userId) = event else { return }
        let sessionId = sessionController.touchSessionId()
        let aliasCapture = identityController.makeAliasCapture(
            previousAnonymousId: previousAnonymousId,
            userId: userId)
        do {
            try client.enqueue(aliasCapture, sessionId: sessionId)
            scheduleFlush()
        } catch {
            // Analytics must never interrupt product actions.
        }
    }

    private func scheduleFlush() {
        flushTask?.cancel()
        flushTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            await PostHogCapture.shared.flushQueuedEvents()
        }
    }

    private func flushQueuedEvents() async {
        var batchClient = client
        try? await batchClient.flush()
        client = batchClient
    }
}

final class PostHogAnalyticsClient: ProductAnalyticsClient, @unchecked Sendable {
    func track(_ event: ProductEvent, properties: ProductEventProperties) {
        Task {
            await PostHogCapture.shared.capture(event, properties: properties)
        }
    }
}

import CompassData
import CompassKit
import Foundation

actor PostHogCapture {
    static let shared = PostHogCapture()

    private var client = PostHogBatchClient(configuration: nil)
    private var activeDistinctId: String?
    private var flushTask: Task<Void, Never>?
    private let lib = "compass-macos"

    func configure(posthog: AppConfigPosthog?) {
        guard let posthog else {
            client = PostHogBatchClient(configuration: nil)
            return
        }
        let configuration = PostHogCaptureConfiguration(
            apiKey: posthog.key,
            host: posthog.host,
            lib: lib)
        client = PostHogBatchClient(
            configuration: configuration,
            transport: PostHogBatchTransport { request in
                let (data, response) = try await URLSession.shared.data(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode ?? -1
                return (status, data)
            })
    }

    func configureFromBundle() async {
        let key = Bundle.main.object(forInfoDictionaryKey: "COMPASS_POSTHOG_KEY") as? String
        let host = Bundle.main.object(forInfoDictionaryKey: "COMPASS_POSTHOG_HOST") as? String
        guard let key, let host, !key.isEmpty, !host.isEmpty else {
            client = PostHogBatchClient(configuration: nil)
            return
        }
        configure(posthog: AppConfigPosthog(host: host, key: key))
    }

    func identify(distinctId: String) {
        activeDistinctId = distinctId
        client.setDistinctId(distinctId)
    }

    func resetIdentity() {
        activeDistinctId = nil
        client.setDistinctId(nil)
    }

    func capture(_ event: ProductEvent, properties: ProductEventProperties = [:]) {
        do {
            try client.enqueue(event: event.rawValue, properties: properties)
            scheduleFlush()
        } catch {
            // Analytics must never interrupt product actions.
        }
    }

    func submitFeedback(details: String, appView: String) async throws {
        guard client.isConfigured else {
            throw PostHogBatchClientError.notConfigured
        }
        _ = ensureDistinctId()
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
        try client.enqueue(event: "survey sent", properties: properties)
        await flushQueuedEvents()
    }

    private func ensureDistinctId() -> String {
        if let activeDistinctId {
            return activeDistinctId
        }
        let key = "COMPASS_POSTHOG_ANON_DISTINCT_ID"
        if let stored = UserDefaults.standard.string(forKey: key), !stored.isEmpty {
            identify(distinctId: stored)
            return stored
        }
        let generated = UUID().uuidString
        UserDefaults.standard.set(generated, forKey: key)
        identify(distinctId: generated)
        return generated
    }

    func flushNow() async {
        flushTask?.cancel()
        flushTask = nil
        await flushQueuedEvents()
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

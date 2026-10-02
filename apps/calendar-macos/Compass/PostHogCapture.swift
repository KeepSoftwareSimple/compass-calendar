import CompassData
import CompassKit
import Foundation

actor PostHogCapture {
    static let shared = PostHogCapture()

    private var client = PostHogBatchClient(configuration: nil)
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
        configure(posthog: AppConfigPosthog(key: key, host: host))
    }

    func identify(distinctId: String) {
        client.setDistinctId(distinctId)
    }

    func resetIdentity() {
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

    func flushNow() async {
        flushTask?.cancel()
        flushTask = nil
        try? await client.flush()
    }

    private func scheduleFlush() {
        flushTask?.cancel()
        flushTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            try? await client.flush()
        }
    }
}

@MainActor
final class PostHogAnalyticsClient: ProductAnalyticsClient {
    func track(_ event: ProductEvent, properties: ProductEventProperties) {
        Task {
            await PostHogCapture.shared.capture(event, properties: properties)
        }
    }
}

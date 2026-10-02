// Mirrors runtime `/api/config` consumption on the web (see `ConfigAPI` / app bootstrap).

import CompassKit
import Foundation

@MainActor
@Observable
public final class ConfigStore {
    public private(set) var config: AppConfig?
    public private(set) var loadError: String?
    public private(set) var isLoading = false

    private let configAPI: ConfigAPI

    public init(configAPI: ConfigAPI) {
        self.configAPI = configAPI
    }

    public init(apiClient: CompassAPIClient) {
        self.configAPI = ConfigAPI(client: apiClient)
    }

    public func load() async {
        guard !isLoading else { return }
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            config = try await configAPI.get()
        } catch {
            loadError = String(describing: error)
        }
    }

    public func resetForTests() {
        config = nil
        loadError = nil
        isLoading = false
    }
}

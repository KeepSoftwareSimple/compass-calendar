import CompassKit
import Foundation

public actor ContactSuggestionDebouncer {
    public typealias Fetch = @Sendable (String) async -> [DraftAttendeeInput]

    private let debounceMilliseconds: Int
    private let fetch: Fetch
    private var pendingTask: Task<[DraftAttendeeInput], Never>?
    private var generation: UInt = 0

    public init(
        debounceMilliseconds: Int = ContactSuggestionConstants.debounceMilliseconds,
        fetch: @escaping Fetch
    ) {
        self.debounceMilliseconds = debounceMilliseconds
        self.fetch = fetch
    }

    public func cancel() {
        generation &+= 1
        pendingTask?.cancel()
        pendingTask = nil
    }

    public func suggestions(for rawQuery: String) async -> [DraftAttendeeInput] {
        generation &+= 1
        let currentGeneration = generation
        pendingTask?.cancel()

        let task = Task { [debounceMilliseconds, fetch] in
            if debounceMilliseconds > 0 {
                try? await Task.sleep(for: .milliseconds(debounceMilliseconds))
            }
            guard !Task.isCancelled else { return [] as [DraftAttendeeInput] }
            let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
            guard query.count >= ContactSuggestionConstants.minQueryLength else { return [] }
            return await fetch(query)
        }
        pendingTask = task
        let result = await task.value
        guard currentGeneration == generation else { return [] }
        return result
    }
}

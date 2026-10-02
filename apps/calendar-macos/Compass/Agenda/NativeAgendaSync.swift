import CompassData
import CompassKit
import Foundation

@MainActor
final class NativeAgendaSync {
    private weak var model: NativeCalendarRootModel?
    private var debounceTask: Task<Void, Never>?
    private var lastPayload = ""
    private var timer: Timer?

    func start(model: NativeCalendarRootModel, deepLinkDeliverer: CompassAgendaDeepLinkDelivering) {
        self.model = model
        CompassAgendaController.shared.configure(deepLinkDeliverer: deepLinkDeliverer)
        timer?.invalidate()
        let timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.schedulePush()
            }
        }
        self.timer = timer
        schedulePush()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        debounceTask?.cancel()
        model = nil
    }

    func schedulePush() {
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(DesktopAgendaBuilder.debounceMilliseconds))
            guard !Task.isCancelled else { return }
            await MainActor.run {
                self?.pushAgenda()
            }
        }
    }

    private func pushAgenda() {
        guard let model else { return }
        let now = model.referenceNow
        let items = DesktopAgendaBuilder.build(
            now: now,
            candidates: model.sidebandTimedCandidates())
        let payload = (try? JSONEncoder().encode(items)).flatMap { String(data: $0, encoding: .utf8) } ?? ""
        if payload == lastPayload { return }
        lastPayload = payload
        CompassAgendaController.shared.updateAgenda(items)
    }
}

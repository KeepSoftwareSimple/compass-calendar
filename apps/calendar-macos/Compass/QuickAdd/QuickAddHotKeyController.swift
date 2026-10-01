import AppKit
import Carbon
import CompassKit

@MainActor
final class QuickAddHotKeyController {
    private static let hotKeySignature: OSType = 0x434D_5051 // "CMPQ"
    private static let hotKeyID: UInt32 = 1

    private var hotKeyRef: EventHotKeyRef?
    private var handlerInstalled = false
    private var handlerRef: EventHandlerRef?

    var onHotKeyPressed: (() -> Void)?
    private(set) var binding: QuickAddHotKeyBinding

    init(binding: QuickAddHotKeyBinding = QuickAddHotKeyStorage.load()) {
        self.binding = binding
    }

    func start() {
        installHandlerIfNeeded()
        registerHotKey()
    }

    func stop() {
        unregisterHotKey()
    }

    func applyShortcut(_ raw: String) {
        guard let parsed = QuickAddHotKeyParser.parse(raw) else { return }
        binding = parsed
        QuickAddHotKeyStorage.save(parsed)
        registerHotKey()
    }

    private func registerHotKey() {
        unregisterHotKey()
        var hotKeyID = EventHotKeyID(
            signature: Self.hotKeySignature,
            id: Self.hotKeyID)
        let status = RegisterEventHotKey(
            binding.keyCode,
            binding.carbonModifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &hotKeyRef)
        if status != noErr {
            hotKeyRef = nil
        }
    }

    private func unregisterHotKey() {
        if let hotKeyRef {
            UnregisterEventHotKey(hotKeyRef)
            self.hotKeyRef = nil
        }
    }

    private func installHandlerIfNeeded() {
        guard !handlerInstalled else { return }
        handlerInstalled = true
        var eventType = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed))
        let userData = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, userData -> OSStatus in
                guard let userData else { return OSStatus(eventNotHandledErr) }
                let controller = Unmanaged<QuickAddHotKeyController>
                    .fromOpaque(userData)
                    .takeUnretainedValue()
                var hotKeyID = EventHotKeyID()
                let status = GetEventParameter(
                    event,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &hotKeyID)
                guard status == noErr,
                      hotKeyID.signature == QuickAddHotKeyController.hotKeySignature,
                      hotKeyID.id == QuickAddHotKeyController.hotKeyID
                else {
                    return OSStatus(eventNotHandledErr)
                }
                Task { @MainActor in
                    controller.onHotKeyPressed?()
                }
                return noErr
            },
            1,
            &eventType,
            userData,
            &handlerRef)
    }
}

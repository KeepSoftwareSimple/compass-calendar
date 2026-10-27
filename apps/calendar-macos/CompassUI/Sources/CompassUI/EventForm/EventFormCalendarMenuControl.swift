import AppKit
import CompassKit
import SwiftUI

/// The SwiftUI label supplies the chrome; this transparent native popup owns
/// menu tracking, keyboard activation and accessibility.
struct EventFormCalendarMenuControl: NSViewRepresentable {
    let calendars: [CompassCalendar]
    let selectedId: String?
    let focusRequest: Int
    let requestsFocus: Bool
    @Binding var isFocused: Bool
    let onSelect: (String) -> Void

    func makeNSView(context: Context) -> CalendarPopupButton {
        let button = CalendarPopupButton(frame: .zero, pullsDown: false)
        button.isTransparent = true
        button.focusRingType = .none
        button.setAccessibilityIdentifier("compass-event-form-calendar")
        button.target = button
        button.action = #selector(CalendarPopupButton.chooseCalendar)
        return button
    }

    func updateNSView(_ button: CalendarPopupButton, context: Context) {
        button.isEnabled = context.environment.isEnabled
        button.onSelect = onSelect
        button.onFocusChange = { focused in
            DispatchQueue.main.async { isFocused = focused }
        }
        let titles = calendars.map { $0.isPrimary ? "\($0.name) (primary)" : $0.name }
        let ids = calendars.map(\.id)
        if button.itemTitles != titles || button.itemArray.compactMap({ $0.representedObject as? String }) != ids {
            button.removeAllItems()
            for (title, id) in zip(titles, ids) {
                button.addItem(withTitle: title)
                button.lastItem?.representedObject = id
            }
        }
        if let index = ids.firstIndex(of: selectedId ?? "") { button.selectItem(at: index) }
        if requestsFocus, button.lastFocusRequest != focusRequest {
            button.lastFocusRequest = focusRequest
            DispatchQueue.main.async { button.window?.makeFirstResponder(button) }
        }
    }
}

final class CalendarPopupButton: NSPopUpButton {
    var lastFocusRequest = -1
    var onSelect: ((String) -> Void)?
    var onFocusChange: ((Bool) -> Void)?
    override var acceptsFirstResponder: Bool { true }

    override func becomeFirstResponder() -> Bool {
        let accepted = super.becomeFirstResponder()
        if accepted { onFocusChange?(true) }
        return accepted
    }

    override func resignFirstResponder() -> Bool {
        let accepted = super.resignFirstResponder()
        if accepted { onFocusChange?(false) }
        return accepted
    }

    override func keyDown(with event: NSEvent) {
        if [36, 49].contains(event.keyCode), event.modifierFlags.intersection(.deviceIndependentFlagsMask).isEmpty {
            performClick(nil)
        } else {
            super.keyDown(with: event)
        }
    }

    @objc func chooseCalendar() {
        if let id = selectedItem?.representedObject as? String { onSelect?(id) }
    }
}

import CompassData
import CompassKit
import SwiftUI

struct EventFormToolbarView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let draft: GridEventDraft
    @FocusState private var focusedAction: String?

    var body: some View {
        HStack(spacing: 4) {
            Spacer(minLength: 0)
            if draft.kind == .edit {
                toolbarButton(label: "Duplicate", icon: .copy, shortcut: "⌘ D") {
                    Task { await model.duplicateFocusedOrFormEvent() }
                }
                if model.hasBookedMeetingActions {
                    BookingEventActionsView(model: model, focusedAction: $focusedAction)
                } else if !model.isEventFormReadOnly(for: draft) {
                    toolbarButton(label: "Delete", icon: .trash, shortcut: "Delete") {
                        Task { await model.deleteFormEvent() }
                    }
                }
            } else if !model.isEventFormReadOnly(for: draft) {
                // Web shows Delete on a new draft too; nothing is saved, so it
                // closes the form, like Escape.
                toolbarButton(label: "Delete", icon: .trash, shortcut: "Delete") {
                    model.requestCloseEventForm()
                }
            }
            toolbarButton(label: "Close", icon: .x, shortcut: "Esc") {
                model.requestCloseEventForm()
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Event actions")
        .accessibilityIdentifier("compass-event-form-actions")
        .onKeyPress(keys: [.tab]) { press in
            guard press.modifiers.isEmpty || press.modifiers == .shift,
                let focusedAction, let index = actionLabels.firstIndex(of: focusedAction)
            else { return .ignored }
            let next = index + (press.modifiers.contains(.shift) ? -1 : 1)
            guard actionLabels.indices.contains(next) else { return .ignored }
            self.focusedAction = actionLabels[next]
            return .handled
        }
        .onEventFormFocusRequest(model, field: .actions) {
            focusedAction = actionLabels.first
        }
        .onChange(of: focusedAction) { _, action in
            model.isEventFormActionFocused = action != nil
        }
        .onDisappear { model.isEventFormActionFocused = false }
    }

    private var actionLabels: [String] {
        var labels: [String] = draft.kind == .edit ? ["Duplicate"] : []
        if draft.kind == .edit && model.hasBookedMeetingActions {
            labels += ["Cancel meeting", "Reschedule"]
        } else if !model.isEventFormReadOnly(for: draft) {
            labels.append("Delete")
        }
        return labels + ["Close"]
    }

    private func toolbarButton(
        label: String,
        icon: PhosphorIcon,
        shortcut: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            PhosphorIconView(icon: icon, size: 18)
                .frame(width: 32, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .focusable()
        .focusEffectDisabled()
        .focused($focusedAction, equals: label)
        .onKeyPress(.return) {
            action()
            return .handled
        }
        .onKeyPress(.space) {
            action()
            return .handled
        }
        .overlay {
            if focusedAction == label {
                RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault)
                    .stroke(theme.accentColor, lineWidth: 1)
                    .allowsHitTesting(false)
            }
        }
        .accessibilityLabel(label)
        .help("\(label) (\(shortcut))")
    }
}

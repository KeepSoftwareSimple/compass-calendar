import CompassData
import CompassKit
import SwiftUI

/// Web `LocationField`: free-text location with Apple Maps suggestions.
/// Arrows move through the list, Return picks, Escape closes it. With the
/// list closed, keys behave like any text field.
struct EventFormLocationField: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let draft: GridEventDraft
    let focusField: EventFormField

    @State private var completer = LocationCompleter()
    @State private var activeIndex: Int?
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("Location", text: Binding(
                get: { draft.location },
                set: { value in
                    model.updateDraftFromForm(location: value)
                    activeIndex = nil
                    completer.update(query: value)
                }
            ))
            .textFieldStyle(.plain)
            .font(.rubik(13))
            .foregroundStyle(theme.textColor)
            .focused($fieldFocused)
            .accessibilityIdentifier("compass-event-form-location")
            .onKeyPress(.downArrow) { moveActive(by: 1) }
            .onKeyPress(.upArrow) { moveActive(by: -1) }
            .onKeyPress(.return) {
                guard let activeIndex, completer.suggestions.indices.contains(activeIndex) else {
                    return .ignored
                }
                pick(completer.suggestions[activeIndex])
                return .handled
            }
            .onKeyPress(.escape) {
                guard !completer.suggestions.isEmpty else { return .ignored }
                closeList()
                return .handled
            }

            if fieldFocused, !completer.suggestions.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(completer.suggestions.enumerated()), id: \.offset) { index, suggestion in
                        Button {
                            pick(suggestion)
                        } label: {
                            Text(suggestion)
                                .font(.rubik(12))
                                .foregroundStyle(theme.textColor)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 4)
                                .background(index == activeIndex ? theme.surfaceColor : Color.clear)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Location suggestions")
            }
        }
        .pageJumpChipAnchor(id: "form-location")
        .onChange(of: focusField) { _, field in
            fieldFocused = field == .location
        }
        .onChange(of: model.eventFormLocationFocusRequest) { _, _ in
            DispatchQueue.main.async {
                guard model.isEventFormVisible, model.eventFormFocusedField == .location else { return }
                fieldFocused = true
            }
        }
        .onChange(of: fieldFocused) { _, focused in
            if !focused { closeList() }
        }
    }

    private func moveActive(by delta: Int) -> KeyPress.Result {
        let count = completer.suggestions.count
        guard count > 0 else { return .ignored }
        let next = (activeIndex ?? -1) + delta
        activeIndex = min(count - 1, max(0, next))
        return .handled
    }

    private func pick(_ suggestion: String) {
        model.updateDraftFromForm(location: suggestion)
        closeList()
    }

    private func closeList() {
        activeIndex = nil
        completer.clear()
    }
}

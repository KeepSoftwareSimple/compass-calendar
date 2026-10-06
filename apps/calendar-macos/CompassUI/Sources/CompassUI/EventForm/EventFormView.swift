import CompassData
import CompassKit
import SwiftUI

public struct EventFormView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var model: NativeCalendarRootModel
    @FocusState private var titleFocused: Bool

    public init(model: NativeCalendarRootModel) {
        self.model = model
    }

    public var body: some View {
        if model.isEventFormVisible, let draft = model.draftStore.gridDraft {
            HStack(spacing: 0) {
                Spacer()
                formPanel(draft: draft)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlayPreferenceValue(PageJumpChipAnchorKey.self) { anchors in
                ModHoldChipsOverlay(
                    targets: model.formFieldDigitTargets(),
                    anchors: anchors,
                    visible: model.formFieldDigitHintsVisible,
                    accessibilityIdentifier: "compass-form-field-digit-chips"
                )
            }
        }
    }

    private func formPanel(draft: GridEventDraft) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            EventFormToolbarView(
                isExistingEvent: draft.kind == .edit,
                onClose: { model.requestCloseEventForm() },
                onDuplicate: { Task { await model.duplicateFocusedOrFormEvent() } },
                onDelete: { Task { await model.deleteFormEvent() } }
            )
            .pageJumpChipAnchor(id: "form-actions")

            TextField("Title", text: Binding(
                get: { draft.title },
                set: { model.updateDraftFromForm(title: $0) }
            ))
            .textFieldStyle(.plain)
            .font(.custom("Rubik", size: 16))
            .foregroundStyle(theme.textColor)
            .focused($titleFocused)
            .pageJumpChipAnchor(id: "form-title")

            DescriptionEditorView(
                html: Binding(
                    get: { draft.description },
                    set: { model.updateDraftFromForm(description: $0) }
                ),
                resetKey: draft.persistedEventId?.rawValue ?? draft.clientId.rawValue,
                isFocused: model.eventFormFocusedField == .description
            )
            .frame(minHeight: 72, maxHeight: 140)
            .padding(8)
            .background(theme.surfacePanelColor)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(
                        model.eventFormFocusedField == .description ? theme.accentColor : theme.borderColor,
                        lineWidth: 1
                    )
            )
            .pageJumpChipAnchor(id: "form-description")

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    EventFormScheduleSection(
                        model: model,
                        draft: draft,
                        focusField: model.eventFormFocusedField
                    )
                    EventFormCalendarSection(
                        model: model,
                        draft: draft,
                        focusField: model.eventFormFocusedField
                    )
                    EventFormColorSection(
                        model: model,
                        draft: draft,
                        focusField: model.eventFormFocusedField
                    )
                }
            }
        }
        .padding(16)
        .frame(width: 320)
        .frame(maxHeight: .infinity)
        .background(theme.surfacePanelColor)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(theme.borderColor)
                .frame(width: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("compass-event-form")
        .onAppear {
            titleFocused = true
            model.eventFormFocusedField = .title
        }
        .onChange(of: model.eventFormFocusedField) { _, field in
            titleFocused = field == .title
        }
    }
}

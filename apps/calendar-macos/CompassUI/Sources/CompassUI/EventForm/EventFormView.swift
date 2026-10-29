import CompassData
import CompassKit
import SwiftUI

/// Web `SidebarEventDetails`: the form replaces the sidebar's body while a
/// draft is open, so `RootView` hosts it in the sidebar column.
public struct EventFormView: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var model: NativeCalendarRootModel
    @FocusState private var titleFocused: Bool

    public init(model: NativeCalendarRootModel) {
        self.model = model
    }

    public var body: some View {
        if model.isEventFormVisible, let draft = model.draftStore.gridDraft {
            formPanel(draft: draft)
                .environment(\.timeZone, TimeZone(identifier: model.viewStore.effectiveTimeZone) ?? .current)
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
        let isReadOnly = model.isEventFormReadOnly(for: draft)
        return VStack(alignment: .leading, spacing: 12) {
            EventFormToolbarView(model: model, draft: draft)
            .pageJumpChipAnchor(id: "form-actions")

            EventFormTitleField(
                draft: draft,
                title: Binding(
                    get: { draft.title },
                    set: { model.updateDraftFromForm(title: $0) }
                ),
                focused: $titleFocused,
                isReadOnly: isReadOnly
            )

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        EventFormCard {
                            VStack(alignment: .leading, spacing: 10) {
                                EventFormScheduleSection(
                                    model: model,
                                    draft: draft
                                )
                                EventFormRecurrenceSection(
                                    model: model,
                                    draft: draft
                                )
                                .disabled(model.isScheduleLocked(for: draft))
                            }
                        }
                        .id(EventFormField.start)
                        EventFormCard {
                            VStack(alignment: .leading, spacing: 10) {
                                EventFormCalendarSection(
                                    model: model,
                                    draft: draft
                                )
                                .disabled(isReadOnly)
                                EventFormColorSection(
                                    model: model,
                                    draft: draft,
                                    focusField: model.eventFormFocusedField
                                )
                                .disabled(isReadOnly)
                            }
                        }
                        .id(EventFormField.calendar)
                        EventFormCard(highlighted: isLogisticsFieldFocused(model.eventFormFocusedField)) {
                            VStack(alignment: .leading, spacing: 10) {
                                EventFormIconRow(icon: .mapPin) {
                                    EventFormLocationField(
                                        model: model,
                                        draft: draft,
                                        focusField: model.eventFormFocusedField
                                    )
                                    .disabled(isReadOnly)
                                }
                                EventFormConferenceSection(
                                    model: model,
                                    draft: draft
                                )
                                .id(EventFormField.conference)
                                EventFormIconRow(icon: .users, alignTop: true) {
                                    EventFormAttendeesSection(
                                        model: model,
                                        draft: draft,
                                        focusField: model.eventFormFocusedField
                                    )
                                    .id(EventFormField.attendees)
                                }
                            }
                        }
                        .id(EventFormField.location)
                        EventFormCard(highlighted: model.eventFormFocusedField == .description) {
                            DescriptionEditorView(
                                html: Binding(
                                    get: { draft.description },
                                    set: { model.updateDraftFromForm(description: $0) }
                                ),
                                resetKey: draft.persistedEventId?.rawValue ?? draft.clientId.rawValue,
                                isFocused: model.eventFormFocusedField == .description,
                                isEditable: !isReadOnly,
                                suppressLinkHintSlots: model.hasBookedMeetingActions
                                    || BookingEventLinks.parse(draft.description) != nil,
                                onLinkCopied: { model.didCopyDescriptionLink() }
                            )
                            .frame(minHeight: 72, maxHeight: 140)
                        }
                        .pageJumpChipAnchor(id: "form-description")
                        .id(EventFormField.description)

                        EventFormRsvpSection(
                            model: model,
                            draft: draft
                        )
                        .id(EventFormField.rsvp)
                    }
                }
                .onAppear {
                    guard UITestLaunchPolicy.isParityCapture else { return }
                    DispatchQueue.main.async {
                        proxy.scrollTo(EventFormField.start, anchor: .top)
                    }
                }
                .onChange(of: model.eventFormFocusedField) { _, field in
                    proxy.scrollTo(field == .end ? EventFormField.start : field, anchor: .center)
                }
                .onChange(of: draft.recurrence) { _, _ in
                    if model.eventFormFocusedField == .recurrence {
                        proxy.scrollTo(EventFormField.recurrence, anchor: .center)
                    }
                }
            }
            if !isReadOnly {
                Button {
                    Task { await model.saveDraft() }
                } label: {
                    HStack(spacing: 8) {
                        Text("Save")
                        Spacer(minLength: 8)
                        HStack(spacing: 4) {
                            saveKeycap(KeycapGlyphs.display(["Mod"]))
                            saveKeycap("Enter")
                        }
                    }
                    .font(.rubik(14, weight: .medium))
                    .foregroundStyle(theme.onAccentColor)
                    .padding(.horizontal, 20)
                    .frame(maxWidth: .infinity, minHeight: 40, maxHeight: 40)
                    .background(theme.accentColor)
                    .clipShape(RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault))
                }
                .buttonStyle(.plain)
                .disabled(model.hasPendingEventMutations)
                .accessibilityLabel("Save")
                .accessibilityIdentifier("compass-event-form-save")
                EventFormFooterTipsView(
                    model: model,
                    tabNavigationApplies: model.eventFormDateKeyOwner == nil)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .tint(theme.accentColor)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("compass-event-form")
        .focusOnAppear($titleFocused)
        .onAppear {
            model.eventFormFocusedField = .title
        }
        .onDisappear { model.cancelBookedMeetingConfirmation() }
        .onChange(of: draft.clientId) { _, _ in model.cancelBookedMeetingConfirmation() }
        .onChange(of: model.eventFormFocusedField) { _, field in
            titleFocused = field == .title
        }
        .onEventFormFocusRequest(model, field: .title) {
            titleFocused = true
        }
    }

    private func isLogisticsFieldFocused(_ field: EventFormField) -> Bool {
        field == .location || field == .conference || field == .attendees
    }

    private func saveKeycap(_ label: String) -> some View {
        Text(label)
            .font(.rubik(11, weight: .medium))
            .foregroundStyle(theme.onAccentColor.opacity(0.92))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(theme.onAccentColor.opacity(0.1))
            .overlay {
                RoundedRectangle(cornerRadius: 4)
                    .stroke(theme.onAccentColor.opacity(0.35), lineWidth: 1)
            }
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

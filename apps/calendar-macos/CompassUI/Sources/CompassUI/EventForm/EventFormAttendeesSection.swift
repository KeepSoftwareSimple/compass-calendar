import CompassData
import CompassKit
import SwiftUI

struct EventFormAttendeesSection: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable var model: NativeCalendarRootModel
    let draft: GridEventDraft
    let focusField: EventFormField

    @State private var query = ""
    @FocusState private var fieldFocused: Bool

    var body: some View {
        if model.showAttendeeEditor(for: draft) {
            VStack(alignment: .leading, spacing: 8) {
                if let tally = attendeeTally {
                    Text(tally)
                        .font(.custom("Rubik", size: 11))
                        .foregroundStyle(theme.textMutedColor)
                }
                FlowLayout(spacing: 6) {
                    ForEach(displayedAttendees, id: \.email) { attendee in
                        attendeeChip(attendee)
                    }
                }
                TextField("Add guest email", text: $query)
                    .textFieldStyle(.plain)
                    .font(.custom("Rubik", size: 13))
                    .focused($fieldFocused)
                    .onChange(of: query) { _, value in
                        model.scheduleAttendeeSuggestions(for: value)
                    }
                    .onSubmit { commitQuery() }
                if !model.attendeeSuggestions.isEmpty, !query.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(model.attendeeSuggestions, id: \.email) { suggestion in
                            Button {
                                addAttendee(suggestion)
                                query = ""
                                model.attendeeSuggestions = []
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(suggestion.displayName ?? suggestion.email)
                                        .foregroundStyle(theme.textColor)
                                    Text(suggestion.email)
                                        .font(.custom("Rubik", size: 11))
                                        .foregroundStyle(theme.textMutedColor)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if !model.canSuggestContacts {
                    EnableContactSuggestionsNudgeView(model: model)
                }
            }
            .padding(12)
            .background(theme.surfacePanelColor)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(focusField == .attendees ? theme.accentColor : theme.borderColor, lineWidth: 1)
            )
            .accessibilityIdentifier("compass-event-form-attendees")
            .pageJumpChipAnchor(id: "form-attendees")
            .onChange(of: focusField) { _, field in
                fieldFocused = field == .attendees
            }
        }
    }

    private var displayedAttendees: [DraftAttendeeInput] {
        model.displayAttendees(for: draft)
    }

    private var attendeeTally: String? {
        let statuses = displayedAttendees.map { attendee in
            model.attendeeStatusMap(for: draft)[attendee.email.lowercased()] ?? .needsAction
        }
        return AttendeeRsvp.formatTally(statuses: statuses)
    }

    private func attendeeChip(_ attendee: DraftAttendeeInput) -> some View {
        let label = attendee.displayName?.isEmpty == false ? attendee.displayName! : attendee.email
        return HStack(spacing: 4) {
            Text(label)
                .font(.custom("Rubik", size: 12))
                .foregroundStyle(theme.textColor)
            Button {
                removeAttendee(email: attendee.email)
            } label: {
                Text("×")
                    .foregroundStyle(theme.textMutedColor)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove guest")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(theme.surfaceColor)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func commitQuery() {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.contains("@") else { return }
        addAttendee(DraftAttendeeInput(email: trimmed, displayName: nil))
        query = ""
        model.attendeeSuggestions = []
    }

    private func addAttendee(_ attendee: DraftAttendeeInput) {
        var list = model.displayAttendees(for: draft)
        guard !list.contains(where: { $0.email.lowercased() == attendee.email.lowercased() }) else { return }
        list.append(attendee)
        model.updateDraftAttendees(list)
    }

    private func removeAttendee(email: String) {
        var list = model.displayAttendees(for: draft)
        list.removeAll { $0.email.lowercased() == email.lowercased() }
        model.updateDraftAttendees(list)
    }
}

/// Simple horizontal flow for chips.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, frame) in result.frames.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                proposal: ProposedViewSize(frame.size)
            )
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, frames: [CGRect]) {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var frames: [CGRect] = []
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            frames.append(CGRect(origin: CGPoint(x: x, y: y), size: size))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }
        return (CGSize(width: maxWidth, height: y + rowHeight), frames)
    }
}

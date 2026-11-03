import CompassData
import CompassKit
import SwiftUI

struct EventFormTimeField: View {
    @Environment(\.nativeWebTheme) private var theme
    @Binding var date: Date
    let accessibilityIdentifier: String
    @Binding var keyOwner: String?
    @State private var showsMenu: Bool
    @FocusState private var isFocused: Bool

    init(date: Binding<Date>, accessibilityIdentifier: String, keyOwner: Binding<String?> = .constant(nil)) {
        _date = date
        self.accessibilityIdentifier = accessibilityIdentifier
        _keyOwner = keyOwner
        let openPicker = UITestLaunchPolicy.openEventFormTimePickerForUITest
            && accessibilityIdentifier == "compass-event-form-start"
        _showsMenu = State(initialValue: openPicker)
    }

    /// The row for the selected time, or the quarter hour before it (3:10 opens on 3 PM).
    private var selectedQuarterHourLabel: String {
        let quarter = (date.timeIntervalSince1970 / 900).rounded(.down) * 900
        return EventFormTimeFormat.formatLabel(for: Date(timeIntervalSince1970: quarter))
    }

    var body: some View {
        Button {
            showsMenu = true
        } label: {
            HStack(spacing: 6) {
                Text(EventFormTimeFormat.formatLabel(for: date))
                    .font(.rubik(NativeWebLayoutTokens.fontSizeBody))
                    .foregroundStyle(theme.textColor)
                    .lineLimit(1)
            }
            .padding(.horizontal, 8)
            .frame(minWidth: 72, idealWidth: 76, maxWidth: 88)
            .frame(minHeight: 38)
            .background(theme.surfaceOverlayColor)
            .clipShape(RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault))
            .overlay {
                RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault)
                    .stroke(showsMenu || isFocused ? theme.accentColor : theme.borderColor, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .focusable()
        .focusEffectDisabled()
        .focused($isFocused)
        .onChange(of: isFocused) { _, focused in
            if focused { keyOwner = accessibilityIdentifier }
            else if keyOwner == accessibilityIdentifier { keyOwner = nil }
        }
        .onDisappear {
            if keyOwner == accessibilityIdentifier { keyOwner = nil }
        }
        .onKeyPress(.return) {
            showsMenu = true
            return .handled
        }
        .onKeyPress(.downArrow) {
            showsMenu = true
            return .handled
        }
        .onKeyPress(.upArrow) {
            showsMenu = true
            return .handled
        }
        .accessibilityIdentifier(accessibilityIdentifier)
        .popover(isPresented: $showsMenu, arrowEdge: .bottom) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(EventFormTimeFormat.quarterHourLabels(), id: \.self) { label in
                            Button {
                                if let merged = EventFormTimeFormat.mergeTime(into: date, label: label) {
                                    date = merged
                                }
                                showsMenu = false
                            } label: {
                                Text(label)
                                    .font(.rubik(NativeWebLayoutTokens.fontSizeBody))
                                    .foregroundStyle(
                                        label == EventFormTimeFormat.formatLabel(for: date)
                                            ? theme.onAccentColor : theme.textColor
                                    )
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(
                                        label == EventFormTimeFormat.formatLabel(for: date)
                                            ? theme.accentColor : Color.clear
                                    )
                            }
                            .buttonStyle(.plain)
                            .id(label)
                        }
                    }
                }
                // Web opens the list centered on the selected time, not at 12 AM.
                .onAppear { proxy.scrollTo(selectedQuarterHourLabel, anchor: .center) }
            }
            .frame(width: 120, height: 220)
            .background(theme.surfacePanelColor)
            // Fill the popover's own inset too, like the date popover; the
            // system material there read as a dark frame around the list.
            .presentationBackground(theme.surfacePanelColor)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("\(accessibilityIdentifier)-menu")
        }
    }
}

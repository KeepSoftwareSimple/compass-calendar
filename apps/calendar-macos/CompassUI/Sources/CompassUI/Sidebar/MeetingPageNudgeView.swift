import CompassData
import SwiftUI

/// Web `MeetingPageNudge`: sidebar card after the first event until a meeting
/// page is live or the host dismisses it. `/` opens Meeting settings.
struct MeetingPageNudgeView: View {
    @Environment(\.nativeWebTheme) private var theme
    var model: NativeCalendarRootModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Skip the back & forth")
                        .font(.rubik(14, weight: .medium))
                        .foregroundStyle(theme.textColor)
                        .accessibilityAddTraits(.isHeader)
                    Text("Share a link and guests pick a time that is free on your calendar.")
                        .font(.rubik(12))
                        .lineSpacing(3)
                        .foregroundStyle(theme.textColor)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                NoticeDismissButton {
                    model.onboardingStore.dismissMeetingPageNudge()
                }
            }
            Button {
                model.openBookingSettings()
            } label: {
                HStack(spacing: 8) {
                    Text("Set up meeting page")
                    ShortcutHintChip(label: "/")
                }
            }
            .buttonStyle(CompactPrimaryButtonStyle())
        }
        .padding(12)
        .background(theme.surfaceOverlayColor)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .noticeFocusRing(model.focusedNotice == .meetingPageNudge)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Meeting page")
        .accessibilityIdentifier("compass-native-meeting-page-nudge")
    }
}

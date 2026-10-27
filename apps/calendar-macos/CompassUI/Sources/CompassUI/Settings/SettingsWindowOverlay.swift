import CompassData
import CompassKit
import SwiftUI

public struct SettingsWindowOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var model: NativeCalendarRootModel
    @FocusState private var focusedPage: SettingsPage?

    public init(model: NativeCalendarRootModel) {
        self.model = model
    }

    public var body: some View {
        if model.settingsStore.isPresented {
            GeometryReader { geometry in
                ZStack(alignment: .top) {
                    theme.panelBackdropColor
                        .ignoresSafeArea()
                        .onTapGesture { model.closeSettingsIfAllowed() }
                    VStack(alignment: .leading, spacing: 24) {
                        HStack(alignment: .center) {
                            Text("Settings")
                                .font(.rubik(18, weight: .semibold))
                                .foregroundStyle(theme.textColor)
                            Spacer(minLength: 8)
                            Button("Close") { model.closeSettingsIfAllowed() }
                                .buttonStyle(.plain)
                                .font(.rubik(14))
                                .foregroundStyle(theme.textMutedColor)
                            ShortcutHintChip(label: "Esc")
                                .allowsHitTesting(false)
                        }
                        HStack(alignment: .top, spacing: 24) {
                            nav
                            content
                        }
                    }
                    .padding(OverlayPanelChrome.padding)
                    .frame(width: min(640, max(0, geometry.size.width - 32)))
                    .frame(maxHeight: geometry.size.height * 0.9)
                    .fixedSize(horizontal: false, vertical: true)
                    .overlayPanelChrome()
                    .frame(maxWidth: .infinity, alignment: .top)
                    .padding(.top, geometry.size.height * 0.05)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isModal)
            .accessibilityIdentifier("compass-native-settings")
            .onAppear {
                DispatchQueue.main.async { focusedPage = model.settingsStore.page }
            }
        }
        if model.settingsStore.timezoneDialogPurpose != nil {
            TimezonePickerDialogView(
                settingsStore: model.settingsStore,
                viewStore: model.viewStore)
        }
    }

    private var nav: some View {
        VStack(alignment: .leading, spacing: 8) {
            navButton("Accounts", page: .accounts)
            if model.settingsHasMeetings {
                navButton("Meetings", page: .booking, attention: model.bookingStore.bookingNeedsAttention)
            }
            if model.settingsHasBilling {
                navButton("Billing", page: .billing)
            }
            if !model.focusStore.pageJumpHintsVisible {
                HStack(spacing: 4) {
                    Text("Hold")
                        .font(.rubik(11))
                        .foregroundStyle(theme.textMutedColor)
                    ShortcutHintChip(label: KeycapGlyphs.display(["Mod"]))
                    Text("to see shortcuts.")
                        .font(.rubik(11))
                        .foregroundStyle(theme.textMutedColor)
                }
                .padding(.top, 4)
            }
        }
        .frame(width: 128, alignment: .leading)
    }

    private func navButton(_ title: String, page: SettingsPage, attention: Bool = false) -> some View {
        let isCurrent = model.settingsStore.page == page
        return Button(title) { model.settingsStore.page = page }
            .buttonStyle(.plain)
            .font(.rubik(14, weight: isCurrent ? .medium : .regular))
            .foregroundStyle(isCurrent ? theme.textColor : theme.textMutedColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                if isCurrent {
                    RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault)
                        .fill(theme.surfaceOverlayColor)
                }
            }
            .overlay(alignment: .leading) {
                if isCurrent {
                    Rectangle()
                        .fill(theme.accentColor)
                        .frame(width: 2)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault))
            .focusable()
            .focusEffectDisabled()
            .focused($focusedPage, equals: page)
            .overlay {
                if focusedPage == page {
                    RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault)
                        .inset(by: -2)
                        .stroke(theme.accentColor, lineWidth: 1)
                        .allowsHitTesting(false)
                }
            }
            .overlay(alignment: .trailing) {
                if attention {
                    Circle()
                        .fill(theme.warningColor)
                        .frame(width: 6, height: 6)
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if model.settingsStore.page == .billing {
                    billingContent
                } else if model.settingsStore.page == .booking {
                    SettingsBookingSectionView(model: model)
                } else {
                    accountsContent
                    // Web: `mt-2 border-t border-border pt-3` above the actions.
                    VStack(alignment: .leading, spacing: 12) {
                        Rectangle().fill(theme.borderColor).frame(height: 1)
                        SettingsDataActionsSectionView(model: model)
                    }
                    .padding(.top, 8)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private var accountsContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            SettingsTimezoneSectionView(
                settingsStore: model.settingsStore,
                viewStore: model.viewStore)
            SettingsDefaultCalendarSectionView(
                settingsStore: model.settingsStore,
                calendars: model.calendars,
                hasConnectedAccount: !model.syncConnectionsStore.connections.isEmpty)
            if model.isSignedIn {
                SettingsThemeSectionView(settingsStore: model.settingsStore)
                SettingsLaunchAtLoginSectionView(settingsStore: model.settingsStore)
                SettingsQuickAddHotkeySectionView(settingsStore: model.settingsStore)
                SettingsAccountsSectionView(syncStore: model.syncConnectionsStore)
            } else {
                SettingsUnsignedAccountsSectionView()
            }
        }
    }

    private var billingContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Billing")
                .font(.rubik(15))
                .foregroundStyle(theme.textColor)
            BillingPlanSectionView(billingStore: model.billingStore)
        }
        .accessibilityIdentifier("settings-section-billing")
    }
}

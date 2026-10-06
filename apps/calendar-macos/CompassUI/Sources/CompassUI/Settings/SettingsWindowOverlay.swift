import CompassData
import CompassKit
import SwiftUI

public struct SettingsWindowOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var model: NativeCalendarRootModel

    public init(model: NativeCalendarRootModel) {
        self.model = model
    }

    private var showBillingNav: Bool {
        BillingPlanBadgeResolver.badge(access: model.billingStore.appAccess) != nil
    }

    public var body: some View {
        if model.settingsStore.isPresented {
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                    .onTapGesture { model.settingsStore.close() }
                HStack(alignment: .top, spacing: 0) {
                    nav
                    Divider().overlay(theme.borderColor)
                    content
                }
                .frame(width: 640, height: 620)
                .background(theme.surfaceColor)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(theme.borderColor))
            }
            .accessibilityIdentifier("compass-native-settings")
        }
        if model.settingsStore.timezoneDialogPurpose != nil {
            TimezonePickerDialogView(
                settingsStore: model.settingsStore,
                viewStore: model.viewStore)
        }
    }

    private var nav: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Settings")
                .font(.custom("Rubik", size: 18))
                .foregroundStyle(theme.textColor)
            navButton("Accounts", page: .accounts)
            if showBillingNav {
                navButton("Billing", page: .billing)
            }
            Spacer()
            Button("Close") { model.settingsStore.close() }
                .buttonStyle(.plain)
                .foregroundStyle(theme.textMutedColor)
        }
        .padding(20)
        .frame(width: 180, alignment: .leading)
    }

    private func navButton(_ title: String, page: SettingsPage) -> some View {
        Button(title) { model.settingsStore.page = page }
            .buttonStyle(.plain)
            .font(.custom("Rubik", size: 14))
            .foregroundStyle(model.settingsStore.page == page ? theme.textColor : theme.textMutedColor)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if model.settingsStore.page == .billing {
                    billingContent
                } else {
                    accountsContent
                }
            }
            .padding(20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var accountsContent: some View {
        Group {
            SettingsTimezoneSectionView(
                settingsStore: model.settingsStore,
                viewStore: model.viewStore)
            SettingsDefaultCalendarSectionView(
                settingsStore: model.settingsStore,
                calendars: model.calendars,
                hasConnectedAccount: !model.syncConnectionsStore.connections.isEmpty)
            SettingsThemeSectionView(settingsStore: model.settingsStore)
            SettingsLaunchAtLoginSectionView(settingsStore: model.settingsStore)
            SettingsQuickAddHotkeySectionView(settingsStore: model.settingsStore)
            if model.isSignedIn {
                SettingsAccountsSectionView(syncStore: model.syncConnectionsStore)
            }
        }
    }

    private var billingContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Billing")
                .font(.custom("Rubik", size: 15))
                .foregroundStyle(theme.textColor)
            BillingPlanSectionView(billingStore: model.billingStore)
        }
        .accessibilityIdentifier("settings-section-billing")
    }
}

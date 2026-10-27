import CompassData
import CompassKit
import SwiftUI

public struct BillingUpgradeConfirmationSheet: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var billingStore: BillingStore

    public init(billingStore: BillingStore) {
        self.billingStore = billingStore
    }

    public var body: some View {
        if billingStore.isUpgradeConfirmationPresented {
            let dismiss = { billingStore.isUpgradeConfirmationPresented = false }
            BillingDialogPanel(
                title: "Start Premium now?",
                message: "Premium starts right away and the card on file is charged today. Everything in your calendar keeps working, and the trial badge goes away. Manage billing opens your invoices and card on file. It does not charge you or end the trial.",
                onDismiss: dismiss
            ) {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 12) {
                        OverlayPanelActionButton(
                            billingStore.isSubmitting ? "Starting Premium…" : "Start Premium",
                            variant: .primary,
                            shortcut: ["Enter"]
                        ) { Task { await billingStore.endTrialEarly() } }
                        .keyboardShortcut(.defaultAction)
                        OverlayPanelActionButton("Cancel", shortcut: ["Esc"], action: dismiss)
                            .keyboardShortcut(.cancelAction)
                    }
                    OverlayPanelActionButton("Manage billing", variant: .ghost, shortcut: ["M"]) {
                        dismiss()
                        billingStore.openSettings()
                    }
                    .keyboardShortcut("m", modifiers: [])
                }
                .disabled(billingStore.isSubmitting)
            }
        }
    }
}

public struct BillingCancelConfirmationSheet: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var billingStore: BillingStore
    public let periodEndLabel: String
    public let isTrialing: Bool

    @State private var selectedReason: SubscriptionCancelReason?
    @State private var otherDetails = ""
    @FocusState private var otherDetailsFocused: Bool

    public init(billingStore: BillingStore, periodEndLabel: String, isTrialing: Bool) {
        self.billingStore = billingStore
        self.periodEndLabel = periodEndLabel
        self.isTrialing = isTrialing
    }

    public var body: some View {
        if billingStore.isCancelConfirmationPresented {
            let message = isTrialing
                ? "You keep access until the trial ends on \(periodEndLabel). You can resume any time before then."
                : "Your plan stays active until \(periodEndLabel). You can resume any time before then."
            let dismiss = {
                guard !billingStore.isSubmitting else { return }
                billingStore.isCancelConfirmationPresented = false
            }
            let submit = {
                guard !billingStore.isSubmitting else { return }
                let submission = buildSubmission()
                Task { await billingStore.cancelSubscriptionAtPeriodEnd(submission: submission) }
            }
            BillingDialogPanel(
                title: "Cancel your plan?",
                message: message,
                onDismiss: dismiss,
                maxWidth: 480
            ) {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Why are you canceling? (optional)")
                        .font(.rubik(14))
                        .foregroundStyle(theme.textColor)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(SubscriptionCancelReason.allCases, id: \.self) { reason in
                            Button {
                                selectedReason = reason
                            } label: {
                                HStack(spacing: 12) {
                                    Image(
                                        systemName: selectedReason == reason
                                            ? "largecircle.fill.circle"
                                            : "circle"
                                    )
                                    .foregroundStyle(
                                        selectedReason == reason
                                            ? theme.accentColor : theme.textMutedColor
                                    )
                                    Text(reason.label)
                                        .font(.rubik(14))
                                        .foregroundStyle(theme.textColor)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(
                                    RoundedRectangle(
                                        cornerRadius: NativeWebLayoutTokens.radiusDefault
                                    )
                                    .stroke(
                                        selectedReason == reason
                                            ? theme.accentColor : theme.borderColor,
                                        lineWidth: 1
                                    )
                                )
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(selectedReason == reason ? .isSelected : [])
                        }
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("Why are you canceling? (optional)")

                    if selectedReason == .other {
                        ZStack(alignment: .topLeading) {
                            TextEditor(text: $otherDetails)
                                .font(.rubik(14))
                                .foregroundStyle(theme.textColor)
                                .scrollContentBackground(.hidden)
                                .focused($otherDetailsFocused)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 6)
                                .accessibilityLabel("Other reason")
                                .accessibilityIdentifier("compass-cancel-reason-other")
                                .onChange(of: otherDetails) { _, value in
                                    if value.count > 500 { otherDetails = String(value.prefix(500)) }
                                }
                            if otherDetails.isEmpty {
                                Text("Tell us more (optional).")
                                    .font(.rubik(14))
                                    .foregroundStyle(theme.textMutedColor)
                                    .padding(.horizontal, 13)
                                    .padding(.vertical, 6)
                                    .allowsHitTesting(false)
                            }
                        }
                        .frame(height: 88)
                        .overlay(
                            RoundedRectangle(cornerRadius: NativeWebLayoutTokens.radiusDefault)
                                .stroke(
                                    otherDetailsFocused ? theme.accentColor : theme.borderColor,
                                    lineWidth: 1
                                )
                        )
                    }

                    HStack(spacing: 12) {
                        OverlayPanelActionButton(
                            billingStore.isSubmitting ? "Canceling…" : "Cancel subscription",
                            variant: .destructive,
                            shortcut: ["Mod", "Enter"],
                            action: submit
                        )
                        .keyboardShortcut(.return, modifiers: .command)
                        OverlayPanelActionButton("Keep plan", shortcut: ["Esc"], action: dismiss)
                            .keyboardShortcut(.cancelAction)
                    }
                    .disabled(billingStore.isSubmitting)
                }
            }
            .onAppear {
                selectedReason = nil
                otherDetails = ""
            }
        }
    }

    private func buildSubmission() -> SubscriptionCancelReasonSubmission? {
        guard let selectedReason else { return nil }
        if selectedReason != .other {
            return SubscriptionCancelReasonSubmission(reason: selectedReason)
        }
        let trimmed = otherDetails.trimmingCharacters(in: .whitespacesAndNewlines)
        return SubscriptionCancelReasonSubmission(
            reason: .other,
            details: trimmed.isEmpty ? nil : trimmed
        )
    }
}

/// Web `OverlayPanel` modal with a title, message, and start-aligned actions.
private struct BillingDialogPanel<Actions: View>: View {
    let title: String
    let message: String
    let onDismiss: () -> Void
    var maxWidth: CGFloat = 400
    @ViewBuilder let actions: Actions

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            ModalDialogTitle(title)
            ModalDialogMessage(message)
            actions
        }
        .accessibilityAddTraits(.isModal)
        .modalDialogChrome(maxWidth: maxWidth, identifier: "compass-billing-dialog")
        .onExitCommand(perform: onDismiss)
    }
}

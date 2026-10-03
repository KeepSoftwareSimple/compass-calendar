import CompassData
import CompassKit
import SwiftUI

public struct BillingGateOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var billingStore: BillingStore

    public init(billingStore: BillingStore) {
        self.billingStore = billingStore
    }

    public var body: some View {
        if let status = billingStore.gateStatus {
            let copy = BillingGateCopy.content(for: status)
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                VStack(spacing: 16) {
                    Text(copy.title)
                        .font(.custom("Rubik", size: 20, relativeTo: .title2))
                        .foregroundStyle(theme.textColor)
                        .multilineTextAlignment(.center)
                    Text(copy.body)
                        .font(.custom("Rubik", size: 13))
                        .foregroundStyle(theme.textMutedColor)
                        .multilineTextAlignment(.center)
                    if let actionError = billingStore.actionError {
                        Text(actionError)
                            .font(.custom("Rubik", size: 12))
                            .foregroundStyle(theme.warningColor)
                    }
                    Button {
                        billingStore.openCheckoutFromGate()
                    } label: {
                        Group {
                            if billingStore.isOpeningHostedSession {
                                ProgressView().controlSize(.small)
                            } else {
                                Text(copy.primaryLabel)
                                    .font(.custom("Rubik", size: 14, relativeTo: .body))
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                    }
                    .buttonStyle(.plain)
                    .background(theme.textColor)
                    .foregroundStyle(theme.backgroundColor)
                    .clipShape(Capsule())
                    .disabled(billingStore.isOpeningHostedSession)
                }
                .padding(24)
                .frame(maxWidth: 420)
                .background(theme.surfaceColor)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.borderColor, lineWidth: 1)
                )
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("compass-native-billing-gate")
            }
            .onAppear {
                billingStore.trackGateShownIfNeeded()
            }
        }
    }
}

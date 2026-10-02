import SwiftUI

public struct RootView: View {
    @Environment(\.nativeWebTheme) private var theme
    @State private var monthTitle = "October 2026"
    @State private var titleBarLeadingInset: CGFloat = 72

    public init() {}

    public var body: some View {
        HStack(spacing: 0) {
            sidebar
            VStack(spacing: 0) {
                header
                content
            }
        }
        .background(theme.backgroundColor)
        .font(.custom("Rubik", size: 14))
        .background {
            GeometryReader { geometry in
                Color.clear
                    .onAppear {
                        applyTitleBarInset(geometry.safeAreaInsets.leading)
                    }
                    .onChange(of: geometry.safeAreaInsets.leading) { _, leading in
                        applyTitleBarInset(leading)
                    }
            }
        }
    }

    private func applyTitleBarInset(_ leading: CGFloat) {
        let resolved = max(leading, 72)
        if abs(resolved - titleBarLeadingInset) > 0.5 {
            titleBarLeadingInset = resolved
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Calendars")
                .font(.custom("Rubik", size: 13, relativeTo: .headline))
                .foregroundStyle(theme.textMutedColor)
            Spacer()
        }
        .padding(16)
        .frame(width: 260)
        .background(theme.surfacePanelColor)
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(theme.borderColor)
                .frame(width: 1)
        }
        .overlay {
            Color.clear
                .accessibilityElement()
                .accessibilityIdentifier("compass-native-sidebar")
                .allowsHitTesting(false)
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            HStack(spacing: 12) {
                headerButton(label: "Previous", systemImage: "chevron.left")
                headerButton(label: "Next", systemImage: "chevron.right")
                Text(monthTitle)
                    .font(.custom("Rubik", size: 15, relativeTo: .headline))
                    .foregroundStyle(theme.textColor)
                    .lineLimit(1)
                headerButton(label: "Today", systemImage: nil, title: "Today")
            }
            .padding(.leading, titleBarLeadingInset)

            Spacer()
        }
        .frame(height: 48)
        .frame(maxWidth: .infinity)
        .background(theme.surfaceColor)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(theme.borderColor)
                .frame(height: 1)
        }
        .overlay {
            Color.clear
                .accessibilityElement()
                .accessibilityIdentifier("compass-native-header")
                .allowsHitTesting(false)
        }
    }

    private var content: some View {
        Color.clear
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(theme.backgroundColor)
            .accessibilityIdentifier("compass-native-content")
    }

    @ViewBuilder
    private func headerButton(
        label: String,
        systemImage: String?,
        title: String? = nil
    ) -> some View {
        Button(action: {}) {
            Group {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 12, weight: .semibold))
                } else if let title {
                    Text(title)
                        .font(.custom("Rubik", size: 13, relativeTo: .body))
                }
            }
            .foregroundStyle(theme.textMutedColor)
            .frame(minWidth: 28, minHeight: 28)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

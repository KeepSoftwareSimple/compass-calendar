import CompassKit
import SwiftUI

struct BlockPartyEndScreenView: View {
    @Environment(\.nativeWebTheme) private var theme
    let game: BlockPartyState
    let isSignedIn: Bool
    let onGraduate: () -> Void
    let onReplayTimed: () -> Void
    let onSignUp: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(heading)
                .font(.custom("Rubik", size: 22, relativeTo: .title))
                .foregroundStyle(theme.textColor)
            Text(subcopy)
                .font(.custom("Rubik", size: 13))
                .foregroundStyle(theme.textMutedColor)

            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Score")
                        .font(.custom("Rubik", size: 10))
                        .foregroundStyle(theme.textMutedColor)
                        .textCase(.uppercase)
                    Text("\(game.score)")
                        .font(.custom("Rubik", size: 28, relativeTo: .title))
                        .foregroundStyle(theme.textColor)
                }
                Spacer()
                Text("\(game.tasksDone)/\(game.runTasks.count) tasks cleared")
                    .font(.custom("Rubik", size: 12))
                    .foregroundStyle(theme.textMutedColor)
            }
            .padding(12)
            .background(theme.surfacePanelColor)
            .clipShape(RoundedRectangle(cornerRadius: 10))

            if !isSignedIn {
                Button("Sign up free") { onSignUp() }
                    .buttonStyle(BlockPartyPrimaryButtonStyle(theme: theme))
            }
            if !game.timed {
                Button("Race the clock") { onReplayTimed() }
                    .buttonStyle(BlockPartySecondaryButtonStyle(theme: theme))
            }
            Button("Back to calendar") { onGraduate() }
                .buttonStyle(BlockPartySecondaryButtonStyle(theme: theme))
        }
        .padding(24)
        .frame(maxWidth: 420)
        .background(theme.surfaceColor)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(theme.borderColor, lineWidth: 1)
        }
        .accessibilityIdentifier("block-party-end-screen")
    }

    private var heading: String {
        if !game.timed { return "You cleared the week!" }
        if game.buzzer != nil { return "Cleared it. The clock just blinked first." }
        return "You beat the clock!"
    }

    private var subcopy: String {
        if game.tasksSkipped > 0 {
            return "The moves you made work the same on your real calendar. The rest will come."
        }
        return "Every one of those moves works the same on your real calendar."
    }
}

private struct BlockPartyPrimaryButtonStyle: ButtonStyle {
    let theme: NativeWebTheme
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.custom("Rubik", size: 14))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(theme.accentColor.opacity(configuration.isPressed ? 0.85 : 1))
            .foregroundStyle(theme.backgroundColor)
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private struct BlockPartySecondaryButtonStyle: ButtonStyle {
    let theme: NativeWebTheme
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.custom("Rubik", size: 14))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(theme.surfacePanelColor.opacity(configuration.isPressed ? 0.85 : 1))
            .foregroundStyle(theme.textColor)
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(theme.borderColor, lineWidth: 1)
            }
    }
}

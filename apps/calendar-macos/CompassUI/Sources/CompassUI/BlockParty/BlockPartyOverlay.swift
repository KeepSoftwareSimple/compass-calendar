import CompassData
import CompassKit
import SwiftUI

public struct BlockPartyOverlay: View {
    @Environment(\.nativeWebTheme) private var theme
    @Bindable public var model: NativeCalendarRootModel
    @State private var remainingSeconds = BlockPartyScoring.runDurationMs / 1000

    public init(model: NativeCalendarRootModel) {
        self.model = model
    }

    public var body: some View {
        if model.blockPartyStore.isActive {
            ZStack {
                theme.overlayBackdropColor
                    .ignoresSafeArea()
                content
            }
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isModal)
            .accessibilityIdentifier("block-party-overlay")
            .onAppear { syncTimer() }
            .onReceive(Timer.publish(every: 0.25, on: .main, in: .common).autoconnect()) { _ in
                model.blockPartyStore.tick()
                syncTimer()
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        let game = model.blockPartyStore.gameState
        if game.phase == .howto {
            howToCard
        } else if game.phase == .ended {
            BlockPartyEndScreenView(
                game: game,
                isSignedIn: model.isSignedIn,
                onGraduate: { model.blockPartyStore.graduateFromEndScreen() },
                onReplayTimed: { model.blockPartyStore.replayTimedRun() },
                onSignUp: {
                    model.blockPartyStore.finishAfterEndScreen()
                    model.authStore.openModal(.signUp)
                })
        } else {
            runningLayout(game: game)
        }

        if let overlay = game.simOverlay {
            BlockPartySimOverlayView(overlay: overlay)
        }
    }

    private var howToCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Block Party")
                .font(.custom("Rubik", size: 26, relativeTo: .title))
                .foregroundStyle(theme.textColor)
            Text(
                "Practice the keyboard moves on a sandbox calendar. "
                    + "Your first run is untimed. Press Enter when you are ready.")
                .font(.custom("Rubik", size: 14))
                .foregroundStyle(theme.textMutedColor)
            Button("Start practicing") {
                model.blockPartyStore.startPracticeRun()
            }
            .buttonStyle(.borderedProminent)
            .tint(theme.accentColor)
            Button("Leave") {
                model.blockPartyStore.requestSkip()
            }
            .buttonStyle(.plain)
            .foregroundStyle(theme.textMutedColor)
        }
        .padding(28)
        .frame(maxWidth: 440)
        .background(theme.surfaceColor)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(theme.borderColor, lineWidth: 1)
        }
    }

    private func runningLayout(game: BlockPartyState) -> some View {
        let task = BlockPartyEngine.currentTask(game)
        let ghost = task.flatMap { BlockPartyEngine.getTaskGhost(task: $0) }
        return VStack(alignment: .leading, spacing: 16) {
            BlockPartyHudView(
                game: game,
                task: task,
                remainingSeconds: remainingSeconds)
            BlockPartyPracticeGridView(
                practice: game.practice,
                ghost: ghost,
                jumpLetters: BlockPartyEngine.getJumpLetters(practice: game.practice),
                jumpChipsShown: game.jumpChipsShown)
            HStack {
                Button(model.blockPartyStore.skipPending ? "Leave now" : "Leave") {
                    model.blockPartyStore.requestSkip()
                }
                .buttonStyle(.plain)
                .foregroundStyle(theme.textMutedColor)
                Spacer()
            }
        }
        .padding(24)
        .frame(maxWidth: 720)
        .background(theme.surfaceColor)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(theme.borderColor, lineWidth: 1)
        }
    }

    private func syncTimer() {
        let game = model.blockPartyStore.gameState
        guard game.timed, game.phase == .running, game.endsAtMs > 0 else { return }
        let nowMs = Int(Date().timeIntervalSince1970 * 1000)
        remainingSeconds = max(0, (game.endsAtMs - nowMs) / 1000)
    }
}

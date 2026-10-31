import Foundation

/// Web `bottom-notice-queue`: one bottom-left notice at a time.
public enum ActiveBottomNotice: Int, Sendable {
    case updateReady = 0
    case firstEvent = 10
    case localModeConnect = 20
}

extension NativeCalendarRootModel {
    public var activeBottomNotice: ActiveBottomNotice? {
        var candidates: [ActiveBottomNotice] = []
        if desktopUpdateReadyVersion != nil {
            candidates.append(.updateReady)
        }
        if activeOnboardingSurface == .firstEventPrompt {
            candidates.append(.firstEvent)
        }
        if showsLocalModeConnectPrompt {
            candidates.append(.localModeConnect)
        }
        return candidates.min(by: { $0.rawValue < $1.rawValue })
    }
}

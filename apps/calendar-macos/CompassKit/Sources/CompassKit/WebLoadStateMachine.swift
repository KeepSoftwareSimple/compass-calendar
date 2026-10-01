import Foundation

public enum WebLoadPhase: Equatable, Sendable {
    case loadingApp
    case showingApp
    case showingOffline
}

/// Pure state for the main-frame load / offline page flow (XCTest without WebKit).
public struct WebLoadStateMachine: Equatable, Sendable {
    public private(set) var phase: WebLoadPhase
    public private(set) var networkSatisfied: Bool

    public init(
        phase: WebLoadPhase = .loadingApp,
        networkSatisfied: Bool = true
    ) {
        self.phase = phase
        self.networkSatisfied = networkSatisfied
    }

    public mutating func appLoadStarted() {
        phase = .loadingApp
    }

    public mutating func appLoadSucceeded() {
        phase = .showingApp
    }

    public mutating func appLoadFailed() {
        phase = .showingOffline
    }

    public mutating func retryRequested() {
        guard networkSatisfied else { return }
        phase = .loadingApp
    }

    public mutating func setNetworkSatisfied(_ satisfied: Bool) {
        networkSatisfied = satisfied
        if satisfied, phase == .showingOffline {
            phase = .loadingApp
        }
    }
}

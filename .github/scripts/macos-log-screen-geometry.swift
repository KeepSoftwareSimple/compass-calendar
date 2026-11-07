import AppKit

for (index, screen) in NSScreen.screens.enumerated() {
    let visible = screen.visibleFrame
    let frame = screen.frame
    print(
        "screen[\(index)] visible=\(Int(visible.width))x\(Int(visible.height)) "
            + "origin=(\(Int(visible.origin.x)),\(Int(visible.origin.y))) "
            + "frame=\(Int(frame.width))x\(Int(frame.height))")
}

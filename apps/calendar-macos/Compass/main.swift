import AppKit

// No main nib: build the app and its delegate by hand.
let app = CompassApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()

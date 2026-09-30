import Foundation

public enum BridgeScript {
    public static let bridgeVersion = "0.1.0"

    /// Injects `window.compassDesktop` only when `location.origin` matches the app origin.
    public static func userScriptSource(appOrigin: String) -> String {
        """
        (function () {
          if (window.compassDesktop) { return; }
          if (location.origin !== '\(appOrigin)') { return; }
          var deepLinkHandlers = [];
          var updateReadyHandlers = [];
          function post(body) {
            window.webkit.messageHandlers.compass.postMessage(body);
          }
          window.compassDesktop = {
            version: '\(bridgeVersion)',
            platform: 'macos',
            openExternal: function (url) { post({ method: 'openExternal', url: url }); },
            setAgenda: function (items) { post({ method: 'setAgenda', items: items }); },
            restartToUpdate: function () { post({ method: 'restartToUpdate' }); },
            onDeepLink: function (handler) { deepLinkHandlers.push(handler); },
            onUpdateReady: function (handler) { updateReadyHandlers.push(handler); },
            __deliverDeepLink: function (url) {
              deepLinkHandlers.forEach(function (handler) { handler(url); });
            },
            __deliverUpdateReady: function (version) {
              updateReadyHandlers.forEach(function (handler) { handler(version); });
            }
          };
        })();
        """
    }

    public static let readBridgeVersionJavaScript = """
        window.compassDesktop && window.compassDesktop.version;
        """

    public static func deliverDeepLinkJavaScript(url: String) -> String {
        let encoded = url.replacing("\\", with: "\\\\").replacing("'", with: "\\'")
        return "window.compassDesktop && window.compassDesktop.__deliverDeepLink('\(encoded)');"
    }

    public static func deliverUpdateReadyJavaScript(version: String) -> String {
        let encoded = version.replacing("\\", with: "\\\\").replacing("'", with: "\\'")
        return "window.compassDesktop && window.compassDesktop.__deliverUpdateReady('\(encoded)');"
    }
}

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
          var resumeHandlers = [];
          var permissionChangeHandlers = [];
          var pendingPermissionRequest = null;
          var pendingPermissionQuery = null;
          var pendingLaunchAtLoginQuery = null;
          var pendingLaunchAtLoginSet = null;
          function post(body) {
            window.webkit.messageHandlers.compass.postMessage(body);
          }
          function normalizePermission(value) {
            if (value === 'granted' || value === 'denied' || value === 'default') {
              return value;
            }
            return 'default';
          }
          window.compassDesktop = {
            version: '\(bridgeVersion)',
            platform: 'macos',
            notificationPermission: 'default',
            openExternal: function (url) { post({ method: 'openExternal', url: url }); },
            setAgenda: function (items) { post({ method: 'setAgenda', items: items }); },
            restartToUpdate: function () { post({ method: 'restartToUpdate' }); },
            requestNotificationPermission: function () {
              return new Promise(function (resolve) {
                pendingPermissionRequest = resolve;
                post({ method: 'requestNotificationPermission' });
              });
            },
            getNotificationPermission: function () {
              return new Promise(function (resolve) {
                pendingPermissionQuery = resolve;
                post({ method: 'getNotificationPermission' });
              });
            },
            showNotification: function (payload) {
              post({
                method: 'showNotification',
                title: payload.title,
                body: payload.body,
                tag: payload.tag,
                eventId: payload.eventId
              });
            },
            onNotificationPermissionChange: function (handler) {
              permissionChangeHandlers.push(handler);
              return function () {
                permissionChangeHandlers = permissionChangeHandlers.filter(function (entry) {
                  return entry !== handler;
                });
              };
            },
            onDeepLink: function (handler) { deepLinkHandlers.push(handler); },
            onUpdateReady: function (handler) { updateReadyHandlers.push(handler); },
            onResume: function (handler) {
              resumeHandlers.push(handler);
              return function () {
                resumeHandlers = resumeHandlers.filter(function (entry) {
                  return entry !== handler;
                });
              };
            },
            getLaunchAtLogin: function () {
              return new Promise(function (resolve) {
                pendingLaunchAtLoginQuery = resolve;
                post({ method: 'getLaunchAtLogin' });
              });
            },
            setLaunchAtLogin: function (enabled) {
              return new Promise(function (resolve) {
                pendingLaunchAtLoginSet = resolve;
                post({ method: 'setLaunchAtLogin', enabled: !!enabled });
              });
            },
            setAppearance: function (theme) {
              post({ method: 'setAppearance', theme: theme });
            },
            __deliverNotificationPermission: function (permission) {
              var normalized = normalizePermission(permission);
              window.compassDesktop.notificationPermission = normalized;
              permissionChangeHandlers.forEach(function (handler) { handler(); });
              if (pendingPermissionRequest) {
                pendingPermissionRequest(normalized);
                pendingPermissionRequest = null;
              }
              if (pendingPermissionQuery) {
                pendingPermissionQuery(normalized);
                pendingPermissionQuery = null;
              }
            },
            __deliverDeepLink: function (url) {
              deepLinkHandlers.forEach(function (handler) { handler(url); });
            },
            __deliverUpdateReady: function (version) {
              updateReadyHandlers.forEach(function (handler) { handler(version); });
            },
            __deliverResume: function () {
              resumeHandlers.forEach(function (handler) { handler(); });
            },
            __deliverLaunchAtLogin: function (enabled) {
              var value = !!enabled;
              if (pendingLaunchAtLoginQuery) {
                pendingLaunchAtLoginQuery(value);
                pendingLaunchAtLoginQuery = null;
              }
              if (pendingLaunchAtLoginSet) {
                pendingLaunchAtLoginSet(value);
                pendingLaunchAtLoginSet = null;
              }
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

    public static let deliverResumeJavaScript = """
        window.compassDesktop && window.compassDesktop.__deliverResume();
        """

    public static func deliverLaunchAtLoginJavaScript(enabled: Bool) -> String {
        "window.compassDesktop && window.compassDesktop.__deliverLaunchAtLogin(\(enabled));"
    }
}

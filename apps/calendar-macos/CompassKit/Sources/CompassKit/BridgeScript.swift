import Foundation

public enum BridgeScript {
    public static let bridgeVersion = "0.1.0"

    /// Injects `window.compassDesktop` only when `location.origin` matches the app origin.
    public static func userScriptSource(appOrigin: String) -> String {
        """
        (function () {
          if (window.compassDesktop) { return; }
          if (location.origin !== '\(appOrigin)') { return; }
          function handlerRegistry() {
            var handlers = [];
            return {
              add: function (handler) {
                handlers.push(handler);
                return function () {
                  handlers = handlers.filter(function (entry) {
                    return entry !== handler;
                  });
                };
              },
              emit: function (argument) {
                handlers.slice().forEach(function (handler) { handler(argument); });
              }
            };
          }
          var deepLink = handlerRegistry();
          var updateReady = handlerRegistry();
          var permissionChange = handlerRegistry();
          var pendingPermissionRequest = null;
          var pendingPermissionQuery = null;
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
              return permissionChange.add(handler);
            },
            onDeepLink: function (handler) { return deepLink.add(handler); },
            onUpdateReady: function (handler) { return updateReady.add(handler); },
            __deliverNotificationPermission: function (permission) {
              var normalized = normalizePermission(permission);
              window.compassDesktop.notificationPermission = normalized;
              permissionChange.emit();
              if (pendingPermissionRequest) {
                pendingPermissionRequest(normalized);
                pendingPermissionRequest = null;
              }
              if (pendingPermissionQuery) {
                pendingPermissionQuery(normalized);
                pendingPermissionQuery = null;
              }
            },
            __deliverDeepLink: function (url) { deepLink.emit(url); },
            __deliverUpdateReady: function (version) { updateReady.emit(version); }
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

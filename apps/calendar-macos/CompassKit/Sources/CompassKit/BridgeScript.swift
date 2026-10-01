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
          var desktopMenuShortcutBindings = {
            'create-timed': { hotkey: 'C', eventType: 'keyup' },
            'nav-today': { hotkey: 'T', eventType: 'keyup' },
            'nav-day-view': { hotkey: 'D', eventType: 'keyup' },
            'nav-week-view': { hotkey: 'W', eventType: 'keyup' },
            'other-palette': { hotkey: 'Mod+K', eventType: 'keydown' },
            'other-settings': { hotkey: 'Mod+,', eventType: 'keydown' },
            'other-shortcuts': { hotkey: 'Shift+/', eventType: 'keyup' }
          };
          function modifierFlags(part) {
            if (part === 'Mod') { return { metaKey: true }; }
            if (part === 'Shift') { return { shiftKey: true }; }
            if (part === 'Alt') { return { altKey: true }; }
            if (part === 'Ctrl') { return { ctrlKey: true }; }
            return {};
          }
          function keyInitForHotkey(hotkey) {
            var parts = hotkey.split('+');
            var keyToken = parts[parts.length - 1] || hotkey;
            var init = { bubbles: true, cancelable: true };
            for (var i = 0; i < parts.length - 1; i += 1) {
              Object.assign(init, modifierFlags(parts[i]));
            }
            if (keyToken === 'ArrowUp') {
              init.key = 'ArrowUp';
              init.code = 'ArrowUp';
            } else if (keyToken === 'ArrowDown') {
              init.key = 'ArrowDown';
              init.code = 'ArrowDown';
            } else if (keyToken === 'ArrowLeft') {
              init.key = 'ArrowLeft';
              init.code = 'ArrowLeft';
            } else if (keyToken === 'ArrowRight') {
              init.key = 'ArrowRight';
              init.code = 'ArrowRight';
            } else if (keyToken === ',') {
              init.key = ',';
              init.code = 'Comma';
            } else if (keyToken === '/') {
              init.key = '/';
              init.code = 'Slash';
            } else if (keyToken.length === 1) {
              init.key = keyToken;
              init.code = 'Key' + keyToken.toUpperCase();
            } else {
              init.key = keyToken;
              init.code = keyToken;
            }
            return init;
          }
          function replayDesktopMenuShortcut(name) {
            var binding = desktopMenuShortcutBindings[name];
            if (!binding) { return false; }
            var target = document.body || document.documentElement;
            if (!target) { return false; }
            target.dispatchEvent(
              new KeyboardEvent(binding.eventType, keyInitForHotkey(binding.hotkey)));
            window.__compassDesktopDispatchProbe = name;
            return true;
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
            dispatchShortcut: function (name) {
              window.__compassDesktopDispatchProbe = undefined;
              window.dispatchEvent(new CustomEvent('compass:dispatch-shortcut', {
                detail: { name: name },
                bubbles: true
              }));
              if (window.__compassDesktopDispatchProbe !== name) {
                replayDesktopMenuShortcut(name);
              }
              return window.__compassDesktopDispatchProbe === name;
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

    public static func dispatchShortcutJavaScript(name: String) -> String {
        let encoded = name.replacing("\\", with: "\\\\").replacing("'", with: "\\'")
        return "window.compassDesktop && window.compassDesktop.dispatchShortcut('\(encoded)');"
    }
}

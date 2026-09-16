import { HotkeyManager } from "@tanstack/react-hotkeys";
import { restartMockServer, server } from "../__mocks__/server/mock.server";
import {
  installDefaultWebTestSeams,
  resetWebTestSeams,
} from "../helpers/web-test-seams";
import {
  mirrorBrowserPolyfillGlobals,
  syncWindowNetworkGlobals,
} from "./browser-polyfills";
import { ensureIndexedDbTestEnv } from "./indexeddb-env";
import { dom, mirrorJsdomGlobals } from "./jsdom-env";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  mock,
  setSystemTime,
} from "bun:test";
import { createRequire } from "node:module";

const requireMatchers = createRequire(import.meta.path);
const jestDomMatchers = requireMatchers(
  "@testing-library/jest-dom/dist/matchers.js",
) as Record<string, unknown>;
expect.extend(jestDomMatchers);
(globalThis as typeof globalThis & { expect: typeof expect }).expect = expect;

const { cleanup, configure } = await import("@testing-library/react");
const { resetAllStores } = await import("../utils/state/reset-stores");
const { BaseApi } = await import("@web/api/base/base.api");
const { billingPreviewActions } = await import(
  "@web/billing/billing-preview.store"
);
const { resetBillingWriteLockForTests } = await import(
  "@web/billing/billing-write-lock"
);
const { resetShortcutUpgradePromptForTests } = await import(
  "@web/billing/prompt-shortcut-upgrade"
);
const { clearAppLockReasons } = await import("@web/shortcuts/app-lock");
const { clearFloatingLayerReasons } = await import(
  "@web/shortcuts/floating-layer"
);

configure({ asyncUtilTimeout: 5000 });

function resetDocument() {
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  document.body.removeAttribute("class");
  document.body.removeAttribute("data-app-locked");
  clearAppLockReasons();
  clearFloatingLayerReasons();
  resetBillingWriteLockForTests();
  resetShortcutUpgradePromptForTests();
  document.documentElement.removeAttribute("style");
}

function resetBrowserState() {
  dom.reconfigure({ url: "http://localhost/" });
  localStorage.clear();
  sessionStorage.clear();
}

function remirrorIsolateGlobals(): void {
  // bun's fake clock is process-global across files in a worker. A leaked
  // pin makes later findBy/waitFor hang forever because Date.now never
  // advances past their timeout. Reset before any async work, so a previous
  // file that timed out cannot freeze indexedDB or MSW in this file.
  setSystemTime();
  mirrorJsdomGlobals();
  mirrorBrowserPolyfillGlobals();
}

beforeEach(() => {
  remirrorIsolateGlobals();
  installDefaultWebTestSeams();
});

beforeAll(async () => {
  remirrorIsolateGlobals();
  await ensureIndexedDbTestEnv();
  restartMockServer();
  syncWindowNetworkGlobals();
});
afterEach(async () => {
  setSystemTime();
  await Promise.resolve();
  cleanup();
  resetDocument();
  resetBrowserState();
  resetAllStores();
  resetWebTestSeams();
  billingPreviewActions.exit();
  HotkeyManager.resetInstance();
  BaseApi.defaults.adapter = undefined;
  server.resetHandlers();
});
afterAll(() => {
  resetDocument();
  resetBrowserState();
  resetAllStores();
  resetWebTestSeams();
  mock.restore();
});

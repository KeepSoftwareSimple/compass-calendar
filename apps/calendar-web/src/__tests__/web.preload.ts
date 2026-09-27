// sort-imports-ignore — side-effect import order matters

import "@core/__tests__/core.test.init";
import "@core/__tests__/core.test.start";
import "./web.test.init";

import "./setup/asset-stubs.plugin";
import "./setup/jsdom-env";
import "./setup/browser-polyfills";
import "./setup/indexeddb-env";

await import("./setup/test-lifecycle");

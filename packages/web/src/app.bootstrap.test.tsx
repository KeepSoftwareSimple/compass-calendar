import * as realReactDomClient from "react-dom/client";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realSessionProvider from "@web/auth/compass/session/SessionProvider";
import * as realConnectStatus from "@web/auth/providers/connect-status.util";
import * as realAppInit from "@web/common/utils/app-init.util";
import * as realApp from "@web/components/App/App";
import * as realRouters from "@web/routers";
import * as realEventForm from "@web/views/Forms/EventForm/EventForm.lazy";
import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

const render = mock();
const createRoot = mock(() => ({ render, unmount: mock() }));
mockModuleForFile("react-dom/client", realReactDomClient, { createRoot });

let resolveInit: (result: { dbInitError: unknown }) => void = () => undefined;
const initializeDatabaseWithErrorHandling = mock(
  () =>
    new Promise<{ dbInitError: unknown }>((resolve) => {
      resolveInit = resolve;
    }),
);
const showDbInitErrorToast = mock();
mockModuleForFile("@web/common/utils/app-init.util", realAppInit, {
  initializeDatabaseWithErrorHandling,
  showDbInitErrorToast,
});

const sessionInit = mock();
mockModuleForFile(
  "@web/auth/compass/session/SessionProvider",
  realSessionProvider,
  { sessionInit },
);

mockModuleForFile("@web/components/App/App", realApp, {
  App: () => null,
});

mockModuleForFile(
  "@web/auth/providers/connect-status.util",
  realConnectStatus,
  {
    readConnectStatus: () => null,
    applyConnectRedirect: mock(),
  },
);

const preloadEventFormOnFirstInput = mock();
mockModuleForFile("@web/views/Forms/EventForm/EventForm.lazy", realEventForm, {
  preloadEventFormOnFirstInput,
});

// Other files stub `router` too (navigate only); this one needs `subscribe`.
let onResolved: (() => void) | null = null;
const unsubscribe = mock();
const subscribe = mock((_event: string, listener: () => void) => {
  onResolved = listener;
  return unsubscribe;
});
mockModuleForFile("@web/routers", realRouters, { router: { subscribe } });

const { bootstrapApp } =
  require("./app.bootstrap") as typeof import("./app.bootstrap");
const { DatabaseInitError } =
  require("@web/common/utils/app-init.util") as typeof import("@web/common/utils/app-init.util");

describe("bootstrapApp", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    render.mockClear();
    createRoot.mockClear();
    sessionInit.mockClear();
    showDbInitErrorToast.mockClear();
    initializeDatabaseWithErrorHandling.mockClear();
    preloadEventFormOnFirstInput.mockClear();
    subscribe.mockClear();
    unsubscribe.mockClear();
    onResolved = null;
  });

  it("renders before the database init promise resolves", async () => {
    const done = bootstrapApp();

    expect(initializeDatabaseWithErrorHandling).toHaveBeenCalledTimes(1);
    expect(sessionInit).toHaveBeenCalledTimes(1);
    expect(createRoot).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();

    resolveInit({ dbInitError: null });
    await done;
  });

  it("shows the existing db-init failure toast after render", async () => {
    const done = bootstrapApp();
    expect(render).toHaveBeenCalled();

    const errorSpy = spyOn(console, "error").mockImplementation(
      () => undefined,
    );
    const dbInitError = new DatabaseInitError("IndexedDB blocked");
    resolveInit({ dbInitError });
    await done;

    expect(showDbInitErrorToast).toHaveBeenCalledWith(dbInitError);
    errorSpy.mockRestore();
  });

  it("arms the form preload only after the first navigation resolves", async () => {
    const done = bootstrapApp();

    expect(subscribe).toHaveBeenCalledWith("onResolved", expect.any(Function));
    expect(preloadEventFormOnFirstInput).not.toHaveBeenCalled();

    onResolved?.();
    onResolved?.();

    expect(preloadEventFormOnFirstInput).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    resolveInit({ dbInitError: null });
    await done;
  });
});

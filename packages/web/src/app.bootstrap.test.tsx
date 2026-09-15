import * as realReactDomClient from "react-dom/client";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realSessionProvider from "@web/auth/compass/session/SessionProvider";
import * as realConnectStatus from "@web/auth/providers/connect-status.util";
import * as realAppInit from "@web/common/utils/app-init.util";
import * as realApp from "@web/components/App/App";
import * as realEventForm from "@web/views/Forms/EventForm/EventForm.lazy";
import { beforeEach, describe, expect, it, mock } from "bun:test";

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

mockModuleForFile(
  "@web/views/Forms/EventForm/EventForm.lazy",
  realEventForm,
  { preloadEventFormOnFirstInput: mock() },
);

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

    const dbInitError = new DatabaseInitError("IndexedDB blocked");
    resolveInit({ dbInitError });
    await done;

    expect(showDbInitErrorToast).toHaveBeenCalledWith(dbInitError);
  });
});

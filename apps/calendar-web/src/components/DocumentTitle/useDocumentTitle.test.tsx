import { renderHook } from "@testing-library/react";
import dayjs from "@core/util/date/dayjs";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realUseupnextevent from "@web/components/Sidebar/UpNextCard/useUpNextEvent";
import { initialViewState, useViewStore } from "@web/events/stores/view.store";
import {
  DEFAULT_DOCUMENT_TITLE,
  DOCUMENT_TITLE_BRAND,
} from "./formatDocumentTitle";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

const now = dayjs("2026-08-06T15:00:00.000Z");

const upNextState = {
  now,
  upNext: undefined as
    | {
        _id: string;
        title: string;
        startDate: string;
        endDate: string;
      }
    | undefined,
  isCurrentEvent: false,
  openEventDetails: () => {},
  conferenceUrl: undefined as string | undefined,
};

// Bun's mock.module is process-wide; flag off in afterAll so later files get
// the real hook back (same pattern as CommandPalette.test.tsx).
const actualUpNext = {
  ...(await import("@web/components/Sidebar/UpNextCard/useUpNextEvent")),
};
let isUpNextMocked = true;
mockModuleForFile(
  "@web/components/Sidebar/UpNextCard/useUpNextEvent",
  realUseupnextevent,
  {
    useUpNextEvent: () =>
      isUpNextMocked
        ? upNextState
        : // biome-ignore lint/correctness/useHookAtTopLevel: mock.module factory, not a component
          actualUpNext.useUpNextEvent(),
  },
);

const actualTanstackRouter = { ...(await import("@tanstack/react-router")) };
const locationState = { pathname: "/week/2026-08-02" };
const dayParamsState: { dateString?: string } = {};
let isRouterMocked = true;

mock.module("@tanstack/react-router", () => ({
  ...actualTanstackRouter,
  useLocation: (...args: unknown[]) =>
    isRouterMocked
      ? locationState
      : (actualTanstackRouter.useLocation as (...a: unknown[]) => unknown)(
          ...args,
        ),
  useParams: (...args: unknown[]) =>
    isRouterMocked
      ? dayParamsState
      : (actualTanstackRouter.useParams as (...a: unknown[]) => unknown)(
          ...args,
        ),
}));

const { useDocumentTitle } = await import("./useDocumentTitle");

afterAll(() => {
  isUpNextMocked = false;
  isRouterMocked = false;
});

describe("useDocumentTitle", () => {
  beforeEach(() => {
    document.title = DEFAULT_DOCUMENT_TITLE;
    upNextState.now = now;
    upNextState.upNext = undefined;
    upNextState.isCurrentEvent = false;
    locationState.pathname = "/week/2026-08-02";
    dayParamsState.dateString = undefined;
    useViewStore.setState(
      {
        ...initialViewState,
        dates: {
          start: "2026-08-02T00:00:00.000Z",
          end: "2026-08-08T23:59:59.999Z",
        },
      },
      true,
    );
  });

  afterEach(() => {
    document.title = DEFAULT_DOCUMENT_TITLE;
  });

  it("sets an idle week title on mount", () => {
    renderHook(() => useDocumentTitle());

    expect(document.title).toBe(`Aug 2 - 8 - ${DOCUMENT_TITLE_BRAND}`);
  });

  it("prefers an upcoming event countdown", () => {
    upNextState.upNext = {
      _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      title: "Standup",
      startDate: now.add(12, "minute").format(),
      endDate: now.add(42, "minute").format(),
    };

    renderHook(() => useDocumentTitle());

    expect(document.title).toBe(`In 12m: Standup - ${DOCUMENT_TITLE_BRAND}`);
  });

  it("restores the default title on unmount", () => {
    const { unmount } = renderHook(() => useDocumentTitle());

    expect(document.title).not.toBe(DEFAULT_DOCUMENT_TITLE);

    unmount();

    expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE);
  });

  it("uses the day route date for the idle title", () => {
    locationState.pathname = "/day/2026-08-06";
    dayParamsState.dateString = "2026-08-06";

    renderHook(() => useDocumentTitle());

    expect(document.title).toBe(
      `${dayjs("2026-08-06", dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT).format("ddd MMM D")} - ${DOCUMENT_TITLE_BRAND}`,
    );
  });
});

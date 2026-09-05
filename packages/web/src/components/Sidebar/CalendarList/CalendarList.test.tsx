import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Status } from "@core/errors/status.codes";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import {
  CalendarIdSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import { type GoogleSyncConnectionSummary } from "@core/types/user.types";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { toNormalizedEventQueryData } from "@web/__tests__/utils/event-query-test-data";
import { createMockConnection as makeConnection } from "@web/__tests__/utils/factories/calendar.factory";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { type ApiRequestConfig } from "@web/api/api.types";
import { BaseApi } from "@web/api/base/base.api";
import { createApiError } from "@web/api/util/api.util";
import { session } from "@web/auth/compass/session/Session";
import { setGoogleAvailabilityForTests } from "@web/auth/google/hooks/useIsGoogleAvailable/useIsGoogleAvailable";
import { emptyCalendarsCopy } from "@web/auth/providers/provider-copy.util";
import { setProviderAvailabilityForTests } from "@web/auth/providers/useIsProviderAvailable";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { isCalendarHidden } from "@web/calendars/calendar-visibility.storage";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

// mock.module is process-wide and not reliably restorable, so the real hook
// is captured up front and a flag (flipped off in afterAll) decides which
// implementation runs on each call - the same technique used in
// SidebarActions.test.tsx for useVersionCheck. This lets a file that runs
// after this one get the real useSession back
// instead of permanently inheriting this file's mock.
const actualUseSession = (await import("@web/auth/compass/session/useSession"))
  .useSession;
let isSessionMocked = true;
const mockUseSession = mock();
mock.module("@web/auth/compass/session/useSession", () => ({
  useSession: (...args: Parameters<typeof actualUseSession>) =>
    isSessionMocked ? mockUseSession(...args) : actualUseSession(...args),
}));

const actualUseConnectProvider = (
  await import("@web/auth/providers/useConnectProvider")
).useConnectProvider;
let isConnectGoogleMocked = true;
// Mirrors the real hook's one behavior these tests depend on: scoping to a
// connection reports that account's own state. (The real scoping is covered
// directly in useConnectGoogle.scope.test.tsx.) Restored in beforeEach, since
// a test that swaps in mockReturnValue would otherwise poison later ones.
const defaultUseConnectGoogle = (
  _kind?: unknown,
  options?: Parameters<typeof actualUseConnectProvider>[1],
) => ({
  commandAction: null,
  connect: mock(),
  isAvailable: true,
  isConnecting: false,
  state: options?.connection?.connectionState ?? ("NOT_CONNECTED" as const),
});
const mockUseConnectGoogle = mock(defaultUseConnectGoogle);
mock.module("@web/auth/providers/useConnectProvider", () => ({
  useConnectProvider: (...args: Parameters<typeof actualUseConnectProvider>) =>
    isConnectGoogleMocked
      ? mockUseConnectGoogle(...args)
      : actualUseConnectProvider(...args),
}));

// The no-accounts-yet header (covered in CalendarListHeader.test.tsx) reads
// the signed-in email, and takes the anonymous branch - which needs a router
// for its sign-up modal. Tests can set mockUserEmail to undefined to test the
// anonymous path. Deliberately not the account emails below, so "did the generic
// header render?" stays a distinct question from "did an account section render?".
const HEADER_EMAIL = "login@pequod.com";
let mockUserEmail: string | undefined = HEADER_EMAIL;
const actualUseUser = (await import("@web/auth/compass/user/hooks/useUser"))
  .useUser;
let isUserMocked = true;
mock.module("@web/auth/compass/user/hooks/useUser", () => ({
  useUser: (...args: Parameters<typeof actualUseUser>) =>
    isUserMocked ? { email: mockUserEmail } : actualUseUser(...args),
}));

afterAll(() => {
  isSessionMocked = false;
  isConnectGoogleMocked = false;
  isUserMocked = false;
});

// CalendarList.tsx is already cached by the time this file runs -
// Sidebar.test.tsx imports Sidebar from "./Sidebar", and merely loading that
// file runs Sidebar.tsx's own top-level `import { CalendarList }`, binding
// its useSession import to whatever was active at that earlier point.
// A plain require here would return that stale instance. A cache-busted URL
// forces a fresh evaluation that re-resolves useSession against the mock
// above (same technique as useVersionCheck.test.ts).
const calendarListModuleUrl = new URL(
  `./CalendarList.tsx?test=${Math.random().toString(36).slice(2)}`,
  import.meta.url,
);
const { CalendarList } = (await import(
  calendarListModuleUrl.href
)) as typeof import("./CalendarList");

const makeCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: CalendarIdSchema.parse(createObjectIdString()),
  name: "Work",
  description: "",
  timeZone: TimeZoneSchema.parse("America/Denver"),
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "owner",
  capabilities: getCalendarCapabilities("owner"),
  isPrimary: false,
  isVisible: true,
  isActive: true,
  ...overrides,
});

const renderCalendarList = (
  calendars: Calendar[],
  {
    authenticated = true,
    connections,
  }: {
    authenticated?: boolean;
    connections?: GoogleSyncConnectionSummary[];
  } = {},
) => {
  mockUseSession.mockReturnValue({
    authenticated,
    setAuthenticated: () => {},
  });

  if (connections) {
    userMetadataActions.set({
      connections,
      google: { connectionState: "HEALTHY", connections },
    });
  }

  const { queryClient, wrapper } = createStoreWrapper();
  queryClient.setQueryData(calendarQueryKeys.all, calendars);

  const utils = render(<CalendarList />, {
    wrapper,
  });

  return { queryClient, ...utils };
};

describe("CalendarList", () => {
  beforeEach(() => {
    mockUseConnectGoogle.mockImplementation(defaultUseConnectGoogle);
    mockUseSession.mockReturnValue({
      authenticated: true,
      setAuthenticated: () => {},
    });
    mockUserEmail = HEADER_EMAIL;
  });

  afterEach(() => {
    BaseApi.defaults.adapter = undefined;
    // Storage clearing + the hidden-ids store resync are both handled by the
    // global test-lifecycle afterEach (resetBrowserState + resetAllStores).
    mockUseSession.mockReturnValue({
      authenticated: false,
      setAuthenticated: () => {},
    });
  });

  it("renders active calendars with pressed buttons and hides inactive calendars", () => {
    const active = makeCalendar({ name: "Work" });
    const primary = makeCalendar({ name: "Personal", isPrimary: true });
    const readOnly = makeCalendar({
      name: "Team",
      access: "reader",
      capabilities: getCalendarCapabilities("reader"),
    });
    const inactive = makeCalendar({ name: "Archived", isActive: false });

    renderCalendarList([active, primary, readOnly, inactive]);

    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide Work calendar" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Archived")).not.toBeInTheDocument();
  });

  it("relabels the primary provider calendar as 'primary' since the header already shows its name", () => {
    const primary = makeCalendar({ name: "ahab@pequod.com", isPrimary: true });

    renderCalendarList([primary]);

    expect(
      screen.getByRole("button", { name: "Hide primary calendar" }),
    ).toBeInTheDocument();
    expect(screen.getByText("primary")).toBeInTheDocument();
    expect(screen.queryByText("ahab@pequod.com")).not.toBeInTheDocument();
  });

  it("shows a single row labeled 'This browser' for anonymous users, without repeating a heading", () => {
    // Anonymous users get the local calendar rendered as AnonymousCalendarRow,
    // which combines the account label ("This browser") and sign-up affordance
    // into a single row, without a separate heading. No visibility toggle.
    const local = makeCalendar({
      name: "Compass",
      provider: "local",
      isPrimary: true,
    });

    mockUserEmail = undefined;
    renderCalendarList([local], { authenticated: false });

    expect(screen.getByText("This browser")).toBeInTheDocument();
    expect(screen.queryByText("primary")).not.toBeInTheDocument();
    expect(screen.queryByText("Compass")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "This browser" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign up to save this calendar" }),
    ).toBeInTheDocument();
  });

  it("shows the Compass calendar's real name when signed in but not connected", () => {
    // Signed-in users who haven't connected Google yet see an email heading
    // with a single local Compass row. The row shows the calendar's real name
    // ("Compass"), not "primary", since there's no account heading to disambiguate.
    const local = makeCalendar({
      name: "Compass",
      provider: "local",
      isPrimary: true,
    });

    renderCalendarList([local], { authenticated: true });

    expect(screen.getByText("Compass")).toBeInTheDocument();
    expect(screen.queryByText("primary")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide Compass calendar" }),
    ).toBeInTheDocument();
  });

  it("flips aria-pressed and persists hidden ids in localStorage", async () => {
    const calendarA = makeCalendar({ name: "Calendar A" });
    const calendarB = makeCalendar({ name: "Calendar B" });

    const user = userEvent.setup({ delay: null });
    renderCalendarList([calendarA, calendarB]);

    const buttonA = screen.getByRole("button", {
      name: "Hide Calendar A calendar",
    });
    const buttonB = screen.getByRole("button", {
      name: "Hide Calendar B calendar",
    });

    await user.click(buttonA);
    await waitFor(() => {
      expect(buttonA.getAttribute("aria-pressed")).toBe("false");
    });
    expect(isCalendarHidden(calendarA.id)).toBe(true);

    await user.click(buttonB);
    await waitFor(() => {
      expect(buttonB.getAttribute("aria-pressed")).toBe("false");
    });
    expect(isCalendarHidden(calendarB.id)).toBe(true);

    await user.click(buttonA);
    await waitFor(() => {
      expect(buttonA.getAttribute("aria-pressed")).toBe("true");
    });
    expect(isCalendarHidden(calendarA.id)).toBe(false);
    expect(isCalendarHidden(calendarB.id)).toBe(true);
  });

  it("keeps cached events on hide/show and only flips calendar isVisible", async () => {
    const hidden = makeCalendar({ name: "Hidden target" });
    const hiddenEvent = createMockEvent({ calendarId: hidden.id });
    const weekKey = eventQueryKeys.week({
      source: "remote",
      start: "2026-07-13T00:00:00.000Z",
      end: "2026-07-20T00:00:00.000Z",
    });
    const weekData = toNormalizedEventQueryData([hiddenEvent]);

    const user = userEvent.setup({ delay: null });
    const { queryClient } = renderCalendarList([hidden]);
    queryClient.setQueryData<NormalizedEventQueryData>(weekKey, weekData);

    const hideButton = screen.getByRole("button", {
      name: "Hide Hidden target calendar",
    });
    await user.click(hideButton);

    // Visibility now lives in the client-owned hidden-ids store (derived by
    // the calendars query's `select`), not hand-patched onto the raw cache -
    // event queries are untouched either way.
    expect(queryClient.getQueryData<NormalizedEventQueryData>(weekKey)).toEqual(
      weekData,
    );
    expect(isCalendarHidden(hidden.id)).toBe(true);

    await user.click(
      screen.getByRole("button", { name: "Show Hidden target calendar" }),
    );
    expect(queryClient.getQueryData<NormalizedEventQueryData>(weekKey)).toEqual(
      weekData,
    );
    expect(isCalendarHidden(hidden.id)).toBe(false);
  });

  it("announces failure and leaves the button pressed when storage write fails", async () => {
    const calendar = makeCalendar({ name: "Work" });
    const setSpy = spyOn(persistentBrowserStore, "set").mockReturnValue(false);

    const user = userEvent.setup({ delay: null });
    renderCalendarList([calendar]);

    const toggle = screen.getByRole("button", { name: "Hide Work calendar" });
    await user.click(toggle);

    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent ?? "").toMatch(
      /couldn.t update calendar visibility/i,
    );
    setSpy.mockRestore();
  });

  it("is reachable by Tab and toggles on Enter and Space", async () => {
    const calendar = makeCalendar({ name: "Work" });

    const user = userEvent.setup({ delay: null });
    renderCalendarList([calendar]);

    const toggle = screen.getByRole("button", { name: "Hide Work calendar" });

    await user.tab();
    expect(document.activeElement).toBe(toggle);

    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
    });

    await user.keyboard(" ");
    await waitFor(() => {
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("groups calendars under a labelled section per account when two are connected", () => {
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const personal = makeCalendar({
      name: "Personal",
      accountEmail: "ahab@gmail.com",
    });

    renderCalendarList([work, personal], {
      connections: [
        makeConnection("ahab@pequod.com"),
        makeConnection("ahab@gmail.com"),
      ],
    });

    expect(
      screen.getByRole("region", { name: "Calendars for ahab@pequod.com" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Calendars for ahab@gmail.com" }),
    ).toBeInTheDocument();
    // Each account's calendars live under its own section, not one flat list.
    expect(
      within(
        screen.getByRole("region", { name: "Calendars for ahab@pequod.com" }),
      ).getByText("Work"),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("region", { name: "Calendars for ahab@gmail.com" }),
      ).getByText("Personal"),
    ).toBeInTheDocument();
  });

  it("gives each account section its own page-jump target", () => {
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const personal = makeCalendar({
      name: "Personal",
      accountEmail: "ahab@gmail.com",
    });

    renderCalendarList([work, personal], {
      connections: [
        makeConnection("ahab@pequod.com"),
        makeConnection("ahab@gmail.com"),
      ],
    });

    expect(
      screen.getByRole("region", { name: "Calendars for ahab@pequod.com" }),
    ).toHaveAttribute("data-page-jump", "calendar-account:ahab@pequod.com");
    expect(
      screen.getByRole("region", { name: "Calendars for ahab@gmail.com" }),
    ).toHaveAttribute("data-page-jump", "calendar-account:ahab@gmail.com");
    expect(
      screen.getByRole("region", { name: "Calendars" }),
    ).not.toHaveAttribute("data-page-jump");
  });

  it("hides the generic header as soon as any account section exists", () => {
    // Found live on staging: the Compass login's own Google account (A7
    // adopts it as a connection at sign-up) is always one of the sections
    // below, so a generic header on top just repeats one section's status
    // under a heading with no account name attached - confusing, not merely
    // redundant. True with one account, not just several.
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });

    renderCalendarList([work], {
      connections: [makeConnection("ahab@pequod.com")],
    });

    expect(screen.queryByText(HEADER_EMAIL)).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Calendars for ahab@pequod.com" }),
    ).toBeInTheDocument();
  });

  it("shows the generic header while the user has no connected account", () => {
    renderCalendarList([makeCalendar({ name: "Compass", provider: "local" })]);

    expect(screen.getByText(HEADER_EMAIL)).toBeInTheDocument();
    expect(screen.getByText("Compass")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Calendars" })).toHaveAttribute(
      "data-page-jump",
      "calendars",
    );
  });

  it("orders sections by connection order, not calendar order", () => {
    const gmail = makeCalendar({
      name: "Personal",
      accountEmail: "ahab@gmail.com",
    });
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });

    renderCalendarList([gmail, work], {
      // pequod connected first, so its section comes first even though the
      // gmail calendar sorts ahead of it by name.
      connections: [
        makeConnection("ahab@pequod.com"),
        makeConnection("ahab@gmail.com"),
      ],
    });

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(["ahab@pequod.com", "ahab@gmail.com"]);
  });

  it("keeps each account's own section quiet - status text lives in the pinned SidebarStatusBar instead", () => {
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const personal = makeCalendar({
      name: "Personal",
      accountEmail: "ahab@gmail.com",
    });

    renderCalendarList([work, personal], {
      connections: [
        makeConnection("ahab@pequod.com"),
        // One broken account must not be hidden behind the healthy one.
        makeConnection("ahab@gmail.com", {
          state: "actionRequired",
          stateReason: "authorizationRevoked",
          connectionState: "RECONNECT_REQUIRED",
        }),
      ],
    });

    const healthy = within(
      screen.getByRole("region", { name: "Calendars for ahab@pequod.com" }),
    );
    const broken = within(
      screen.getByRole("region", { name: "Calendars for ahab@gmail.com" }),
    );
    // Neither account's own section renders status text - it moved to the
    // sidebar's pinned bottom bar (see SidebarStatusBar.test.tsx) so a
    // status appearing/disappearing per account can never shift the
    // calendar rows below it.
    expect(healthy.queryByRole("status")).not.toBeInTheDocument();
    expect(broken.queryByRole("status")).not.toBeInTheDocument();
  });

  it("gives a lone account the same labelled section as several", () => {
    // One account and five render the same shape. The single-account header
    // that used to stand in here drifted from the section header it mirrored
    // (it alone showed "Saving changes…"), so there is now just the one.
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });

    renderCalendarList([work], {
      connections: [makeConnection("ahab@pequod.com")],
    });

    const section = screen.getByRole("region", {
      name: "Calendars for ahab@pequod.com",
    });
    expect(within(section).getByText("Work")).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "ahab@pequod.com" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("leaves the local calendar outside the account sections when no account is connected", () => {
    const local = makeCalendar({ name: "Compass", provider: "local" });

    renderCalendarList([local], { connections: [] });

    expect(screen.getByText("Compass")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /^Calendars for/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the local calendar under the Compass email section once Google is connected", () => {
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const personal = makeCalendar({
      name: "Personal",
      accountEmail: "ahab@gmail.com",
    });
    const local = makeCalendar({ name: "Compass", provider: "local" });

    renderCalendarList([work, personal, local], {
      connections: [
        makeConnection("ahab@pequod.com"),
        makeConnection("ahab@gmail.com"),
      ],
    });

    const compassSection = screen.getByRole("region", {
      name: `Calendars for ${HEADER_EMAIL}`,
    });
    expect(within(compassSection).getByText("Compass")).toBeInTheDocument();
    expect(
      within(compassSection).getByRole("button", {
        name: "Hide Compass calendar",
      }),
    ).toBeInTheDocument();
    for (const email of ["ahab@pequod.com", "ahab@gmail.com"]) {
      expect(
        within(
          screen.getByRole("region", { name: `Calendars for ${email}` }),
        ).queryByText("Compass"),
      ).not.toBeInTheDocument();
    }
  });

  it("keeps the local calendar toggleable after Google is connected", async () => {
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const local = makeCalendar({ name: "Compass", provider: "local" });

    const user = userEvent.setup({ delay: null });
    renderCalendarList([work, local], {
      connections: [makeConnection("ahab@pequod.com")],
    });

    const toggle = screen.getByRole("button", {
      name: "Hide Compass calendar",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: "Show Compass calendar" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("renders a connected account's header even before any calendars have imported", () => {
    renderCalendarList([], {
      connections: [makeConnection("ahab@pequod.com")],
    });

    expect(
      screen.getByRole("region", { name: "Calendars for ahab@pequod.com" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ahab@pequod.com" }),
    ).toBeInTheDocument();
  });

  it("keeps the local calendar visible after a connected account disconnects", () => {
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const local = makeCalendar({ name: "Compass", provider: "local" });
    const onlyConnection = makeConnection("ahab@pequod.com");

    renderCalendarList([work, local], { connections: [onlyConnection] });

    expect(screen.getByText("Compass")).toBeInTheDocument();

    act(() => {
      userMetadataActions.removeConnection(onlyConnection.id);
    });

    expect(screen.getByText("Compass")).toBeInTheDocument();
  });

  it("collapses and re-expands an account's calendar rows on heading click", async () => {
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const personal = makeCalendar({
      name: "Personal",
      accountEmail: "ahab@gmail.com",
    });

    const user = userEvent.setup({ delay: null });
    renderCalendarList([work, personal], {
      connections: [
        makeConnection("ahab@pequod.com"),
        makeConnection("ahab@gmail.com"),
      ],
    });

    expect(screen.getByText("Work")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "ahab@pequod.com" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Work")).not.toBeInTheDocument();
    // The other section is unaffected.
    expect(screen.getByText("Personal")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("nests Compass under the Google account that matches the Compass login email", () => {
    mockUserEmail = "ahab@pequod.com";
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const personal = makeCalendar({
      name: "Personal",
      accountEmail: "ahab@gmail.com",
    });
    const local = makeCalendar({ name: "Compass", provider: "local" });

    renderCalendarList([work, personal, local], {
      connections: [
        makeConnection("ahab@pequod.com"),
        makeConnection("ahab@gmail.com"),
      ],
    });

    const matchingSection = screen.getByRole("region", {
      name: "Calendars for ahab@pequod.com",
    });
    expect(within(matchingSection).getByText("Work")).toBeInTheDocument();
    expect(within(matchingSection).getByText("Compass")).toBeInTheDocument();
    expect(
      screen.queryAllByRole("region", {
        name: "Calendars for ahab@pequod.com",
      }),
    ).toHaveLength(1);
    expect(
      within(
        screen.getByRole("region", { name: "Calendars for ahab@gmail.com" }),
      ).queryByText("Compass"),
    ).not.toBeInTheDocument();
  });

  it("hides Compass with the matching Google account when that section collapses", async () => {
    mockUserEmail = "ahab@pequod.com";
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const local = makeCalendar({ name: "Compass", provider: "local" });

    const user = userEvent.setup({ delay: null });
    renderCalendarList([work, local], {
      connections: [makeConnection("ahab@pequod.com")],
    });

    expect(screen.getByText("Compass")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "ahab@pequod.com" }));
    expect(screen.queryByText("Compass")).not.toBeInTheDocument();
    expect(screen.queryByText("Work")).not.toBeInTheDocument();
  });

  it("keeps the local Compass section visible when Google accounts are collapsed", async () => {
    const work = makeCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const personal = makeCalendar({
      name: "Personal",
      accountEmail: "ahab@gmail.com",
    });
    const local = makeCalendar({ name: "Compass", provider: "local" });

    const user = userEvent.setup({ delay: null });
    renderCalendarList([work, personal, local], {
      connections: [
        makeConnection("ahab@pequod.com"),
        makeConnection("ahab@gmail.com"),
      ],
    });

    await user.click(screen.getByRole("button", { name: "ahab@pequod.com" }));
    await user.click(screen.getByRole("button", { name: "ahab@gmail.com" }));

    expect(screen.getByText("Compass")).toBeInTheDocument();
  });

  it("renders no placeholder text while calendars are pending, to avoid a layout shift once they load", () => {
    BaseApi.defaults.adapter = () => new Promise(() => {});
    const { wrapper } = createStoreWrapper();

    render(<CalendarList />, { wrapper });

    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no calendars", () => {
    renderCalendarList([], { authenticated: false });

    expect(screen.getByText(/no calendars yet/i)).toBeInTheDocument();
  });

  it("shows an error state and recovers via retry", async () => {
    const calendar = makeCalendar({ name: "Work" });
    let shouldFail = true;
    BaseApi.defaults.adapter = async <T,>(
      config: ApiRequestConfig & { body?: unknown },
    ) => {
      if (shouldFail) throw new Error("Simulated load failure");
      return {
        config,
        data: { calendars: [calendar] } as T,
        headers: new Headers(),
        status: 200,
        statusText: "OK",
      };
    };
    const { wrapper } = createStoreWrapper();
    render(<CalendarList />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/couldn.t load calendars/i)).toBeInTheDocument();
    });

    shouldFail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Work")).toBeInTheDocument();
    });
  });

  it("does not show the calendars load error for a session-level failure", async () => {
    // Session recovery already owns the signed-out toast; Retry would keep
    // failing while remote source stays selected. Stay quiet rather than
    // inventing an empty-list story ("Connect Google…" / "No calendars yet.").
    window.history.pushState({}, "", "/week");
    const signOutSpy = spyOn(session, "signOut").mockResolvedValue(undefined);
    BaseApi.defaults.adapter = async (
      config: ApiRequestConfig & { body?: unknown },
    ) => {
      throw createApiError(config, {
        config,
        data: {},
        headers: new Headers(),
        status: Status.UNAUTHORIZED,
        statusText: "Unauthorized",
      });
    };
    mockUseSession.mockReturnValue({
      authenticated: true,
      setAuthenticated: () => {},
    });
    const { wrapper } = createStoreWrapper();
    render(<CalendarList />, { wrapper });

    await waitFor(() => {
      expect(screen.getByLabelText("Calendars")).toBeInTheDocument();
      expect(
        screen.queryByText(/couldn.t load calendars/i),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/connect google to see your calendars/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/no calendars yet/i)).not.toBeInTheDocument();

    signOutSpy.mockRestore();
  });

  it("shows today's Google empty-list copy when only Google can connect", () => {
    setGoogleAvailabilityForTests("available");
    renderCalendarList([], { authenticated: true, connections: [] });

    expect(
      screen.getByText("Connect Google to see your calendars."),
    ).toBeInTheDocument();
  });

  it("shows Microsoft empty-list copy for a Microsoft-only deploy", () => {
    setProviderAvailabilityForTests("microsoft", "available");
    renderCalendarList([], { authenticated: true, connections: [] });

    expect(
      screen.getByText(emptyCalendarsCopy(["microsoft"])),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Connect Google to see your calendars."),
    ).not.toBeInTheDocument();
  });
});

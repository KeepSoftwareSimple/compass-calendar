import { HotkeysProvider, resolveModifier } from "@tanstack/react-hotkeys";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { DEFAULT_WEEKLY_AVAILABILITY } from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import {
  type CalendarId,
  CalendarIdSchema,
} from "@core/types/domain-primitives";
import { type GoogleSyncConnectionSummary } from "@core/types/user.types";
import dayjs from "@core/util/date/dayjs";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { AuthApi } from "@web/api/auth.api";
import {
  markAccountReconnectRequired,
  resetGoogleReconnectRequiredForTests,
} from "@web/auth/providers/reconnect.state";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { UpgradeConfirmationProvider } from "@web/billing/UpgradeConfirmation/UpgradeConfirmationProvider";
import { type AppAccess } from "@web/billing/useAppAccess";
import { BOOKING_MORE_OPTIONS_LABEL } from "@web/booking/BookingMoreOptions";
import { BOOKING_SAVE_CHANGES_LABEL } from "@web/booking/BookingSaveBar";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  ACCOUNT_DISCONNECTED_TOAST_ID,
  GOOGLE_REVOKED_TOAST_ID,
} from "@web/common/constants/toast.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import {
  registerToastPort,
  resetToastPort,
} from "@web/common/utils/toast/toast.port";
import {
  selectIsCmdPaletteOpen,
  selectSettingsPage,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { getPartsPlainText } from "@web/shortcuts/tips/shortcut-tips.data";
import * as realUsessedegraded from "@web/sse/hooks/useSseDegraded";
import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

// mock.module is process-wide and not reliably restorable, so - as elsewhere
// in this suite of files - the real hook is captured up front and a flag
// (flipped in afterAll) decides which one runs.
const actualUseLogoutConfirmationModule = {
  ...(await import(
    "@web/components/LogoutConfirmation/hooks/useLogoutConfirmation"
  )),
};
let isLogoutConfirmationMocked = true;
const mockOpenLogoutConfirmation = mock();
mock.module(
  "@web/components/LogoutConfirmation/hooks/useLogoutConfirmation",
  () => ({
    // Spread so the module's other exports (LogoutConfirmationContext,
    // useLogoutConfirmationState) stay real for the provider's own tests.
    ...actualUseLogoutConfirmationModule,
    useLogoutConfirmation: (
      ...args: Parameters<
        typeof actualUseLogoutConfirmationModule.useLogoutConfirmation
      >
    ) =>
      isLogoutConfirmationMocked
        ? {
            isOpen: false,
            closeLogoutConfirmation: mock(),
            openLogoutConfirmation: mockOpenLogoutConfirmation,
          }
        : // biome-ignore lint/correctness/useHookAtTopLevel: this is a mock.module factory, not a component - the flag only flips once, in afterAll, after this file's components have unmounted.
          actualUseLogoutConfirmationModule.useLogoutConfirmation(...args),
  }),
);

// Other test files (e.g. useLogoutCmdItems.test.ts) also mock.module this
// same path without ever restoring it, so - regardless of load order - this
// module can already be permanently swapped to a foreign mock by the time
// this file runs. Mock it here too rather than relying on a real
// SessionContext.Provider, which that foreign mock would bypass entirely.
const actualUseSession = (await import("@web/auth/compass/session/useSession"))
  .useSession;
let isSessionMocked = true;
let authenticated = false;
mock.module("@web/auth/compass/session/useSession", () => ({
  useSession: (...args: Parameters<typeof actualUseSession>) =>
    isSessionMocked
      ? { authenticated, setAuthenticated: mock() }
      : actualUseSession(...args),
}));

let isSseDegraded = false;
let isSseDegradedMocked = true;
const actualUseSseDegraded = (await import("@web/sse/hooks/useSseDegraded"))
  .useSseDegraded;
mockModuleForFile("@web/sse/hooks/useSseDegraded", realUsessedegraded, {
  useSseDegraded: () =>
    isSseDegradedMocked ? isSseDegraded : actualUseSseDegraded(),
});

let access: AppAccess = { kind: "open" };
let isAppAccessMocked = true;
const actualUseAppAccess = (await import("@web/billing/useAppAccess"))
  .useAppAccess;
mock.module("@web/billing/useAppAccess", () => ({
  useAppAccess: (...args: Parameters<typeof actualUseAppAccess>) =>
    isAppAccessMocked ? access : actualUseAppAccess(...args),
}));

afterAll(() => {
  isLogoutConfirmationMocked = false;
  isSessionMocked = false;
  isSseDegradedMocked = false;
  isAppAccessMocked = false;
});

afterEach(() => {
  mockOpenLogoutConfirmation.mockClear();
  resetGoogleReconnectRequiredForTests();
  isSseDegraded = false;
  access = { kind: "open" };
});

const settingsModalUrl = new URL(
  `./SettingsModal.tsx?test=${Math.random().toString(36).slice(2)}`,
  import.meta.url,
);
const { SettingsModal, SETTINGS_HOLD_MOD_HINT_PARTS } = (await import(
  settingsModalUrl.href
)) as typeof import("./SettingsModal");

const connection = (
  overrides: Partial<GoogleSyncConnectionSummary> = {},
): GoogleSyncConnectionSummary => ({
  id: "connection-1",
  state: "healthy",
  stateReason: null,
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail: "ahab@pequod.com",
  connectionState: "HEALTHY",
  canSuggestContacts: false,
  ...overrides,
});

const renderSettings = ({
  authenticated: isAuthenticated = false,
  connections = [connection()],
  calendars = [],
  open = true,
  page = "accounts",
  fromPalette = false,
}: {
  authenticated?: boolean;
  connections?: GoogleSyncConnectionSummary[];
  calendars?: Calendar[];
  open?: boolean;
  page?: "accounts" | "billing" | "booking";
  fromPalette?: boolean;
} = {}) => {
  authenticated = isAuthenticated;
  userMetadataActions.set({
    google: { connectionState: "HEALTHY", connections },
  });
  const { queryClient, wrapper } = createStoreWrapper();
  queryClient.setQueryData(calendarQueryKeys.all, calendars);
  if (open) settingsActions.openSettings(page, { fromPalette });

  return {
    queryClient,
    ...render(
      <HotkeysProvider>
        <UpgradeConfirmationProvider>
          <SettingsModal />
        </UpgradeConfirmationProvider>
      </HotkeysProvider>,
      { wrapper },
    ),
  };
};

const bookingPageUrl = `${ENV_WEB.API_BASEURL}/booking/page`;

const unconfiguredBookingPage = (calendarId: CalendarId) => ({
  enabled: false,
  durationMinutes: 30,
  destinationCalendarId: calendarId,
  blockingCalendarIds: [calendarId],
  timeZone: "UTC",
  weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
  minNoticeHours: 4,
  maxHorizonDays: 60,
  isConfigured: false,
  suggestedSlug: "hostuser",
});

const putSavedBookingPage = (
  calendarId: CalendarId,
  body: Record<string, unknown>,
) => {
  const slug = typeof body.slug === "string" ? body.slug : "hostuser";
  return {
    id: createObjectIdString(),
    slug,
    hostUserId: createObjectIdString(),
    enabled: body.enabled === true,
    durationMinutes: body.durationMinutes ?? 30,
    destinationCalendarId: body.destinationCalendarId ?? calendarId,
    blockingCalendarIds: body.blockingCalendarIds ?? [calendarId],
    timeZone: body.timeZone ?? "UTC",
    weeklyAvailability: body.weeklyAvailability ?? DEFAULT_WEEKLY_AVAILABILITY,
    minNoticeHours: body.minNoticeHours ?? 4,
    maxHorizonDays: body.maxHorizonDays ?? 60,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    bookingUrl: `https://compasscalendar.com/meet/${slug}`,
  };
};

describe("SettingsModal", () => {
  it("renders nothing while closed", () => {
    renderSettings({ open: false });

    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("shows a default timezone control", () => {
    renderSettings();

    expect(screen.getByText("Default timezone")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Default timezone/ }),
    ).toBeInTheDocument();
  });

  it("anchors the Settings dialog to the top of the viewport", () => {
    renderSettings();

    const backdrop = screen.getByRole("dialog", {
      name: "Settings",
    }).parentElement;
    expect(backdrop).toHaveClass("items-start");
    expect(backdrop).not.toHaveClass("items-center");
  });

  it("lists every connected account with its own status", () => {
    renderSettings({
      connections: [
        connection(),
        connection({
          id: "connection-2",
          accountEmail: "ahab@gmail.com",
          state: "actionRequired",
          stateReason: "authorizationRevoked",
          connectionState: "RECONNECT_REQUIRED",
          canSuggestContacts: false,
        }),
      ],
    });

    expect(screen.getByText("ahab@pequod.com")).toBeInTheDocument();
    expect(screen.getByText("ahab@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("Calendar connected")).toBeInTheDocument();
    expect(screen.getByText("Calendar needs reconnecting")).toBeInTheDocument();
  });

  it("reflects a live reconnect-required marking without waiting for metadata to refetch", () => {
    renderSettings({ connections: [connection()] });

    expect(screen.getByText("Calendar connected")).toBeInTheDocument();

    // A live 410 marks the session-local override ahead of the next metadata
    // refetch; the connection's own connectionState is still "HEALTHY" here.
    // AccountsSection's own useConnectGoogle() call subscribes to the
    // reconnect-required version and re-renders the tree beneath it, so
    // AccountRow picks up the override on its next render even without
    // subscribing itself - this guards that behavior against a refactor that
    // removes AccountsSection's own subscription.
    act(() => {
      markAccountReconnectRequired({ connectionId: "connection-1" });
    });

    expect(screen.getByText("Calendar needs reconnecting")).toBeInTheDocument();
  });

  it("replaces 'Calendar connected' with a live-updates warning when SSE is degraded", () => {
    isSseDegraded = true;
    renderSettings({ connections: [connection()] });

    expect(screen.queryByText("Calendar connected")).not.toBeInTheDocument();
    expect(screen.getByText("Reconnecting live updates…")).toBeInTheDocument();
  });

  it("does not let the live-updates warning preempt a real reconnect problem", () => {
    isSseDegraded = true;
    renderSettings({
      connections: [
        connection({
          state: "actionRequired",
          stateReason: "authorizationRevoked",
          connectionState: "RECONNECT_REQUIRED",
          canSuggestContacts: false,
        }),
      ],
    });

    expect(screen.getByText("Calendar needs reconnecting")).toBeInTheDocument();
    expect(
      screen.queryByText("Reconnecting live updates…"),
    ).not.toBeInTheDocument();
  });

  it("asks for confirmation before disconnecting", async () => {
    const disconnect = spyOn(
      AuthApi,
      "disconnectGoogleConnection",
    ).mockResolvedValue(undefined);

    const user = userEvent.setup({ delay: null });
    renderSettings();

    await user.click(
      screen.getByRole("button", { name: "Disconnect ahab@pequod.com" }),
    );

    // Disconnecting is not undoable without redoing the whole OAuth flow, so
    // the first press must not call the API.
    expect(disconnect).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", {
        name: "Confirm disconnecting ahab@pequod.com",
      }),
    ).toBeInTheDocument();

    disconnect.mockRestore();
  });

  it("disconnects that connection once confirmed", async () => {
    const disconnect = spyOn(
      AuthApi,
      "disconnectGoogleConnection",
    ).mockResolvedValue(undefined);

    const user = userEvent.setup({ delay: null });
    renderSettings({ connections: [connection({ id: "connection-second" })] });

    await user.click(
      screen.getByRole("button", { name: "Disconnect ahab@pequod.com" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Confirm disconnecting ahab@pequod.com",
      }),
    );

    await waitFor(() => {
      expect(disconnect).toHaveBeenCalledWith("connection-second");
    });

    disconnect.mockRestore();
  });

  it("shows success toast and dismisses stale reconnect warning on disconnect", async () => {
    const { port: toastPort, mocks: toastMocks } = createTestToastPort();
    registerToastPort(toastPort);

    const disconnect = spyOn(
      AuthApi,
      "disconnectGoogleConnection",
    ).mockResolvedValue(undefined);

    const user = userEvent.setup({ delay: null });
    renderSettings({ connections: [connection({ id: "connection-third" })] });

    await user.click(
      screen.getByRole("button", { name: "Disconnect ahab@pequod.com" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Confirm disconnecting ahab@pequod.com",
      }),
    );

    await waitFor(() => {
      expect(toastMocks.dismiss).toHaveBeenCalledWith(GOOGLE_REVOKED_TOAST_ID);
      expect(toastMocks.toast).toHaveBeenCalledWith(
        "Disconnected ahab@pequod.com",
        expect.objectContaining({ toastId: ACCOUNT_DISCONNECTED_TOAST_ID }),
      );
    });

    disconnect.mockRestore();
    resetToastPort();
  });

  it("backs out of the confirm without disconnecting", async () => {
    const disconnect = spyOn(
      AuthApi,
      "disconnectGoogleConnection",
    ).mockResolvedValue(undefined);

    const user = userEvent.setup({ delay: null });
    renderSettings();

    await user.click(
      screen.getByRole("button", { name: "Disconnect ahab@pequod.com" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(disconnect).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Disconnect ahab@pequod.com" }),
    ).toBeInTheDocument();

    disconnect.mockRestore();
  });

  it("returns to the un-confirmed state when the disconnect fails", async () => {
    const disconnect = spyOn(
      AuthApi,
      "disconnectGoogleConnection",
    ).mockRejectedValue(new Error("nope"));

    const user = userEvent.setup({ delay: null });
    renderSettings();

    await user.click(
      screen.getByRole("button", { name: "Disconnect ahab@pequod.com" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Confirm disconnecting ahab@pequod.com",
      }),
    );

    // A stuck "Disconnecting…" would read as a disconnect that half-happened.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Disconnect ahab@pequod.com" }),
      ).toBeInTheDocument();
    });

    disconnect.mockRestore();
  });

  it("shows an empty state with no accounts connected", () => {
    renderSettings({ connections: [] });

    expect(screen.getByText("No accounts connected yet.")).toBeInTheDocument();
  });

  it("steps back out of an open confirm on Escape before closing the modal", async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings();

    await user.click(
      screen.getByRole("button", { name: "Disconnect ahab@pequod.com" }),
    );
    expect(
      screen.getByRole("button", {
        name: "Confirm disconnecting ahab@pequod.com",
      }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("button", { name: "Disconnect ahab@pequod.com" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("returns to the command palette on Escape when opened from it", async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings({ fromPalette: true });

    await user.keyboard("{Escape}");

    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(selectIsCmdPaletteOpen(useSettingsStore.getState())).toBe(true);
  });

  it("does not open the command palette on Escape when opened directly", async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings();

    await user.keyboard("{Escape}");

    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(selectIsCmdPaletteOpen(useSettingsStore.getState())).toBe(false);
  });

  it("closes on Escape even when focus is on document.body", async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings();

    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("{Escape}");

    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("shows a Close control with an Esc chip", async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings();

    const close = screen.getByRole("button", { name: /Close/ });
    expect(within(close).getByText("Esc")).toBeTruthy();

    await user.click(close);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("shows the derived default calendar in the picker when nothing is stored", () => {
    const primary = createMockCalendar({ name: "Personal", isPrimary: true });
    const side = createMockCalendar({ name: "Side project" });

    renderSettings({ calendars: [primary, side] });

    expect(
      screen.getByRole("combobox", { name: "Default Calendar" }),
    ).toHaveValue(primary.id);
  });

  it("persists a new default calendar pick to storage", async () => {
    const primary = createMockCalendar({ name: "Personal", isPrimary: true });
    const side = createMockCalendar({ name: "Side project" });

    const user = userEvent.setup({ delay: null });
    renderSettings({ calendars: [primary, side] });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Default Calendar" }),
      side.id,
    );

    expect(
      screen.getByRole("combobox", { name: "Default Calendar" }),
    ).toHaveValue(side.id);
    expect(persistentBrowserStore.get(STORAGE_KEYS.DEFAULT_CALENDAR_ID)).toBe(
      side.id,
    );
  });

  it("groups the picker by account even with a single account connected", () => {
    // Matches the sidebar, which gives a lone account the same labelled
    // section as several (no "only group past two accounts" threshold).
    const work = createMockCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });

    renderSettings({ calendars: [work] });

    const combobox = screen.getByRole("combobox", { name: "Default Calendar" });
    expect(
      within(combobox).getByRole("group", { name: "ahab@pequod.com (Google)" }),
    ).toBeInTheDocument();
  });

  it("labels a Microsoft account optgroup with Microsoft provider copy", () => {
    const work = createMockCalendar({
      name: "Work",
      provider: "microsoft",
      accountEmail: "user@outlook.com",
    });

    renderSettings({
      connections: [
        connection({
          id: "ms-conn",
          accountEmail: "user@outlook.com",
          provider: "microsoft",
        }),
      ],
      calendars: [work],
    });

    const combobox = screen.getByRole("combobox", { name: "Default Calendar" });
    expect(
      within(combobox).getByRole("group", {
        name: "user@outlook.com (Microsoft)",
      }),
    ).toBeInTheDocument();
  });

  it("marks each account row with its provider and badges only the default account", () => {
    // The same address connected on both providers: the rows are told apart
    // by the provider mark, and only the account owning the default
    // calendar wears the Default badge.
    const googlePrimary = createMockCalendar({
      name: "Google primary",
      isPrimary: true,
      accountEmail: "lance@gmail.com",
    });
    const microsoftPrimary = createMockCalendar({
      name: "Microsoft primary",
      isPrimary: true,
      provider: "microsoft",
      accountEmail: "lance@gmail.com",
    });

    renderSettings({
      connections: [
        connection({ id: "google-conn", accountEmail: "lance@gmail.com" }),
        connection({
          id: "ms-conn",
          accountEmail: "lance@gmail.com",
          provider: "microsoft",
        }),
      ],
      calendars: [googlePrimary, microsoftPrimary],
    });

    expect(screen.getByRole("img", { name: "Google" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Microsoft" })).toBeInTheDocument();

    const badge = screen.getByText("Default");
    expect(badge.parentElement).toHaveTextContent("lance@gmail.com");
    expect(
      within(badge.parentElement ?? badge).getByRole("img", { name: "Google" }),
    ).toBeInTheDocument();

    const combobox = screen.getByRole("combobox", { name: "Default Calendar" });
    expect(
      within(combobox).getByRole("group", { name: "lance@gmail.com (Google)" }),
    ).toBeInTheDocument();
    expect(
      within(combobox).getByRole("group", {
        name: "lance@gmail.com (Microsoft)",
      }),
    ).toBeInTheDocument();
  });

  it("lists the local calendar after the account groups when no account is connected", () => {
    // The sidebar renders account sections first and the local/ungrouped
    // calendar last; this picker used to disagree. With no account connected
    // the local calendar is still a legitimate writable target (see the next
    // test for the connected case).
    const work = createMockCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const local = createMockCalendar({ name: "Compass", provider: "local" });

    renderSettings({ connections: [], calendars: [work, local] });

    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["Work", "Compass"]);
  });

  it("excludes the local calendar once an account is connected", () => {
    // Once any account is connected, new events belong on a provider
    // calendar - the local calendar drops out of the writable set entirely
    // rather than sorting last (local-calendar-visibility LCV2).
    const work = createMockCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const local = createMockCalendar({ name: "Compass", provider: "local" });

    renderSettings({ calendars: [work, local] });

    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(["Work"]);
  });

  it("restores the local calendar as a writable target once the only connected account is disconnected", async () => {
    // ensureLocalCalendar exists precisely so a disconnected user never loses
    // every writable calendar - LCV2's exclusion must lift the moment the
    // account it depends on is gone, not stay stuck excluding a calendar
    // nothing else can write to (local-calendar-visibility LCV5).
    const disconnect = spyOn(
      AuthApi,
      "disconnectGoogleConnection",
    ).mockResolvedValue(undefined);

    const work = createMockCalendar({
      name: "Work",
      accountEmail: "ahab@pequod.com",
    });
    const local = createMockCalendar({ name: "Compass", provider: "local" });

    const user = userEvent.setup({ delay: null });
    renderSettings({ calendars: [work, local] });

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Work"]);

    await user.click(
      screen.getByRole("button", { name: "Disconnect ahab@pequod.com" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Confirm disconnecting ahab@pequod.com",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(["Compass"]);
    });

    disconnect.mockRestore();
  });

  it("badges the account that owns the default calendar", () => {
    const work = createMockCalendar({
      name: "Work",
      isPrimary: true,
      accountEmail: "ahab@pequod.com",
    });

    renderSettings({
      connections: [
        connection(),
        connection({ id: "connection-2", accountEmail: "ahab@gmail.com" }),
      ],
      calendars: [work],
    });

    const pequodRow = screen.getByText("ahab@pequod.com").closest("div");
    expect(
      pequodRow ? within(pequodRow).getByText("Default") : null,
    ).toBeInTheDocument();
    const gmailRow = screen.getByText("ahab@gmail.com").closest("div");
    expect(
      gmailRow ? within(gmailRow).queryByText("Default") : null,
    ).not.toBeInTheDocument();
  });

  it("shows a Log out action for a signed-in user", async () => {
    const user = userEvent.setup({ delay: null });
    renderSettings({ authenticated: true });

    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(mockOpenLogoutConfirmation).toHaveBeenCalledTimes(1);
  });

  it("closes Settings and opens logout confirmation on Log out", async () => {
    const user = userEvent.setup({ delay: null });
    const closeSettingsSpy = spyOn(settingsActions, "closeSettings");
    renderSettings({ authenticated: true });

    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(closeSettingsSpy).toHaveBeenCalled();
    expect(mockOpenLogoutConfirmation).toHaveBeenCalledTimes(1);

    closeSettingsSpy.mockRestore();
  });

  it("hides the Log out action for a signed-out (local-only) session", () => {
    renderSettings({ authenticated: false });

    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
  });

  it("shows Booking for a signed-in user", () => {
    renderSettings({ authenticated: true });

    expect(screen.getByRole("button", { name: "Meeting" })).toBeInTheDocument();
  });

  it("marks Meeting as needing attention when the live page is not bookable", async () => {
    const calendar = createMockCalendar({ name: "Work" });
    server.use(
      rest.get(bookingPageUrl, (_req, res, ctx) =>
        res(
          ctx.json({
            id: createObjectIdString(),
            slug: "hostuser",
            hostUserId: createObjectIdString(),
            enabled: true,
            durationMinutes: 30,
            destinationCalendarId: calendar.id,
            blockingCalendarIds: [calendar.id],
            timeZone: "UTC",
            weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
            minNoticeHours: 4,
            maxHorizonDays: 60,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            bookingUrl: "https://compasscalendar.com/meet/hostuser",
          }),
        ),
      ),
      rest.get(`${bookingPageUrl}/status`, (_req, res, ctx) =>
        res(
          ctx.json({
            bookable: false,
            reasons: [
              {
                kind: "calendar",
                reason: "stale",
                calendarId: calendar.id,
              },
            ],
          }),
        ),
      ),
    );

    renderSettings({
      authenticated: true,
      calendars: [calendar],
    });

    await waitFor(() => {
      expect(
        within(screen.getByRole("button", { name: /Meeting/ })).getByText(
          "needs attention",
        ),
      ).toBeInTheDocument();
    });
  });

  it("does not mark Meeting as needing attention when the page is bookable", async () => {
    renderSettings({ authenticated: true });

    const meeting = screen.getByRole("button", { name: "Meeting" });
    expect(within(meeting).queryByText("needs attention")).toBeNull();
  });

  it("hides Booking for a signed-out session", () => {
    renderSettings({ authenticated: false });

    expect(screen.queryByRole("button", { name: "Meeting" })).toBeNull();
  });

  it.each([
    "accounts",
    "billing",
    "booking",
  ] as const)("tells the host to hold Mod on the %s screen", (page) => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    renderSettings({ authenticated: true, page });

    expect(
      within(screen.getByRole("dialog", { name: "Settings" })).getByText(
        getPartsPlainText(SETTINGS_HOLD_MOD_HINT_PARTS),
      ),
    ).toBeInTheDocument();
  });

  it("says nothing about a plan on an install without billing", () => {
    renderSettings({ authenticated: true });

    expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Billing" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Manage billing" }),
    ).not.toBeInTheDocument();
  });

  it("stays on Billing while plan data is still fail-open", async () => {
    access = { kind: "open" };
    const user = userEvent.setup({ delay: null });
    renderSettings({ authenticated: true, page: "billing" });

    expect(selectSettingsPage(useSettingsStore.getState())).toBe("billing");
    expect(screen.getByRole("button", { name: "Billing" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await user.keyboard("2");
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("billing");
    expect(screen.getByRole("button", { name: "Billing" })).toHaveFocus();
  });

  it("leaves Billing when the server reports no plan", () => {
    access = {
      kind: "server",
      status: "none",
      isReadOnly: false,
      trialEndsAt: null,
    };
    renderSettings({ authenticated: true, page: "billing" });

    expect(selectSettingsPage(useSettingsStore.getState())).toBe("accounts");
    expect(screen.queryByRole("button", { name: "Billing" })).toBeNull();
    expect(screen.getByRole("button", { name: "Accounts" })).toHaveFocus();
  });

  it("seats focus on Billing when Settings opens on that page", () => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    renderSettings({ authenticated: true, page: "billing" });

    expect(screen.getByRole("button", { name: "Billing" })).toHaveFocus();
  });

  it("keeps timezone and accounts off the Billing page", () => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    renderSettings({ authenticated: true, page: "billing" });

    expect(screen.getByRole("button", { name: "Billing" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.queryByText("Default timezone")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Export data" }),
    ).not.toBeInTheDocument();
  });

  it("switches between Accounts and Billing", async () => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    const user = userEvent.setup({ delay: null });
    renderSettings({ authenticated: true });

    expect(screen.getByText("Default timezone")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Billing" }));
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.queryByText("Default timezone")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accounts" }));
    expect(screen.getByText("Default timezone")).toBeInTheDocument();
  });

  it("tells a subscriber they are on Premium", () => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    renderSettings({ authenticated: true, page: "billing" });

    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Premium")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Manage billing" }),
    ).not.toBeInTheDocument();
  });

  it("renders plan, card, and receipts when opening Billing", async () => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    renderSettings({ authenticated: true, page: "billing" });

    expect(screen.getByText("Premium")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("$12.00 per month")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Visa ending in 4242, expires 12/99"),
    ).toBeInTheDocument();
    const receipt = screen.getByRole("link", { name: "Receipt" });
    expect(receipt).toHaveAttribute("target", "_blank");
    expect(receipt).toHaveAttribute("rel", "noreferrer");
    expect(
      screen.getByRole("button", { name: "Cancel subscription" }),
    ).toBeInTheDocument();
  });

  it("counts down the trial and points at the early-upgrade shortcut", () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: dayjs().add(3, "day").toISOString(),
    };
    renderSettings({ authenticated: true, page: "billing" });

    expect(screen.getByText("Trial \u00b7 3d")).toBeInTheDocument();
    expect(screen.getByText(/to subscribe now/)).toBeInTheDocument();
    expect(
      within(
        screen.getByText(/to subscribe now/).closest("p") as HTMLElement,
      ).getByText("B"),
    ).toBeTruthy();
  });

  it("says a cancel-scheduled trial will not renew", () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: dayjs().add(3, "day").toISOString(),
      cancelAtPeriodEnd: true,
    };
    renderSettings({ authenticated: true, page: "billing" });

    expect(
      screen.getByText(/to subscribe now/).closest("p") as HTMLElement,
    ).toHaveTextContent(
      `Your trial ends ${dayjs().add(3, "day").format("MMM D, YYYY")} and will not renew. Press B to subscribe now.`,
    );
  });

  it("jumps to Billing with 2 and back to Accounts with 1", async () => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    const user = userEvent.setup({ delay: null });
    renderSettings({ authenticated: true });

    await user.keyboard("2");
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Billing" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("Plan")).toBeInTheDocument();
    await user.keyboard("1");
    expect(screen.getByText("Default timezone")).toBeInTheDocument();
  });

  it("reveals shortcut chips while Mod is held", async () => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    const user = userEvent.setup({ delay: null });
    renderSettings({ authenticated: true });

    expect(
      within(screen.getByRole("button", { name: "Accounts" })).queryByText("1"),
    ).toBeNull();

    const hint = getPartsPlainText(SETTINGS_HOLD_MOD_HINT_PARTS);
    expect(screen.getByText(hint)).toBeInTheDocument();

    const modKey = resolveModifier("Mod") === "Meta" ? "Meta" : "Control";
    await user.keyboard(`{${modKey}>}`);
    expect(
      within(screen.getByRole("button", { name: "Accounts" })).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Billing" })).getByText("2"),
    ).toBeInTheDocument();
    expect(screen.queryByText(hint)).toBeNull();

    await user.keyboard(`{/${modKey}}`);
    expect(
      within(screen.getByRole("button", { name: "Accounts" })).queryByText("1"),
    ).toBeNull();
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it("opens the upgrade confirmation with B while Settings is open", async () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: dayjs().add(3, "day").toISOString(),
    };
    const user = userEvent.setup({ delay: null });
    renderSettings({ authenticated: true, page: "billing" });

    await user.keyboard("b");

    expect(
      screen.getByRole("dialog", { name: "Start Premium now?" }),
    ).toBeInTheDocument();
  });

  it("closes the upgrade confirmation on Escape and leaves Settings open", async () => {
    access = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: dayjs().add(3, "day").toISOString(),
    };
    const user = userEvent.setup({ delay: null });
    renderSettings({ authenticated: true, page: "billing" });

    await user.keyboard("b");
    expect(
      screen.getByRole("dialog", { name: "Start Premium now?" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Start Premium now?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  // The booking section is lazily imported (BookingSettingsSection.lazy) to
  // keep the booking admin stack off the boot chunk, behind a Suspense
  // fallback that reserves the Meeting pane height. A chunk that never
  // resolves would keep that reserved box rather than throwing, so assert
  // the section actually arrives instead of trusting the boundary.
  it("resolves the lazily loaded booking section", async () => {
    renderSettings({ authenticated: true, page: "booking" });

    expect(
      await screen.findByText("Loading meeting settings\u2026"),
    ).toBeInTheDocument();
  });

  it("asks before discarding unsaved booking edits on Escape", async () => {
    const user = userEvent.setup({ delay: null });
    const calendar = createMockCalendar({ name: "Work" });
    renderSettings({
      authenticated: true,
      calendars: [calendar],
      page: "booking",
    });

    await screen.findByRole("switch", { name: "Meeting page" });
    await user.selectOptions(screen.getByLabelText("Duration"), "45");
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("dialog", { name: "Discard unsaved changes?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Duration")).toHaveValue("45");
  });

  it("closes Settings after confirming discard of booking edits", async () => {
    const user = userEvent.setup({ delay: null });
    const calendar = createMockCalendar({ name: "Work" });
    renderSettings({
      authenticated: true,
      calendars: [calendar],
      page: "booking",
    });

    await screen.findByRole("switch", { name: "Meeting page" });
    await user.selectOptions(screen.getByLabelText("Duration"), "45");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(
      screen.queryByRole("dialog", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });

  it("keeps booking edits when the discard confirmation is dismissed", async () => {
    const user = userEvent.setup({ delay: null });
    const calendar = createMockCalendar({ name: "Work" });
    renderSettings({
      authenticated: true,
      calendars: [calendar],
      page: "booking",
    });

    await screen.findByRole("switch", { name: "Meeting page" });
    await user.selectOptions(screen.getByLabelText("Duration"), "45");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("dialog", { name: "Discard unsaved changes?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Duration")).toHaveValue("45");
  });

  it("closes Settings on Escape when booking settings are unchanged", async () => {
    const user = userEvent.setup({ delay: null });
    const calendar = createMockCalendar({ name: "Work" });
    renderSettings({
      authenticated: true,
      calendars: [calendar],
      page: "booking",
    });

    await screen.findByRole("switch", { name: "Meeting page" });
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Discard unsaved changes?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });

  it("reveals sidebar digits and Save Enter while Mod is held on Meeting", async () => {
    const user = userEvent.setup({ delay: null });
    const calendar = createMockCalendar({ name: "Work" });
    renderSettings({
      authenticated: true,
      calendars: [calendar],
      page: "booking",
    });

    await screen.findByRole("switch", { name: "Meeting page" });
    const modKey = resolveModifier("Mod") === "Meta" ? "Meta" : "Control";
    await user.keyboard(`{${modKey}>}`);

    const settings = screen.getByRole("dialog", { name: "Settings" });
    expect(
      within(screen.getByRole("button", { name: "Accounts" })).getByText("1", {
        exact: true,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Billing" })).toBeNull();
    expect(
      within(screen.getByRole("button", { name: "Meeting" })).getByText("3", {
        exact: true,
      }),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("button", { name: BOOKING_SAVE_CHANGES_LABEL }),
      ).getByText("Enter"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByText("Duration")).queryByText("5", { exact: true }),
    ).toBeNull();
    expect(
      within(screen.getByText("Meeting timezone")).queryByText("6", {
        exact: true,
      }),
    ).toBeNull();
    expect(
      within(screen.getByText("Weekly hours")).queryByText("7", {
        exact: true,
      }),
    ).toBeNull();
    expect(
      within(screen.getByText("Destination calendar")).queryByText("8", {
        exact: true,
      }),
    ).toBeNull();
    expect(
      within(screen.getByText(BOOKING_MORE_OPTIONS_LABEL)).queryByText("9", {
        exact: true,
      }),
    ).toBeNull();
    expect(within(settings).queryByText("U", { exact: true })).toBeNull();
    expect(within(settings).queryByText("4", { exact: true })).toBeNull();

    await user.keyboard(`{/${modKey}}`);
  });

  it("reveals Billing 2 while Mod is held when billing is present", async () => {
    const user = userEvent.setup({ delay: null });
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    const calendar = createMockCalendar({ name: "Work" });
    renderSettings({
      authenticated: true,
      calendars: [calendar],
      page: "booking",
    });

    await screen.findByRole("switch", { name: "Meeting page" });
    const modKey = resolveModifier("Mod") === "Meta" ? "Meta" : "Control";
    await user.keyboard(`{${modKey}>}`);

    expect(
      within(screen.getByRole("button", { name: "Billing" })).getByText("2", {
        exact: true,
      }),
    ).toBeInTheDocument();

    await user.keyboard(`{/${modKey}}`);
  });

  it("does not jump or toggle anything with Mod+5", async () => {
    const user = userEvent.setup({ delay: null });
    const calendar = createMockCalendar({ name: "Work" });
    renderSettings({
      authenticated: true,
      calendars: [calendar],
      page: "booking",
    });

    const meetingSwitch = await screen.findByRole("switch", {
      name: "Meeting page",
    });
    meetingSwitch.focus();
    const before = document.activeElement;
    const checked = meetingSwitch.getAttribute("aria-checked");
    const modKey = resolveModifier("Mod") === "Meta" ? "Meta" : "Control";
    await user.keyboard(`{${modKey}>}5{/${modKey}}`);

    expect(document.activeElement).toBe(before);
    expect(screen.getByLabelText("Duration")).not.toHaveFocus();
    expect(
      screen.getByRole("switch", { name: "Meeting page" }),
    ).toHaveAttribute("aria-checked", checked);
  });

  it("saves with Mod+Enter on the Meeting page", async () => {
    const user = userEvent.setup({ delay: null });
    const calendar = createMockCalendar({ name: "Work" });
    let savedBody: unknown;
    server.use(
      rest.put(`${ENV_WEB.API_BASEURL}/booking/page`, async (req, res, ctx) => {
        savedBody = await req.json();
        return res(ctx.json(savedBody as object));
      }),
    );
    renderSettings({
      authenticated: true,
      calendars: [calendar],
      page: "booking",
    });

    await screen.findByRole("switch", { name: "Meeting page" });
    await user.selectOptions(screen.getByLabelText("Duration"), "45");
    const modKey = resolveModifier("Mod") === "Meta" ? "Meta" : "Control";
    await user.keyboard(`{${modKey}>}{Enter}{/${modKey}}`);

    await waitFor(() => {
      expect(savedBody).toMatchObject({ durationMinutes: 45 });
    });
  });

  it("continues the setup wizard with Mod+Enter on the address step", async () => {
    const user = userEvent.setup({ delay: null });
    const calendar = createMockCalendar({ name: "Work" });
    const calendarId = CalendarIdSchema.parse(calendar.id);
    server.use(
      rest.get(bookingPageUrl, (_req, res, ctx) =>
        res(ctx.json(unconfiguredBookingPage(calendarId))),
      ),
      rest.put(bookingPageUrl, async (req, res, ctx) => {
        const body = (await req.json()) as Record<string, unknown>;
        return res(ctx.json(putSavedBookingPage(calendarId, body)));
      }),
    );
    renderSettings({
      authenticated: true,
      calendars: [calendar],
      page: "booking",
    });

    await screen.findByText("Step 1 of 4");
    const modKey = resolveModifier("Mod") === "Meta" ? "Meta" : "Control";
    await user.keyboard(`{${modKey}>}{Enter}{/${modKey}}`);

    expect(await screen.findByText("Step 2 of 4")).toBeInTheDocument();
  });

  it("reveals nav chips and Continue Enter while Mod is held during setup", async () => {
    const user = userEvent.setup({ delay: null });
    const calendar = createMockCalendar({ name: "Work" });
    const calendarId = CalendarIdSchema.parse(calendar.id);
    server.use(
      rest.get(bookingPageUrl, (_req, res, ctx) =>
        res(ctx.json(unconfiguredBookingPage(calendarId))),
      ),
    );
    renderSettings({
      authenticated: true,
      calendars: [calendar],
      page: "booking",
    });

    await screen.findByText("Step 1 of 4");
    const modKey = resolveModifier("Mod") === "Meta" ? "Meta" : "Control";
    await user.keyboard(`{${modKey}>}`);

    const settings = screen.getByRole("dialog", { name: "Settings" });
    expect(
      within(screen.getByRole("button", { name: "Accounts" })).getByText("1", {
        exact: true,
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Meeting" })).getByText("3", {
        exact: true,
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /^Continue/ })).getByText(
        "Enter",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: BOOKING_SAVE_CHANGES_LABEL }),
    ).toBeNull();
    expect(within(settings).queryByText("4", { exact: true })).toBeNull();

    await user.keyboard(`{/${modKey}}`);
  });

  it("steps back on Escape during setup without closing Settings", async () => {
    const user = userEvent.setup({ delay: null });
    const calendar = createMockCalendar({ name: "Work" });
    const calendarId = CalendarIdSchema.parse(calendar.id);
    server.use(
      rest.get(bookingPageUrl, (_req, res, ctx) =>
        res(ctx.json(unconfiguredBookingPage(calendarId))),
      ),
      rest.put(bookingPageUrl, async (req, res, ctx) => {
        const body = (await req.json()) as Record<string, unknown>;
        return res(ctx.json(putSavedBookingPage(calendarId, body)));
      }),
    );
    renderSettings({
      authenticated: true,
      calendars: [calendar],
      page: "booking",
    });

    await user.click(await screen.findByRole("button", { name: /^Continue/ }));
    expect(await screen.findByText("Step 2 of 4")).toBeInTheDocument();
    await user.keyboard("k");
    expect(await screen.findByText("Step 3 of 4")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(await screen.findByText("Step 2 of 4")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Settings" }),
    ).toBeInTheDocument();
  });

  it("closes Settings on Escape from the first setup step", async () => {
    const user = userEvent.setup({ delay: null });
    const calendar = createMockCalendar({ name: "Work" });
    const calendarId = CalendarIdSchema.parse(calendar.id);
    server.use(
      rest.get(bookingPageUrl, (_req, res, ctx) =>
        res(ctx.json(unconfiguredBookingPage(calendarId))),
      ),
    );
    renderSettings({
      authenticated: true,
      calendars: [calendar],
      page: "booking",
    });

    await screen.findByText("Step 1 of 4");
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });
});

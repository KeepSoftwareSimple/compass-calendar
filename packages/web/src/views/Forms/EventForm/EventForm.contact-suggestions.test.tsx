import { HotkeyManager } from "@tanstack/react-hotkeys";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { jsonResponse } from "@web/__tests__/helpers/msw-v2";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockConnection } from "@web/__tests__/utils/factories/calendar.factory";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { resetContactsNudgeSessionForTests } from "@web/views/Forms/EventForm/AttendeeField/contact-nudge.gate";
import { EventForm } from "@web/views/Forms/EventForm/EventForm";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// WP-06 in the real form: live Google-contact suggestions in the guest
// combobox when the capability is granted, the occasional enable-contacts
// nudge in the combobox footer when it is not, and silent raw-email fallback
// when the proxy fails.

const ACCOUNT_EMAIL = "me@example.com";
const SUGGESTIONS_URL = `${ENV_WEB.API_BASEURL}/contacts/suggestions`;

const makeCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: CalendarIdSchema.parse(createObjectIdString()),
  name: "Work calendar",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "owner",
  capabilities: getCalendarCapabilities("owner"),
  isPrimary: true,
  isVisible: true,
  isActive: true,
  accountEmail: ACCOUNT_EMAIL,
  ...overrides,
});

const makeMeetingEvent = (calendarId: Calendar["id"]): Event =>
  createMockEvent({
    calendarId,
    content: {
      kind: "details",
      title: "Weekly sync",
      description: "",
      organizer: { email: ACCOUNT_EMAIL, displayName: null },
      attendees: [],
    },
  });

const seedContactsCapability = (canSuggestContacts: boolean) => {
  userMetadataActions.set({
    google: {
      connectionState: "HEALTHY",
      connections: [
        createMockConnection(ACCOUNT_EMAIL, { canSuggestContacts }),
      ],
    },
  });
};

const serveSuggestions = (
  suggestions: Array<{ email: string; displayName: string | null }>,
) => {
  const queries: string[] = [];
  server.use(
    http.get(SUGGESTIONS_URL, ({ request }) => {
      queries.push(new URL(request.url).searchParams.get("q") ?? "");
      return jsonResponse({ suggestions }, 200);
    }),
  );
  return queries;
};

const renderGuestEditor = () => {
  const calendar = makeCalendar();
  const draft = editGridEventDraft(makeMeetingEvent(calendar.id));
  if (!draft) throw new Error("expected an edit draft");

  const { queryClient, wrapper } = createStoreWrapper();
  queryClient.setQueryData(calendarQueryKeys.all, [calendar]);

  const setDraft = mock();
  render(
    <EventForm
      draft={draft}
      isDraft={false}
      isExistingEvent={true}
      onClose={mock()}
      onDelete={mock()}
      onDuplicate={mock()}
      onSubmit={mock()}
      setDraft={setDraft}
    />,
    { wrapper },
  );

  // The form is prop-controlled: a guest edit lands as a resolved draft on
  // setDraft (the harness never feeds it back, so chips don't re-render).
  // Read the intended guests off the latest resolved draft.
  const latestDraftAttendees = () => {
    const resolved = setDraft.mock.calls.at(-1)?.[0] as
      | GridEventDraft
      | null
      | undefined;
    return resolved?.values.attendees;
  };

  return {
    combobox: screen.getByRole("combobox", { name: "Guests" }),
    setDraft,
    latestDraftAttendees,
  };
};

describe("EventForm contact suggestions (WP-06)", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    localStorage.clear();
    resetContactsNudgeSessionForTests();
  });

  afterEach(() => {
    cleanup();
    userMetadataActions.clear();
  });

  it("shows ranked suggestions after typing and fills the chip from a pick (displayName + email)", async () => {
    seedContactsCapability(true);
    const queries = serveSuggestions([
      { email: "zed@example.com", displayName: "Zed" },
      { email: "ada@example.com", displayName: "Ada Lovelace" },
    ]);
    const user = userEvent.setup();

    const { combobox, latestDraftAttendees } = renderGuestEditor();
    await user.type(combobox, "ada");

    // Debounced (≥250ms) round-trip; findBy* waits it out.
    await screen.findByText("Ada Lovelace");
    const labels = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    // Ranked: Ada (name-prefix match) above Zed (server-matched only).
    expect(labels.indexOf("Ada Lovelace")).toBeGreaterThan(-1);
    expect(labels.indexOf("Ada Lovelace")).toBeLessThan(labels.indexOf("Zed"));
    expect(queries).toEqual(["ada"]);

    await user.click(screen.getByText("Ada Lovelace"));
    // The pick lands in the draft with displayName AND email.
    expect(latestDraftAttendees()).toEqual([
      { email: "ada@example.com", displayName: "Ada Lovelace" },
    ]);
    // No nudge while the capability is granted.
    expect(
      screen.queryByRole("button", { name: "Enable contact suggestions" }),
    ).not.toBeInTheDocument();
  });

  it("without the capability: no request, raw email entry works, and the footer nudge appears once", async () => {
    seedContactsCapability(false);
    const queries = serveSuggestions([
      { email: "ada@example.com", displayName: "Ada Lovelace" },
    ]);
    const user = userEvent.setup();

    const { combobox, latestDraftAttendees } = renderGuestEditor();
    await user.type(combobox, "ada");

    // The nudge sits in the combobox footer of the open menu; no modal.
    expect(
      await screen.findByRole("button", { name: "Enable contact suggestions" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Raw email entry still lands a guest edit.
    await user.clear(combobox);
    await user.type(combobox, "ada@example.com");
    await user.keyboard("{Enter}");
    expect(latestDraftAttendees()).toEqual([
      { email: "ada@example.com", displayName: null },
    ]);
    expect(queries).toHaveLength(0);
  });

  it("degrades silently when the proxy fails: no suggestions, raw entry unaffected", async () => {
    seedContactsCapability(true);
    server.use(
      http.get(SUGGESTIONS_URL, () => new HttpResponse(null, { status: 503 })),
    );
    const user = userEvent.setup();

    const { combobox, latestDraftAttendees } = renderGuestEditor();
    await user.type(combobox, "ada@example.com");
    await user.keyboard("{Enter}");

    expect(latestDraftAttendees()).toEqual([
      { email: "ada@example.com", displayName: null },
    ]);
  });
});

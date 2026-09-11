import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { EventIdSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { composeOccurrenceId } from "@core/util/occurrence-id";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { RsvpControl } from "@web/views/Forms/EventForm/RsvpControl";
import { describe, expect, it } from "bun:test";

// WP-08: the Going / Maybe / Decline segmented control. Semantics are pinned
// through RTL role/name queries (radiogroup + named radios) — the same
// contract an assistive technology reads — because the axe e2e harness runs
// the anonymous local-mode app, where no Google-calendar invitation can exist
// for the control to mount on.

const ACCOUNT_EMAIL = "me@example.com";

const attendees = (selfStatus: Attendee["responseStatus"]): Attendee[] => [
  // Case-differing self entry: the match must be case-insensitive.
  { email: "Me@Example.com", displayName: null, responseStatus: selfStatus },
  {
    email: "guest@example.com",
    displayName: "Guest One",
    responseStatus: "declined",
  },
];

const invitedEvent = (
  selfStatus: Attendee["responseStatus"],
  overrides: Partial<Event> = {},
): Event =>
  createMockEvent({
    content: {
      kind: "details",
      title: "Planning",
      description: "",
      attendees: attendees(selfStatus),
    },
    ...overrides,
  });

const renderControl = (event: Event) => {
  const { wrapper } = createStoreWrapper();
  return render(<RsvpControl event={event} accountEmail={ACCOUNT_EMAIL} />, {
    wrapper,
  });
};

const captureRsvpRequests = () => {
  const requests: Array<{ path: string; body: unknown }> = [];
  server.use(
    http.post(`${ENV_WEB.API_BASEURL}/event/:id/rsvp`, async ({ request }) => {
      requests.push({
        path: new URL(request.url).pathname,
        body: await request.json(),
      });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return requests;
};

describe("RsvpControl", () => {
  it("renders a labelled radiogroup with Going / Maybe / Decline and the current answer checked", () => {
    renderControl(invitedEvent("tentative"));

    expect(
      screen.getByRole("radiogroup", { name: "Going?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Going" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Maybe" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Decline" })).not.toBeChecked();
  });

  it("leaves every option unchecked while the invitation is unanswered", () => {
    renderControl(invitedEvent("needsAction"));

    for (const name of ["Going", "Maybe", "Decline"]) {
      expect(screen.getByRole("radio", { name })).not.toBeChecked();
    }
  });

  it("renders nothing when the account email is not in the attendee list", () => {
    const event = createMockEvent({
      content: {
        kind: "details",
        title: "Their meeting",
        description: "",
        attendees: [
          {
            email: "guest@example.com",
            displayName: null,
            responseStatus: "accepted",
          },
        ],
      },
    });

    renderControl(event);

    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("answers a single event immediately with scope single and no dialog", async () => {
    const user = userEvent.setup();
    const requests = captureRsvpRequests();
    const event = invitedEvent("needsAction");

    renderControl(event);
    await user.click(screen.getByRole("radio", { name: "Going" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.path.endsWith(`/event/${event.id}/rsvp`)).toBe(true);
    expect(requests[0]?.body).toEqual({
      responseStatus: "accepted",
      scope: "single",
    });
    // Single events never see the scope dialog.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers This Event / All Events (never this-and-following) for an occurrence and posts the occurrence id for This Event", async () => {
    const user = userEvent.setup();
    const requests = captureRsvpRequests();
    const seriesId = createObjectIdString();
    const occurrenceId = composeOccurrenceId({
      eventId: seriesId,
      recurrenceId: "2026-05-05T14:00:00.000Z",
    });
    const occurrence = invitedEvent("needsAction", {
      id: EventIdSchema.parse(occurrenceId),
      recurrence: {
        kind: "occurrence",
        seriesId: EventIdSchema.parse(seriesId),
      },
    });

    renderControl(occurrence);
    await user.click(screen.getByRole("radio", { name: "Decline" }));

    // The choice defers to the dialog: nothing on the wire yet.
    const dialog = await screen.findByRole("dialog");
    expect(requests).toHaveLength(0);
    expect(
      screen.getByRole("radio", { name: "This Event" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "All Events" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /following/i }),
    ).not.toBeInTheDocument();
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ok" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    // The composite occurrence id rides the URL — this occurrence only.
    expect(
      requests[0]?.path.endsWith(
        `/event/${encodeURIComponent(occurrenceId)}/rsvp`,
      ),
    ).toBe(true);
    expect(requests[0]?.body).toEqual({
      responseStatus: "declined",
      scope: "single",
    });
  });

  it("posts scope all when All Events is chosen for an occurrence", async () => {
    const user = userEvent.setup();
    const requests = captureRsvpRequests();
    const seriesId = createObjectIdString();
    const occurrence = invitedEvent("needsAction", {
      id: EventIdSchema.parse(
        composeOccurrenceId({
          eventId: seriesId,
          recurrenceId: "2026-05-05T14:00:00.000Z",
        }),
      ),
      recurrence: {
        kind: "occurrence",
        seriesId: EventIdSchema.parse(seriesId),
      },
    });

    renderControl(occurrence);
    await user.click(screen.getByRole("radio", { name: "Maybe" }));
    await user.click(await screen.findByRole("radio", { name: "All Events" }));
    await user.click(screen.getByRole("button", { name: "Ok" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.body).toEqual({
      responseStatus: "tentative",
      scope: "all",
    });
  });

  it("sends nothing when the scope dialog is cancelled", async () => {
    const user = userEvent.setup();
    const requests = captureRsvpRequests();
    const seriesId = createObjectIdString();
    const occurrence = invitedEvent("needsAction", {
      id: EventIdSchema.parse(
        composeOccurrenceId({
          eventId: seriesId,
          recurrenceId: "2026-05-05T14:00:00.000Z",
        }),
      ),
      recurrence: {
        kind: "occurrence",
        seriesId: EventIdSchema.parse(seriesId),
      },
    });

    renderControl(occurrence);
    await user.click(screen.getByRole("radio", { name: "Decline" }));
    await user.click(
      (await screen.findAllByRole("button", { name: "Cancel" }))[0] as Element,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("re-choosing the current answer sends nothing", async () => {
    const user = userEvent.setup();
    const requests = captureRsvpRequests();

    renderControl(invitedEvent("accepted"));
    await user.click(screen.getByRole("radio", { name: "Going" }));

    expect(requests).toHaveLength(0);
  });
});

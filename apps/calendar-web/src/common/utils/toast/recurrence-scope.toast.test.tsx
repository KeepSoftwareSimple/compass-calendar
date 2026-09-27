import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { type EventId } from "@core/types/domain-primitives";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { EVENT_DELETED_TOAST_ID } from "@web/common/constants/toast.constants";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import {
  recurrenceScopeOpportunityActions,
  useRecurrenceScopeOpportunityStore,
} from "@web/events/recurrence/recurrence-scope-opportunity.store";
import {
  dismissRecurrenceScopeToast,
  showRecurrenceScopeSuccessToast,
  showRecurrenceScopeToast,
} from "./recurrence-scope.toast";
import { beforeEach, describe, expect, it } from "bun:test";

describe("showRecurrenceScopeToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    recurrenceScopeOpportunityActions.reset();
    mocks.toast.mockClear();
    mocks.update.mockClear();
    mocks.dismiss.mockClear();
    registerToastPort(port);
  });

  it("offers accessible clickable promotion actions", async () => {
    const original = createMockEvent({
      content: {
        kind: "details",
        title: "Drive home with kids for 50 min in the SUV on highway 20",
        description: "",
      },
      recurrence: {
        kind: "occurrence",
        seriesId: "0123456789abcdef11111111" as EventId,
      },
    });
    const id = recurrenceScopeOpportunityActions.begin({
      kind: "delete",
      original,
      source: "local",
    });
    const opportunity =
      useRecurrenceScopeOpportunityStore.getState().opportunity;
    if (!opportunity) throw new Error("Expected opportunity");

    showRecurrenceScopeToast(opportunity);
    expect(mocks.update).toHaveBeenCalledWith(
      EVENT_DELETED_TOAST_ID,
      expect.objectContaining({
        closeButton: false,
        closeOnClick: false,
        onClose: expect.any(Function),
      }),
    );
    const [content] = mocks.toast.mock.calls.at(0) as unknown as [ReactNode];
    render(content);

    expect(
      screen.getByText("Deleted “Drive home with kids for 50…”"),
    ).toBeVisible();
    expect(screen.getByText("Apply to series?")).toBeVisible();
    expect(screen.getByRole("button", { name: "Following" })).toBeVisible();
    expect(screen.getByRole("button", { name: "All" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Following" }));

    expect(
      useRecurrenceScopeOpportunityStore.getState().opportunity,
    ).toMatchObject({
      id,
      status: "requested",
      requestedScope: "thisAndFollowing",
    });
    expect(screen.getByRole("button", { name: "All" })).toBeVisible();
  });

  it("confirms the promoted scope without implying it can be undone", () => {
    const original = createMockEvent({
      content: { kind: "details", title: "Plan week", description: "" },
      recurrence: {
        kind: "occurrence",
        seriesId: "0123456789abcdef11111111" as EventId,
      },
    });
    recurrenceScopeOpportunityActions.begin({
      kind: "replace",
      original,
      input: {
        content: {
          kind: "details",
          title: "Updated plan",
          description: "",
          location: "",
        },
        schedule: original.schedule,
        recurrence: { kind: "preserve" },
        scope: "this",
      },
      source: "local",
    });
    const opportunity =
      useRecurrenceScopeOpportunityStore.getState().opportunity;
    if (!opportunity) throw new Error("Expected opportunity");

    showRecurrenceScopeSuccessToast(opportunity, "thisAndFollowing");
    const [, update] = mocks.update.mock.calls.at(-1) as unknown as [
      unknown,
      { render: ReactNode },
    ];
    render(update.render);

    expect(
      screen.getByText("Updated “Updated plan” and following"),
    ).toBeVisible();
    expect(screen.queryByText(/undo/i)).not.toBeInTheDocument();
  });

  it("does not replace a newer scope offer with a stale confirmation", () => {
    const original = createMockEvent({
      recurrence: {
        kind: "occurrence",
        seriesId: "0123456789abcdef11111111" as EventId,
      },
    });
    const firstId = recurrenceScopeOpportunityActions.begin({
      kind: "delete",
      original,
      source: "local",
    });
    const first = useRecurrenceScopeOpportunityStore.getState().opportunity;
    if (!first) throw new Error("Expected first opportunity");

    recurrenceScopeOpportunityActions.requestPromotion(firstId, "all");
    const newerId = recurrenceScopeOpportunityActions.begin({
      kind: "delete",
      original: createMockEvent({
        recurrence: {
          kind: "occurrence",
          seriesId: "0123456789abcdef22222222" as EventId,
        },
      }),
      source: "local",
    });
    const newer = useRecurrenceScopeOpportunityStore.getState().opportunity;
    if (!newer) throw new Error("Expected newer opportunity");

    showRecurrenceScopeToast(newer);
    mocks.update.mockClear();
    showRecurrenceScopeSuccessToast(first, "all");

    expect(mocks.update).not.toHaveBeenCalled();
    expect(
      useRecurrenceScopeOpportunityStore.getState().opportunity,
    ).toMatchObject({ id: newerId, status: "ready" });
  });

  it("dismisses only the matching live scope offer", () => {
    const original = createMockEvent({
      recurrence: {
        kind: "occurrence",
        seriesId: "0123456789abcdef11111111" as EventId,
      },
    });
    const staleId = recurrenceScopeOpportunityActions.begin({
      kind: "replace",
      original,
      input: {
        content: {
          kind: "details",
          title: "Original",
          description: "",
          location: "",
        },
        schedule: original.schedule,
        recurrence: { kind: "preserve" },
        scope: "this",
      },
      source: "local",
    });
    const activeId = recurrenceScopeOpportunityActions.begin({
      kind: "delete",
      original,
      source: "local",
    });

    dismissRecurrenceScopeToast(staleId);
    expect(mocks.dismiss).not.toHaveBeenCalled();

    dismissRecurrenceScopeToast(activeId);
    expect(mocks.dismiss).toHaveBeenCalledWith(EVENT_DELETED_TOAST_ID);
  });
});

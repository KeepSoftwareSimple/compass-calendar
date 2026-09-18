import { type EventId } from "@core/types/domain-primitives";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import {
  isRecurrenceScopeAskReady,
  isRecurrenceScopeEditAskDeclined,
  recurrenceScopeOpportunityActions,
  useRecurrenceScopeOpportunityStore,
} from "./recurrence-scope-opportunity.store";
import { describe, expect, it } from "bun:test";

const occurrence = () =>
  createMockEvent({
    recurrence: {
      kind: "occurrence",
      seriesId: "0123456789abcdef11111111" as EventId,
    },
  });

const original = occurrence();

const replaceInput = (event = original, startHour = 9) => ({
  calendarId: event.calendarId,
  content: {
    kind: "details" as const,
    title: "Test",
    description: "",
    location: "",
  },
  schedule: {
    ...event.schedule,
    start: `2026-05-05T0${startHour}:00:00.000-05:00`,
  } as typeof event.schedule,
  recurrence: { kind: "preserve" as const },
  scope: "this" as const,
});

describe("recurrenceScopeOpportunityActions", () => {
  it("is ready only while the series-scope toast can still promote", () => {
    recurrenceScopeOpportunityActions.reset();
    expect(isRecurrenceScopeAskReady()).toBe(false);

    const id = recurrenceScopeOpportunityActions.begin({
      kind: "delete",
      original,
      source: "local",
    });
    expect(isRecurrenceScopeAskReady()).toBe(true);

    recurrenceScopeOpportunityActions.requestPromotion(id, "all");
    expect(isRecurrenceScopeAskReady()).toBe(false);
  });

  it("only promotes the currently-live opportunity once", () => {
    recurrenceScopeOpportunityActions.reset();
    const id = recurrenceScopeOpportunityActions.begin({
      kind: "delete",
      original,
      source: "local",
    });

    recurrenceScopeOpportunityActions.requestPromotion(id, "all");
    const claimed = recurrenceScopeOpportunityActions.claimPromotion();

    expect(claimed).toMatchObject({
      id,
      kind: "delete",
      requestedScope: "all",
      status: "requested",
    });
    expect(recurrenceScopeOpportunityActions.claimPromotion()).toBeNull();
    expect(
      useRecurrenceScopeOpportunityStore.getState().opportunity,
    ).toMatchObject({
      id,
      status: "submitting",
    });
  });

  it("new opportunities supersede an older toast without letting it promote", () => {
    recurrenceScopeOpportunityActions.reset();
    const older = recurrenceScopeOpportunityActions.begin({
      kind: "delete",
      original,
      source: "local",
    });
    const newer = recurrenceScopeOpportunityActions.begin({
      kind: "delete",
      original,
      source: "local",
    });

    recurrenceScopeOpportunityActions.requestPromotion(older, "all");

    expect(
      useRecurrenceScopeOpportunityStore.getState().opportunity,
    ).toMatchObject({
      id: newer,
      status: "ready",
    });
  });

  it("records a decline when an edit ask expires", () => {
    recurrenceScopeOpportunityActions.reset();
    const id = recurrenceScopeOpportunityActions.begin({
      kind: "replace",
      original,
      input: replaceInput(),
      source: "local",
    });

    recurrenceScopeOpportunityActions.dismiss(id);

    expect(isRecurrenceScopeEditAskDeclined(original.id)).toBe(true);
    expect(
      useRecurrenceScopeOpportunityStore.getState().opportunity,
    ).toBeNull();
  });

  it("records a decline when an ask for another instance supersedes a live edit ask", () => {
    recurrenceScopeOpportunityActions.reset();
    recurrenceScopeOpportunityActions.begin({
      kind: "replace",
      original,
      input: replaceInput(),
      source: "local",
    });
    const other = occurrence();
    const id2 = recurrenceScopeOpportunityActions.begin({
      kind: "replace",
      original: other,
      input: replaceInput(other),
      source: "local",
    });

    expect(isRecurrenceScopeEditAskDeclined(original.id)).toBe(true);
    expect(useRecurrenceScopeOpportunityStore.getState().opportunity?.id).toBe(
      id2,
    );
    expect(
      useRecurrenceScopeOpportunityStore.getState().opportunity?.status,
    ).toBe("ready");
  });

  it("a deferred ask stays pending until settle()", () => {
    recurrenceScopeOpportunityActions.reset();
    recurrenceScopeOpportunityActions.begin(
      { kind: "replace", original, input: replaceInput(), source: "local" },
      { deferred: true },
    );

    expect(
      useRecurrenceScopeOpportunityStore.getState().opportunity?.status,
    ).toBe("pending");
    expect(isRecurrenceScopeAskReady()).toBe(false);

    recurrenceScopeOpportunityActions.settle();

    expect(isRecurrenceScopeAskReady()).toBe(true);
  });

  it("merges a burst on one instance: first original, latest input, no decline", () => {
    recurrenceScopeOpportunityActions.reset();
    const first = recurrenceScopeOpportunityActions.begin(
      {
        kind: "replace",
        original,
        input: replaceInput(original, 8),
        source: "local",
      },
      { deferred: true },
    );
    const second = recurrenceScopeOpportunityActions.begin(
      {
        kind: "replace",
        original,
        input: replaceInput(original, 7),
        source: "local",
      },
      { deferred: true },
    );

    const live = useRecurrenceScopeOpportunityStore.getState().opportunity;
    expect(second).not.toBe(first);
    expect(live).toMatchObject({ id: second, original, status: "pending" });
    expect(live?.kind === "replace" && live.input.schedule).toMatchObject({
      start: "2026-05-05T07:00:00.000-05:00",
    });
    expect(isRecurrenceScopeEditAskDeclined(original.id)).toBe(false);
  });

  it("a pending ask is never declined by the ask that supersedes it", () => {
    recurrenceScopeOpportunityActions.reset();
    recurrenceScopeOpportunityActions.begin(
      { kind: "replace", original, input: replaceInput(), source: "local" },
      { deferred: true },
    );
    const other = occurrence();
    recurrenceScopeOpportunityActions.begin({
      kind: "replace",
      original: other,
      input: replaceInput(other),
      source: "local",
    });

    expect(isRecurrenceScopeEditAskDeclined(original.id)).toBe(false);
  });

  it("reset() clears a pending ask", () => {
    recurrenceScopeOpportunityActions.reset();
    recurrenceScopeOpportunityActions.begin(
      { kind: "replace", original, input: replaceInput(), source: "local" },
      { deferred: true },
    );

    recurrenceScopeOpportunityActions.reset();

    expect(
      useRecurrenceScopeOpportunityStore.getState().opportunity,
    ).toBeNull();
  });

  it("does not record a decline for a delete ask", () => {
    recurrenceScopeOpportunityActions.reset();
    const id = recurrenceScopeOpportunityActions.begin({
      kind: "delete",
      original,
      source: "local",
    });

    recurrenceScopeOpportunityActions.dismiss(id);

    expect(isRecurrenceScopeEditAskDeclined(original.id)).toBe(false);
  });

  it("clear() leaves the ask undeclined", () => {
    recurrenceScopeOpportunityActions.reset();
    recurrenceScopeOpportunityActions.begin({
      kind: "replace",
      original,
      input: replaceInput(),
      source: "local",
    });

    recurrenceScopeOpportunityActions.clear();

    expect(isRecurrenceScopeEditAskDeclined(original.id)).toBe(false);
  });

  it("promotion drops an existing decline for the instance", () => {
    recurrenceScopeOpportunityActions.reset();
    const replaceId = recurrenceScopeOpportunityActions.begin({
      kind: "replace",
      original,
      input: replaceInput(),
      source: "local",
    });
    recurrenceScopeOpportunityActions.dismiss(replaceId);
    expect(isRecurrenceScopeEditAskDeclined(original.id)).toBe(true);

    // Now promote a delete
    const deleteId = recurrenceScopeOpportunityActions.begin({
      kind: "delete",
      original,
      source: "local",
    });
    recurrenceScopeOpportunityActions.requestPromotion(deleteId, "all");
    recurrenceScopeOpportunityActions.claimPromotion();

    expect(isRecurrenceScopeEditAskDeclined(original.id)).toBe(false);
  });

  it("reset() clears both the opportunity and the declined set", () => {
    recurrenceScopeOpportunityActions.reset();
    const id = recurrenceScopeOpportunityActions.begin({
      kind: "replace",
      original,
      input: replaceInput(),
      source: "local",
    });
    recurrenceScopeOpportunityActions.dismiss(id);

    recurrenceScopeOpportunityActions.reset();

    expect(isRecurrenceScopeEditAskDeclined(original.id)).toBe(false);
    expect(
      useRecurrenceScopeOpportunityStore.getState().opportunity,
    ).toBeNull();
    expect(
      useRecurrenceScopeOpportunityStore.getState().declinedEditInstanceIds
        .size,
    ).toBe(0);
  });
});

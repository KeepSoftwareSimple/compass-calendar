import { type GoogleSyncConnectionSummary } from "@core/types/user.types";
import { eventGridFirstImportFlags } from "@web/grid/event-grid-import-overlay";
import { describe, expect, it } from "bun:test";

const firstImport: GoogleSyncConnectionSummary = {
  id: "c1",
  state: "importing",
  stateReason: null,
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail: "a@example.com",
  connectionState: "IMPORTING",
  canSuggestContacts: false,
};

const established: GoogleSyncConnectionSummary = {
  ...firstImport,
  lastHealthyAt: "2026-09-01T00:00:00.000Z",
};

describe("eventGridFirstImportFlags", () => {
  it("shows the scouting overlay only for an empty first import", () => {
    expect(
      eventGridFirstImportFlags({
        connection: firstImport,
        googleState: "IMPORTING",
        hasVisibleEvents: false,
        queryReady: true,
      }),
    ).toEqual({ isImportingEmpty: true, isImportFailed: false });
  });

  it("does not treat routine catch-up on an established account as a first import", () => {
    expect(
      eventGridFirstImportFlags({
        connection: established,
        googleState: "IMPORTING",
        hasVisibleEvents: false,
        queryReady: true,
      }),
    ).toEqual({ isImportingEmpty: false, isImportFailed: false });
  });

  it("hides both overlays until the query is ready", () => {
    expect(
      eventGridFirstImportFlags({
        connection: firstImport,
        googleState: "IMPORTING",
        hasVisibleEvents: false,
        queryReady: false,
      }),
    ).toEqual({ isImportingEmpty: false, isImportFailed: false });
  });

  it("shows the failed overlay when the first import never became healthy", () => {
    expect(
      eventGridFirstImportFlags({
        connection: {
          ...firstImport,
          state: "delayed",
          connectionState: "ATTENTION",
        },
        googleState: "ATTENTION",
        hasVisibleEvents: false,
        queryReady: true,
      }),
    ).toEqual({ isImportingEmpty: false, isImportFailed: true });
  });
});

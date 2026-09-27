import { type ConnectionStateReason } from "@core/types/sync/connection.contracts";
import {
  attentionFallbackCopy,
  connectionHealthCopy,
  connectionHealthNextAction,
  credentialKindForConnection,
  nameAccountInCopy,
  OAUTH_RECONNECT_COPY,
  pickAggregateSidebarStatus,
} from "./connection-health-copy.util";
import { CONSENT_REQUIRED_COPY } from "./provider-copy.util";
import { describe, expect, it } from "bun:test";

const REASONS: ConnectionStateReason[] = [
  "authorizationRevoked",
  "authorizationExpired",
  "insufficientScopes",
  "consentRequired",
  "workOverdue",
  "providerErrors",
];

describe("connectionHealthCopy", () => {
  for (const stateReason of REASONS) {
    it(`returns whole oauth settings copy for reason ${stateReason}`, () => {
      const copy = connectionHealthCopy({
        state: "actionRequired",
        stateReason,
        credentialKind: "oauthRedirect",
        surface: "settings",
      });
      expect(copy).toBeTruthy();
      expect(copy).not.toContain("—");
    });
  }

  for (const stateReason of [
    "authorizationRevoked",
    "authorizationExpired",
    "insufficientScopes",
  ] as const) {
    it(`returns whole password settings copy for reason ${stateReason}`, () => {
      const copy = connectionHealthCopy({
        state: "actionRequired",
        stateReason,
        credentialKind: "credentialForm",
        surface: "settings",
      });
      expect(copy).toBeTruthy();
      expect(copy).not.toMatch(/reconnect google/i);
      expect(copy).toMatch(/app-specific password/i);
    });
  }

  it("keeps Google oauth reconnect copy byte-identical", () => {
    for (const stateReason of [
      "authorizationRevoked",
      "authorizationExpired",
      "insufficientScopes",
    ] as const) {
      expect(
        connectionHealthCopy({
          state: "actionRequired",
          stateReason,
          credentialKind: "oauthRedirect",
          surface: "settings",
        }),
      ).toBe(OAUTH_RECONNECT_COPY);
    }
  });

  it("renders consentRequired copy whole", () => {
    expect(
      connectionHealthCopy({
        state: "actionRequired",
        stateReason: "consentRequired",
        credentialKind: "oauthRedirect",
        surface: "settings",
      }),
    ).toBe(CONSENT_REQUIRED_COPY);
  });

  it("renders delayed workOverdue settings copy whole", () => {
    expect(
      connectionHealthCopy({
        state: "delayed",
        stateReason: "workOverdue",
        credentialKind: "oauthRedirect",
        surface: "settings",
        lastUpdatedSuffix: " Last updated 15 minutes ago.",
      }),
    ).toBe(
      "Calendar updates are taking longer than usual. Last updated 15 minutes ago. Try Refresh, or reconnect if this continues.",
    );
  });

  it("renders delayed providerErrors settings copy whole", () => {
    expect(
      connectionHealthCopy({
        state: "delayed",
        stateReason: "providerErrors",
        credentialKind: "oauthRedirect",
        surface: "settings",
        lastUpdatedSuffix: " Last updated 15 minutes ago.",
      }),
    ).toBe(
      "Couldn't update your calendar. Last updated 15 minutes ago. Try Refresh, or reconnect if this continues.",
    );
  });

  it("renders delayed workOverdue sidebar copy whole", () => {
    expect(
      connectionHealthCopy({
        state: "delayed",
        stateReason: "workOverdue",
        credentialKind: "oauthRedirect",
        surface: "sidebarShort",
      }),
    ).toBe("Calendar updates are delayed");
  });

  it("renders delayed providerErrors sidebar copy whole", () => {
    expect(
      connectionHealthCopy({
        state: "delayed",
        stateReason: "providerErrors",
        credentialKind: "credentialForm",
        surface: "sidebarShort",
      }),
    ).toBe("Couldn't update your calendar");
  });
});

describe("connectionHealthNextAction", () => {
  for (const stateReason of REASONS) {
    it(`returns a next action for oauth reason ${stateReason}`, () => {
      expect(
        connectionHealthNextAction(
          "actionRequired",
          stateReason,
          "oauthRedirect",
        ),
      ).not.toBeNull();
    });
  }

  for (const stateReason of [
    "authorizationRevoked",
    "authorizationExpired",
    "insufficientScopes",
  ] as const) {
    it(`returns updatePassword for password reason ${stateReason}`, () => {
      expect(
        connectionHealthNextAction(
          "actionRequired",
          stateReason,
          "credentialForm",
        ),
      ).toBe("updatePassword");
    });
  }

  it("returns learnMore for consentRequired", () => {
    expect(
      connectionHealthNextAction(
        "actionRequired",
        "consentRequired",
        "oauthRedirect",
      ),
    ).toBe("learnMore");
  });

  it("returns refresh for delayed work", () => {
    expect(
      connectionHealthNextAction("delayed", "workOverdue", "oauthRedirect"),
    ).toBe("refresh");
  });
});

describe("credentialKindForConnection", () => {
  it("derives credentialForm for Apple connections", () => {
    expect(credentialKindForConnection({ provider: "apple" })).toBe(
      "credentialForm",
    );
  });

  it("derives oauthRedirect for Google connections", () => {
    expect(credentialKindForConnection({ provider: "google" })).toBe(
      "oauthRedirect",
    );
  });
});

describe("nameAccountInCopy", () => {
  it("names the account for generic reconnect copy", () => {
    expect(nameAccountInCopy(OAUTH_RECONNECT_COPY, "a@example.com")).toBe(
      "a@example.com needs reconnecting",
    );
  });

  it("leaves specific copy unchanged", () => {
    expect(nameAccountInCopy(CONSENT_REQUIRED_COPY, "a@example.com")).toBe(
      CONSENT_REQUIRED_COPY,
    );
  });
});

describe("pickAggregateSidebarStatus", () => {
  it("names the account when two connections disagree", () => {
    const status = pickAggregateSidebarStatus([
      {
        connection: {
          id: "c1",
          provider: "google",
          state: "delayed",
          stateReason: "workOverdue",
          lastSyncedAt: null,
          lastHealthyAt: null,
          accountEmail: "work@example.com",
          connectionState: "ATTENTION",
          canSuggestContacts: false,
        },
        status: { variant: "warning", text: "Calendar updates are delayed" },
      },
      {
        connection: {
          id: "c2",
          provider: "microsoft",
          state: "actionRequired",
          stateReason: "authorizationRevoked",
          lastSyncedAt: null,
          lastHealthyAt: null,
          accountEmail: "home@example.com",
          connectionState: "RECONNECT_REQUIRED",
          canSuggestContacts: false,
        },
        status: { variant: "error", text: OAUTH_RECONNECT_COPY },
      },
    ]);

    expect(status).toEqual({
      variant: "error",
      text: "home@example.com needs reconnecting",
    });
  });
});

describe("attentionFallbackCopy", () => {
  it("returns the ATTENTION fallback whole", () => {
    expect(attentionFallbackCopy()).toBe(
      "Calendar updates are taking longer than usual. Try Refresh, or reconnect if this continues.",
    );
  });
});

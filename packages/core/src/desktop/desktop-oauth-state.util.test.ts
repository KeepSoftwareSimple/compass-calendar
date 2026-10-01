import {
  buildDesktopOAuthRelayUrl,
  buildOAuthStateForClient,
  DESKTOP_OAUTH_STATE_PREFIX,
  hasDesktopOAuthStateMarker,
  parseDesktopAuthDeepLink,
} from "@core/desktop/desktop-oauth-state.util";
import { describe, expect, it } from "bun:test";

describe("desktop oauth state", () => {
  it("prefixes state when the client is desktop", () => {
    const state = buildOAuthStateForClient(true);
    expect(state.startsWith(DESKTOP_OAUTH_STATE_PREFIX)).toBe(true);
    expect(hasDesktopOAuthStateMarker(state)).toBe(true);
  });

  it("leaves browser state unprefixed", () => {
    const state = buildOAuthStateForClient(false);
    expect(state.startsWith(DESKTOP_OAUTH_STATE_PREFIX)).toBe(false);
    expect(hasDesktopOAuthStateMarker(state)).toBe(false);
  });

  it("builds compass auth callback deep links", () => {
    expect(
      buildDesktopOAuthRelayUrl(
        "google",
        "?code=abc&state=compass-desktop%3Aid",
      ),
    ).toBe(
      "compass://auth/google/callback?code=abc&state=compass-desktop%3Aid",
    );
  });

  it("parses the same deep-link shape the relay builds", () => {
    const url = buildDesktopOAuthRelayUrl(
      "microsoft",
      "?code=abc&state=compass-desktop%3Aid",
    );
    expect(parseDesktopAuthDeepLink(url)).toEqual({
      provider: "microsoft",
      query: "?code=abc&state=compass-desktop%3Aid",
    });
    expect(
      parseDesktopAuthDeepLink(buildDesktopOAuthRelayUrl("apple", "")),
    ).toEqual({
      provider: "apple",
      query: "",
    });
  });

  it("ignores non-auth compass links", () => {
    expect(parseDesktopAuthDeepLink("compass://agenda")).toBeNull();
  });
});

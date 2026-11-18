import * as signupFunnel from "@web/auth/posthog/signup-funnel";
import * as trackModule from "@web/auth/posthog/track";
import { recordOAuthSignInCallbackLanding } from "@web/auth/providers/authorization/record-oauth-signin-callback-landing";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

describe("recordOAuthSignInCallbackLanding", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("relays then records the client landing events in order", () => {
    const calls: string[] = [];
    const fetchMock = mock(async () => {
      calls.push("relay");
      return new Response(null, { status: 204 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const stepSpy = spyOn(signupFunnel, "trackSignupStep").mockImplementation(
      () => {
        calls.push("step");
      },
    );
    const trackSpy = spyOn(trackModule, "track").mockImplementation(() => {
      calls.push("track");
    });

    recordOAuthSignInCallbackLanding("google", "?state=abc&code=1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall as unknown as [string, RequestInit];
    expect(url).toContain("/api/auth/google/callback?state=abc");
    expect(init.headers).toEqual(
      expect.objectContaining({ "X-Compass-OAuth-Telemetry": "1" }),
    );
    expect(stepSpy).toHaveBeenCalledWith("oauth_callback_returned", {
      method: "google",
    });
    expect(trackSpy).toHaveBeenCalledWith("oauth_callback_received", {
      provider: "google",
    });
    expect(calls).toEqual(["relay", "step", "track"]);

    stepSpy.mockRestore();
    trackSpy.mockRestore();
  });

  it("does not relay an empty callback query", () => {
    const fetchMock = mock(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const stepSpy = spyOn(signupFunnel, "trackSignupStep").mockImplementation(
      () => undefined,
    );
    const trackSpy = spyOn(trackModule, "track").mockImplementation(
      () => undefined,
    );

    recordOAuthSignInCallbackLanding("google", "");

    expect(fetchMock).not.toHaveBeenCalled();

    stepSpy.mockRestore();
    trackSpy.mockRestore();
  });

  it("does not relay a whitespace-only callback query", () => {
    const fetchMock = mock(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const stepSpy = spyOn(signupFunnel, "trackSignupStep").mockImplementation(
      () => undefined,
    );
    const trackSpy = spyOn(trackModule, "track").mockImplementation(
      () => undefined,
    );

    recordOAuthSignInCallbackLanding("google", "?state=%20&code=");

    expect(fetchMock).not.toHaveBeenCalled();

    stepSpy.mockRestore();
    trackSpy.mockRestore();
  });

  it("does not relay Apple callbacks because the form_post path already recorded them", () => {
    const fetchMock = mock(async () => new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const stepSpy = spyOn(signupFunnel, "trackSignupStep").mockImplementation(
      () => undefined,
    );
    const trackSpy = spyOn(trackModule, "track").mockImplementation(
      () => undefined,
    );

    recordOAuthSignInCallbackLanding("apple", "?state=abc&code=1");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stepSpy).toHaveBeenCalled();
    expect(trackSpy).toHaveBeenCalled();

    stepSpy.mockRestore();
    trackSpy.mockRestore();
  });
});

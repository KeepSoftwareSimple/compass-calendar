import {
  getCommandPalettePlaceholder,
  getMoreCommandPaletteSections,
  PERSONAL_ONBOARDING_URL,
} from "@web/components/CommandPalette/more.cmd.constants";
import {
  feedbackActions,
  selectFeedbackRequest,
  useFeedbackStore,
} from "@web/components/Feedback/feedback.store";
import {
  selectIsAboutOpen,
  selectOverlayOpenedFromPalette,
  useSettingsStore,
} from "@web/settings/settings.store";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

describe("getMoreCommandPaletteSections", () => {
  const originalWindowOpen = window.open;
  const mockWindowOpen = mock();

  beforeEach(() => {
    feedbackActions.close();
    useSettingsStore.setState({
      isAboutOpen: false,
      overlayOpenedFromPalette: false,
    });
    mockWindowOpen.mockClear();
    window.open = mockWindowOpen;
  });

  afterEach(() => {
    window.open = originalWindowOpen;
  });

  it("omits feedback commands when PostHog is not enabled", () => {
    const [section] = getMoreCommandPaletteSections("week", false);

    expect(section.items).toHaveLength(2);
    expect(section.items[0].label).toBe("Book personal onboarding");
    expect(section.items[1].label).toBe("About Compass");
    expect(getCommandPalettePlaceholder("day", false)).toBe(
      "Search commands or events",
    );
    expect(getCommandPalettePlaceholder("week", false)).toBe(
      "Search commands or events",
    );
  });

  it("opens the feedback request from the cloud command", () => {
    const [section] = getMoreCommandPaletteSections("day", true);
    expect(section.items).toHaveLength(3);
    expect(
      section.items.find((item) => item.id === "report-bug"),
    ).toBeUndefined();
    const shareFeedback = section.items.find(
      (item) => item.id === "share-feedback",
    );

    shareFeedback?.onClick?.();
    expect(selectFeedbackRequest(useFeedbackStore.getState())).toEqual({
      view: "day",
    });
    expect(selectOverlayOpenedFromPalette(useSettingsStore.getState())).toBe(
      true,
    );
    expect(getCommandPalettePlaceholder("day", true)).toBe(
      "Search commands or events",
    );
  });

  it("offers feedback from Life", () => {
    const [section] = getMoreCommandPaletteSections("life", true);
    section.items.find((item) => item.id === "share-feedback")?.onClick?.();

    expect(selectFeedbackRequest(useFeedbackStore.getState())).toEqual({
      view: "life",
    });
    expect(getCommandPalettePlaceholder("life", true)).toBe(
      "Search commands or events",
    );
  });

  it("opens the About modal from the about command", () => {
    const [section] = getMoreCommandPaletteSections("week", false);
    const about = section.items.find((item) => item.id === "about");

    about?.onClick?.();

    expect(selectIsAboutOpen(useSettingsStore.getState())).toBe(true);
    expect(selectOverlayOpenedFromPalette(useSettingsStore.getState())).toBe(
      true,
    );
  });

  it("opens the personal onboarding Calendly link in a new tab", () => {
    const [section] = getMoreCommandPaletteSections("week", false);
    const bookOnboarding = section.items.find(
      (item) => item.id === "book-personal-onboarding",
    );

    bookOnboarding?.onClick?.();

    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    expect(mockWindowOpen).toHaveBeenCalledWith(
      PERSONAL_ONBOARDING_URL,
      "_blank",
      "noopener,noreferrer",
    );
  });
});

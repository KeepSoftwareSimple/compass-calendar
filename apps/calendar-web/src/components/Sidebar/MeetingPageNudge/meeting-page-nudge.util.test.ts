import {
  hasDismissedMeetingPageNudge,
  markMeetingPageNudgeDismissed,
} from "./meeting-page-nudge.util";
import { beforeEach, describe, expect, it } from "bun:test";

describe("meeting-page-nudge.util", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is not dismissed until markMeetingPageNudgeDismissed is called", () => {
    expect(hasDismissedMeetingPageNudge()).toBe(false);

    markMeetingPageNudgeDismissed();

    expect(hasDismissedMeetingPageNudge()).toBe(true);
  });
});

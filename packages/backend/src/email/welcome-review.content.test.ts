import { ObjectId } from "mongodb";
import { type Schema_User } from "@core/types/user.types";
import { CONFIG } from "@backend/common/constants/config.constants";
import { EmailSendRecordSchema } from "@backend/email/email-send.record";
import * as reflectionContext from "@backend/email/reflection-context";
import { prepareWelcomeReviewEmail } from "@backend/email/welcome-review.content";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const original = { ...CONFIG };
const user = {
  _id: new ObjectId(),
  email: "person@example.com",
  name: "Person",
  firstName: "Person",
  lastName: "",
  locale: "en",
  reflectionPreferences: {
    enabled: true,
    timeZone: "America/Denver",
    excludedCalendarIds: [],
  },
} satisfies Schema_User & { _id: ObjectId };
const now = new Date();
const row = EmailSendRecordSchema.parse({
  _id: "welcome-review",
  userId: user._id,
  sequence: "welcome",
  stepKey: "weekly-review",
  status: "queued",
  sendAt: now,
  attemptCount: 0,
  nextAttemptAt: now,
  lastError: null,
  providerMessageId: null,
  sentAt: null,
  deliveredAt: null,
  createdAt: now,
  updatedAt: now,
});
const unsubscribe = {
  httpsUrl: "https://example.com/unsubscribe",
  listUnsubscribeHeader: "",
};

describe("onboarding weekly review", () => {
  beforeEach(() =>
    Object.assign(CONFIG, {
      EMAIL_PROVIDER: "log",
      REFLECTION_ENABLED: true,
      REFLECTION_ROLLOUT_ENABLED: true,
    }),
  );
  afterEach(() => {
    Object.assign(CONFIG, original);
    mock.restore();
  });

  it("includes the user's real review after a brief introduction", async () => {
    const prepare = spyOn(
      reflectionContext,
      "prepareReflection",
    ).mockResolvedValue({
      subject: "Weekly review (45)",
      html: "<!doctype html><html><body><p>A trip</p></body></html>",
      text: "A trip",
      pdfBase64: "pdf",
      memoryIds: [],
      calendarIds: [],
      lifeRevision: 0,
    });
    const result = await prepareWelcomeReviewEmail(row, user, unsubscribe);
    expect(result.subject).toBe("Your weekly review (5/5)");
    expect(result.text).toContain("Sunday at 10:30 a.m.");
    expect(result.text).toContain("Settings > Notifications");
    expect(result.text).toEndWith("A trip");
    expect(result.html).toContain("<body><p><strong>A little time to reflect");
    expect(result.html).toContain("<p>A trip</p>");
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        reflection: expect.objectContaining({ timeZone: "America/Denver" }),
      }),
      user,
      unsubscribe.httpsUrl,
      { preview: true, allowIncompleteHistory: true },
    );
    expect(result.pdfBase64).toBe("pdf");
  });

  it("introduces settings without reading history when enrollment is unavailable", async () => {
    const prepare = spyOn(reflectionContext, "prepareReflection");
    const result = await prepareWelcomeReviewEmail(
      row,
      { ...user, reflectionPreferences: undefined },
      unsubscribe,
    );
    expect(prepare).not.toHaveBeenCalled();
    expect(result.text).toContain("settings=notifications");
    expect(result.subject).toContain("(5/5)");
  });
});

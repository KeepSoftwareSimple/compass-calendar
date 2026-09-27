import {
  captureFeedback,
  FEEDBACK_SURVEY,
} from "@web/components/Feedback/feedback.posthog";
import { describe, expect, it, mock } from "bun:test";

describe("captureFeedback", () => {
  const posthog = {
    get_distinct_id: () => "user-123",
    get_session_id: () => "session-456",
  };

  it("waits for an accepted survey response with app context", async () => {
    const send = mock((input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve({ ok: true, status: 200 });
    });

    await captureFeedback(
      posthog,
      {
        details: "Keep completed events visible.",
        view: "week",
      },
      { apiKey: "test-key", host: "https://us.i.posthog.com", send },
    );

    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0];
    expect(String(url)).toEndWith("/i/v0/e/");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      api_key: expect.any(String),
      distinct_id: "user-123",
      event: "survey sent",
      properties: {
        $session_id: "session-456",
        $survey_id: FEEDBACK_SURVEY.id,
        $survey_name: FEEDBACK_SURVEY.name,
        $survey_questions: [FEEDBACK_SURVEY.question],
        $survey_response: "Keep completed events visible.",
        [`$survey_response_${FEEDBACK_SURVEY.question.id}`]:
          "Keep completed events visible.",
        $survey_completed: true,
        app_version: expect.any(String),
        app_view: "week",
        feedback_source: "command_palette",
        feedback_type: "feedback",
      },
    });
  });

  it("fails when PostHog rejects the request", async () => {
    await expect(
      captureFeedback(
        posthog,
        {
          details: "Keep my report open so I can retry.",
          view: "day",
        },
        {
          apiKey: "test-key",
          host: "https://us.i.posthog.com",
          send: mock(() => Promise.resolve({ ok: false, status: 503 })),
        },
      ),
    ).rejects.toThrow("PostHog rejected feedback with status 503");
  });
});

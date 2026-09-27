import { ENV_WEB } from "@web/common/constants/env.constants";
import { APP_VERSION } from "@web/common/constants/version.constants";
import { type FeedbackRequest } from "@web/components/Feedback/feedback.store";

export const FEEDBACK_SURVEY = {
  id: "019a13d7-eb0b-0000-df78-ef3df70db610",
  name: "Open feedback",
  question: {
    id: "d0154ae2-c312-4d19-9d03-bb28eb56d6e3",
    question: "What would you like to share?",
  },
} as const;

interface PostHogFeedbackClient {
  get_distinct_id: () => string;
  get_session_id: () => string;
}

interface FeedbackSubmission extends FeedbackRequest {
  details: string;
}

type FeedbackSender = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status">>;

interface FeedbackDeliveryOptions {
  apiKey?: string;
  host?: string;
  send?: FeedbackSender;
}

export async function captureFeedback(
  posthog: PostHogFeedbackClient,
  { details, view }: FeedbackSubmission,
  {
    apiKey = ENV_WEB.POSTHOG_KEY,
    host = ENV_WEB.POSTHOG_HOST,
    send = fetch,
  }: FeedbackDeliveryOptions = {},
): Promise<void> {
  if (!apiKey || !host) throw new Error("PostHog is not configured");

  const response = await send(new URL("/i/v0/e/", host), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      distinct_id: posthog.get_distinct_id(),
      event: "survey sent",
      properties: {
        $session_id: posthog.get_session_id(),
        $survey_id: FEEDBACK_SURVEY.id,
        $survey_name: FEEDBACK_SURVEY.name,
        $survey_questions: [FEEDBACK_SURVEY.question],
        $survey_response: details,
        [`$survey_response_${FEEDBACK_SURVEY.question.id}`]: details,
        $survey_completed: true,
        app_version: APP_VERSION,
        app_view: view,
        feedback_source: "command_palette",
        feedback_type: "feedback",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`PostHog rejected feedback with status ${response.status}`);
  }
}

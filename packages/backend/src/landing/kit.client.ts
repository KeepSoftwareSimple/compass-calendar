const KIT_SUBSCRIBERS_URL = "https://api.kit.com/v4/subscribers";

/**
 * Adds an email to the Kit subscriber list. Kit treats this as an upsert, and
 * a subscriber created through the API starts active, so there is no
 * confirmation email for the visitor to click first.
 */
export async function addKitSubscriber(
  email: string,
  apiKey: string,
): Promise<void> {
  const response = await fetch(KIT_SUBSCRIBERS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kit-Api-Key": apiKey,
    },
    body: JSON.stringify({ email_address: email }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Kit subscriber create failed (${response.status})`);
  }
}

/** Polls the SuperTokens core `/hello` endpoint until it responds or times out. */
export async function waitForSupertokensCore(
  uri = process.env["SUPERTOKENS_URI"] ?? "http://127.0.0.1:3567",
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const helloUrl = `${uri.replace(/\/$/, "")}/hello`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(helloUrl);
      if (response.ok) {
        const body = await response.text();
        if (body.includes("Hello")) {
          return;
        }
      }
    } catch {
      // Core still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`SuperTokens core not reachable at ${helloUrl}`);
}

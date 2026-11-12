import { providerHttpResponseFacts } from "@sync/providers/provider-transient-error.util";
import { redactedCause } from "@sync/safety/redact-error";

export function microsoftStatus(error: unknown): number | undefined {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  return typeof status === "number" ? status : undefined;
}

export function microsoftErrorCode(error: unknown): string | undefined {
  const code = (
    error as { response?: { data?: { error?: { code?: unknown } } } }
  )?.response?.data?.error?.code;
  return typeof code === "string" ? code : undefined;
}

export function isMicrosoftTransient(
  error: unknown,
  status: number | undefined = microsoftStatus(error),
): boolean {
  if (status === undefined || status === 429 || status >= 500) return true;
  return false;
}

export function microsoftFailureCause(error: unknown): Error | undefined {
  const status = microsoftStatus(error);
  const code = microsoftErrorCode(error);
  const { contentType } = providerHttpResponseFacts(error);
  const facts = [
    ...(status === undefined ? [] : [`HTTP ${status}`]),
    ...(code ? [code] : []),
    ...(contentType === undefined ? [] : [`content-type ${contentType}`]),
  ];
  if (facts.length === 0) return redactedCause(error);
  const message = error instanceof Error ? error.message : null;
  return new Error(
    message ? `${message} (${facts.join(", ")})` : facts.join(", "),
  );
}

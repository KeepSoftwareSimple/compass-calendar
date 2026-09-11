#!/usr/bin/env bun
/**
 * Set up the Microsoft leg of live-provider-smoke in one run.
 *
 * Usage:
 *   bun run microsoft:mint-token [--repo owner/name] [--env provider-smoke]
 *                                [--redirect-uri URL] [--print-only]
 *
 * Reads the client id from MICROSOFT_CLIENT_ID or from the target GitHub
 * Environment's MICROSOFT_CLIENT_ID variable, takes the client secret from
 * MICROSOFT_CLIENT_SECRET or a hidden prompt, opens Microsoft sign-in, exchanges
 * the code, proves the refresh token refreshes, makes sure the account has a
 * writable `compass-smoke` calendar, and writes MICROSOFT_CLIENT_ID,
 * MICROSOFT_CLIENT_SECRET and SMOKE_MICROSOFT_REFRESH_TOKEN to that Environment
 * with `gh`. `--print-only` stops before writing and prints the token instead.
 *
 * The default redirect URI (http://localhost:3010/sync/microsoft) is one of the
 * URIs registered on the Entra app. Sign in with the dedicated smoke-test
 * account, not a real user's. The script never sees the account password: it
 * only opens Microsoft's own sign-in page and reads back the redirect.
 */
import { SMOKE_CALENDAR_NAME } from "@sync/providers/__contract__/live-provider-smoke";
import { MicrosoftAuthAdapter } from "@sync/providers/microsoft/microsoft-auth.adapter";
import { MicrosoftCalendarAdapter } from "@sync/providers/microsoft/microsoft-calendar.adapter";
import { microsoftGraphRequest } from "@sync/providers/microsoft/microsoft-graph-request";
import { MICROSOFT_GRAPH_BASE_URL } from "@sync/providers/microsoft/microsoft-http.constants";
import { type DiscoveredCalendar } from "@sync/providers/provider-calendar.port";
import { randomBytes } from "node:crypto";

const DEFAULT_REDIRECT_URI = "http://localhost:3010/sync/microsoft";
const DEFAULT_ENVIRONMENT = "provider-smoke";
const REQUIRED_SCOPE = "Calendars.ReadWrite";

export interface MintArgs {
  readonly repo: string | null;
  readonly environment: string;
  readonly redirectUri: string;
  readonly printOnly: boolean;
}

export function parseArgs(argv: readonly string[]): MintArgs {
  const value = (flag: string): string | null => {
    const at = argv.indexOf(flag);
    return at >= 0 && argv[at + 1] ? argv[at + 1]! : null;
  };
  return {
    repo: value("--repo"),
    environment: value("--env") ?? DEFAULT_ENVIRONMENT,
    redirectUri: value("--redirect-uri") ?? DEFAULT_REDIRECT_URI,
    printOnly: argv.includes("--print-only"),
  };
}

// Same predicate the smoke suite uses, so what this script accepts is what
// the nightly job will find.
export function pickSmokeCalendar(
  calendars: readonly DiscoveredCalendar[],
): DiscoveredCalendar | undefined {
  return calendars.find(
    (calendar) =>
      calendar.displayName === SMOKE_CALENDAR_NAME &&
      calendar.active &&
      calendar.capabilities.canWriteEvents,
  );
}

// Microsoft returns scopes either bare ("Calendars.ReadWrite") or as full
// resource URIs ("https://graph.microsoft.com/Calendars.ReadWrite").
export function hasScope(scopes: readonly string[], scope: string): boolean {
  return scopes.some(
    (granted) => granted === scope || granted.endsWith(`/${scope}`),
  );
}

function gh(args: string[], stdin?: string): string {
  const result = Bun.spawnSync({
    cmd: ["gh", ...args],
    stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `gh ${args.join(" ")} failed: ${result.stderr.toString().trim()}`,
    );
  }
  return result.stdout.toString().trim();
}

function resolveRepo(args: MintArgs): string {
  if (args.repo) return args.repo;
  return gh([
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]);
}

function resolveClientId(repo: string, environment: string): string {
  const fromEnv = process.env["MICROSOFT_CLIENT_ID"]?.trim();
  if (fromEnv) return fromEnv;
  try {
    return gh([
      "api",
      `repos/${repo}/environments/${environment}/variables/MICROSOFT_CLIENT_ID`,
      "--jq",
      ".value",
    ]);
  } catch (error) {
    throw new Error(
      `Set MICROSOFT_CLIENT_ID, or create that variable on the ${environment} Environment first (${error instanceof Error ? error.message : error})`,
    );
  }
}

async function readHidden(label: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    throw new Error("Set MICROSOFT_CLIENT_SECRET when stdin is not a terminal");
  }
  process.stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "") {
          cleanup();
          reject(new Error("Aborted"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value.trim());
          return;
        }
        if (char === "" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function resolveClientSecret(): Promise<string> {
  const fromEnv = process.env["MICROSOFT_CLIENT_SECRET"]?.trim();
  if (fromEnv) return fromEnv;
  const secret = await readHidden(
    "Paste the Microsoft client secret (input is hidden), then press Enter: ",
  );
  if (!secret) throw new Error("No client secret entered");
  return secret;
}

function openBrowser(url: string): void {
  if (process.platform !== "darwin") return;
  try {
    Bun.spawn({ cmd: ["open", url], stdout: "ignore", stderr: "ignore" });
  } catch {
    // The URL is printed either way.
  }
}

async function waitForCallback(
  redirect: string,
  state: string,
): Promise<string> {
  const url = new URL(redirect);
  return new Promise((resolve, reject) => {
    const server = Bun.serve({
      port: Number(url.port || 80),
      hostname: url.hostname,
      fetch(request) {
        const reqUrl = new URL(request.url);
        if (reqUrl.pathname !== url.pathname) {
          return new Response("Not found", { status: 404 });
        }
        const error = reqUrl.searchParams.get("error");
        const returnedState = reqUrl.searchParams.get("state");
        const code = reqUrl.searchParams.get("code");
        queueMicrotask(() => server.stop());
        if (error) {
          reject(
            new Error(
              `Microsoft returned an error: ${error} - ${reqUrl.searchParams.get("error_description")}`,
            ),
          );
        } else if (returnedState !== state) {
          reject(new Error("OAuth state mismatch, aborting"));
        } else if (!code) {
          reject(new Error("Microsoft redirect carried no authorization code"));
        } else {
          resolve(code);
        }
        return new Response(
          error
            ? "Sign-in failed. You can close this tab and check the terminal."
            : "Signed in. You can close this tab and return to the terminal.",
          { headers: { "Content-Type": "text/plain" } },
        );
      },
    });
  });
}

async function ensureSmokeCalendar(accessToken: string): Promise<string> {
  const discovery = await new MicrosoftCalendarAdapter().discoverCalendars({
    accessToken,
  });
  const existing = pickSmokeCalendar(discovery.calendars);
  if (existing) {
    console.log(
      `Found writable "${SMOKE_CALENDAR_NAME}" calendar: ${existing.providerCalendarId}`,
    );
    return existing.providerCalendarId;
  }
  const created = await microsoftGraphRequest<{ id: string }>({
    accessToken,
    method: "POST",
    url: `${MICROSOFT_GRAPH_BASE_URL}/me/calendars`,
    body: { name: SMOKE_CALENDAR_NAME },
    fallbackError: "microsoft_calendar_create_failed",
  });
  console.log(
    `Created "${SMOKE_CALENDAR_NAME}" calendar on this account: ${created.id}`,
  );
  return created.id;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repo = resolveRepo(args);
  console.log(`Target: ${repo}, Environment ${args.environment}`);

  const clientId = resolveClientId(repo, args.environment);
  const clientSecret = await resolveClientSecret();
  const adapter = new MicrosoftAuthAdapter(clientId, clientSecret);
  const state = randomBytes(16).toString("hex");

  const authorizeUrl = adapter.buildAuthorizationUrl({
    state,
    redirectUri: args.redirectUri,
  });
  console.log(
    "\nSign in with the smoke-test account in the browser tab that opens.",
  );
  console.log("If nothing opens, use this URL:\n");
  console.log(authorizeUrl);
  console.log(`\nWaiting for the redirect to ${args.redirectUri} ...`);
  openBrowser(authorizeUrl);

  const code = await waitForCallback(args.redirectUri, state);
  const authorization = await adapter.exchangeAuthorizationCode({
    code,
    redirectUri: args.redirectUri,
  });
  console.log(
    "\nSigned in as:",
    authorization.account.email ?? "(no email claim)",
  );

  // The nightly job's first call. Failing here is the whole point of the check.
  const refreshed = await adapter.refreshAccessToken({
    refreshToken: authorization.refreshToken,
  });
  const scopes = refreshed.grantedScopes;
  console.log(
    "Refresh verified. Granted scopes:",
    scopes.join(" ") || "(none reported)",
  );
  if (scopes.length > 0 && !hasScope(scopes, REQUIRED_SCOPE)) {
    throw new Error(
      `Microsoft granted no ${REQUIRED_SCOPE} scope; the smoke suite cannot write events with this token`,
    );
  }

  await ensureSmokeCalendar(refreshed.accessToken);

  if (args.printOnly) {
    console.log(
      `\nSMOKE_MICROSOFT_REFRESH_TOKEN=${authorization.refreshToken}`,
    );
    return;
  }

  gh(
    [
      "variable",
      "set",
      "MICROSOFT_CLIENT_ID",
      "--env",
      args.environment,
      "--repo",
      repo,
    ],
    clientId,
  );
  gh(
    [
      "secret",
      "set",
      "MICROSOFT_CLIENT_SECRET",
      "--env",
      args.environment,
      "--repo",
      repo,
    ],
    clientSecret,
  );
  gh(
    [
      "secret",
      "set",
      "SMOKE_MICROSOFT_REFRESH_TOKEN",
      "--env",
      args.environment,
      "--repo",
      repo,
    ],
    authorization.refreshToken,
  );
  console.log(
    `\nWrote MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET and SMOKE_MICROSOFT_REFRESH_TOKEN to ${repo} / ${args.environment}.`,
  );
  console.log("Next: gh workflow run live-provider-smoke.yml");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof Error && error.cause instanceof Error) {
      console.error(`Cause: ${error.cause.message}`);
    }
    process.exit(1);
  });
}

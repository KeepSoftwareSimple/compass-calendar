#!/usr/bin/env bun
/**
 * Mint a Microsoft OAuth refresh token for the live-provider-smoke suite.
 *
 * Usage:
 *   bun packages/scripts/src/commands/microsoft-mint-refresh-token.ts [--redirect-uri URL]
 *
 * Reads MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET from the environment,
 * falling back to compass.yaml's `microsoft` section. Prints a Microsoft
 * sign-in URL, opens a local server to catch the OAuth callback, exchanges
 * the code for tokens, and prints the refresh token to set as
 * SMOKE_MICROSOFT_REFRESH_TOKEN on the provider-smoke GitHub Environment.
 *
 * The default redirect URI (http://localhost:3010/sync/microsoft) must
 * already be registered on the Entra app; it is one of the 8 the app has.
 * Sign in with the dedicated smoke-test Microsoft account, not a real user's.
 *
 * This script never sees your Microsoft password: it only opens a browser
 * to Microsoft's own sign-in page and reads back the redirect.
 */
import { loadCompassConfig } from "@core/config/compass.config";
import { MicrosoftAuthAdapter } from "@sync/providers/microsoft/microsoft-auth.adapter";
import { randomBytes } from "node:crypto";

const DEFAULT_REDIRECT_URI = "http://localhost:3010/sync/microsoft";

function credentials(): { clientId: string; clientSecret: string } {
  const envId = process.env["MICROSOFT_CLIENT_ID"]?.trim();
  const envSecret = process.env["MICROSOFT_CLIENT_SECRET"]?.trim();
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret };

  const config = loadCompassConfig().microsoft;
  const clientId = envId || config?.clientId?.trim();
  const clientSecret = envSecret || config?.clientSecret?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET (env or compass.yaml microsoft.*) before running this script",
    );
  }
  return { clientId, clientSecret };
}

function redirectUri(argv: string[]): string {
  const flag = argv.indexOf("--redirect-uri");
  return flag >= 0 && argv[flag + 1] ? argv[flag + 1]! : DEFAULT_REDIRECT_URI;
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

async function main(): Promise<void> {
  const { clientId, clientSecret } = credentials();
  const redirect = redirectUri(process.argv.slice(2));
  const adapter = new MicrosoftAuthAdapter(clientId, clientSecret);
  const state = randomBytes(16).toString("hex");

  const authorizeUrl = adapter.buildAuthorizationUrl({
    state,
    redirectUri: redirect,
  });

  console.log("Open this URL and sign in with the smoke-test account:\n");
  console.log(authorizeUrl);
  console.log(`\nWaiting for the redirect to ${redirect} ...`);

  const code = await waitForCallback(redirect, state);
  const authorization = await adapter.exchangeAuthorizationCode({
    code,
    redirectUri: redirect,
  });

  console.log(
    "\nSigned in as:",
    authorization.account.email ?? "(no email claim)",
  );
  console.log("Granted scopes:", authorization.grantedScopes.join(" "));
  console.log(`\nSMOKE_MICROSOFT_REFRESH_TOKEN=${authorization.refreshToken}`);
  console.log(
    '\nSet it with: gh secret set SMOKE_MICROSOFT_REFRESH_TOKEN --env provider-smoke --body "<token above>"',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

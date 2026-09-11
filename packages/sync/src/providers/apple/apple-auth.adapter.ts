import {
  CaldavClientError,
  type CaldavClientFactory,
  createCaldavClient,
  discoverCalendars,
} from "@sync/providers/apple/caldav-client";
import {
  type ProviderAuthAdapter,
  ProviderAuthError,
  type ProviderAuthorization,
  type RefreshedCredential,
} from "@sync/providers/provider-auth.port";

// Password credentials do not expire; custody never calls refresh for them, but
// the port still requires a far-future expiry when it does.
const PASSWORD_CREDENTIAL_EXPIRY = new Date("2099-12-31T23:59:59.999Z");

export interface CredentialValidationInput {
  readonly username: string;
  readonly secret: string;
}

export interface PasswordCredentialAuthAdapter extends ProviderAuthAdapter {
  validateCredential(input: CredentialValidationInput): Promise<void>;
}

export function isPasswordCredentialAuthAdapter(
  adapter: ProviderAuthAdapter,
): adapter is PasswordCredentialAuthAdapter {
  return "validateCredential" in adapter;
}

export class AppleAuthAdapter implements PasswordCredentialAuthAdapter {
  #makeClient: CaldavClientFactory;

  constructor(makeClient: CaldavClientFactory = createCaldavClient) {
    this.#makeClient = makeClient;
  }

  buildAuthorizationUrl(_input: {
    state: string;
    redirectUri: string;
    selectAccount?: boolean;
    loginHint?: string;
    extraScopes?: readonly string[];
  }): string {
    throw new ProviderAuthError(
      "unsupported",
      "Apple calendar connect does not use OAuth redirect",
    );
  }

  async exchangeAuthorizationCode(_input: {
    code: string;
    redirectUri: string;
  }): Promise<ProviderAuthorization> {
    throw new ProviderAuthError(
      "unsupported",
      "Apple calendar connect does not use OAuth redirect",
    );
  }

  async refreshAccessToken(input: {
    refreshToken: string;
  }): Promise<RefreshedCredential> {
    return {
      accessToken: input.refreshToken,
      expiresAt: PASSWORD_CREDENTIAL_EXPIRY,
      grantedScopes: [],
    };
  }

  async revoke(_input: { token: string }): Promise<void> {
    // Apple app-specific passwords have no revoke endpoint.
  }

  async validateCredential(input: CredentialValidationInput): Promise<void> {
    const client = this.#makeClient({
      username: input.username,
      password: input.secret,
    });
    try {
      await discoverCalendars(client, {
        username: input.username,
        password: input.secret,
      });
    } catch (error) {
      if (error instanceof CaldavClientError) {
        if (error.reason === "authExpired") {
          throw new ProviderAuthError(
            "authorizationRevoked",
            "Apple rejected the app-specific password",
            { cause: error },
          );
        }
        if (error.reason === "transient") {
          throw new ProviderAuthError(
            "refreshFailed",
            "Apple CalDAV throttled or refused credential validation",
            { cause: error },
          );
        }
      }
      throw error;
    }
  }
}

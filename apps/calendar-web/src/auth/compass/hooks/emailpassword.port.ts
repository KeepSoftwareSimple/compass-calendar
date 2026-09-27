import type EmailPassword from "supertokens-web-js/recipe/emailpassword";

type EmailPasswordPort = Pick<
  typeof EmailPassword,
  | "signUp"
  | "signIn"
  | "sendPasswordResetEmail"
  | "submitNewPassword"
  | "getResetPasswordTokenFromURL"
>;

/** Lazy require — eager import patches XMLHttpRequest and fights MSW. */
function createProductionEmailPasswordPort(): EmailPasswordPort {
  return require("supertokens-web-js/recipe/emailpassword")
    .default as EmailPasswordPort;
}

let emailPasswordPort: EmailPasswordPort | undefined;

export function getEmailPasswordPort(): EmailPasswordPort {
  emailPasswordPort ??= createProductionEmailPasswordPort();
  return emailPasswordPort;
}

export function registerEmailPasswordPort(port: EmailPasswordPort): void {
  emailPasswordPort = port;
}

export function resetEmailPasswordPort(): void {
  emailPasswordPort = undefined;
}

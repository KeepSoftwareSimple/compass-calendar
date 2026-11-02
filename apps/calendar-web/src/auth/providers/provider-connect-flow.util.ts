import { type ProviderKind } from "@core/types/sync/identity.contracts";

export type ConnectFlowKind = "oauthRedirect" | "credentialForm";

const CONNECT_FLOW_BY_KIND: Record<ProviderKind, ConnectFlowKind> = {
  google: "oauthRedirect",
  microsoft: "oauthRedirect",
  apple: "credentialForm",
};

export function connectFlowKind(kind: ProviderKind): ConnectFlowKind {
  return CONNECT_FLOW_BY_KIND[kind];
}

export function usesCredentialFormConnect(kind: ProviderKind): boolean {
  return connectFlowKind(kind) === "credentialForm";
}

// Providers whose consent screen can add the optional "contacts" feature
// (attendee suggestions from the account's address book).
const OFFERS_CONTACTS_BY_KIND: Record<ProviderKind, boolean> = {
  google: true,
  microsoft: true,
  apple: false,
};

export function offersContactsFeature(kind: ProviderKind): boolean {
  return OFFERS_CONTACTS_BY_KIND[kind];
}

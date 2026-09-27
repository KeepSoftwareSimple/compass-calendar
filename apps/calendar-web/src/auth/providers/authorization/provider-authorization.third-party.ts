import {
  type ProviderKind,
  SUPERTOKENS_THIRD_PARTY_TO_KIND,
  type SuperTokensThirdPartyId,
} from "@core/types/sync/identity.contracts";

const KIND_TO_THIRD_PARTY = Object.fromEntries(
  Object.entries(SUPERTOKENS_THIRD_PARTY_TO_KIND).map(
    ([thirdPartyId, kind]) => [kind, thirdPartyId],
  ),
) as Record<ProviderKind, SuperTokensThirdPartyId>;

export function thirdPartyIdForProviderKind(
  kind: ProviderKind,
): SuperTokensThirdPartyId {
  return KIND_TO_THIRD_PARTY[kind];
}

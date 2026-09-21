import {
  type CredentialAtRest,
  decryptCredentialAtRest,
  encryptCredentialAtRest,
} from "@core/security/credential-at-rest";
import { type OauthRefreshCredentialRecord } from "@sync/storage/contracts/credential.contracts";

export type SealedOauthRefreshToken = CredentialAtRest;

export function sealOauthRefreshToken(
  keyBase64: string,
  refreshToken: string,
): SealedOauthRefreshToken {
  return encryptCredentialAtRest(keyBase64, refreshToken);
}

export function openOauthRefreshToken(
  keyBase64: string | null,
  record: OauthRefreshCredentialRecord,
): string {
  if (
    record.refreshTokenCiphertext &&
    record.refreshTokenIv &&
    record.refreshTokenTag &&
    record.keyVersion
  ) {
    if (!keyBase64) {
      throw new Error(
        "stored credentials require sync.credentialEncryptionKey",
      );
    }
    return decryptCredentialAtRest(keyBase64, {
      ciphertext: record.refreshTokenCiphertext,
      iv: record.refreshTokenIv,
      tag: record.refreshTokenTag,
      keyVersion: record.keyVersion,
    });
  }
  throw new Error("oauth refresh credential has no stored refresh token");
}

export function hasStoredOauthRefreshToken(
  record: OauthRefreshCredentialRecord,
): boolean {
  return Boolean(
    record.refreshTokenCiphertext &&
      record.refreshTokenIv &&
      record.refreshTokenTag &&
      record.keyVersion,
  );
}

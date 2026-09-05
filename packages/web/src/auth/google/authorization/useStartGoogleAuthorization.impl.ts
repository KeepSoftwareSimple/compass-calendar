import { useStartProviderAuthorization } from "@web/auth/providers/authorization/useStartProviderAuthorization";

export const useStartGoogleAuthorizationImpl = (
  options: Parameters<typeof useStartProviderAuthorization>[1],
) => {
  const { loading, startAuthorization } = useStartProviderAuthorization(
    "google",
    options,
  );

  return {
    loading,
    startGoogleAuthorization: startAuthorization,
  };
};

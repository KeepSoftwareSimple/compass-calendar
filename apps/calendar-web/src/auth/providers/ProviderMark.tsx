import { type FC } from "react";
import {
  type ProviderKind,
  providerDisplayName,
} from "@core/types/sync/identity.contracts";
import { AppleLogo } from "@web/components/Icons/AppleLogo";
import { GoogleLogo } from "@web/components/Icons/GoogleLogo";
import { MicrosoftLogo } from "@web/components/Icons/MicrosoftLogo";

/**
 * One monochrome logo per provider kind, exhaustive so a new provider cannot
 * ship without one. The logos are decorative (aria-hidden); use them bare
 * only next to text that already names the provider.
 */
export const PROVIDER_LOGO: Record<ProviderKind, FC<{ size?: number }>> = {
  google: GoogleLogo,
  microsoft: MicrosoftLogo,
  apple: AppleLogo,
};

/**
 * A provider's logo with the provider name as its accessible name, for
 * account rows and headings where the email alone cannot say which
 * provider an account belongs to (the same address can back a Google
 * account and a Microsoft account).
 */
export const ProviderMark: FC<{ provider: ProviderKind; size?: number }> = ({
  provider,
  size = 14,
}) => {
  const Logo = PROVIDER_LOGO[provider];
  const name = providerDisplayName(provider);
  return (
    <span
      aria-label={name}
      className="inline-flex shrink-0 text-text-muted"
      role="img"
      title={name}
    >
      <Logo size={size} />
    </span>
  );
};

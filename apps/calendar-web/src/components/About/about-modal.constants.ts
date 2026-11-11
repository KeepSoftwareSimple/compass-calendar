import {
  BLOG_LINK,
  SOCIAL_LINKS,
  type SocialLink,
} from "@web/common/constants/social.constants";

export const COPY_VERSION_SHORTCUT = "C" as const;

export type AboutSocialLinkId = SocialLink["id"] | typeof BLOG_LINK.id;

export interface AboutSocialLink {
  id: AboutSocialLinkId;
  label: string;
  href: string;
}

/** Social + blog links shown in the About dialog icon row. */
export const ABOUT_SOCIAL_LINKS: AboutSocialLink[] = [
  ...SOCIAL_LINKS,
  BLOG_LINK,
];

/** Mnemonic letter shortcuts for About social links (active only while open). */
export const ABOUT_SOCIAL_SHORTCUTS = {
  x: "X",
  linkedin: "L",
  github: "G",
  blog: "B",
} as const satisfies Record<AboutSocialLinkId, string>;

export const ABOUT_OVERLAY_SHORTCUT = {
  ignoreAppLock: true,
  ignoreInputs: true,
  preventDefault: true,
} as const;

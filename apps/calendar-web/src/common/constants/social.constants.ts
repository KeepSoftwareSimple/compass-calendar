export interface SocialLink {
  id: "x" | "linkedin" | "github";
  label: string;
  href: string;
}

export const SOCIAL_LINKS: SocialLink[] = [
  { id: "x", label: "X (Twitter)", href: "https://x.com/CompassCalendar" },
  {
    id: "linkedin",
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/compass-calendar",
  },
  {
    id: "github",
    label: "GitHub",
    href: "https://github.com/KeepSoftwareSimple/compass-calendar",
  },
];

export const BLOG_LINK = {
  id: "blog",
  label: "Blog",
  href: "https://www.compasscalendar.com/blog",
} as const;

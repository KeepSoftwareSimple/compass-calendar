/**
 * Monochrome Microsoft four-square logo SVG, rendered in currentColor to
 * match the Google logo's single-ink treatment. Decorative: callers that
 * need an accessible name wrap it (see ProviderMark).
 */
export const MicrosoftLogo = ({ size = 18 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M3 3h8v8H3V3z" fill="currentColor" />
    <path d="M13 3h8v8h-8V3z" fill="currentColor" />
    <path d="M3 13h8v8H3v-8z" fill="currentColor" />
    <path d="M13 13h8v8h-8v-8z" fill="currentColor" />
  </svg>
);

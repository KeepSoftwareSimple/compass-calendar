/** Hovered or keyboard-focused description link for shortcut targeting. */
let interactionLink: HTMLAnchorElement | null = null;

export const setDescriptionLinkInteraction = (
  link: HTMLAnchorElement | null,
): void => {
  interactionLink = link;
};

export const getDescriptionLinkInteraction = (): HTMLAnchorElement | null =>
  interactionLink;

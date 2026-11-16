import { render, screen, within } from "@testing-library/react";
import { SOCIAL_LINKS } from "@web/common/constants/social.constants";
import { WelcomeLinks } from "./WelcomeLinks";
import { afterEach, describe, expect, it } from "bun:test";

/** The keycap digit rendered beside footer link `name`, or null when it has none. */
function footerKey(name: string): string | null {
  const link = screen.getByRole("link", { name });
  return within(link).queryAllByText(/^[0-9]$/)[0]?.textContent ?? null;
}

/** Renders one footer variant on its own and reads back its legal-link keys. */
function legalKeys(variant: "guide" | "accountChoice") {
  const view = render(<WelcomeLinks flashedKey={null} variant={variant} />);
  const keys = { privacy: footerKey("Privacy"), terms: footerKey("Terms") };
  view.unmount();
  return keys;
}

describe("WelcomeLinks", () => {
  const realSocialLinks = [...SOCIAL_LINKS];

  afterEach(() => {
    SOCIAL_LINKS.splice(0, SOCIAL_LINKS.length, ...realSocialLinks);
  });

  it("gives Privacy and Terms the same digit key on both footer screens", () => {
    expect(legalKeys("accountChoice")).toEqual(legalKeys("guide"));
  });

  it("keeps the two screens in step when the social links change", () => {
    // The account-choice screen hides the social links but reuses their jump
    // indices, so changing the social list has to shift the legal keys on both
    // screens together. Restating either index as a literal breaks this.
    SOCIAL_LINKS.splice(0, 1);

    expect(legalKeys("accountChoice")).toEqual(legalKeys("guide"));

    SOCIAL_LINKS.splice(0, 1);

    expect(legalKeys("accountChoice")).toEqual(legalKeys("guide"));
  });
});

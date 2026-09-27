import { type ReactNode, useId } from "react";
import { useFaqDisclosure } from "./useFaqDisclosure";
import { useWelcomeJumpShortcuts } from "./useWelcomeJumpShortcuts";
import { WelcomeFaqList } from "./WelcomeFaqList";
import { WelcomeLinks } from "./WelcomeLinks";

/** The signed-in welcome guide: headline, FAQ, and footer links on one screen. */
export function WelcomeGuideBody({
  children,
  flashedKey,
}: {
  children?: ReactNode;
  flashedKey: string | null;
}) {
  const faqHintId = `${useId()}-faq-hint`;
  const faq = useFaqDisclosure();
  useWelcomeJumpShortcuts(faq.toggleAt);

  return (
    <>
      <div className="flex w-full flex-col gap-2">
        <h2 className="font-bold text-2xl text-text leading-snug">
          The Keyboard Calendar
        </h2>
        <p className="text-text-muted">
          Rediscover the joy of shortcuts as you build your perfect schedule.
          Click any button here, or use Enter and the key hints beside each
          action.
        </p>
      </div>

      <WelcomeFaqList
        describedById={faqHintId}
        expanded={faq.expanded}
        flashedKey={flashedKey}
        onToggle={faq.toggle}
      />

      <p id={faqHintId} className="text-text-muted text-xs leading-relaxed">
        Tip: Press a number to open a question or a link.
      </p>
      {children}
      <WelcomeLinks flashedKey={flashedKey} />
    </>
  );
}

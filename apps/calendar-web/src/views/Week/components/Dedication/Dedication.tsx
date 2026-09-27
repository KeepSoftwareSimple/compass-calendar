import { useRef, useState } from "react";
import derekImg from "@web/assets/png/derek.png";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";
import { AsciiPortrait } from "./AsciiPortrait";

export const Dedication = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const open = () => {
    dialogRef.current?.showModal();
    requestAnimationFrame(() => setIsVisible(true));
  };

  const close = () => {
    setIsVisible(false);
  };

  const handleTransitionEnd = () => {
    if (!isVisible) {
      dialogRef.current?.close();
    }
  };

  useAppShortcut("Control+Shift+0", () => {
    if (dialogRef.current?.open) {
      close();
    } else {
      open();
    }
  });

  useAppShortcut("Escape", () => {
    if (dialogRef.current?.open) {
      close();
    }
  });

  return (
    <dialog
      ref={dialogRef}
      className={`max-h-none max-w-none bg-transparent p-0 transition-[opacity,overlay,display] duration-300 ease-out backdrop:bg-overlay-backdrop backdrop:transition-opacity backdrop:duration-300 ${
        isVisible
          ? "opacity-100 backdrop:opacity-100"
          : "opacity-0 backdrop:opacity-0"
      }`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="flex h-screen w-screen items-center justify-center">
        <button
          type="button"
          onClick={close}
          className="absolute inset-0 cursor-default"
          aria-label="Close dialog"
        />
        <div
          className={`relative flex max-h-[90vh] w-[min(92vw,44rem)] flex-col gap-6 overflow-y-auto rounded-xl border border-border bg-surface p-6 text-text-muted shadow-[0_16px_48px_var(--color-shadow-default)] transition-transform duration-300 ease-out sm:p-8 ${
            isVisible ? "scale-100" : "scale-95"
          }`}
        >
          <p className="text-l">
            Compass Calendar is dedicated to Derek John Benton (1993-2014).
          </p>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
            <blockquote>
              <p
                className="text-2xl text-text"
                style={{ fontFamily: '"Caveat", cursive' }}
              >
                "I have such amazing friends and family and I wish I could slow
                down time just a little bit so I can take all these
                relationships in as much as possible. Time is the biggest enemy
                we all face."
              </p>
            </blockquote>
            <AsciiPortrait
              src={derekImg}
              alt="Headshot of Derek"
              className="h-44 w-44 shrink-0 overflow-hidden rounded-full shadow-[0_0_10px_var(--color-shadow-default)] sm:h-60 sm:w-60"
            />
          </div>
        </div>
      </div>
    </dialog>
  );
};

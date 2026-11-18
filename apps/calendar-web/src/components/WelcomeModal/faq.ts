import { KEYMAP } from "@core/shortcuts/keymap";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

export type FaqItem = {
  question: string;
  answer: string | readonly ShortcutTipPart[];
};

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: "Who is Compass for?",
    answer: "Compass is for busy professionals who live at their keyboard.",
  },
  {
    question: "How is Compass different?",
    answer: "Everything here is faster, simpler, open-source...er.",
  },
  {
    question: "What does 'the keyboard calendar' actually mean?",
    answer:
      "You can target any element on screen without endless Tabbing, chain shortcuts into sequences, and do everything from the mighty command palette. It feels a bit like playing Tetris.",
  },
  {
    question: "Does it work with Google Calendar and Outlook?",
    answer:
      "Yes. Your Google Calendar and Microsoft Outlook events sync both ways, so changes you make in Compass show up there, and the other way around.",
  },
  {
    question: "I don't know any shortcuts yet. Will I be lost?",
    answer: [
      "No. The practice arena walks you through the core shortcut patterns, hints appear right when they're useful, and ",
      { key: "?" },
      " opens the full legend. ",
      { keys: KEYMAP.commandPalette.keycaps },
      " opens a command palette for anything you can't remember.",
    ],
  },
  {
    question: "Can I trust you?",
    answer:
      "Yes. Compass has been around since 2021. We're open-source, bootstrapped, and have no plans of stopping.",
  },
];

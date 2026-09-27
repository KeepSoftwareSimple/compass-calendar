import { KEYMAP } from "@web/shortcuts/keymap";
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
      "You can target any element on screen without endless Tabbing, chain shortcuts into sequences, and pull up a command palette for anything you can't remember. Compass surfaces the right shortcut at the right moment instead of dumping the full list on you. It feels a bit like playing Tetris.",
  },
  {
    question: "Why doesn't my mouse work?",
    answer:
      "The calendar grid is built for the keyboard. This welcome screen works with your mouse, too: every button and link here responds to a click.",
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
];

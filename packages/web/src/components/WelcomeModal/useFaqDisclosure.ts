import { useCallback, useRef, useState } from "react";
import { FAQ_ITEMS } from "./faq";

export type FaqToggleSource = "pointer" | "keyboard";

const POINTER_TOGGLE_GUARD_MS = 300;

/** Which FAQ rows are open, keyed by question, plus toggles by question or index. */
export function useFaqDisclosure() {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const lastPointerToggle = useRef<{ question: string; at: number } | null>(
    null,
  );

  const toggle = useCallback(
    (question: string, source: FaqToggleSource = "keyboard") => {
      if (source === "pointer") {
        const at = Date.now();
        const last = lastPointerToggle.current;
        if (
          last &&
          last.question === question &&
          at - last.at < POINTER_TOGGLE_GUARD_MS
        ) {
          return;
        }
        lastPointerToggle.current = { question, at };
      }

      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(question)) {
          next.delete(question);
        } else {
          next.add(question);
        }
        return next;
      });
    },
    [],
  );

  const toggleAt = useCallback(
    (index: number) => {
      const item = FAQ_ITEMS[index];
      if (item) toggle(item.question, "keyboard");
    },
    [toggle],
  );

  return { expanded, toggle, toggleAt };
}

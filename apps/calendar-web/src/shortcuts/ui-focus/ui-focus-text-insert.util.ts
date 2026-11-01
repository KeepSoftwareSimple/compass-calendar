/** Keys that move UI focus and must not insert into a field focused on the same chord. */
let pendingSuppressKey: string | null = null;

export const markUiFocusTextInsertSuppress = (key: string): void => {
  pendingSuppressKey = key.toLowerCase();
};

export const shouldSuppressUiFocusTextInsert = (key: string): boolean =>
  pendingSuppressKey === key.toLowerCase();

export const clearUiFocusTextInsertSuppress = (): void => {
  pendingSuppressKey = null;
};

export const consumeUiFocusTextInsertSuppress = (key: string): boolean => {
  if (!shouldSuppressUiFocusTextInsert(key)) return false;
  clearUiFocusTextInsertSuppress();
  return true;
};

export const stripTrailingLetter = (
  input: HTMLInputElement,
  key: string,
): boolean => {
  if (!input.value.endsWith(key)) return false;
  input.value = input.value.slice(0, -1);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
};

/**
 * Playwright `keyboard.press` can insert into a field after UI-focus moves
 * focus on keyup. Poll briefly and revert the stray suffix.
 */
export const scheduleUiFocusInsertScrub = (
  inputId: string,
  key: string,
  durationMs = 200,
): void => {
  markUiFocusTextInsertSuppress(key);
  let elapsed = 0;
  const intervalMs = 10;
  const timer = window.setInterval(() => {
    elapsed += intervalMs;
    const input = document.getElementById(inputId);
    if (input instanceof HTMLInputElement && stripTrailingLetter(input, key)) {
      clearUiFocusTextInsertSuppress();
      window.clearInterval(timer);
      return;
    }
    if (elapsed >= durationMs) {
      clearUiFocusTextInsertSuppress();
      window.clearInterval(timer);
    }
  }, intervalMs);
};

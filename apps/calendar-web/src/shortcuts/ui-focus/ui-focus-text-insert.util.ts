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

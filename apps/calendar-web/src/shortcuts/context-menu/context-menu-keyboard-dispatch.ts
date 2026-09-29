let skipPointerHintForNextContextMenu = false;

/** Set before the `m` shortcut dispatches a synthetic contextmenu. */
export const markKeyboardContextMenuDispatch = (): void => {
  skipPointerHintForNextContextMenu = true;
};

export const consumeKeyboardContextMenuSkip = (): boolean => {
  if (!skipPointerHintForNextContextMenu) return false;
  skipPointerHintForNextContextMenu = false;
  return true;
};

export const resetKeyboardContextMenuDispatchForTests = (): void => {
  skipPointerHintForNextContextMenu = false;
};

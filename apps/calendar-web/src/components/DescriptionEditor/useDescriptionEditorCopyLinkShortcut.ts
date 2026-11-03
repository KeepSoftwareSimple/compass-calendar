import { type Editor } from "@tiptap/react";
import { useCallback } from "react";
import { KEYMAP } from "@core/shortcuts/keymap";
import {
  copyDescriptionLinkUrl,
  resolveDescriptionLinkToCopy,
} from "@web/components/DescriptionEditor/description-link.util";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

export function useDescriptionEditorCopyLinkShortcut(
  editor: Editor | null,
  editorRoot: HTMLElement | null,
  enabled: boolean,
) {
  const handler = useCallback(
    (event: KeyboardEvent) => {
      if (!editor || !editorRoot) return;

      const url = resolveDescriptionLinkToCopy(
        editor,
        editorRoot,
        event.target,
      );
      if (!url) return;

      void copyDescriptionLinkUrl(url);
    },
    [editor, editorRoot],
  );

  useAppShortcut(KEYMAP.copyDescriptionLink.hotkey, handler, {
    enabled: enabled && Boolean(editor),
    ignoreInputs: false,
    preventDefault: true,
    stopPropagation: true,
    shortcutId: "edit-copy-description-link",
  });
}

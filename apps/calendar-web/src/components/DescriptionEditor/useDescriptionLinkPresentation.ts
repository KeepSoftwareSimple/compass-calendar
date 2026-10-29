import { type Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import {
  displayHostForDescriptionLink,
  listDescriptionLinks,
  shouldShortenDescriptionLinkLabel,
  withEditorDomObserverPaused,
} from "@web/components/DescriptionEditor/description-link.util";

/** Display-only host labels; ProseMirror HTML stays unchanged. */
export function useDescriptionLinkPresentation(
  editor: Editor | null,
  editorRoot: HTMLElement | null,
  isFocused: boolean,
) {
  const presentationAppliedRef = useRef(false);

  useEffect(() => {
    if (!editor || !editorRoot) return;

    if (isFocused) {
      if (presentationAppliedRef.current) {
        editor.view.dispatch(editor.state.tr);
        presentationAppliedRef.current = false;
      }
      return;
    }

    if (presentationAppliedRef.current) {
      return;
    }
    presentationAppliedRef.current = true;

    withEditorDomObserverPaused(editor, () => {
      for (const link of listDescriptionLinks(editorRoot)) {
        link.title = link.href;
        const text = link.textContent ?? "";
        if (!shouldShortenDescriptionLinkLabel(text, link.href)) continue;

        const host = displayHostForDescriptionLink(link.href);
        if (text.trim() !== host) {
          link.textContent = host;
        }
      }
    });
  }, [editor, editorRoot, isFocused]);
}

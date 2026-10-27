import { type Editor } from "@tiptap/react";
import { splitParagraphHardBreaksForListSelection } from "@web/components/DescriptionEditor/split-paragraph-hard-breaks";

const expandSelectionToListItems = (editor: Editor) => {
  const { state } = editor;
  const { from, to } = state.selection;
  let minPos: number | null = null;
  let maxPos: number | null = null;

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== "listItem") return;
    minPos = minPos === null ? pos : Math.min(minPos, pos);
    maxPos =
      maxPos === null
        ? pos + node.nodeSize
        : Math.max(maxPos, pos + node.nodeSize);
  });

  if (minPos === null || maxPos === null) return;
  if (minPos === from && maxPos === to) return;
  editor.commands.setTextSelection({ from: minPos, to: maxPos });
};

const expandSelectionToActiveListContent = (
  editor: Editor,
  listType: "bulletList" | "orderedList",
) => {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== listType) continue;
    const start = $from.before(depth);
    const node = $from.node(depth);
    editor.commands.setTextSelection({
      from: start + 1,
      to: start + node.nodeSize - 1,
    });
    return;
  }
};

export const toggleDescriptionList = (
  editor: Editor,
  list: "bullet" | "ordered",
) => {
  splitParagraphHardBreaksForListSelection(editor);

  const listType = list === "bullet" ? "bulletList" : "orderedList";
  if (editor.isActive(listType)) {
    expandSelectionToActiveListContent(editor, listType);
  } else {
    expandSelectionToListItems(editor);
  }

  const chain = editor.chain().focus();
  const ran =
    list === "bullet"
      ? chain.toggleBulletList().run()
      : chain.toggleOrderedList().run();

  if (ran) return;

  expandSelectionToActiveListContent(editor, listType);
  const retry =
    list === "bullet"
      ? editor.chain().focus().toggleBulletList().run()
      : editor.chain().focus().toggleOrderedList().run();
  if (!retry) {
    console.warn("Description list toggle did not apply");
  }
};

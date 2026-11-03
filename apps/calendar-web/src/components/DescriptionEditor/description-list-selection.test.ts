import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { splitParagraphHardBreaksForListSelection } from "@web/components/DescriptionEditor/split-paragraph-hard-breaks";
import { toggleDescriptionList } from "@web/components/DescriptionEditor/toggle-description-list";
import { describe, expect, it } from "bun:test";

const starterKit = StarterKit.configure({
  blockquote: false,
  code: false,
  codeBlock: false,
  heading: false,
  horizontalRule: false,
  strike: false,
  underline: false,
  link: false,
});

const createEditor = (content: string) =>
  new Editor({
    extensions: [starterKit],
    content,
  });

describe("description list selection", () => {
  it("bullets only selected lines in legacy br paragraphs", () => {
    const html =
      "<p>LIST<br>- Frames<br>- Art supplies</p><p>PLACES<br>Magpie Art Supply, LLC<br>Paper and Grace<br>Sacks Thrift Store<br>Salvation Army<br>UFS BZN</p>";
    const editor = createEditor(html);
    const doc = editor.state.doc;
    let placesLineStart = 0;
    let placesLineEnd = 0;
    doc.descendants((node, pos) => {
      if (node.isText && node.text === "Magpie Art Supply, LLC") {
        placesLineStart = pos;
      }
      if (node.isText && node.text === "UFS BZN") {
        placesLineEnd = pos + node.nodeSize;
      }
    });
    editor.commands.setTextSelection({
      from: placesLineStart,
      to: placesLineEnd,
    });

    toggleDescriptionList(editor, "bullet");

    const result = editor.getHTML();
    expect(result).toContain("<ul>");
    expect(result.match(/<li>/g)?.length).toBe(5);
    expect(result).toContain("- Frames");
    expect(result).not.toMatch(/<ul>[\s\S]*- Frames/);

    toggleDescriptionList(editor, "bullet");
    expect(editor.getHTML()).not.toContain("<ul>");
    expect(editor.getHTML()).toContain("Magpie Art Supply, LLC");

    editor.destroy();
  });

  it("toggles list off without leaving a broken list when only one item was selected", () => {
    const editor = createEditor(
      "<ul><li><p>one</p></li><li><p>two</p></li></ul>",
    );
    const doc = editor.state.doc;
    let from = 0;
    let to = 0;
    doc.descendants((node, pos) => {
      if (node.isText && node.text === "two") {
        from = pos;
        to = pos + node.nodeSize;
      }
    });
    editor.commands.setTextSelection({ from, to });

    toggleDescriptionList(editor, "bullet");

    expect(editor.getHTML()).not.toContain("<ul>");
    expect(editor.getHTML()).toContain("one");
    expect(editor.getHTML()).toContain("two");

    editor.destroy();
  });

  it("splits hard breaks before toggling list", () => {
    const editor = createEditor("<p>one<br>two<br>three</p>");
    const middleStart = 2;
    editor.commands.setTextSelection({
      from: middleStart,
      to: middleStart + 3,
    });

    splitParagraphHardBreaksForListSelection(editor);
    expect(editor.getHTML()).toBe("<p>one</p><p>two</p><p>three</p>");

    editor.destroy();
  });
});

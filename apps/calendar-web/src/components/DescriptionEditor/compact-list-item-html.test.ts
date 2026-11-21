import { compactListItemHtml } from "@web/components/DescriptionEditor/compact-list-item-html";
import { describe, expect, it } from "bun:test";

describe("compactListItemHtml", () => {
  it("unwraps single-paragraph list items", () => {
    expect(
      compactListItemHtml("<ul><li><p>a</p></li><li><p><b>b</b></p></li></ul>"),
    ).toBe("<ul><li>a</li><li><b>b</b></li></ul>");
  });

  it("drops leading and trailing breaks a provider added to list items", () => {
    expect(compactListItemHtml("<ul><li>a</li><li><br>b<br/></li></ul>")).toBe(
      "<ul><li>a</li><li>b</li></ul>",
    );
  });

  it("keeps multi-paragraph list items and content outside lists", () => {
    const html = "<p>x<br>y</p><ol><li><p>a</p><p>b</p></li></ol>";
    expect(compactListItemHtml(html)).toBe(html);
  });
});

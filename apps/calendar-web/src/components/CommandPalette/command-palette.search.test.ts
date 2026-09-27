import { PlusIcon } from "@phosphor-icons/react";
import {
  filterSections,
  getLabelMatchRanges,
  scoreCommandItem,
} from "./command-palette.search";
import { describe, expect, it } from "bun:test";

describe("filterSections", () => {
  const sections = [
    {
      id: "a",
      heading: "A",
      items: [
        { id: "1", label: "Create Event", icon: PlusIcon },
        { id: "2", label: "Report Bug", icon: PlusIcon },
      ],
    },
    {
      id: "b",
      heading: "B",
      items: [{ id: "3", label: "Share Feedback", icon: PlusIcon }],
    },
  ];

  it("returns all sections when the query is empty or whitespace", () => {
    expect(filterSections(sections, "")).toEqual(sections);
    expect(filterSections(sections, "   ")).toEqual(sections);
  });

  it("matches labels case-insensitively as a substring", () => {
    const result = filterSections(sections, "REPORT");
    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].label).toBe("Report Bug");
  });

  it("drops sections whose items all filter out", () => {
    const result = filterSections(sections, "share");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("trims the query before matching", () => {
    const result = filterSections(sections, "  event  ");
    expect(result).toHaveLength(1);
    expect(result[0].items[0].label).toBe("Create Event");
  });

  it("strips trailing sentence punctuation so play. still matches Play", () => {
    const withPlay = [
      {
        id: "nav",
        heading: "Navigation",
        items: [
          {
            id: "practice-shortcuts",
            label: "Play Block Party (practice shortcuts)",
            icon: PlusIcon,
            keywords: ["play", "game"],
          },
          { id: "create", label: "Create event", icon: PlusIcon },
        ],
      },
    ];

    const result = filterSections(withPlay, "play.");
    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].id).toBe("practice-shortcuts");
  });

  it("matches a synonym via keywords, not just the label", () => {
    const withKeywords = [
      {
        id: "nav",
        heading: "Navigation",
        items: [
          {
            id: "go-to-day",
            label: "Go to Day",
            icon: PlusIcon,
            keywords: ["day view", "day page", "daily", "calendar"],
          },
          {
            id: "go-to-week",
            label: "Go to Week",
            icon: PlusIcon,
            keywords: ["week view", "week page", "weekly", "calendar"],
          },
        ],
      },
    ];

    const result = filterSections(withKeywords, "day page");
    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0].label).toBe("Go to Day");
  });

  it("requires every query token to match (AND semantics)", () => {
    const result = filterSections(sections, "create zebra");
    expect(result).toHaveLength(0);
  });

  it("ranks a prefix match above a plain substring match within a section", () => {
    const items = [
      {
        id: "with-cat-inside",
        heading: "S",
        items: [
          { id: "1", label: "Vacation planner", icon: PlusIcon },
          { id: "2", label: "Cat settings", icon: PlusIcon },
        ],
      },
    ];

    const result = filterSections(items, "cat");
    expect(result[0].items.map((item) => item.label)).toEqual([
      "Cat settings",
      "Vacation planner",
    ]);
  });

  it("ranks a label match above a keyword-only match at the same tier", () => {
    const items = [
      {
        id: "s",
        heading: "S",
        items: [
          {
            id: "keyword-only",
            label: "Toggle theme",
            icon: PlusIcon,
            keywords: ["dark mode"],
          },
          { id: "label-match", label: "Dark mode settings", icon: PlusIcon },
        ],
      },
    ];

    const result = filterSections(items, "dark");
    expect(result[0].items.map((item) => item.id)).toEqual([
      "label-match",
      "keyword-only",
    ]);
  });

  it("matches a character subsequence as a last resort, tied items keep authored order", () => {
    const items = [
      {
        id: "s",
        heading: "S",
        items: [
          { id: "create-event", label: "Create event", icon: PlusIcon },
          { id: "clear-samples", label: "Clear sample events", icon: PlusIcon },
        ],
      },
    ];

    // "cae" is a character subsequence of both labels but not a
    // word-prefix/substring of either, so both rank via the lowest tier.
    const result = filterSections(items, "cae");
    expect(result[0].items.map((item) => item.id)).toEqual([
      "create-event",
      "clear-samples",
    ]);
  });

  it("does not match a subsequence for tokens shorter than 3 characters", () => {
    const items = [
      {
        id: "s",
        heading: "S",
        items: [{ id: "1", label: "Report Bug", icon: PlusIcon }],
      },
    ];

    // "rb" is a subsequence of "Report Bug" but below the 3-char floor, so it
    // shouldn't match via that tier (and there's no substring/prefix hit).
    expect(filterSections(items, "rb")).toHaveLength(0);
  });

  it("keeps ties in authored order (stable sort)", () => {
    const items = [
      {
        id: "s",
        heading: "S",
        items: [
          { id: "first", label: "Go to Today", icon: PlusIcon },
          { id: "second", label: "Go to Day", icon: PlusIcon },
          { id: "third", label: "Go to Life", icon: PlusIcon },
        ],
      },
    ];

    const result = filterSections(items, "go");
    expect(result[0].items.map((item) => item.id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});

describe("scoreCommandItem", () => {
  it("returns 0 when the query doesn't match label or keywords", () => {
    expect(scoreCommandItem({ label: "Create event" }, "zzzzz")).toBe(0);
  });

  it("scores an exact label match higher than a substring match", () => {
    const exact = scoreCommandItem({ label: "day" }, "day");
    const substring = scoreCommandItem({ label: "Go to Day" }, "day");
    expect(exact).toBeGreaterThan(substring);
  });
});

describe("getLabelMatchRanges", () => {
  it("returns an empty array for an empty or whitespace query", () => {
    expect(getLabelMatchRanges("Create event", "")).toEqual([]);
    expect(getLabelMatchRanges("Create event", "   ")).toEqual([]);
  });

  it("returns an empty array when the token doesn't appear in the label", () => {
    expect(getLabelMatchRanges("Create event", "zzzzz")).toEqual([]);
  });

  it("finds a single-token substring match, case-insensitively", () => {
    expect(getLabelMatchRanges("Go to Day", "day")).toEqual([[6, 9]]);
    expect(getLabelMatchRanges("Go to Day", "DAY")).toEqual([[6, 9]]);
  });

  it("does not highlight a token that only matched via a keyword, not the label", () => {
    // getLabelMatchRanges only looks at the label itself — a token that
    // scored via a keyword synonym simply produces no range for that token.
    expect(getLabelMatchRanges("Go to Day", "page")).toEqual([]);
  });

  it("returns one range per matching token, sorted by position", () => {
    expect(getLabelMatchRanges("Create all-day event", "event create")).toEqual(
      [
        [0, 6],
        [15, 20],
      ],
    );
  });

  it("merges overlapping ranges from different tokens", () => {
    // "lig" matches [10,13) and "ight" matches [11,15) within "light" (at
    // index 10) — they overlap and should merge into a single [10,15) range
    // covering the whole word.
    expect(getLabelMatchRanges("Switch to light theme", "lig ight")).toEqual([
      [10, 15],
    ]);
  });
});

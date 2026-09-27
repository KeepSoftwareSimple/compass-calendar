import { getRandomLifeQuote, LIFE_QUOTES } from "./life-quotes";
import { describe, expect, it } from "bun:test";

describe("life quotes", () => {
  it("chooses from the supplied quotes", () => {
    expect(getRandomLifeQuote(() => 0)).toBe(LIFE_QUOTES[0]);
  });
});

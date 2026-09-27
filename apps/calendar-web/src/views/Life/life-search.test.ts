import { applyLifeSearch, validateLifeSearch } from "./life-search";
import { describe, expect, it } from "bun:test";

describe("life search", () => {
  it("accepts bookmarkable variation and age params", () => {
    expect(validateLifeSearch({ age: "83", variation: "random" })).toEqual({
      age: 83,
      variation: "random",
    });
    expect(
      validateLifeSearch({ age: "not-a-number", variation: "other" }),
    ).toEqual({
      age: undefined,
      variation: undefined,
    });
  });

  it("uses a URL age for the selected variation", () => {
    const preferences = applyLifeSearch(
      { birthDate: "1993-09-14", lifespan: 77, variation: "average" },
      { age: 83, variation: "random" },
      new Date(2026, 6, 21),
    );

    expect(preferences).toEqual({
      birthDate: "1993-09-14",
      lifespan: 83,
      variation: "random",
    });
  });
});

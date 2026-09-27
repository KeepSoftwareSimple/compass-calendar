import { roundToNext, roundToPrev } from "./round.util";

describe("round.util", () => {
  describe("roundToNext", () => {
    it("should round up to the next multiple of roundBy", () => {
      expect(roundToNext(5, 10)).toBe(10);
      expect(roundToNext(12, 10)).toBe(20);
      expect(roundToNext(15, 10)).toBe(20);
      expect(roundToNext(20, 10)).toBe(20);
    });

    it("should handle decimal numbers", () => {
      expect(roundToNext(5.1, 10)).toBe(10);
      expect(roundToNext(5.9, 10)).toBe(10);
      expect(roundToNext(12.3, 10)).toBe(20);
    });

    it("should handle different roundBy values", () => {
      expect(roundToNext(7, 5)).toBe(10);
      expect(roundToNext(13, 5)).toBe(15);
      expect(roundToNext(3, 2)).toBe(4);
      expect(roundToNext(4, 2)).toBe(4);
    });

    it("should handle zero and negative numbers", () => {
      expect(roundToNext(0, 10)).toBe(0);
      expect(roundToNext(-5, 10)).toBe(-0);
      expect(roundToNext(-12, 10)).toBe(-10);
    });

    it("should handle edge cases", () => {
      expect(roundToNext(0.1, 1)).toBe(1);
      expect(roundToNext(0.9, 1)).toBe(1);
      expect(roundToNext(1, 1)).toBe(1);
    });
  });

  describe("roundToPrev", () => {
    it("should round down to the previous multiple of roundBy", () => {
      expect(roundToPrev(5, 10)).toBe(0);
      expect(roundToPrev(12, 10)).toBe(10);
      expect(roundToPrev(15, 10)).toBe(10);
      expect(roundToPrev(20, 10)).toBe(20);
    });

    it("should handle decimal numbers", () => {
      expect(roundToPrev(5.1, 10)).toBe(0);
      expect(roundToPrev(5.9, 10)).toBe(0);
      expect(roundToPrev(12.3, 10)).toBe(10);
    });

    it("should handle different roundBy values", () => {
      expect(roundToPrev(7, 5)).toBe(5);
      expect(roundToPrev(13, 5)).toBe(10);
      expect(roundToPrev(3, 2)).toBe(2);
      expect(roundToPrev(4, 2)).toBe(4);
    });

    it("should handle zero and negative numbers", () => {
      expect(roundToPrev(0, 10)).toBe(0);
      expect(roundToPrev(-5, 10)).toBe(-10);
      expect(roundToPrev(-12, 10)).toBe(-20);
    });

    it("should handle edge cases", () => {
      expect(roundToPrev(0.1, 1)).toBe(0);
      expect(roundToPrev(0.9, 1)).toBe(0);
      expect(roundToPrev(1, 1)).toBe(1);
    });
  });
});

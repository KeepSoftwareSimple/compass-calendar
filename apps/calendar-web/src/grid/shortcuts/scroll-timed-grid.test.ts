import { ID_GRID_MAIN } from "@web/common/constants/web.constants";
import { scrollTimedGrid } from "@web/grid/shortcuts/scroll-timed-grid";
import { afterEach, describe, expect, it, mock } from "bun:test";

const mountGrid = (clientHeight: number) => {
  const grid = document.createElement("section");
  grid.id = ID_GRID_MAIN;
  Object.defineProperty(grid, "clientHeight", { value: clientHeight });
  const scrollBy = mock();
  grid.scrollBy = scrollBy as typeof grid.scrollBy;
  document.body.append(grid);
  return { grid, scrollBy };
};

describe("scrollTimedGrid", () => {
  afterEach(() => {
    document.getElementById(ID_GRID_MAIN)?.remove();
  });

  it("scrolls the timed grid by one viewport in the requested direction", () => {
    const { scrollBy } = mountGrid(390);

    expect(scrollTimedGrid("down", "page")).toBe(true);
    expect(scrollBy).toHaveBeenCalledWith({ top: 390 });

    expect(scrollTimedGrid("up", "page")).toBe(true);
    expect(scrollBy).toHaveBeenCalledWith({ top: -390 });
  });

  it("scrolls the timed grid by one hour in the requested direction", () => {
    const { scrollBy } = mountGrid(390);

    expect(scrollTimedGrid("down", "hour")).toBe(true);
    expect(scrollBy).toHaveBeenCalledWith({ top: 30 });

    expect(scrollTimedGrid("up", "hour")).toBe(true);
    expect(scrollBy).toHaveBeenCalledWith({ top: -30 });
  });

  it("no-ops when the timed grid is not in the document", () => {
    expect(scrollTimedGrid("down", "page")).toBe(false);
    expect(scrollTimedGrid("down", "hour")).toBe(false);
  });
});

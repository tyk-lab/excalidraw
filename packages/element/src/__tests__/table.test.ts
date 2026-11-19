import { newTableElement } from "../newElement";

import {
  deleteTableColumn,
  deleteTableRow,
  getTableCellAtScenePoint,
  insertTableColumn,
  insertTableRow,
} from "../table";

describe("table", () => {
  const createTable = () =>
    newTableElement({
      type: "table",
      x: 10,
      y: 20,
      width: 300,
      height: 120,
    });

  it("places a click in the cell under the pointer", () => {
    const table = createTable();

    expect(getTableCellAtScenePoint(table, 10 + 50, 20 + 20)).toEqual({
      row: 0,
      col: 0,
    });
    expect(getTableCellAtScenePoint(table, 10 + 250, 20 + 100)).toEqual({
      row: 2,
      col: 2,
    });
    expect(getTableCellAtScenePoint(table, 0, 0)).toBeNull();
  });

  it("inserts a row below the clicked row and grows the table", () => {
    const table = createTable();
    const next = insertTableRow(table, 0);

    expect(next.cells).toHaveLength(4);
    expect(next.cells[1]).toEqual(["", "", ""]);
    expect(next.height).toBeCloseTo(160);
    expect(next.rowFractions).toHaveLength(4);
    expect(next.rowFractions.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
      1,
    );
  });

  it("removes a column and shrinks the width", () => {
    const table = createTable();
    const next = deleteTableColumn(table, 1);

    expect(next.cells[0]).toHaveLength(2);
    expect(next.width).toBeCloseTo(200);
    expect(deleteTableRow(deleteTableRow(next, 0), 0).rowFractions).toHaveLength(
      1,
    );
  });

  it("adds a column to the right of the clicked one", () => {
    const table = createTable();
    const next = insertTableColumn(table, 2);

    expect(next.cells[0]).toHaveLength(4);
    expect(next.width).toBeCloseTo(400);
  });
});

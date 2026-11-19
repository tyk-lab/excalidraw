import React from "react";

import {
  DEFAULT_TABLE_COL_WIDTH,
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROW_HEIGHT,
  DEFAULT_TABLE_ROWS,
} from "@excalidraw/element";

import type { ExcalidrawTableElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";

import { actionTableInsertRow } from "../actions/actionTable";

import { API } from "./helpers/api";
import { render, fireEvent } from "./test-utils";
import { getTextEditor, updateTextEditor } from "./queries/dom";

const { h } = window;

const tableElements = () =>
  h.elements.filter(
    (element): element is ExcalidrawTableElement => element.type === "table",
  );

describe("table", () => {
  it("places a table on click and edits the first cell", async () => {
    const { getByToolName, container } = await render(<Excalidraw />);
    fireEvent.click(getByToolName("table"));

    const canvas = container.querySelector("canvas.interactive")!;
    fireEvent.pointerDown(canvas, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(canvas, { clientX: 300, clientY: 200 });

    const editor = await getTextEditor();
    const table = tableElements()[0];
    expect(table.cells).toHaveLength(DEFAULT_TABLE_ROWS);
    expect(table.cells[0]).toHaveLength(DEFAULT_TABLE_COLS);
    expect(table.width).toBe(DEFAULT_TABLE_COL_WIDTH * DEFAULT_TABLE_COLS);
    expect(table.height).toBe(DEFAULT_TABLE_ROW_HEIGHT * DEFAULT_TABLE_ROWS);
    expect(editor.value).toContain("---");
    expect(h.state.activeTool.type).toBe("selection");

    updateTextEditor(
      editor,
      ["| 姓名 | 年龄 |", "| --- | --- |", "| 张三 | 18 |"].join("\n"),
    );
    expect(h.elements.find((element) => element.id === table.id)).toMatchObject({
      cells: [
        ["姓名", "年龄"],
        ["张三", "18"],
      ],
    });

    fireEvent.keyDown(editor, { key: "Escape" });
    expect(document.querySelector("textarea.excalidraw-wysiwyg")).toBeNull();
  });

  it("sizes a dragged table without opening the editor", async () => {
    const { getByToolName, container } = await render(<Excalidraw />);
    fireEvent.click(getByToolName("table"));
    const canvas = container.querySelector("canvas.interactive")!;

    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 50 });
    fireEvent.pointerMove(canvas, { clientX: 280, clientY: 170 });
    fireEvent.pointerUp(canvas, { clientX: 280, clientY: 170 });

    const table = tableElements()[0];
    expect(table.width).toBeGreaterThan(100);
    expect(table.height).toBeGreaterThan(50);
    expect(document.querySelector("textarea.excalidraw-wysiwyg")).toBeNull();
    expect(h.state.selectedElementIds[table.id]).toBe(true);
  });

  it("opens the editor when an existing table is clicked", async () => {
    const { container } = await render(<Excalidraw />);
    const table = API.createElement({
      type: "table",
      x: 0,
      y: 0,
      width: 300,
      height: 120,
      id: "table",
      cells: [
        ["姓名", "年龄"],
        ["张三", "18"],
        ["李四", "20"],
      ],
    });
    API.setElements([table]);
    API.setSelectedElements([table]);

    const canvas = container.querySelector("canvas.interactive")!;
    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(canvas, { clientX: 40, clientY: 40 });

    const editor = await getTextEditor();
    expect(editor.value).toContain("姓名");
    expect(editor.value).toContain("张三");
    expect(editor.value).toContain("李四");
  });

  it("inserts a row from the context action", async () => {
    await render(<Excalidraw />);
    const table = API.createElement({
      type: "table",
      x: 0,
      y: 0,
      width: 300,
      height: 120,
      id: "table",
    });
    API.setElements([table]);
    API.setSelectedElements([table]);

    API.executeAction(actionTableInsertRow);

    const next = h.elements.find((element) => element.id === "table");
    expect(next).toMatchObject({ type: "table" });
    if (next?.type === "table") {
      expect(next.cells).toHaveLength(4);
    }
  });
});

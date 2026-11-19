import { getFontString, getLineHeight } from "@excalidraw/common";

import { newElementWith } from "./mutateElement";
import {
  TABLE_CELL_PADDING,
  TABLE_MAX_COLS,
  TABLE_MAX_ROWS,
  TABLE_MIN_COL_WIDTH,
  TABLE_MIN_ROW_HEIGHT,
} from "./table";
import { getLineHeightInPx, measureText } from "./textMeasurements";
import { wrapText } from "./textWrapping";

import type { RenderEnvironment } from "./renderEnvironment";

import type { ExcalidrawTableElement, FontFamilyValues } from "./types";

const MAX_COL_WIDTH = 280;

const splitRow = (line: string): string[] | null => {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return null;
  }
  const escaped = trimmed.replace(/\\\|/g, "\u0000");
  let body = escaped;
  if (body.startsWith("|")) {
    body = body.slice(1);
  }
  if (body.endsWith("|")) {
    body = body.slice(0, -1);
  }
  return body.split("|").map((cell) => cell.replace(/\u0000/g, "|").trim());
};

const isSeparator = (cells: readonly string[]) =>
  cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));

const padRow = (row: readonly string[], width: number) =>
  Array.from({ length: width }, (_, index) => row[index] ?? "");

/**
 * Parses a Markdown table. The text must be only that table: a header row,
 * a `| --- |` separator, then body rows. Returns null for anything else.
 */
export const parseMarkdownTable = (source: string): string[][] | null => {
  const lines = source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return null;
  }

  const header = splitRow(lines[0]);
  const separator = splitRow(lines[1]);
  if (!header || !separator || !isSeparator(separator)) {
    return null;
  }

  const rows = [header];
  for (let index = 2; index < lines.length; index++) {
    const row = splitRow(lines[index]);
    if (!row || isSeparator(row)) {
      return null;
    }
    rows.push(row);
  }

  const width = Math.min(
    TABLE_MAX_COLS,
    Math.max(...rows.map((row) => row.length)),
  );
  if (width < 1) {
    return null;
  }

  return rows
    .slice(0, TABLE_MAX_ROWS)
    .map((row) => padRow(row, width).slice(0, TABLE_MAX_COLS));
};

const escapeCell = (value: string) => value.replace(/\|/g, "\\|");

/** The Markdown the table editor shows and accepts back. */
export const tableToMarkdown = (
  cells: readonly (readonly string[])[],
): string => {
  const width = Math.max(1, ...cells.map((row) => row.length));
  const rows = (cells.length > 0 ? cells : [[]]).map((row) => padRow(row, width));
  const format = (row: readonly string[]) =>
    `| ${row.map((cell) => escapeCell(cell)).join(" | ")} |`;
  return [
    format(rows[0]),
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...rows.slice(1).map((row) => format(row)),
  ].join("\n");
};

export const layoutMarkdownTable = (
  cells: readonly (readonly string[])[],
  fontSize: number,
  fontFamily: FontFamilyValues,
  env?: RenderEnvironment,
) => {
  const font = getFontString({ fontSize, fontFamily });
  const lineHeight = getLineHeight(fontFamily);
  const lineHeightPx = getLineHeightInPx(fontSize, lineHeight);
  const width = cells[0]?.length ?? 1;

  const colWidths = Array.from({ length: width }, (_, column) => {
    let content = TABLE_MIN_COL_WIDTH;
    for (const row of cells) {
      const text = row[column] || " ";
      const measured =
        measureText(text, font, lineHeight, env).width + TABLE_CELL_PADDING * 2;
      content = Math.max(content, Math.min(measured, MAX_COL_WIDTH));
    }
    return content;
  });

  const rowHeights = cells.map((row) => {
    let lines = 1;
    row.forEach((text, column) => {
      const inner = Math.max(1, colWidths[column] - TABLE_CELL_PADDING * 2);
      const wrapped = text
        ? wrapText(text, font, inner, env).split("\n").length
        : 1;
      lines = Math.max(lines, wrapped);
    });
    return Math.max(
      TABLE_MIN_ROW_HEIGHT,
      lines * lineHeightPx + TABLE_CELL_PADDING * 2,
    );
  });

  const tableWidth = colWidths.reduce((sum, value) => sum + value, 0);
  const tableHeight = rowHeights.reduce((sum, value) => sum + value, 0);
  return {
    width: tableWidth,
    height: tableHeight,
    colFractions: colWidths.map((value) => value / tableWidth),
    rowFractions: rowHeights.map((value) => value / tableHeight),
  };
};

/** Keeps the table's top-left and restyles it around new Markdown cells. */
export const applyMarkdownTable = (
  element: ExcalidrawTableElement,
  cells: readonly (readonly string[])[],
  env?: RenderEnvironment,
) => {
  const layout = layoutMarkdownTable(
    cells,
    element.fontSize,
    element.fontFamily,
    env,
  );
  return newElementWith(element, {
    cells: cells.map((row) => [...row]),
    ...layout,
  });
};

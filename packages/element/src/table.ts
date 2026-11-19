import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  FONT_FAMILY,
  THEME,
  applyDarkModeFilter,
  getFontString,
  getLineHeight,
} from "@excalidraw/common";

import { pointFrom, pointRotateRads, type Radians } from "@excalidraw/math";

import { newElementWith, type ElementUpdate } from "./mutateElement";
import { getLineHeightInPx } from "./textMeasurements";
import { wrapText } from "./textWrapping";

import type { RenderEnvironment } from "./renderEnvironment";

import type { FontFamilyValues, ExcalidrawTableElement } from "./types";

export const DEFAULT_TABLE_ROWS = 3;
export const DEFAULT_TABLE_COLS = 3;
export const DEFAULT_TABLE_COL_WIDTH = 160;
export const DEFAULT_TABLE_ROW_HEIGHT = 48;
export const TABLE_MIN_COL_WIDTH = 40;
export const TABLE_MIN_ROW_HEIGHT = 32;
export const TABLE_CELL_PADDING = 8;
export const TABLE_MAX_ROWS = 20;
export const TABLE_MAX_COLS = 12;

export const equalFractions = (count: number): number[] => {
  if (count <= 0) {
    return [];
  }
  return Array.from({ length: count }, () => 1 / count);
};

const isPositiveFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export const normalizeFractions = (
  raw: readonly number[] | null | undefined,
  count: number,
): number[] => {
  if (
    !raw ||
    raw.length !== count ||
    raw.some((value) => !isPositiveFinite(value))
  ) {
    return equalFractions(count);
  }
  const sum = raw.reduce((total, value) => total + value, 0);
  return raw.map((value) => value / sum);
};

export const createEmptyCells = (rows: number, cols: number): string[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));

const isFontFamily = (value: unknown): value is FontFamilyValues =>
  typeof value === "number" &&
  (Object.values(FONT_FAMILY) as number[]).includes(value);

/**
 * Repairs cell text and track fractions. Size floors apply to saved elements;
 * a pointer-down draft is still 0×0 and must not be inflated here.
 */
export const normalizeTableElement = <T extends ExcalidrawTableElement>(
  element: T,
  options?: { enforceMinSize?: boolean },
): T => {
  const rawRows = Array.isArray(element.cells) ? element.cells : [];
  const rowCount = Math.min(
    TABLE_MAX_ROWS,
    Math.max(
      1,
      rawRows.length,
      element.rowFractions?.length || 0,
    ),
  );
  const colCount = Math.min(
    TABLE_MAX_COLS,
    Math.max(
      1,
      element.colFractions?.length || 0,
      ...rawRows.map((row) => (Array.isArray(row) ? row.length : 0)),
    ),
  );
  const cells = Array.from({ length: rowCount }, (_, row) =>
    Array.from({ length: colCount }, (_, col) => {
      const value = rawRows[row]?.[col];
      return typeof value === "string" ? value : "";
    }),
  );
  const fontSize = isPositiveFinite(element.fontSize)
    ? element.fontSize
    : DEFAULT_FONT_SIZE;
  const fontFamily = isFontFamily(element.fontFamily)
    ? element.fontFamily
    : DEFAULT_FONT_FAMILY;

  let width = isPositiveFinite(element.width) ? element.width : element.width;
  let height = isPositiveFinite(element.height)
    ? element.height
    : element.height;
  if (options?.enforceMinSize) {
    width = Math.max(width || 0, TABLE_MIN_COL_WIDTH * colCount);
    height = Math.max(height || 0, TABLE_MIN_ROW_HEIGHT * rowCount);
  }

  return newElementWith(element, {
    cells,
    colFractions: normalizeFractions(element.colFractions, colCount),
    rowFractions: normalizeFractions(element.rowFractions, rowCount),
    fontSize,
    fontFamily,
    roundness: null,
    width,
    height,
  } as unknown as ElementUpdate<T>) as T;
};

/** Edges along one axis, in element-local pixels. The last edge is `span`. */
export const getTableTracks = (
  fractions: readonly number[],
  span: number,
): number[] => {
  const edges = [0];
  let cursor = 0;
  fractions.forEach((fraction, index) => {
    cursor += fraction * span;
    edges.push(index === fractions.length - 1 ? span : cursor);
  });
  return edges;
};

export type TableCellBox = {
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const getTableCells = (
  element: Pick<
    ExcalidrawTableElement,
    "width" | "height" | "colFractions" | "rowFractions"
  >,
): TableCellBox[] => {
  const xs = getTableTracks(element.colFractions, element.width);
  const ys = getTableTracks(element.rowFractions, element.height);
  const cells: TableCellBox[] = [];
  for (let row = 0; row < ys.length - 1; row++) {
    for (let col = 0; col < xs.length - 1; col++) {
      cells.push({
        row,
        col,
        x: xs[col],
        y: ys[row],
        width: xs[col + 1] - xs[col],
        height: ys[row + 1] - ys[row],
      });
    }
  }
  return cells;
};

export const scenePointToTableLocal = (
  element: Pick<ExcalidrawTableElement, "x" | "y" | "width" | "height" | "angle">,
  sceneX: number,
  sceneY: number,
) => {
  const center = pointFrom(
    element.x + element.width / 2,
    element.y + element.height / 2,
  );
  const rotated = pointRotateRads(
    pointFrom(sceneX, sceneY),
    center,
    -element.angle as Radians,
  );
  return {
    x: rotated[0] - element.x,
    y: rotated[1] - element.y,
  };
};

export const getTableCellAtScenePoint = (
  element: ExcalidrawTableElement,
  sceneX: number,
  sceneY: number,
): { row: number; col: number } | null => {
  const local = scenePointToTableLocal(element, sceneX, sceneY);
  if (
    local.x < 0 ||
    local.y < 0 ||
    local.x > element.width ||
    local.y > element.height
  ) {
    return null;
  }
  const cell = getTableCells(element).find(
    (candidate) =>
      local.x >= candidate.x &&
      local.y >= candidate.y &&
      local.x <= candidate.x + candidate.width &&
      local.y <= candidate.y + candidate.height,
  );
  return cell ? { row: cell.row, col: cell.col } : null;
};

export const getTableCellPadding = (cell: Pick<TableCellBox, "width" | "height">) =>
  Math.min(TABLE_CELL_PADDING, Math.max(0, Math.min(cell.width, cell.height) / 4));

export type TableCellTextLayout = TableCellBox & {
  lines: string[];
  padding: number;
  lineHeightPx: number;
};

export const getTableCellTextLayouts = (
  element: ExcalidrawTableElement,
  env?: RenderEnvironment,
): TableCellTextLayout[] => {
  const font = getFontString({
    fontSize: element.fontSize,
    fontFamily: element.fontFamily,
  });
  const lineHeightPx = getLineHeightInPx(
    element.fontSize,
    getLineHeight(element.fontFamily),
  );

  return getTableCells(element).map((cell) => {
    const padding = getTableCellPadding(cell);
    const maxWidth = cell.width - padding * 2;
    const text = element.cells[cell.row]?.[cell.col] ?? "";
    const wrapped =
      !text || maxWidth <= 0 ? [] : wrapText(text, font, maxWidth, env).split("\n");
    const maxLines = Math.max(
      1,
      Math.floor((cell.height - padding * 2) / lineHeightPx),
    );
    return {
      ...cell,
      padding,
      lineHeightPx,
      lines: wrapped.slice(0, maxLines),
    };
  });
};

export const drawTableText = (
  element: ExcalidrawTableElement,
  context: CanvasRenderingContext2D,
  theme: string,
  env?: RenderEnvironment,
) => {
  context.save();
  context.font = getFontString({
    fontSize: element.fontSize,
    fontFamily: element.fontFamily,
  });
  context.fillStyle = applyDarkModeFilter(
    element.strokeColor,
    theme === THEME.DARK,
  );
  context.textAlign = "left";
  context.textBaseline = "top";

  for (const cell of getTableCellTextLayouts(element, env)) {
    if (cell.lines.length === 0) {
      continue;
    }
    context.save();
    context.beginPath();
    context.rect(cell.x, cell.y, cell.width, cell.height);
    context.clip();
    cell.lines.forEach((line, index) => {
      context.fillText(
        line,
        cell.x + cell.padding,
        cell.y + cell.padding + index * cell.lineHeightPx,
      );
    });
    context.restore();
  }
  context.restore();
};

const insertFraction = (
  fractions: readonly number[],
  index: number,
  inserted: number,
): { fractions: number[]; scale: number } | null => {
  if (!(inserted > 0)) {
    return null;
  }
  const next = [
    ...fractions.slice(0, index),
    inserted,
    ...fractions.slice(index),
  ];
  const sum = next.reduce((total, value) => total + value, 0);
  return {
    fractions: next.map((value) => value / sum),
    scale: sum,
  };
};

const removeFraction = (
  fractions: readonly number[],
  index: number,
): { fractions: number[]; scale: number } | null => {
  if (fractions.length <= 1 || index < 0 || index >= fractions.length) {
    return null;
  }
  const next = fractions.filter((_, current) => current !== index);
  const sum = next.reduce((total, value) => total + value, 0);
  return {
    fractions: next.map((value) => value / sum),
    scale: sum,
  };
};

export const insertTableRow = (
  element: ExcalidrawTableElement,
  row: number,
) => {
  if (element.rowFractions.length >= TABLE_MAX_ROWS) {
    return element;
  }
  const source = Math.min(
    Math.max(row, 0),
    element.rowFractions.length - 1,
  );
  const index = Math.min(element.rowFractions.length, source + 1);
  const next = insertFraction(
    element.rowFractions,
    index,
    element.rowFractions[source],
  );
  if (!next) {
    return element;
  }
  const blank = element.colFractions.map(() => "");
  const cells = [
    ...element.cells.slice(0, index),
    blank,
    ...element.cells.slice(index),
  ];
  return newElementWith(element, {
    cells,
    rowFractions: next.fractions,
    height: element.height * next.scale,
  });
};

export const insertTableColumn = (
  element: ExcalidrawTableElement,
  col: number,
) => {
  if (element.colFractions.length >= TABLE_MAX_COLS) {
    return element;
  }
  const source = Math.min(
    Math.max(col, 0),
    element.colFractions.length - 1,
  );
  const index = Math.min(element.colFractions.length, source + 1);
  const next = insertFraction(
    element.colFractions,
    index,
    element.colFractions[source],
  );
  if (!next) {
    return element;
  }
  const cells = element.cells.map((row) => [
    ...row.slice(0, index),
    "",
    ...row.slice(index),
  ]);
  return newElementWith(element, {
    cells,
    colFractions: next.fractions,
    width: element.width * next.scale,
  });
};

export const deleteTableRow = (
  element: ExcalidrawTableElement,
  row: number,
) => {
  const next = removeFraction(element.rowFractions, row);
  if (!next) {
    return element;
  }
  return newElementWith(element, {
    cells: element.cells.filter((_, index) => index !== row),
    rowFractions: next.fractions,
    height: Math.max(
      element.height * next.scale,
      TABLE_MIN_ROW_HEIGHT * next.fractions.length,
    ),
  });
};

export const deleteTableColumn = (
  element: ExcalidrawTableElement,
  col: number,
) => {
  const next = removeFraction(element.colFractions, col);
  if (!next) {
    return element;
  }
  return newElementWith(element, {
    cells: element.cells.map((row) => row.filter((_, index) => index !== col)),
    colFractions: next.fractions,
    width: Math.max(
      element.width * next.scale,
      TABLE_MIN_COL_WIDTH * next.fractions.length,
    ),
  });
};

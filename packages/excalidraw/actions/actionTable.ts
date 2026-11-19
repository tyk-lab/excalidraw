import { viewportCoordsToSceneCoords } from "@excalidraw/common";

import {
  CaptureUpdateAction,
  deleteTableColumn,
  deleteTableRow,
  getTableCellAtScenePoint,
  insertTableColumn,
  insertTableRow,
  isTableElement,
  updateBoundElements,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawTableElement,
  NonDeleted,
} from "@excalidraw/element/types";

import type { AppState } from "../types";

import { register } from "./register";

type TableTarget = {
  element: ExcalidrawTableElement;
  row: number;
  col: number;
};

const getTableTarget = (
  elements: readonly ExcalidrawElement[],
  appState: Readonly<AppState>,
): TableTarget | null => {
  const menu = appState.contextMenu;
  if (menu) {
    const scene = viewportCoordsToSceneCoords(
      {
        clientX: menu.left + appState.offsetLeft,
        clientY: menu.top + appState.offsetTop,
      },
      appState,
    );
    for (let index = elements.length - 1; index >= 0; index--) {
      const element = elements[index];
      if (element.isDeleted || element.locked || !isTableElement(element)) {
        continue;
      }
      const cell = getTableCellAtScenePoint(element, scene.x, scene.y);
      if (cell) {
        return { element, row: cell.row, col: cell.col };
      }
    }
  }

  const selected = elements.filter(
    (element): element is ExcalidrawTableElement =>
      !!appState.selectedElementIds[element.id] &&
      !element.isDeleted &&
      !element.locked &&
      isTableElement(element),
  );
  if (selected.length !== 1) {
    return null;
  }
  const element = selected[0];
  return {
    element,
    row: element.rowFractions.length - 1,
    col: element.colFractions.length - 1,
  };
};

const registerTableAction = (
  name: "tableInsertRow" | "tableInsertColumn" | "tableDeleteRow" | "tableDeleteColumn",
  label: string,
  enabled: (target: TableTarget) => boolean,
  change: (target: TableTarget) => ExcalidrawTableElement,
) =>
  register({
    name,
    label,
    trackEvent: false,
    predicate: (elements, appState) => {
      const target = getTableTarget(elements, appState);
      return !!target && enabled(target);
    },
    perform: (elements, appState, _data, app) => {
      const target = getTableTarget(elements, appState);
      if (!target || !enabled(target)) {
        return false;
      }
      const next = change(target);
      if (next === target.element || next.isDeleted) {
        return false;
      }
      updateBoundElements(next as NonDeleted<ExcalidrawTableElement>, app.scene, {
        changedElements: new Map([[next.id, next]]),
        renderEnvironment: app.renderEnvironment,
      });
      return {
        elements: elements.map((element) =>
          element.id === target.element.id ? next : element,
        ),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      };
    },
  });

export const actionTableInsertRow = registerTableAction(
  "tableInsertRow",
  "labels.tableInsertRow",
  () => true,
  ({ element, row }) => insertTableRow(element, row),
);

export const actionTableInsertColumn = registerTableAction(
  "tableInsertColumn",
  "labels.tableInsertColumn",
  () => true,
  ({ element, col }) => insertTableColumn(element, col),
);

export const actionTableDeleteRow = registerTableAction(
  "tableDeleteRow",
  "labels.tableDeleteRow",
  ({ element }) => element.rowFractions.length > 1,
  ({ element, row }) => deleteTableRow(element, row),
);

export const actionTableDeleteColumn = registerTableAction(
  "tableDeleteColumn",
  "labels.tableDeleteColumn",
  ({ element }) => element.colFractions.length > 1,
  ({ element, col }) => deleteTableColumn(element, col),
);

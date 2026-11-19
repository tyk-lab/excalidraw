import { unstable_batchedUpdates } from "react-dom";

import {
  KEYS,
  THEME,
  applyDarkModeFilter,
  isTransparent,
  sceneCoordsToViewportCoords,
} from "@excalidraw/common";

import {
  ShapeCache,
  isTableElement,
  parseMarkdownTable,
  tableToMarkdown,
  layoutMarkdownTable,
} from "@excalidraw/element";

import type { ExcalidrawTableElement } from "@excalidraw/element/types";

import type App from "./App";

const EDITOR_SELECTOR = ".excalidraw-textEditorContainer";

/**
 * Edits a whole table as Markdown, in screen pixels. A zoomed, per-cell
 * textarea fights IME and makes the grid hard to fill; one source block
 * reflows the grid when it parses.
 */
export class TableCellEditor {
  private editable: HTMLTextAreaElement | null = null;
  private elementId: string | null = null;
  private originalCells = "";
  private closed = true;
  private ignoreBlur = false;
  private cleanups: Array<() => void> = [];

  constructor(private app: App) {}

  open(element: ExcalidrawTableElement, _row = 0, _col = 0) {
    if (element.locked || element.isDeleted) {
      return;
    }
    if (this.elementId === element.id && this.editable && !this.closed) {
      this.editable.focus({ preventScroll: true });
      return;
    }
    this.close();

    const ownerDocument = this.app.ownerDocument;
    const editorBox = ownerDocument.querySelector(EDITOR_SELECTOR);
    if (!editorBox) {
      return;
    }

    const editable = ownerDocument.createElement("textarea");
    editable.dir = "auto";
    editable.classList.add("excalidraw-wysiwyg");
    editable.dataset.testid = "table-cell-editor";
    editable.setAttribute("aria-label", "Markdown table");
    editable.spellcheck = false;
    Object.assign(editable.style, {
      position: "absolute",
      display: "block",
      margin: "0",
      resize: "none",
      boxSizing: "border-box",
      zIndex: "var(--zIndex-wysiwyg)",
      whiteSpace: "pre",
      overflow: "auto",
      borderRadius: "8px",
      padding: "8px 10px",
      font: "14px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.16)",
    });

    this.editable = editable;
    this.elementId = element.id;
    this.originalCells = JSON.stringify(element.cells);
    this.closed = false;
    editable.value = tableToMarkdown(element.cells);
    editorBox.appendChild(editable);
    this.position();
    this.bind(editable);

    const empty = element.cells.every((row) => row.every((cell) => !cell.trim()));
    editable.focus({ preventScroll: true });
    if (empty) {
      editable.select();
    } else {
      const end = editable.value.length;
      editable.setSelectionRange(end, end);
    }
  }

  close(options?: { capture?: boolean }) {
    if (this.closed) {
      return;
    }
    this.commit();
    const element = this.current();
    const capture =
      options?.capture !== false &&
      !!element &&
      JSON.stringify(element.cells) !== this.originalCells;
    this.closed = true;
    this.detach();
    if (capture) {
      this.app.store.scheduleCapture();
    }
  }

  private current() {
    if (!this.elementId) {
      return null;
    }
    const element = this.app.scene.getNonDeletedElement(this.elementId);
    return element && isTableElement(element) ? element : null;
  }

  /** Applies the textarea when it is a Markdown table. Invalid text is left as-is. */
  private commit() {
    const element = this.current();
    const editable = this.editable;
    if (!element || !editable) {
      return;
    }
    const cells = parseMarkdownTable(editable.value);
    if (!cells || JSON.stringify(cells) === JSON.stringify(element.cells)) {
      return;
    }
    const layout = layoutMarkdownTable(
      cells,
      element.fontSize,
      element.fontFamily,
      this.app.renderEnvironment,
    );
    unstable_batchedUpdates(() => {
      ShapeCache.delete(element);
      this.app.scene.mutateElement(element, { cells, ...layout });
    });
  }

  private position() {
    const element = this.current();
    const editable = this.editable;
    if (!element || !editable) {
      return;
    }
    const { x: viewportX, y: viewportY } = sceneCoordsToViewportCoords(
      { sceneX: element.x, sceneY: element.y + element.height },
      this.app.state,
    );
    const { offsetLeft, offsetTop, zoom, theme } = this.app.state;
    const dark = theme === THEME.DARK;
    const color = applyDarkModeFilter(element.strokeColor, dark);
    const background = isTransparent(element.backgroundColor)
      ? this.app.state.viewBackgroundColor
      : applyDarkModeFilter(element.backgroundColor, dark);
    const lines = Math.max(4, editable.value.split("\n").length + 1);
    const width = Math.max(280, Math.min(560, element.width * zoom.value));

    Object.assign(editable.style, {
      left: `${viewportX - offsetLeft}px`,
      top: `${viewportY - offsetTop + 8}px`,
      width: `${width}px`,
      height: `${Math.min(320, lines * 22)}px`,
      color,
      background,
      border: `1px solid ${color}`,
    });
  }

  private bind(editable: HTMLTextAreaElement) {
    const ownerWindow = this.app.ownerWindow;
    const onInput = () => {
      this.commit();
      this.position();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYS.ESCAPE || (event.key === KEYS.ENTER && event[KEYS.CTRL_OR_CMD])) {
        event.preventDefault();
        event.stopPropagation();
        this.close();
        return;
      }
      event.stopPropagation();
    };
    const onBlur = () => {
      ownerWindow.requestAnimationFrame(() => {
        if (this.closed) {
          return;
        }
        if (this.ignoreBlur) {
          this.ignoreBlur = false;
          this.editable?.focus({ preventScroll: true });
          return;
        }
        this.close();
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (this.closed) {
        return;
      }
      const target = event.target;
      if (target === editable) {
        return;
      }
      if (
        target instanceof ownerWindow.Element &&
        target.closest(
          ".properties-content, .properties-trigger, .App-menu, .context-menu",
        )
      ) {
        this.ignoreBlur = true;
        return;
      }
      this.close();
    };
    const unbindUpdate = this.app.scene.onUpdate(() => {
      if (!this.current()) {
        this.close({ capture: false });
        return;
      }
      this.position();
    });
    const unbindScroll = this.app.onScrollChangeEmitter.on(() => this.position());

    editable.addEventListener("input", onInput);
    editable.addEventListener("keydown", onKeyDown);
    editable.addEventListener("blur", onBlur);
    const attachPointer = ownerWindow.requestAnimationFrame(() => {
      ownerWindow.addEventListener("pointerdown", onPointerDown, true);
    });

    this.cleanups.push(() => {
      ownerWindow.cancelAnimationFrame(attachPointer);
      editable.removeEventListener("input", onInput);
      editable.removeEventListener("keydown", onKeyDown);
      editable.removeEventListener("blur", onBlur);
      ownerWindow.removeEventListener("pointerdown", onPointerDown, true);
      unbindScroll();
      unbindUpdate();
      editable.remove();
    });
  }

  private detach() {
    const cleanups = this.cleanups;
    this.cleanups = [];
    this.editable = null;
    this.elementId = null;
    for (const cleanup of cleanups) {
      cleanup();
    }
  }
}

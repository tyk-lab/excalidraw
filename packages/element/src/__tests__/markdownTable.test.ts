import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from "@excalidraw/common";

import {
  layoutMarkdownTable,
  parseMarkdownTable,
  tableToMarkdown,
} from "../markdownTable";

describe("markdown table", () => {
  it("parses a GitHub table and ignores the separator", () => {
    expect(
      parseMarkdownTable(`
        | 姓名 | 年龄 |
        | --- | --- |
        | 张三 | 18 |
        | 李四 | 20 |
      `),
    ).toEqual([
      ["姓名", "年龄"],
      ["张三", "18"],
      ["李四", "20"],
    ]);
  });

  it("rejects prose and tables without a separator", () => {
    expect(parseMarkdownTable("姓名 | 年龄\n张三 | 18")).toBeNull();
    expect(parseMarkdownTable("hello\n\n| a | b |\n| --- | --- |\n| 1 | 2 |")).toBeNull();
  });

  it("round-trips through Markdown", () => {
    const cells = [
      ["姓名", "年龄"],
      ["张三", "18"],
    ];
    expect(parseMarkdownTable(tableToMarkdown(cells))).toEqual(cells);
  });

  it("sizes columns from the text", () => {
    const layout = layoutMarkdownTable(
      [
        ["短", "比较长的一列"],
        ["1", "2"],
      ],
      DEFAULT_FONT_SIZE,
      DEFAULT_FONT_FAMILY,
    );
    expect(layout.colFractions[1]).toBeGreaterThan(layout.colFractions[0]);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});

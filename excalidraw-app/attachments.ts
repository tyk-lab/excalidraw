import { FONT_FAMILY, ROUNDNESS, randomId } from "@excalidraw/common";
import {
  newElement,
  newFreeDrawElement,
  newTextElement,
} from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { LocalPoint, Radians } from "@excalidraw/math";

export const ATTACHMENT_PROTOCOL = "attachment:";

export const makeAttachmentLink = (relativePath: string) =>
  `${ATTACHMENT_PROTOCOL}${encodeURIComponent(relativePath)}`;

export const getAttachmentPath = (link: string) =>
  decodeURIComponent(link.slice(ATTACHMENT_PROTOCOL.length));

const PAPERCLIP_POINTS = [
  [22, 8],
  [10, 20],
  [7, 23],
  [4, 24],
  [1, 22],
  [0, 19],
  [1, 16],
  [13, 4],
  [16, 1],
  [19, 0],
  [22, 1],
  [24, 4],
  [24, 7],
  [12, 19],
  [10, 20],
  [8, 19],
  [7, 17],
  [8, 15],
  [18, 5],
];

export const createAttachmentElements = ({
  name,
  relativePath,
  x,
  y,
}: {
  name: string;
  relativePath: string;
  x: number;
  y: number;
}): NonDeletedExcalidrawElement[] => {
  const groupId = randomId();
  const link = makeAttachmentLink(relativePath);
  const displayName = name.length > 26 ? `${name.slice(0, 23)}…` : name;
  const shared = {
    angle: 0 as Radians,
    groupIds: [groupId],
    link,
    customData: { attachmentCard: true },
  };
  const rectangle = newElement({
    ...shared,
    type: "rectangle",
    x,
    y,
    width: 300,
    height: 84,
    strokeColor: "#74c0fc",
    backgroundColor: "#f1f8ff",
    fillStyle: "solid",
    strokeWidth: 1,
    roughness: 1,
    roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
  });
  const paperclip = newFreeDrawElement({
    ...shared,
    type: "freedraw",
    x: x + 20,
    y: y + 26,
    width: 30,
    height: 30,
    strokeColor: "#1864ab",
    backgroundColor: "transparent",
    strokeWidth: 1.5,
    roughness: 0,
    points: PAPERCLIP_POINTS.map(([px, py]) =>
      pointFrom<LocalPoint>(px * 1.25, py * 1.25),
    ),
    simulatePressure: false,
    strokeOptions: { variability: "constant", streamline: 0.5 },
  });
  const title = newTextElement({
    ...shared,
    x: x + 64,
    y: y + 15,
    text: displayName,
    fontSize: 18,
    fontFamily: FONT_FAMILY.Excalifont,
    strokeColor: "#1864ab",
    backgroundColor: "transparent",
  });
  const hint = newTextElement({
    ...shared,
    x: x + 64,
    y: y + 49,
    text: "双击打开附件",
    fontSize: 12,
    fontFamily: FONT_FAMILY.Cascadia,
    strokeColor: "#4a6a82",
    backgroundColor: "transparent",
  });
  return [rectangle, paperclip, title, hint];
};

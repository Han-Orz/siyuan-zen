/**
 * 视口边缘距离计算。
 *
 * getEdgeProximity(rect) → EdgeProximity
 *   计算 CursorRect 到各视口边缘的距离，返回最近边缘 + 0–1 淡出系数 + 是否离屏。
 *
 * 设计要点：
 *   - 纯数学（无 DOM 查询），每帧调用 < 0.01ms
 *   - 距离带符号：正 = 视口内，负 = 视口外
 *   - factor：0 = 完全淡出，1 = 无淡出（正常显示）
 *   - 离屏时 factor 强制为 0（即使 |距离| 大于 ZONE）
 */

import { EDGE_FADE } from "../config";
import type { CursorRect } from "../types";

export interface EdgeProximity {
  /** 主最近边缘方向；居中或无法判定时为 null。 */
  edge: "top" | "bottom" | "left" | "right" | null;
  /** 距最近视口边缘的距离（px）。正 = 视口内，负 = 视口外。 */
  distance: number;
  /** 0–1 淡出系数：0 = 完全淡出，1 = 无淡出。 */
  factor: number;
  /** 光标是否完全离开视口？ */
  isOffScreen: boolean;
  /** 各边缘原始带符号距离（正=内，负=外）。 */
  raw: { top: number; bottom: number; left: number; right: number };
  /** 光标矩形 x 坐标（视口空间），供 commit 3 箭头定位。 */
  cursorX: number;
  /** 光标矩形 y 坐标（视口空间），供 commit 3 箭头定位。 */
  cursorY: number;
}

const EDGE_NAMES: ReadonlyArray<"top" | "bottom" | "left" | "right"> = [
  "top",
  "bottom",
  "left",
  "right",
];

/**
 * 计算光标矩形相对视口各边的带符号距离，找出最近边缘并给出淡出系数。
 * 距离定义：top = rect.y - effectiveTop, bottom = effectiveBottom - (rect.y + rect.height),
 *           left = rect.x - effectiveLeft, right = effectiveRight - (rect.x + rect.width)。
 *
 * editorRect（可选）：编辑器主区（protyle-content）的 bounding rect。
 *   用来把淡出边界对齐到"编辑器内容区"而不是"裸视口"。SiYuan 顶部 ~55px 是
 *   toolbar/breadcrumb/标题，不属于编辑器内容；如果用裸视口算边缘距离，光标在
 *   顶部 editorRect.top=55 处就进入 case B（isInAllowElements 判定出界），但
 *   getEdgeProximity 的 ZONE 内淡出永远到不了，导致顶部无渐变。
 *   传 editorRect 后：effectiveTop = max(0, editorRect.top)，顶部淡出对齐到
 *   editorRect.top = 55，行为与底部对称。
 */
export function getEdgeProximity(
  rect: CursorRect,
  editorRect?: { top: number; bottom: number; left: number; right: number },
): EdgeProximity {
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;

  const effectiveTop = editorRect ? Math.max(0, editorRect.top) : 0;
  const effectiveBottom = editorRect ? Math.min(vpH, editorRect.bottom) : vpH;
  const effectiveLeft = editorRect ? Math.max(0, editorRect.left) : 0;
  const effectiveRight = editorRect ? Math.min(vpW, editorRect.right) : vpW;

  const top = rect.y - effectiveTop;
  const bottom = effectiveBottom - (rect.y + rect.height);
  const left = rect.x - effectiveLeft;
  const right = effectiveRight - (rect.x + rect.width);

  const raw = { top, bottom, left, right };

  const isOffScreen = top < 0 || right < 0 || bottom < 0 || left < 0;

  // 找最近边缘：|距离| 最小者。优先级 top > bottom > left > right（用于 ties）。
  let nearestEdge: EdgeProximity["edge"] = null;
  let signedDistance = 0;
  let absMin = Infinity;
  for (const name of EDGE_NAMES) {
    const dist = raw[name];
    const abs = Math.abs(dist);
    if (abs < absMin) {
      absMin = abs;
      nearestEdge = name;
      signedDistance = dist;
    }
  }

  // 离屏强制 factor = 0；视口内按 distance / ZONE 线性 clamp。
  const factor = isOffScreen
    ? 0
    : Math.max(0, Math.min(1, signedDistance / EDGE_FADE.ZONE));

  return {
    edge: nearestEdge,
    distance: signedDistance,
    factor,
    isOffScreen,
    raw,
    cursorX: rect.x,
    cursorY: rect.y,
  };
}

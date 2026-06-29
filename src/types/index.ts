// zenType 共享类型定义

export type RippleMode = "text" | "mouse" | "paused";

export type ModuleName = "cursor" | "typewriter" | "ripple";

export interface ModuleEnabled {
  cursor: boolean;
  typewriter: boolean;
  ripple: boolean;
}

/**
 * 顺滑光标显示矩形（viewport 坐标）。
 * x/y 是光标左上角位置（已做垂直居中处理）；
 * height = 当前行 computed lineHeight × LINE_HEIGHT_RATIO。
 * width 保留原始 rect.width，供未来扩展。
 */
export interface CursorRect {
  x: number;
  y: number;
  height: number;
  width: number;
}
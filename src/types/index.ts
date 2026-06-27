// zenType 共享类型定义

export type RippleMode = "text" | "mouse" | "paused";

export interface RippleState {
  mode: RippleMode;
  lastTextCursorChange: number;
  lastMouseBlock: Element | null;
  lastTextBlock: Element | null;
}

export interface CursorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ModuleName = "cursor" | "typewriter" | "ripple";

export interface ModuleEnabled {
  cursor: boolean;
  typewriter: boolean;
  ripple: boolean;
}
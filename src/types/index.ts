// zenType 共享类型定义

export type RippleMode = "text" | "mouse" | "paused";

export type ModuleName = "cursor" | "typewriter" | "ripple";

export interface ModuleEnabled {
  cursor: boolean;
  typewriter: boolean;
  ripple: boolean;
}
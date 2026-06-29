import { getFrontend } from "siyuan";

/**
 * 移动端检测 —— 使用官方 getFrontend() API（P2 替换）。
 * 旧实现用 document.getElementById("sidebar") 是思源手机版的内部实现细节，
 * 可能在版本升级中改名。getFrontend() 是稳定的官方 API。
 */
export function isMobile(): boolean {
  const frontend = getFrontend();
  return frontend === "mobile" || frontend === "browser-mobile";
}

/**
 * zenType 用户可配置参数。
 *
 * 改完保存即可，开发模式会自动重新构建（pnpm run dev）。
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  CSS 侧参数（颜色、宽度、移动曲线、关键帧）：                     │
 * │  编辑 `src/styles/index.scss` 中 `#zentype-cursor` 块             │
 * │  - 宽度：width                                                     │
 * │  - 颜色：background + --zt-cursor-color                            │
 * │  - 移动曲线：transition                                            │
 * │  - 关键帧：@keyframes zentype-breathe                              │
 * │  - 动画时长：animation (3s 1.5s ...)                              │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  CSS 侧参数（高亮条）：                                            │
 * │  编辑 `src/styles/index.scss` 中 `#zentype-highlight-line` 块     │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  行为侧参数（光标高度比、闪烁延迟等）→ 本文件。                    │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ 当前是早期迭代期（BUG 多），本文件只放"已稳定且用户可能想调节"的参数。
 * ⚠️ `as const` 保证值不被意外修改；如需运行时调整请改 union type。
 */

export const CURSOR_CONFIG = {
  /** 光标高度 = 所在行 lineHeight × 此倍数。参考版用 0.88；用户硬性要求 1.1（光标更饱满）。 */
  HEIGHT_RATIO: 1.1,

  /** 光标停止活动后多少毫秒恢复呼吸闪烁。 */
  BLINK_DELAY_MS: 500,
} as const;

/** 打字机高亮条参数（光标保持在 38% 位置时滚动到屏幕中心）。 */
export const TYPEWRITER_CONFIG = {
  /** 高亮条目标位置：编辑器可视区域高度的此比例处。 */
  TARGET_RATIO: 0.38,
  /** 触发平滑滚动的偏移阈值（px）。 */
  THRESHOLD: 40,
  /** 滚动动画时长（ms）。 */
  DURATION: 400,
} as const;

/** 涟漪聚焦参数（按块距离衰减 opacity）。 */
export const RIPPLE_CONFIG = {
  /** 每级块距离对应的 opacity 衰减（0=完全淡化，1=不淡化）。 */
  OPACITY_LEVELS: [1.0, 0.85, 0.6, 0.35, 0.15, 0.05] as const,
  /** 鼠标移动事件节流（ms）。 */
  MOUSE_THROTTLE: 100,
  /** 空闲多少毫秒后从 text 模式切到 mouse 模式。 */
  IDLE_THRESHOLD: 2000,
} as const;

/* ---------------------------------------------------------------------------
 * 尚未开放的行为开关（hooks for P2+）：
 *   - CURSOR_SMOOTH_ENABLED       （关闭后光标瞬移，需同时删 SCSS transition）
 *   - CURSOR_BLINK_ENABLED        （关闭后光标常亮，需同时删 SCSS animation）
 *   - CURSOR_APPLY_TO_TITLE       （标题区域是否显示，需 cursor.ts 加判断）
 *   - CURSOR_USE_IN_MOBILE        （移动端总开关）
 *
 * 这些需要 SCSS 编译策略 / cursor.ts 逻辑共同配合，目前还没接好。
 * 临时调节：直接编辑 src/styles/index.scss 和 src/modules/cursor.ts。
 * ------------------------------------------------------------------------- */
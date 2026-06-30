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
  /** 光标高度 = 所在行 lineHeight × 此倍数。参考版用 0.88；用户要求 1.05（稍短，减少对行的视觉覆盖）。 */
  HEIGHT_RATIO: 1.05,

  /** 光标停止活动后多少毫秒恢复呼吸闪烁（Phase 1 → Phase 2 的间隔）。 */
  BLINK_DELAY_MS: 1500,
} as const;

/** 打字机参数（光标保持在 38% 位置时滚动到屏幕中心）。 */
export const TYPEWRITER_CONFIG = {
  /** v2.2.1 旧字段，保留兼容（v2.3.0 改用 COMFORT_ZONE 区间）。 */
  TARGET_RATIO: 0.38,
  /** v2.3.0：舒适区间 [低, 高]。光标在此区间内时不触发滚动。 */
  COMFORT_ZONE: [0.38, 0.50],
  /** v2.3.0：滚动距离→时长分档（ms），从 typewriter.ts 移入 config。 */
  SCROLL_DURATION_TIERS: [120, 180, 260, 360, 500],
  /** v2.3.0：打字机滚动动画曲线（与光标 transition 一致）。 */
  SCROLL_CURVE: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  /** 保留兼容（v2.3.0 不再使用）。 */
  THRESHOLD: 40,
  /** 保留兼容（v2.3.0 改用 SCROLL_DURATION_TIERS）。 */
  DURATION: 400,
} as const;

/* ---------------------------------------------------------------------------
 * 高亮条 (highlight bar) 入口 — 当前未启用
 *
 * 状态：暂时禁用。typewriter 模块当前只做滚动，不再渲染高亮条。
 *      相关 DOM / CSS 已移除（src/modules/typewriter.ts、src/styles/index.scss）。
 *      本注释保留作为未来恢复入口。
 *
 * 恢复步骤（未来）：
 *   1. src/modules/typewriter.ts
 *        → 重新引入 createHighlightElement() + updateHighlight()
 *        → initTypewriter() 创建 div，destroyTypewriter() 清理
 *        → checkAndScroll() 在每条 early-return 路径清 .visible
 *   2. src/styles/index.scss
 *        → 恢复 #zentype-highlight-line + .visible 块（参见 git 历史 v2.2 之前）
 *   3. 可选：考虑 Neo-Plus 风格的 CSS mask 方案
 *        （见 参考/Neo-Plus-聚焦与打字机分析.md §4.5 — 收益最大但风险最高）
 *
 * 历史：v2.2.x 使用 #zentype-highlight-line div + CSS transform，z-index 由
 *       src/utils/getEffectiveZIndex.ts 沿祖先链动态计算。P3 重构时下线。
 * ------------------------------------------------------------------------- */

/** 涟漪聚焦参数（按块距离衰减 opacity）。 */
export const RIPPLE_CONFIG = {
  /** v2.2.1 旧字段，保留兼容（v2.3.0 改用 SENTENCE_LEVELS）。 */
  OPACITY_LEVELS: [1.0, 0.85, 0.6, 0.35, 0.15, 0.05] as const,
  /** v2.3.0：句级 / 块级 opacity 梯度（5 档，替换旧的 6 档块级 OPACITY_LEVELS）。 */
  SENTENCE_LEVELS: [1.0, 0.88, 0.72, 0.55, 0.42] as const,
  /** v2.3.0：嵌入块基础值 × 此系数（TODO: 区分不同块类型）。 */
  EMBED_MULTIPLIER: 0.85,
  /** v2.3.0：列表深度每层 opacity × (1 - DEPTH_FACTOR)，最低 0.7。 */
  DEPTH_FACTOR: 0.05,
  /** v2.3.0：视觉权重下限（lerp 起点）。 */
  WEIGHT_MIN: 0.85,
  /** 鼠标移动事件节流（ms）。 */
  MOUSE_THROTTLE: 100,
  /** 空闲多少毫秒后从 text 模式切到 mouse 模式。 */
  IDLE_THRESHOLD: 2000,
} as const;

/** 边缘交互：光标接近视口边缘时的淡出 + 缩放。 */
export const EDGE_FADE = {
  /** 距视口边缘的距离（px），淡出 + 缩放在此范围内完成。TODO-3：从 60 收紧到 30，避免最后一行的 caret 就触发淡出。 */
  ZONE: 20,
  /** 光标完全离开视口时的最小缩放系数。 */
  MIN_SCALE: 0.6,
} as const;

/**
 * 光标移动距离 → 过渡时长映射。距离越大，时长越长（避免长距离瞬移感）。
 *
 * 当前光标离屏时不播放边缘动画（squish/bounce 已回滚），所以此处只影响
 * 在视口内移动的情况：typing / click 选行 / Enter 跳块 等。
 *
 * 用法：在数组中调整 `{ maxDist, duration }`。距离 < maxDist 时使用对应 duration。
 * 最后一个的 maxDist 用 Infinity 表示"超过所有前面阈值的距离"。
 *
 * 调整建议：
 *   - 想 typing 更干脆：把第一个 duration 调小（0.04 ~ 0.06）
 *   - 想长跳转更顺滑：把最后一个 duration 调大（0.5 ~ 1.0）
 *   - 想中间档位更细分：往数组里加元素
 */
export const TRANSITION = {
  TIERS: [
    { maxDist: 30, duration: 0.07 },       // 极短距离（typing 1~3px）：snappy
    { maxDist: 150, duration: 0.15 },     // 短距离（行内跳转）：顺滑
    { maxDist: 500, duration: 0.21 },     // 中距离（跨段）：明显顺滑
    { maxDist: Infinity, duration: 0.30 }, // 长距离（跨屏）：长缓动
  ] as const,
} as const;

/** 边缘交互：视口边缘方向箭头指示器。 */
export const EDGE_ARROW = {
  /** 总开关：关闭后箭头永不显示。TODO-2：用户测试后默认关闭。 */
  ENABLED: false,
  /** 箭头显示时的透明度（0–1）。 */
  OPACITY: 0.6,
  /** 三角形大小（px），即箭头指针高度。 */
  SIZE: 12,
  /** 距视口边缘的距离（px），箭头与边缘留此间距。 */
  OFFSET: 8,
  /** 淡入淡出过渡时长（ms），对应 CSS transition。 */
  TRANSITION_MS: 200,
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

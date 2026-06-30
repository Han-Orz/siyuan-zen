# TODO — Known Issues

> **状态（2026-06-30）**：4 项全部解决，相关 commit 在 `fix/v2.2.0-cursor-optimization` 分支上。

## 已解决

| 编号 | 问题 | 解决 commit |
|---|---|---|
| TODO-1 | 初始 cursor "whoosh" 从屏幕外滑入 | `ba0bcea` — `createCursorElement` 元素进 DOM 即加 `.no-transition` |
| TODO-2 | 边缘箭头指示器不需要 | `84193de` — `EDGE_ARROW.ENABLED: false` + 包裹箭头 if/else 块 |
| TODO-3 | 边缘定义太宽（60px 触发太早） | `924c337` — `EDGE_FADE.ZONE: 60 → 30`，后续用户手动收到 20 |
| TODO-4 | 滚出顶部和底部动画不对称 | `c168586` — 把 squish/bounce 块提到边界早退前 + `!isOuterElement` 守门 |

## 后续 follow-up（独立，不在原 4 项内）

- **顶部 / 底部动画对称性**（oracle 发现）：`getEdgeProximity` 用 viewport 边，`isInAllowElements` 用 protyle-content 的 rect，两套坐标系错位。修复在 `1ea9891` —— `getEdgeProximity` 接受可选 `editorRect` 参数，对齐两套边界。
- **返回方向 instant jump**（顺带在 `1ea9891` 修）：`.no-transition` 漏移除导致回屏第一帧硬跳。新增 `wasOffScreen` 状态，case C 首帧 force-remove + reflow。
- **Q7 距离→时长**（`0ee73ed`）：从内联 `dist/1500` 公式搬到 `config.TRANSITION.TIERS` 分档表（用户已手动调到 0.07/0.15/0.21/0.30）。

## 仍存留（不在本次范围）

- **EDGE_ARROW 相关函数**：`createArrowElement` / `showArrow` / `hideArrow` / `getOffScreenArrowPosition` 因 `ENABLED=false` 不可达，但代码保留作为 opt-in 入口。如决定彻底删除可单独提一个 cleanup commit。
- **`applyFadeAndScale` 的 `scale` 参数**：3 个调用点都传 `EDGE_FADE.MIN_SCALE`，参数实际上等价于常量。可清理（变成不带 scale 参数的 `applyFade`），但行为不变，只是冗余。
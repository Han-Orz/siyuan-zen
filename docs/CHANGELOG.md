# Changelog

## v2.2.1 (2026-06-30) — Cursor Edge-Fade Fixes

Branch: `fix/v2.2.0-cursor-optimization`（8 commits ahead of v2.2.0，尚未发 release）

### Fixed
- **TODO-1**: 插件加载时 cursor 从 (0,0) "whoosh" 到实际位置 → `createCursorElement` 在元素进 DOM 那一刻即加 `.no-transition`，首次 doUpdateCursor 写完真实位置后下一帧移除（`ba0bcea`）
- **TODO-2**: 边缘箭头指示器默认关闭 → `EDGE_ARROW.ENABLED: false` + 包裹箭头 if/else 块（`84193de`）
- **TODO-3**: 边缘定义太宽（60px 触发太早）→ `EDGE_FADE.ZONE: 60 → 30`，后续用户手动收到 20（`924c337`）
- **TODO-4**: 滚出顶部和底部动画不对称 → 把 squish/bounce 触发块提到边界早退前 + `!isOuterElement` 守门（`c168586`）

### Changed
- **顶部/底部边缘对齐到 editor rect**（`1ea9891`）—— 之前 `getEdgeProximity` 用 viewport 边、`isInAllowElements` 用 protyle-content rect（约 y=55），两套坐标系错位导致顶部永远进不了淡出区看着瞬切。现在 `getEdgeProximity(rect, editorRect?)` 接受可选 editor rect，顶部/底部对称淡出。
- **返回方向 instant jump 修复**（同 commit `1ea9891`）—— 新增 `wasOffScreen` 状态，case C 首帧 force-remove `.no-transition` + reflow，让回屏第一帧 opacity 也走 transition。
- **squish/bounce 动画下线**（`0ee73ed`）—— 用户测试反馈 scale 动画"显得像弹弓"，删除所有 scale 关键帧 + 触发函数 + `wasOffScreen`/`squishAnimTimer` state。
- **Q7 距离→时长**（`0ee73ed`）—— 从内联 `dist/1500` 公式搬到 `config.TRANSITION.TIERS` 分档表（用户已手动调到 `0.07/0.15/0.21/0.30`）。
- **(0,0) 跳修复**（`282a964`）—— SCSS keyframes 改用独立 `scale:` 属性（CSS Transform Module Level 2），不再覆盖 inline `transform: translate3d(x, y, 0)`。

### Dev workflow
- 改用 `scripts/make_dev_link.js` 建 junction，`D:\SiYuan\data\plugins\siyuan-zen` → `dev/`，配合 `pnpm run dev` watch 实现"保存即热重载"。不再使用 `npx make-install` 硬同步（siyuan-plugin-cli 已从 devDependencies 移除）。

### Cleanup
- 删除 dead state `wasOffScreen` / `squishAnimTimer`（squish/bounce 下线后） + 删除 destroy 里的死引用 `.squishing/.bouncing` class
- 更新 `docs/TODO.md` / `CURSOR_ANIMATION_DECISIONS.md` / `TESTING_GUIDE_v2.2.0.md` 反映当前状态

---

## v2.2.0 (2026-06-29) — EventBus Migration + Code Cleanup

### Added
- `src/utils/scroll.ts` — 滚动检测工具（`hasScroll` / `findAllScrollableAncestors` / `findClosestScrollableElement`），统一去重 cursor.ts / boundary.ts 中的重复实现
- `src/index.ts` — 9 个 EventBus 订阅（`loaded-protyle-static/dynamic` / `destroy-protyle` / `switch-protyle` / `click-editorcontent` / `open-menu-content` / `ws-main` / `mobile-keyboard-show/hide`），统一 `eventBusOffFns` 数组管理生命周期

### Changed
- **全面迁移到官方 EventBus** — 替换手动 `selectionchange` / `keyup` / `addEventListener("message"...)` 监听
- **WS 监听迁移** — `window.siyuan.ws.ws.addEventListener("message"...)` → `EventBus.on("ws-main")`（自动 JSON.parse + 类型安全）
- **`firstProtyleIds` → `activeProtyleIds`** — 由 `click-editorcontent` 事件驱动（用户必须点击过编辑区才显示，避免切 Tab 时闪现）
- **`isMobile()` 改用 `getFrontend()`** — 替代 `document.getElementById("sidebar")` 思源内部实现
- **`isReadMode()` 改用 `getActiveEditor()`** — 修复分屏时只取第一个 `.protyle-content` 的 BUG
- **`typewriter.getEditorContainer()` 改用 `getActiveEditor()`** — 分屏时正确锁定活跃编辑器
- **`onunload()` 顺序调整** — 先退订 EventBus（`eventBusOffFns.forEach(off => off())`）再 destroy 模块，避免悬挂引用
- **删除 dead state `loadedProtyleIds`** — reviewer 发现从未被读（仅声明/add/delete/clear），按"不保留向后兼容"原则移除

### Fixed
- **分屏 split-screen isReadMode BUG** — 之前取文档中第一个 `.protyle-content` 会选错（左编辑/右只读场景下右边的状态判定不准）

### 已知限制
- **`__zentypeScrollBound` 在 `toggle()` off→on 循环中可能残留** — re-init 后仍跳过重新绑定。reviewer 判断为非阻塞：因 `bindScrollContainerEvents` 在每次 `doUpdateCursor` 中重新遍历绑定，不影响实际行为。后续若改成"绑定一次"再修复。
- `SMOOTH_ENABLED` / `BLINK_ENABLED` / `APPLY_TO_TITLE` / `USE_IN_MOBILE` 配置开关尚未接到 JS 逻辑（CSS 编译期锁死）

### Reviewer 状态
- ✅ 5 项 R-P2 风险说明全部 verified accurate
- ✅ 9 对 EventBus on/off 完全配对
- ✅ APPROVE WITH MINOR FIXES（F1/F2/F3 已全部处理）

---

## v2.1.0 (2026-06-29) — Cursor Optimization + Configurable Parameters

### Added
- 用户可配置参数文件 `src/config.ts`（光标高度比、闪烁延迟、打字机参数、涟漪参数）
- `src/utils/getEffectiveZIndex.ts` — 动态计算光标/高亮条的有效 z-index（向上遍历层叠上下文）
- `src/utils/isMobile.ts` — 移动端检测工具
- `src/utils/getLineHeight.ts` — 行高计算工具
- `src/modules/cursor/breathing.ts` — 呼吸动画状态机（idle 后自动恢复闪烁）
- `src/modules/cursor/boundary.ts` — 3 重边界检测（活动编辑器 + AV 排除 + AABB 碰撞）
- `src/types/siyuan.d.ts` — `window.siyuan` 全局类型声明（不再内联 declare global）

### Changed
- **光标改为直角矩形**（删除原 `border-radius: 2px`）
- **行为参数**集中到 `src/config.ts`（之前散落在 `getCursorRect.ts` / `cursor.ts` / `breathing.ts` / `typewriter.ts` / `ripple.ts`）
- **ZWSP marker** 全局复用 IIFE（不再每次 fallback 新建 DOM 节点）
- **throttle 移除**：删掉三阶段 200/400/600ms setTimeout，改为 `requestAnimationFrame(queueUpdate)` 包裹 keydown/input
- **transition 优化**：删除 `height` transition（动画抖动根因），删除 `animation-delay: 0.5s`
- **CSS 关键帧**：参考参考版 0/0.9/0/0/0.3 节奏感

### Fixed
- 顺滑光标 4 个 BUG（呼吸感、高度、移动动画、边界检测）
- P1（Round 3）：动态 z-index、ResizeObserver、悬浮窗拖动检测、滚动容器事件绑定

### 已知限制（已全部解决）
- ~~P2（EventBus 迁移、`getActiveEditor/getFrontend` 全面使用）暂未实施~~ → ✅ v2.2.0 已实施
- `SMOOTH_ENABLED` / `BLINK_ENABLED` / `APPLY_TO_TITLE` / `USE_IN_MOBILE` 配置开关尚未接到 JS 逻辑（CSS 编译期锁死）

---

## v2.0.0 (2026-06-27) — Major Rewrite

### Added
- 顺滑光标：自定义蓝色光标 + 闪烁动画
- 打字机模式：38% 高度居中 + 高亮条
- 涟漪聚焦：5 级渐变曲线
- 鼠标中心聚焦模式（自动切换）
- 嵌入块作为渐淡单位
- 顶栏图标 + 命令面板
- 模块化架构（每个功能独立 init/destroy）

### Changed
- 完全重构，使用 TypeScript + esbuild
- 移除 Svelte 模板代码
- 移除设置面板框架（v2+ 重做）

### Fixed
- 全屏模式高亮条层级问题
- 退格/回车时空行聚焦问题
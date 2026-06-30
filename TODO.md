# zenType 重构计划

## 已决定的方向
- **推倒重做**（选项 B）
- 复合插件，三大功能模块：**顺滑光标** + **打字机模式** + **涟漪聚焦**
- **v1 不做设置面板和快捷键**（后期补）
- 目标技术栈参考：TS + esbuild + sass（模仿 Neo-Plus 架构）

## 三功能一句话定义
1. **顺滑光标** — 写东西时，光标移动有丝滑过渡，看起来更精致
2. **打字机模式** — 写东西时，光标永远在屏幕中央，不用低头找位置
3. **涟漪聚焦** — 写东西时，当前段最亮，其他段淡淡变暗，让人专注

## 外部参考资料
1. 思源内核 API：https://leolee9086.github.io/siyuan-kernelApi-docs
2. Neo-Plus（顺滑光标 + 沉浸模式参考）：https://github.com/QYLexpired/Neo-Plus
3. 简单插件模板（备选）：https://github.com/wish5115/my-plugin
4. Obsidian 纯 CSS 涟漪（原帖）：https://forum-zh.obsidian.md/t/topic/33359
5. 顺滑光标参考实现（本地）：`参考/顺滑光标.js`

## 当前进度
- [x] 项目体检（explore 报告）
- [x] 外部资料调研（librarian 报告）
- [x] 三大问题初评（推倒重做、参考对比、聚焦障碍）
- [x] **brainstorm 阶段：明确每个功能的具体形态**
- [x] 默认开关行为 → 全部默认开
  - [x] 涟漪聚焦的视觉强度/曲线 → 仿 Obsidian 版，当前块带背景高亮条
  - [x] 涟漪聚焦的渐淡单位 → **块级**（按 Protyle `[data-node-id]`，嵌入块也算）
  - [ ] README 需写清楚：思源嵌套块的复杂性（用户可能误以为 v1 能完美处理嵌套）
  - [x] 打字机模式位置 → **黄金分割偏上（38%）**
  - [x] 打字机模式触发方式 → **阈值触发 + 丝滑过渡**（阈值 40px，时长 400ms，缓动 easeInOutCubic）
- [x] 鼠标流体拖尾 → **不做**（性能开销大）
- [x] 模块归属澄清：**高亮条归"打字机模式模块"**，不是光标模块
- [x] 顺滑光标颜色 → **保持蓝色 #5d8cd7（亮）/ #8ab4f8（暗）**（已验证的搭配，保留接口让用户后期可改）
- [x] v1 顶栏按钮/菜单设计 → **D. 总开关（顶栏）+ 命令面板（Ctrl+Shift+P 可单独切换）**
- [x] **顺滑光标边界行为 → 除非显式关闭，永不停**
- [x] **边界场景 v2 修订**：
  - A. 选中多行：**聚焦 + 打字机暂停（带渐出动画）**，**光标不变**
  - B. **新增鼠标中心聚焦**：只读模式 / 编辑模式 + 鼠标静止 2s / 鼠标移到非文本光标块 → 自动切到鼠标中心
  - C. 悬浮窗里编辑：**聚焦 + 打字机暂停**，**光标不变**
  - D. 嵌入块：**加入涟漪聚焦**（作为渐淡单位），**打字机跳过**
  - E. 嵌套块：**v1 简单方案**（不递归），如果用户反馈需要再做 v2 复杂方案
- [x] 设计文档：`docs/superpowers/specs/2026-06-27-zentype-redesign-design.md`
- [x] 用户审阅 v2 设计文档 → **通过**
- [x] 写实施计划：`docs/superpowers/plans/2026-06-27-zentype-redesign-plan.md`（10 个任务）
- [ ] 用户选择执行方式（subagent-driven 或 inline）
- [ ] 代码实现（按计划逐步执行）

## 已识别但未决的开放问题
- 是否引入设置面板框架（如要，则影响构建链）→ **v1 不做，v2+ P0**
- 是否引入 Svelte（不引入则用纯 TS+DOM）→ **不引入，纯 TS+DOM**
- 涟漪聚焦的「距离计算」是用 JS 重算 vs CSS 变量驱动 vs DOM 注入 class → **JS 重算（最简单直接）**
- 三个功能的「开关入口」放哪里 → **顶栏总开关 + 命令面板单开关**
- 与思源主题（明亮/暗黑）的色彩适配方案 → **CSS 变量 `[data-theme-mode="dark"]`**

---

### Plan 6 边缘交互（2026-06-30，分支 `fix/v2.2.0-cursor-optimization`，8 commits，未发 release）
- [x] **TODO-1**: 初始 cursor "whoosh" 修复（`ba0bcea`）
- [x] **TODO-2**: 边缘箭头指示器默认关闭（`84193de`）
- [x] **TODO-3**: `EDGE_FADE.ZONE: 60 → 30`，用户手动收到 20（`924c337`）
- [x] **TODO-4**: 滚出顶部和底部动画对称（`c168586`）
- [x] **(0,0) 跳修复** —— keyframes 用独立 `scale:` 属性（`282a964`）
- [x] **squish/bounce 下线** —— 用户反馈"像弹弓"，删除（`0ee73ed`）
- [x] **Q7 距离→时长** —— `TRANSITION.TIERS` 分档表（`0ee73ed`）
- [x] **顶部/底部对齐 editor rect** —— `getEdgeProximity` 加可选 `editorRect` 参数（`1ea9891`）
- [x] **返回方向 instant jump** —— `wasOffScreen` 状态 + case C 首帧 force-remove `.no-transition`（`1ea9891`）
- [x] **dev workflow 改用 junction** —— `scripts/make_dev_link.js` + `pnpm run dev` watch，"保存即热重载"
- [x] **tech-debt 收尾** —— dead code 删除 + docs 更新（`39d0aa7`）

详细测试场景见 [docs/TESTING_GUIDE_v2.2.0.md](docs/TESTING_GUIDE_v2.2.0.md)。

## 实施进度（2026-06-29）

### 已实施

#### Round 5：4 个原始 BUG（cursor.ts / getCursorRect.ts）
- [x] 呼吸感（反向 idle 暂停/恢复）
- [x] 光标高度（lineHeight × 1.1，垂直居中）
- [x] 移动动画（no-transition / no-animation）
- [x] 边界检测（多重重检测）

#### Round 7：P0 完整重构
- [x] 6 项架构决策（全局 cursor、lineHeight 1.1、reverse 呼吸、viewport、dynamic zIndex、rAF）
- [x] 新建 `src/types/index.ts` (CursorRect), `getCursorElement.ts`, `getLineHeight.ts`, `cursor/breathing.ts`, `cursor/boundary.ts`
- [x] 简化 `getCursorRect()` 为单一函数（不再返回 DOMRect）

#### Round 8：兼容性 refactor
- [x] 删除双函数策略（`getCursorRect` + `getCursorDisplayRect`）
- [x] `getCursorRect()` 返回 `CursorRect {x, y, width, height}`（消费者更新字段名）

#### Round 9：P1 + 动画优化 + 兼容性（A1-A9 / B1-B5 / C1-C5）
- [x] A1-A9：9 项兼容性修复（siyuan.d.ts 拆分 / getCursorElement 解耦 / 删 height transition / ZWSP 全局复用 / isFirstMove / 选中文本 no-transition / isMobile / 删 throttle / 删 isInsidePopupOrDialog）
- [x] B1-B5：动画优化（关键帧改参考版 / no-transition 策略 / 不需要 contain）
- [x] C1-C5：P1（getEffectiveZIndex / ResizeObserver / popover drag / scrollable 容器）

#### Round 10：参数可配置 + 直角矩形
- [x] 删除 `border-radius: 2px`（改为直角矩形）
- [x] 新建 `src/config.ts`（CURSOR_CONFIG / TYPEWRITER_CONFIG / RIPPLE_CONFIG）
- [x] `getCursorRect.ts` / `cursor.ts` / `breathing.ts` / `typewriter.ts` / `ripple.ts` 全部接入 config

#### Round 11：P2 完整实施 + Reviewer 批准
- [x] **P2-1** EventBus 迁移（9 个事件：loaded-protyle-static/dynamic / destroy-protyle / switch-protyle / click-editorcontent / open-menu-content / ws-main / mobile-keyboard-show/hide）
- [x] **P2-2** `getActiveEditor()` / `getFrontend()` 全面使用（cursor.ts / typewriter.ts / edgeCases.ts / isMobile.ts）
- [x] **P2-3** WS 监听迁移到 `ws-main` EventBus（删 `wsHandler` + `addEventListener("message"...)` + `JSON.parse`）
- [x] **P2-7** `hasScroll` / `findAllScrollableAncestors` / `findClosestScrollableElement` 去重到 `src/utils/scroll.ts`
- [x] **P2-8** `isMobile()` 改用 `getFrontend()`（替代 `getElementById("sidebar")`）
- [x] **P2-9** `isReadMode()` 只取第一个 `.protyle-content` 修复（改用 `getActiveEditor().protyle.element`）
- [x] **P2-10** `firstProtyleIds` / `clickedProtyleIds` → `activeProtyleIds` Set + EventBus `click-editorcontent`
- [x] **Reviewer** APPROVE WITH MINOR FIXES（5 项 R-P2 全部 verified accurate）
- [x] **F1**：删除 dead state `loadedProtyleIds`（仅声明/add/delete/clear，从未被读）
- [x] **F3**：记录 `__zentypeScrollBound` 在 `toggle()` 循环残留的 known limitation

### 明确推迟（P2 中决定不做）
- [ ] **P2-4** SCSS → JS 字符串 — `cursor-optimization-p2-plan.md §5.1` 推荐推迟（与现有 ESBuild sass plugin 架构稳定不符）
- [ ] **P2-5** `breathing.ts` 改用 rAF — `cursor-optimization-p2-plan.md §5.2` 不推荐（`setTimeout 500ms` 是 idle 超时检测语义，rAF 16ms 无法替代）

### 长期未决（不在 P2 范围）
- [ ] #1 软链接决策（A: 管理员 PowerShell / B: 开发者模式 / C: 重写 make_dev_link.js 为 watcher+copy）
- [ ] v2.1.0 GitHub release（合并 P2 改动作为 v2.2.0 一起发布更合理）
- [ ] v2.2.0 GitHub release
- [ ] 集市上架（v2.0.0 已上架，v2.2.0 待发布）
- [ ] 用户提到的"嵌套块递归渐淡"
- [ ] `SMOOTH_ENABLED` / `BLINK_ENABLED` / `APPLY_TO_TITLE` / `USE_IN_MOBILE` 配置开关接到 JS 逻辑
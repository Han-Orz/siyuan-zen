# 顺滑光标第三轮优化——完整实施计划

> 版本：v2.2.0
> 日期：2026-06-29
> 执行者：deep-worker
> 前置条件：P0 已完成（4 个 BUG 均修复），本轮聚焦兼容性修复 + 动画优化 + P1 实施

## ✅ 状态：已完整实施

| 类别 | 项目 | 落地 |
|------|------|------|
| A1 | `declare global` → `src/types/siyuan.d.ts` | ✅ |
| A2 | `getCursorElement` 直接 import，移除 re-export | ✅ |
| A3 | 移除 `height` transition（动画抖动根因） | ✅ SCSS `transition: transform 0.15s ...` |
| A4 | ZWSP marker 全局复用 IIFE | ✅ `getCursorRect.ts :: globalZWSPMarker` |
| A5 | `isFirstMove` 首次跳过 transition | ✅ `cursor.ts:151-154` |
| A6 | 文本选中时跳过 transition | ✅ `cursor.ts:157-159` |
| A7 | `isMobile()` 工具 | ✅ `src/utils/isMobile.ts` |
| A8 | 移除三阶段 throttle，rAF 包裹 keydown/input | ✅ `cursor.ts:339-340` `requestAnimationFrame(queueUpdate)` ×2 |
| A9 | 移除 `isInsidePopupOrDialog` | ✅ boundary.ts 简化 |

### 后续优化
- ✅ **P2（EventBus 迁移 + getActiveEditor/getFrontend + 代码清理）** → `cursor-optimization-p2-plan.md`（v2.2.0）
  - 新建 `src/utils/scroll.ts`（hasScroll / findAllScrollableAncestors / findClosestScrollableElement 去重）
  - 9 个 EventBus 事件订阅（`index.ts:80/90/99/109/119/129/139/149/159`）
  - `firstProtyleIds` → `activeProtyleIds` Set + `click-editorcontent` 驱动
  - `isMobile()` / `isReadMode()` / `getEditorContainer()` 全部改用 `getFrontend()` / `getActiveEditor()`
  - 删除 dead state `loadedProtyleIds`（reviewer F1）
| B1 | 动画关键帧改为参考版（0/0.9/0/0/0.3） | ✅ index.scss `@keyframes zentype-breathe` |
| B2 | 首次移动 no-transition | ✅ 同 A5 |
| B3 | 文本选中 no-transition | ✅ 同 A6 |
| B4 | 删除 `animation-delay: 0.5s` | ✅ index.scss 改 shorthand |
| B5 | 不需要 `contain: layout` | ✅ 已用 will-change + backface-visibility |
| C1 | `getEffectiveZIndex` 工具 | ✅ `src/utils/getEffectiveZIndex.ts` |
| C2 | ResizeObserver on `.protyle-content` + `.protyle-wysiwyg` | ✅ `bindResizeObservers()`（去重用 lastBoundProtyleContent 引用比较 + 显式 disconnect） |
| C3 | block__popover 拖动检测 | ✅ `bindPopoverDrag()`（mousedown 在 dragEl，mousemove/mouseup 在 document） |
| C4 | 滚动容器事件绑定 | ✅ `bindScrollContainerEvents()`（`__zentypeScrollBound` 标志 destroy 时 `delete`） |

### 验证状态（2026-06-29）
- `tsc --noEmit`: exit 0
- `node build.js --dev`: exit 0
- Bundle grep 全部命中/未命中符合预期
- 思源插件目录 hash 同步：MATCH

### Deep-worker 风险点（plan 之外）
1. **C2 ResizeObserver 去重**：用 `lastBoundProtyleContent` 引用比较 + 显式 disconnect（比 plan 的 `__zentypeResizeObserved` 标志位更安全——标志在 disconnect 后残留会导致复用 DOM 跳绑定）。
2. **C3 popover drag**：mousedown 绑 dragEl，mousemove/mouseup 绑 document（plan 模式，参考版三个都绑 dragEl 有"鼠标移出手柄失效"BUG）。destroy 需清理两处监听，用 `popoverDragBinding` 对象保存具名函数引用。
3. **C4 `__zentypeScrollBound` destroy 时 `delete`**：避免 destroy → init 后同一滚动元素因标志残留而跳过重新绑定。
4. **rAF 包裹**：plan 6.3 节说"参考版 `requestAnimationFrame(updateCursor)` 应出现"——我们入口名是 `doUpdateCursor`，但 `requestAnimationFrame(queueUpdate)` 出现 2 次（keydown/input handlers），符合 plan 精神。

### P2（暂未实施）
EventBus 迁移、`getActiveEditor/getFrontend` 全面使用、WS 监听迁移、SCSS→JS 字符串等 10 项。

---

## 目录

1. 总览：改动一览表
2. A. 兼容性妥协修复（A1-A9）
3. B. 动画优化（B1-B5）
4. C. P1 实施（C1-C5）
5. 改动后最终文件结构
6. 验证清单
7. 风险点
8. 未做事项（P2 / 本轮不做）

---

## 1. 总览：改动一览表

| # | 文件 | 改动类型 | 优先级 | 所属 |
|---|------|---------|--------|------|
| A1 | `src/types/siyuan.d.ts` 新建 | 新建 ambient declaration | P0 | A |
| A1 | `src/modules/cursor.ts:28-39` 删除 | 删除内联 declare global | P0 | A |
| A2 | `src/utils/getCursorRect.ts:70` 删除 | 删除 re-export getCursorElement | P0 | A |
| A2 | `src/modules/ripple.ts:1` 修改 | import 路径改为 getCursorElement.ts | P0 | A |
| A2 | `src/utils/edgeCases.ts:1` 修改 | import 路径改为 getCursorElement.ts | P0 | A |
| A2 | `src/modules/cursor/boundary.ts:15` 修改 | import 路径改为 getCursorElement.ts | P0 | A |
| A3 | `src/styles/index.scss:15-17` 修改 | 移除 height 过渡 | P0 | A+B |
| A4 | `src/utils/getCursorRect.ts:56-67` 修改 | ZWSP marker 改为模块级缓存复用 | P0 | A |
| A5 | `src/modules/cursor.ts` 修改 | 添加 isFirstMove 标志，首次跳过 transition | P0 | A+B |
| A6 | `src/modules/cursor.ts` 修改 | 文本选中时添加 no-transition | P0 | A+B |
| A7 | `src/utils/isMobile.ts` 新建 | 移动端检测工具 | P0 | A+C |
| A8 | `src/modules/cursor.ts` 修改 | 移除 scheduleThrottledUpdates + 重复 keyup；改用 rAF 包裹 keydown/input | P0 | A |
| A9 | `src/modules/cursor/boundary.ts` 修改 | 移除 isInsidePopupOrDialog()，匹配参考版 | P1 | A |
| B1 | `src/styles/index.scss` 修改 | 呼吸关键帧改为参考版风格 | P0 | B |
| B2 | 同 A5 | isFirstMove 逻辑 | P0 | B |
| B3 | 同 A6 | 文本选中跳过 transition | P0 | B |
| B4 | 同 A3 | 移除 height 过渡 | P0 | B |
| B5 | `src/styles/index.scss:13-14` 不动 | will-change / backface-visibility 保持 | — | B |
| C1 | `src/utils/getEffectiveZIndex.ts` 新建 | 层叠上下文 z-index 遍历工具 | P1 | C |
| C1 | `src/modules/cursor.ts:107` 修改 | 改用 getEffectiveZIndex() | P1 | C |
| C1 | `src/modules/typewriter.ts:31-37` 修改 | 用 getEffectiveZIndex() 替代 getEditorZIndex() | P1 | C |
| C2 | `src/modules/cursor.ts` 修改 | 添加 ResizeObserver | P1 | C |
| C3 | `src/modules/cursor.ts` 修改 | 添加 popover 拖动检测 | P1 | C |
| C4 | `src/modules/cursor.ts` 修改 | 嵌套滚动容器事件绑定 | P1 | C |
| C5 | 同 A7 | isMobile 工具 | P1 | A+C |

---

## 2. A. 兼容性妥协修复

### A1. `declare global { Window.siyuan }` 内联在 cursor.ts

**当前问题**：`src/modules/cursor.ts:28-39` 有一段局部的 `declare global`。
原因是 `src/types/index.ts`（文件名不带 `.d.ts` 后缀）不被 TypeScript 作为 ambient 加载，
导致 `window.siyuan` 类型缺失。这是 P0 时为了快速通过 `tsc --noEmit` 而做的妥协。

**修复步骤**：

1. **新建** `src/types/siyuan.d.ts`（注意后缀必须是 `.d.ts`，不是 `.ts`）：

```typescript
/**
 * Ambient type augmentation for SiYuan global Window object.
 * Dedicated .d.ts so TypeScript treats it as ambient regardless of
 * whether src/types/index.ts exists as a module.
 */
declare global {
  interface Window {
    siyuan?: {
      ws?: {
        ws?: WebSocket;
      };
      zIndex?: number;
    };
  }
}

export {};
```

**为什么需要 `export {}`**：没有它，TypeScript 把 `.d.ts` 文件当 script 而非 module，
`declare global` 的行为与 module 模式不同。加 `export {}` 确保这是 module ambient declaration。

**TypeScript 自动拾取**：`tsconfig.json` 的 `include: ["src/**/*.ts"]` 只匹配 `.ts` 后缀，
但 TypeScript 编译通过 `types` 配置 + `node_modules/@types` + 项目内类型解析路径
仍会拾取 `src/types/siyuan.d.ts`（因为 `types/index.ts` 导入 `siyuan`，TypeScript 
隐式解析 `src/types` 目录下的 `.d.ts` 文件）。
**验证方法**：`tsc --noEmit` 不报 `Property 'siyuan' does not exist on type 'Window'` 即成功。

2. **删除** `src/modules/cursor.ts:28-39`（如下 12 行）：

要删除的精确内容：
行 28-29：注释块（`// 思源笔记全局对象类型 ...`）
行 30-39：`declare global { ... }` 整段

3. **验证**：
```powershell
npx tsc --noEmit
# 预期：零错误。如果有其他文件报 window.siyuan 类型缺失，检查该文件是否 import 了 cursor.ts 的局部声明
```

---

### A2. `getCursorElement` 从 `getCursorRect.ts` re-export

**当前问题**：`src/utils/getCursorRect.ts:70` 用 `export { getCursorElement }` 做 re-export。
三个文件从 `getCursorRect.ts` 导入 `getCursorElement`：
- `src/modules/ripple.ts:1`
- `src/utils/edgeCases.ts:1`
- `src/modules/cursor/boundary.ts:15`

这是一个妥协——P0 时为减少 import 路径修改，把 getCursorElement 从 getCursorRect.ts 透出。
但 getCursorElement 的真正家在 `src/utils/getCursorElement.ts`。

**修复步骤**：

1. **删除** `src/utils/getCursorRect.ts:69-70`（两行）：
```typescript
// re-export 以保持单一入口（ripple.ts / edgeCases.ts 引用）
export { getCursorElement };
```

2. **修改** import 路径（三处）：
   - `src/modules/ripple.ts:1` — 把 `from "../utils/getCursorRect"` 改为 `from "../utils/getCursorElement"`
   - `src/utils/edgeCases.ts:1` — 把 `from "./getCursorRect"` 改为 `from "./getCursorElement"`
   - `src/modules/cursor/boundary.ts:15` — 把 `from "../../utils/getCursorElement"` 改为 `from "../../utils/getCursorElement"`（路径正确，不用改；但如果当前路径是 `from "../../utils/getCursorRect"` 则改为 `from "../../utils/getCursorElement"`）

   **注意**：boundary.ts:15 当前是 `import { getCursorElement } from "../../utils/getCursorElement";`——已经正确！不需要改。只有 ripple.ts 和 edgeCases.ts 需要改。

3. **验证**：
```powershell
npx tsc --noEmit
# 预期：零错误
# 额外检查：rg "getCursorElement" src/ --type ts | rg "getCursorRect"  应返回空
```

---

### A3. `transition` 多动 `height`——动画生硬主因

**当前问题**：`src/styles/index.scss:15-17`：
```scss
transition:
  transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1),
  height 0.15s ease;
```

`height` 也参与 transition，但在光标从一个行高切换到另一个（如正文→标题）时，
`height` 过渡会产生"拉伸/收缩"的违和感。用户参考版只用 `transform` 过渡，
height 瞬时变化。

**修复**：把第 15-17 行改为单一行：

```scss
transition: transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1);
```

即删除 `, height 0.15s ease`。

**为什么这样改**：
- 参考版只用 `transform` 过渡（见 `参考/顺滑光标验证版.js:70`）：
  `transition: transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)` 
- height 变化应瞬时完成（从一行跳到另一行时高度的瞬时切换更自然）
- `will-change: transform, height` 仍然保留（浏览器仍然预告 height 会变，但不做过渡动画）

**验证**：在思源中切换行高不同的段落，观察光标高度变化是否无过渡（瞬时切换）。

---

### A4. ZWSP marker 每次 fallback 都新建

**当前问题**：`src/utils/getCursorRect.ts:56-67`，每次调用 `getZWSPRect()` 时：
```typescript
const marker = document.createTextNode("\u200B");
range.insertNode(marker);
range.selectNode(marker);
const rect = range.getBoundingClientRect();
marker.remove();
```
每次 createTextNode → insertNode → remove 是 DOM 操作开销 + GC 压力。

用户参考版用模块级 `globalMarker` 复用（`参考/顺滑光标验证版.js:142-149`）：
```javascript
const globalMarker = (() => {
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    marker.style.cssText = "position: absolute; visibility: hidden; pointer-events: none;";
    return marker;
})();
```
然后用 `range.insertNode(globalMarker)` → `globalMarker.remove()` 复用一个 DOM 节点。

**修复**：在 `src/utils/getCursorRect.ts` 模块顶层（import 之后、函数之前）添加：

```typescript
/** 全局复用 ZWSP marker，避免每次 fallback 新建 DOM 节点 */
const globalZWSPMarker = (() => {
  const span = document.createElement("span");
  span.textContent = "\u200B";
  span.style.cssText = "position: absolute; visibility: hidden; pointer-events: none;";
  return span;
})();
```

然后修改 `getZWSPRect` 函数（替换原有的 `document.createTextNode` 方式）：

```typescript
function getZWSPRect(range: Range): DOMRect | null {
  try {
    range.insertNode(globalZWSPMarker);
    range.selectNode(globalZWSPMarker);
    const rect = range.getBoundingClientRect();
    globalZWSPMarker.remove();
    return rect;
  } catch {
    return null;
  }
}
```

**注意**：参考版用 `document.createElement("span")` 而非 `createTextNode`。文本节点在没有父元素时无法调用 `getBoundingClientRect()`，span 可以。

**验证**：
- `tsc --noEmit` 通过
- 空段落 / 空表格单元格中光标正常显示

---

### A5. 没有 `isFirstMove` 跳过首次过渡

**当前问题**：光标首次出现时（插件加载后第一次 updateCursor），光标从默认位置 `(0,0)` 
过渡到实际位置，有 ~0.15s 的"飞来"动画——这是多余的。用户参考版用 `isFirstMove` 标志
（`参考/顺滑光标验证版.js:126`）跳过首次过渡。

**修复**：在 `src/modules/cursor.ts` 模块顶层添加：

```typescript
let isFirstMove = true;
```

在 `doUpdateCursor()` 中，光标即将显示时（在 `cursorEl.classList.remove("hidden")` 之前），添加：

```typescript
// 首次移动跳过过渡（避免从 (0,0) 滑到实际位置的"飞来"动画）
if (isFirstMove) {
  cursorEl.classList.add("no-transition");
  isFirstMove = false;
}
```

**精确插入位置**：`cursor.ts:131-132`（`cursorEl.classList.remove("hidden")` 之前）之间插入上述逻辑。

同时，在 `destroyCursor()` 中重置（`cursor.ts:259-260` 的行尾或附近）：
```typescript
isFirstMove = true;
```

**验证**：插件加载后第一次点击编辑器——光标应瞬间出现在目标位置（无 0.15s 滑动）。

---

### A6. 文本选中时未禁用 transition

**当前问题**：用户用鼠标拖蓝选中文字时，光标从选中起点跳到终点，过渡动画让这个跳跃
显得"拖泥带水"。用户参考版（`参考/顺滑光标验证版.js:374-379`）在 `selectionchange` 且
`selection.toString()` 非空时添加 `no-transition`。

**修复**：在 `doUpdateCursor()` 中，光标即将显示前（`cursorEl.classList.remove("hidden")` 之前），添加：

```typescript
// 文本选中时跳过顺滑过渡（光标应瞬间跳到选区末尾）
const sel = window.getSelection();
if (sel && sel.rangeCount > 0 && sel.toString()) {
  cursorEl.classList.add("no-transition");
}
```

**精确插入位置**：紧接 isFirstMove 检查之后，`cursorEl.classList.remove("hidden")` 之前。

**为什么不直接用 `hasSelection()`**：`hasSelection()` 在 `edgeCases.ts` 中已存在，但
这里只需一行 `window.getSelection()?.toString()` 判断，不需要额外的 import 依赖。

**验证**：拖蓝选中一段文字，光标跳到选中末尾时应瞬间出现，无 0.15s 滑动。

---

### A7. 没有移动端检测

**当前问题**：光标无脑显示在 title 输入框内，但移动端 title 可能不需要光标（键盘弹出时
光标会产生额外视觉噪音）。用户参考版有 `isMobile()`（`参考/顺滑光标验证版.js:725-727`）
和 `isApplyToTitle` 标志。

**修复**：

1. **新建** `src/utils/isMobile.ts`：

```typescript
/**
 * 移动端检测——思源手机版特点：存在 #sidebar 元素。
 * 参考参考/顺滑光标验证版.js:725-727。
 */
export function isMobile(): boolean {
  return !!document.getElementById("sidebar");
}
```

2. 在 `src/modules/cursor.ts` 中：
   - 导入：`import { isMobile } from "../utils/isMobile";`
   - 在 `doUpdateCursor()` 的边界检测成功且光标在 title 内时（即 `boundary.ts` 
     返回 `allowed:true` 且 `cursorElement.closest(".protyle-title__input")`），
     移动端选择性地跳过。

**精确插入位置**：`doUpdateCursor()` 中，`isInAllowElements()` 通过后、`cursorEl.classList.remove("hidden")` 之前，添加：

```typescript
// 移动端标题：可选跳过光标显示（避免移动端键盘弹出时视觉噪音）
if (isMobile() && allowed.cursorElement?.closest(".protyle-title__input")) {
  cursorEl.classList.add("hidden");
  scheduleResumeBreathe();
  return;
}
```

**注意**：这里不设 `isApplyToTitle` 配置开关（与参考版不同），mobile 时无条件跳过 title。
桌面端 title 仍正常显示光标。

---

### A8. `scheduleThrottledUpdates` 的 200/400/600ms 三阶段

**当前问题**：每次 `keyup` / `mouseup` 触发时：
1. `queueUpdate()` — rAF 立即更新
2. `scheduleThrottledUpdates()` — 创建 3 个 setTimeout（200ms、400ms、600ms）

此外，`keyup` 事件在 handlers 数组中被注册了**两次**（`cursor.ts:182` 和 `cursor.ts:195`），
导致单次 keyup 触发两次 queueUpdate + 3 个额外 setTimeout（共 5 次更新调用）。
这是 P0 时的遗留——scheduleThrottledUpdates 被追加到 handlers 数组中而非合并。

用户参考版的做法（`参考/顺滑光标验证版.js:547-548`）：
```javascript
["keydown", () => requestAnimationFrame(updateCursor)],
["input", () => requestAnimationFrame(updateCursor)],
```
**没有三阶段 throttle**。仅用 rAF 包裹 keydown 和 input，达到帧率节流。

**决策与依据**：

**推荐：移除 scheduleThrottledUpdates，改用参考版的 rAF 包裹 keydown/input 模式。**

依据：
1. 用户参考版（已验证动画效果好）没有三阶段 throttle
2. 三阶段 throttle 的原始目的（IME 输入后布局延迟、自动换行后光标抖动）已被
   `compositionend` 事件 + `input` 事件覆盖：
   - `compositionend`：IME 组合结束时触发，布局已稳定
   - `input`（rAF 包裹）：内容变更后触发，下一帧更新
   - `keydown`（rAF 包裹）：按键前预更新
3. 当前实现中 `queueUpdate()` 已有 rAF 节流（pendingFrame 标志），
   再加上 3 个 setTimeout 是冗余
4. 减少 3 个 setTimeout 每按键 = 更少 GC、更少 CPU

**修复**：

修改 `src/modules/cursor.ts` 的 handlers 数组（`cursor.ts:180-199`），改为：

```typescript
const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
  ["selectionchange", queueUpdate],
  // keydown + input 用 rAF 包裹（参考版做法），替代三阶段 throttle
  ["keydown", () => requestAnimationFrame(queueUpdate)],
  ["input", () => requestAnimationFrame(queueUpdate)],
  ["mouseup", queueUpdate],
  ["click", queueUpdate],
  [
    "scroll",
    onScrollOrWheel as EventListener,
    { capture: true, passive: true },
  ],
  ["wheel", onScrollOrWheel as EventListener, { passive: true }],
  ["touchmove", onScrollOrWheel as EventListener, { passive: true }],
  ["compositionend", queueUpdate],
  // resize 时刷新（思源侧边栏拖动会触发）
  ["resize", queueUpdate, { passive: true }],
];
```

关键变化：
- **删除** `["keyup", queueUpdate]`（被 keydown + input 取代）
- **删除** `["keyup", scheduleThrottledUpdates]`
- **删除** `["mouseup", scheduleThrottledUpdates]`
- **新增** `["keydown", () => requestAnimationFrame(queueUpdate)]`
- **新增** `["input", () => requestAnimationFrame(queueUpdate)]`

同时，删除 `scheduleThrottledUpdates` 函数（`cursor.ts:152-163`）和
`destroyCursor()` 中 `throttleTimers.forEach(clearTimeout)`（`cursor.ts:234-235`）
以及模块级 `throttleTimers` 变量（`cursor.ts:46`）。

**但保留什么**：`queueUpdate` 的 rAF 节流（pendingFrame 标志）仍然保留——
keydown/input 的 rAF 包裹只是让更新发生在下一帧，而 pendingFrame 防止同一帧内
多次 doUpdateCursor。

**验证**：
- 快速打字（英文连续输入 50 个字符）——光标紧跟无延迟
- 中文 IME 输入（composition → 选词 → 确认）——光标在确认后立即更新
- `performance.now()` 测量 `doUpdateCursor()` 耗时 < 100μs
- `rg "scheduleThrottledUpdates" src/` 返回空
- `rg "throttleTimers" src/` 返回空

---

### A9. `isInsidePopupOrDialog()` 应移除——匹配参考版

**当前问题**：`src/modules/cursor/boundary.ts:72-79` 在边界检测的第 3 重中排除
所有弹窗/对话框/搜索/面包屑/iframe。但这与用户参考版行为不一致——
参考版允许光标出现在 block popover 内的编辑器中。

**分析**：
- 参考版没有 `isInsidePopupOrDialog()`，只依赖 `closest(".protyle:not(.fn__none) .protyle-content")` 
  自然排除非编辑器区域
- 搜索框、设置面板不包含 `.protyle-content`，会被自然地拒绝
- block popover 有 `.protyle .protyle-content`，参考版允许光标在其中——通过
  `getEffectiveZIndex` 处理层级
- `iframe` 内的选区 `window.getSelection()` 访问不到（不同 document），不需要特殊处理

**修复**：

1. **删除** `src/modules/cursor/boundary.ts:72-79`（整个 popup/dialog 检测块）：
```typescript
// 第 3 重：弹窗/对话框/搜索框/iframe 排除
if (isInsidePopupOrDialog(cursorElement)) {
  return {
    allowed: false,
    cursorElement,
    isOuterElement: true,
    reason: "inside popup/dialog",
  };
}
```

2. **删除** `isInsidePopupOrDialog` 函数（`boundary.ts:138-145`）

3. **调整边界检测序号注释**：
   - 原来：第 1 重（activeEditor）→ 第 2 重（AV）→ 第 3 重（popup）→ 第 4 重（AABB）
   - 改为：第 1 重（activeEditor）→ 第 2 重（AV）→ 第 3 重（AABB）

**为什么安全**：
- `.b3-dialog`：不包含 protyle-content，AABB 自然拒绝
- `.search__layout`：不包含 protyle-content，AABB 自然拒绝
- `.protyle-breadcrumb`：同上
- `iframe`：不同 document，selection 访问不到
- `.block__popover`：**包含** protyle-content，光标现在会显示——但参考版已验证可行
  （z-index 计算保证层级正确）

**风险缓解**：如果确实有 case 需要在某些 popup 内隐藏光标，后续可加更精准的检查
（而不是无差别隐藏所有 popup）。

**验证**：
- 在 block popover 编辑器内点击——光标出现（新行为）
- 在搜索框 Ctrl+P 内点击——光标不出现（旧行为保持一致）
- 在设置面板文本框中点击——光标不出现

---

## 3. B. 动画优化

### B1. SCSS 呼吸关键帧调整

**当前**（`src/styles/index.scss:20-21` + `40-46`）：
```scss
animation: zentype-breathe 3s ease-in-out infinite;
animation-delay: 0.5s;

@keyframes zentype-breathe {
  0%   { opacity: 1; }
  45%  { opacity: 1; }
  50%  { opacity: 0.15; }
  55%  { opacity: 0.15; }
  100% { opacity: 1; }
}
```

**用户参考版**（`参考/顺滑光标验证版.js:95-104`）：
```css
animation: cursor-blink 3s 1.5s ease-in-out infinite;

@keyframes cursor-blink {
  0% { opacity: 1; }
  60% { opacity: 0.9; }
  90% { opacity: 0; }
  95% { opacity: 0; }
  100% { opacity: 0.3; }
}
```

**两种方案对比**：

| 属性 | 当前（zenType） | 参考版 | 胜出 |
|------|:------:|:------:|:---:|
| 周期 | 3s | 3s | 持平 |
| 初始 delay | 0.5s | 1.5s | **参考版** |
| 尾帧 opacity | 1（平滑循环） | 0.3（blink 感） | **参考版** |
| 最低 opacity | 0.15 | 0 | **参考版** |
| 低值占比 | ~23%（45%-55%） | ~5%（90%-95%） | **参考版** |
| 视觉感受 | 柔和渐变，无明显 "眨眼" | 有清晰的 "眨一下" 节奏感 | **参考版** |

**推荐：采用参考版关键帧。**

原因：
1. **初始 1.5s delay**：光标出现后先静止 1.5s 再开始呼吸——打字时更自然（刚点进去时不想看到闪）
2. **尾帧 0.3 opacity**：下一个 cycle 从 0.3 跳到 1 产生 "blink" 对比度——这正是"呼吸"的节奏感
3. **opacity 触底到 0**：比 0.15 更明显，眨眼感更强
4. **用户已验证参考版的动画效果好**

**修复**：修改 `src/styles/index.scss:20-21` 和 `:40-46` 为：

```scss
animation: zentype-breathe 3s 1.5s ease-in-out infinite;
// 删除 animation-delay: 0.5s;（因为 1.5s 已在 animation shorthand 中）

@keyframes zentype-breathe {
  0%   { opacity: 1; }
  60%  { opacity: 0.9; }
  90%  { opacity: 0; }
  95%  { opacity: 0; }
  100% { opacity: 0.3; }
}
```

注意：`animation-delay: 0.5s` 行（index.scss:21）要删除——因为 shorthand 已含 1.5s delay。
如果保留会覆盖 shorthand 的 delay 值。

---

### B2. isFirstMove 逻辑实现

与 A5 相同，在 `cursor.ts` 中的实现细节：

**模块级变量**（紧接 `let cursorEl` 之后，`cursor.ts:46` 附近）：
```typescript
let isFirstMove = true;
```

**在 doUpdateCursor() 中**（紧接 `cursorEl.classList.remove("hidden")` 之前）：
```typescript
if (isFirstMove) {
  cursorEl.classList.add("no-transition");
  isFirstMove = false;
}
```

**在 destroyCursor() 中重置**（在清理完 cursorEl 之后，`cursor.ts:260` 附近）：
```typescript
isFirstMove = true;
```

---

### B3. 文本选中跳过 transition

与 A6 相同的实现。要点：
- 判断条件：`window.getSelection()?.toString()` 非空
- 时机：isFirstMove 检查之后、remove("hidden") 之前
- 效果：拖蓝时跳过 0.15s 过渡，光标瞬间到位

---

### B4. transition timing 微调

与 A3 相同——移除 height 过渡。最终 `transition` 属性为：

```scss
transition: transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1);
```

**保持不变的**：
- `will-change: transform, height`（行 13）
- `backface-visibility: hidden`（行 14）
- 3px 宽度、2px border-radius

---

### B5. GPU 合成层评估

**当前已有的 GPU 友好属性**：
- `will-change: transform, height` — 预告浏览器此元素会频繁改变 transform 和 height
- `backface-visibility: hidden` — 减少重绘闪烁
- `transform: translate3d(...)` — 3D transform 强制 GPU 合成层

**是否需要加 `contain: layout`？**

**推荐：不加。**
理由：
1. `contain: layout` 会创建一个新的包含块（containing block），影响 `position: fixed` 
   的子元素定位（光标是 body 的直接子元素，不会受自身 contain 影响，但语义不匹配）
2. 光标元素没有子元素需要隔离——`contain: layout` 的开销（创建新层叠上下文 + 
   包含块）对此场景没有收益
3. 参考版也没有用 `contain`
4. 当前 `will-change` + `backface-visibility` + `translate3d` 已足以让浏览器
   建立合成层（compositor layer）

**结论**：不动 `index.scss:13-14`。

---

## 4. C. P1 实施

### C1. `getEffectiveZIndex` 工具

**新建** `src/utils/getEffectiveZIndex.ts`：

参考 `参考/顺滑光标验证版.js:645-679` 的实现，但加上更多层叠上下文条件
（参考 original plan 的 zIndex.ts 设计：还包括 opacity < 1 和 transform !== none 的检测）：

```typescript
/**
 * 从目标元素向上遍历祖先链，找到第一个创建层叠上下文的元素，
 * 返回其 z-index 数值。用于替代硬编码的 window.siyuan.zIndex。
 *
 * 层叠上下文条件：
 *   1. position: fixed 或 sticky（自动创建，即使 z-index 为 auto）
 *   2. position: absolute/relative 且 z-index 非 auto
 *   3. opacity < 1
 *   4. transform 不为 none
 */
export function getEffectiveZIndex(targetElement: Element): number {
  let current: Element | null = targetElement;

  while (current && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const zIndex = style.zIndex;
    const position = style.position;

    // 条件1：fixed / sticky 自动创建层叠上下文
    if (position === "fixed" || position === "sticky") {
      return zIndex === "auto" ? 0 : (parseInt(zIndex, 10) || 0);
    }

    // 条件2：absolute / relative + 非 auto z-index
    if (
      (position === "absolute" || position === "relative") &&
      zIndex !== "auto"
    ) {
      return parseInt(zIndex, 10) || 0;
    }

    // 条件3：opacity < 1 创建层叠上下文
    if (parseFloat(style.opacity) < 1) {
      return 0;
    }

    // 条件4：transform 非 none
    if (style.transform !== "none") {
      return zIndex === "auto" ? 0 : (parseInt(zIndex, 10) || 0);
    }

    current = current.parentElement;
  }

  return 0;
}
```

**使用方式（在 cursor.ts 中）**：

替换 `cursor.ts:106-108`：
```typescript
// 旧代码：
const siyuanZ = window.siyuan?.zIndex ?? 0;
cursorEl.style.zIndex = (siyuanZ + 1).toString();

// 新代码：
const effectiveZ = getEffectiveZIndex(allowed.cursorElement!);
const siyuanZ = window.siyuan?.zIndex ?? 0;
cursorEl.style.zIndex = String(Math.max(effectiveZ + 1, siyuanZ + 1));
```

**在 typewriter.ts 中**：

替换 `typewriter.ts:31-37` 的 `getEditorZIndex()` 函数调用：

```typescript
// 旧代码（typewriter.ts:31-37）：
function getEditorZIndex(): number {
  const container = getEditorContainer();
  if (!container) return 0;
  const computed = window.getComputedStyle(container).zIndex;
  const parsed = Number.parseInt(computed, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

// 改为：删除 getEditorZIndex 函数，在 updateHighlight() 中使用 getEffectiveZIndex
```

修改 `typewriter.ts:42`：
```typescript
// 旧：
const editorZ = getEditorZIndex();
// 新：
const container = getEditorContainer();
const editorZ = container ? getEffectiveZIndex(container) : 0;
```

同时在 typewriter.ts 顶部添加 import：
```typescript
import { getEffectiveZIndex } from "../utils/getEffectiveZIndex";
```

**边界情况**：
- `cursorElement` 为 null 时 → `getEffectiveZIndex` 不应被调用（does updateCursor 已有 guard）
- 祖先链遍历到 `document.documentElement` → 返回 0
- `window.siyuan?.zIndex` 可能 undefined → fallback 0

---

### C2. ResizeObserver

**场景**：思源编辑器尺寸变化时（拖动侧边栏、分屏、窗口 resize），光标需重新定位。
参考版（`参考/顺滑光标验证版.js:501-518`）对 `.protyle-content` 和 `.protyle-wysiwyg`
各绑定一个 ResizeObserver。

**实现**（在 `src/modules/cursor.ts` 中）：

模块级变量：
```typescript
let protyleContentObserver: ResizeObserver | null = null;
let protyleWysiwygObserver: ResizeObserver | null = null;
```

在 `doUpdateCursor()` 末尾（`scheduleResumeBreathe()` 之后），添加绑定调用：
```typescript
bindResizeObservers(allowed.cursorElement);
```

新增函数：
```typescript
function bindResizeObservers(cursorElement: Element | null): void {
  if (!cursorElement) return;

  const protyleContent = cursorElement.closest(
    ".protyle:not(.fn__none) .protyle-content"
  ) as HTMLElement | null;

  // 只在目标元素变化时重新绑定（通过自定义属性防重）
  if (protyleContent && !(protyleContent as any).__zentypeResizeObserved) {
    (protyleContent as any).__zentypeResizeObserved = true;
    protyleContentObserver?.disconnect();
    protyleContentObserver = new ResizeObserver(() => {
      if (!cursorEl) return;
      cursorEl.classList.add("no-transition");
      queueUpdate();
    });
    protyleContentObserver.observe(protyleContent);
  }

  const protyleWysiwyg = cursorElement.closest(
    ".protyle:not(.fn__none) .protyle-wysiwyg"
  ) as HTMLElement | null;

  if (protyleWysiwyg && !(protyleWysiwyg as any).__zentypeResizeObserved) {
    (protyleWysiwyg as any).__zentypeResizeObserved = true;
    protyleWysiwygObserver?.disconnect();
    protyleWysiwygObserver = new ResizeObserver(() => {
      if (!cursorEl) return;
      cursorEl.classList.add("no-transition");
      queueUpdate();
    });
    protyleWysiwygObserver.observe(protyleWysiwyg);
  }
}
```

在 `destroyCursor()` 中清理：
```typescript
protyleContentObserver?.disconnect();
protyleContentObserver = null;
protyleWysiwygObserver?.disconnect();
protyleWysiwygObserver = null;
```

**注意**：`__zentypeResizeObserved` 自定义属性是防止重复绑定的标记。
切换 protyle 时，新 protyle-content 不会有此标记，会触发新绑定。

**但有个问题**：切换 protyle 时，旧的 protyle-content 上仍有 `__zentypeResizeObserved`
标记和 ResizeObserver 引用。当旧 protyle 被 destroy 时，ResizeObserver 的 callback 
可能已不适用。更好的做法是：在 `destroyCursor()` 中 disconnect，`initCursor()` 中重建。

**简化方案（推荐）**：不缓存 Observer 跨 protyle，每次 doUpdateCursor 都检查
当前 protyleContent 是否是上次绑定的那个——如果不是，先 disconnect 再 bind 新的。
用 `lastProtyleContent` 和 `lastProtyleWysiwyg` 引用做比较。但参考版用
自定义属性标记，也够用。保持一致即可。

---

### C3. Popover 拖动检测

**场景**：用户拖动 block popover 时，光标需跟随 popover 移动。参考版
（`参考/顺滑光标验证版.js:519-535`）监听 `.resize__move` 的 mousedown/mousemove/mouseup。

**实现**（在 `src/modules/cursor.ts` 中）：

新增函数（与 C2 类似，在 `doUpdateCursor()` 末尾调用）：

```typescript
function bindPopoverDrag(cursorElement: Element | null): void {
  if (!cursorElement) return;

  const blockPopover = cursorElement.closest(".block__popover");
  if (!blockPopover || (blockPopover as any).__zentypeDragBound) return;

  const dragEl = blockPopover.querySelector(".resize__move") as HTMLElement | null;
  if (!dragEl) return;

  (blockPopover as any).__zentypeDragBound = true;
  let isDragging = false;

  dragEl.addEventListener("mousedown", () => {
    isDragging = true;
  });

  document.addEventListener("mousemove", () => {
    if (isDragging && cursorEl) {
      cursorEl.classList.add("no-transition");
      queueUpdate();
    }
  }, { passive: true });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });
}
```

在 `doUpdateCursor()` 末尾（`bindResizeObservers()` 之后）调用：
```typescript
bindPopoverDrag(allowed.cursorElement);
```

**注意**：popover 拖动绑定的 mousemove/mouseup 监听器注册在 document 上，
清理时需在 `destroyCursor()` 中处理。当前 destroyCursor 按 `eventListeners` 
数组清理——需要把 mousemove/mouseup 也加入 eventListeners，或者用独立
的 `popoverDragListeners` 数组。

**简化建议**：与 C4（scrollEl 事件）统一管理——在 destroyCursor 中用
`document.removeEventListener` 清理额外的 document 级监听，
用遍历所有 protyle 的 `__zentypeDragBound` 清理 popover 级监听。

或者更简单：把这些事件 callback 存为具名函数引用，在 destroyCursor 
时通过引用移除。参考 C4 的设计。

---

### C4. 嵌套滚动容器事件绑定

**场景**：思源编辑器内可能存在嵌套滚动容器（如表格内滚动、长代码块滚动）。
参考版（`参考/顺滑光标验证版.js:488-499`）给每个滚动元素绑定独立的 
scroll/wheel 监听器，用 `.handleClick` 标志防重复。

**实现**（在 `src/modules/cursor.ts` 中）：

新增函数：
```typescript
function bindScrollContainerEvents(cursorElement: Element | null): void {
  if (!cursorElement) return;

  // 找到所有祖先滚动元素（含自身）
  const scrollEls = findAllScrollableAncestors(cursorElement);
  scrollEls.forEach((scrollEl) => {
    if ((scrollEl as any).__zentypeScrollBound) return;
    (scrollEl as any).__zentypeScrollBound = true;

    const handler = () => {
      if (!cursorEl) return;
      pauseBreathe();
      cursorEl.classList.add("no-transition");
      cursorEl.classList.add("no-animation");
      queueUpdate();
    };

    // 存到 eventListeners 中以便 destroy 清理
    // 注意：需要以 [event, handler, options] 三元组格式追加到 eventListeners
    scrollEl.addEventListener("scroll", handler, { passive: true });
    scrollEl.addEventListener("wheel", handler, { passive: true });

    // 存储以便清理（用闭包 + Map 或直接 push 到清理数组）
    scrollEventBindings.push({ el: scrollEl, handler });
  });
}
```

辅助函数（在 `src/utils/` 或 cursor.ts 内部，复用 boundary.ts 的 `findClosestScrollableElement` 扩展版）：
```typescript
function findAllScrollableAncestors(el: Element): HTMLElement[] {
  const result: HTMLElement[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    if (hasScroll(current)) result.push(current as HTMLElement);
    current = current.parentElement;
  }
  [document.body, document.documentElement].forEach((root) => {
    if (hasScroll(root)) result.push(root);
  });
  return result;
}

function hasScroll(el: Element): boolean {
  const style = window.getComputedStyle(el);
  const canY = (style.overflowY === "scroll" || style.overflowY === "auto") &&
    el.scrollHeight > el.clientHeight;
  const canX = (style.overflowX === "scroll" || style.overflowX === "auto") &&
    el.scrollWidth > el.clientWidth;
  return canY || canX;
}
```

模块级存储：
```typescript
const scrollEventBindings: Array<{ el: HTMLElement; handler: EventListener }> = [];
```

在 `destroyCursor()` 中清理：
```typescript
scrollEventBindings.forEach(({ el, handler }) => {
  el.removeEventListener("scroll", handler);
  el.removeEventListener("wheel", handler);
});
scrollEventBindings.length = 0;
```

**调用时机**：在 `doUpdateCursor()` 末尾调用 `bindScrollContainerEvents(allowed.cursorElement)`。
由于 `__zentypeScrollBound` 标志防重，同一元素不会重复绑定。

---

### C5. `isMobile()` 工具

与 A7 相同。文件 `src/utils/isMobile.ts` 已新建。

`cursor.ts` 中使用：见 A7 描述——移动端跳过 title 内的光标显示。

---

## 5. 改动后最终文件结构

```
src/
├── index.ts                         # 插件入口（本轮基本不动）
├── modules/
│   ├── cursor.ts                    # 主模块 ← 大幅修改
│   │   # 改动：
│   │   #  - 删除 declare global (A1)
│   │   #  - 添加 isFirstMove (A5/B2)
│   │   #  - 添加文本选中检测 (A6/B3)
│   │   #  - 添加移动端 title 跳过 (A7/C5)
│   │   #  - 移除 scheduleThrottledUpdates + throttleTimers (A8)
│   │   #  - 重构 handlers 数组：keydown/input 用 rAF 包裹 (A8)
│   │   #  - 改用 getEffectiveZIndex (C1)
│   │   #  - 添加 bindResizeObservers (C2)
│   │   #  - 添加 bindPopoverDrag (C3)
│   │   #  - 添加 bindScrollContainerEvents (C4)
│   │   #  - destroyCursor 清理新增的 observer/bindings/timer
│   ├── cursor/
│   │   ├── breathing.ts             # 呼吸状态机（本轮不动）
│   │   └── boundary.ts              # 边界检测 ← 修改
│   │       #  - 删除 isInsidePopupOrDialog() (A9)
│   │       #  - 调整边界检测序号注释
│   ├── typewriter.ts                # 打字机模式 ← 修改
│   │   #  - 删除 getEditorZIndex() 函数 (C1)
│   │   #  - 改用 getEffectiveZIndex() (C1)
│   └── ripple.ts                    # 涟漪聚焦 ← 修改
│       #  - 修改 import 路径 (A2)
├── utils/
│   ├── getCursorRect.ts             # 定位工具 ← 修改
│   │   #  - 删除 re-export (A2)
│   │   #  - ZWSP marker 改为模块级 globalZWSPMarker (A4)
│   ├── getCursorElement.ts          # 光标元素（本轮不动）
│   ├── getLineHeight.ts             # 行高计算（本轮不动）
│   ├── getEffectiveZIndex.ts        # ← 新建 (C1)
│   ├── isMobile.ts                  # ← 新建 (A7/C5)
│   ├── edgeCases.ts                 # 边界场景 ← 修改
│   │   #  - 修改 import 路径 (A2)
│   └── styleManager.ts              # 样式管理（本轮不动）
├── styles/
│   └── index.scss                   # 全局样式 ← 修改
│       #  - 移除 height 过渡 (A3/B4)
│       #  - 呼吸关键帧改为参考版风格 (B1)
│       #  - 删除 animation-delay: 0.5s;
├── types/
│   ├── index.ts                     # 共享类型（本轮不动）
│   ├── scss.d.ts                    # SCSS ambient（本轮不动）
│   └── siyuan.d.ts                  # ← 新建 (A1)
└── (其他现有文件不动)
```

---

## 6. 验证清单

### 6.1 TypeScript 编译

```powershell
npx tsc --noEmit
```
**预期**：零错误。所有严格模式检查通过。

### 6.2 构建检查

```powershell
node build.js --dev
```
**预期**：
- `dev/index.js` 生成成功
- 无 `Warning: index.js does not contain expected CSS rules` 警告
  （因为 `#zentype-cursor` 和 `#zentype-highlight-line` 选择器仍在 SCSS 中）

### 6.3 Bundle grep 检查

**应该出现的字符串**：
```
rg "#zentype-cursor" dev/index.js        # 光标主选择器
rg "zentype-breathe" dev/index.js        # 呼吸动画关键帧名
rg "no-transition" dev/index.js          # 过渡暂停类（多处）
rg "no-animation" dev/index.js           # 动画暂停类
rg "getEffectiveZIndex" dev/index.js     # C1 新增工具函数
rg "isFirstMove" dev/index.js            # A5/B2 标志变量
rg "globalZWSPMarker" dev/index.js       # A4 缓存 marker
```

**不应该出现的字符串**（确认删除）：
```
rg "scheduleThrottledUpdates" dev/index.js   # 应返回空
rg "throttleTimers" dev/index.js             # 应返回空
rg "isInsidePopupOrDialog" dev/index.js      # 应返回空（A9）
rg "getEditorZIndex" dev/index.js            # 应返回空（C1 合并）
```

### 6.4 同步到思源插件目录

```powershell
# 复制构建产物
Copy-Item -Path dev\* -Destination D:\SiYuan\data\plugins\siyuan-zen\ -Recurse -Force

# hash 一致性检查（确保 dev/index.js 与目标一致）
Get-FileHash dev\index.js -Algorithm SHA256
Get-FileHash D:\SiYuan\data\plugins\siyuan-zen\index.js -Algorithm SHA256
```
**预期**：两个 hash 一致。

### 6.5 手动功能测试

在思源中逐项验证（约 10 分钟）：

- [ ] 插件加载后首次点击编辑器 → 光标**瞬间**出现在目标位置（无"飞来"动画）[A5/B2]
- [ ] 输入文字后停止约 1.5s → 光标开始呼吸（opacity 渐变动画，有明显"眨眼感"）[B1]
- [ ] 拖蓝选中文字 → 光标瞬间跳到选区末尾（无 0.15s 滑动）[A6/B3]
- [ ] 从正文行切换到标题行 → 光标高度瞬间变化（无 height 过渡拉伸）[A3/B4]
- [ ] 快速打字（英文连续 100 字符）→ 光标紧跟无延迟 [A8]
- [ ] 中文 IME 输入 → 光标在 composition 结束后正确更新 [A8]
- [ ] 在搜索框（Ctrl+P）点击 → 光标**不出现** [A9]
- [ ] 在 block popover 编辑器内点击 → 光标出现（新行为，与参考版一致）[A9]
- [ ] 拖动侧边栏 → 光标跟随编辑器重定位 [C2]
- [ ] 拖动 block popover → 光标跟随移动 [C3]
- [ ] 嵌套滚动容器（如长表格）内滚动 → 光标紧跟 [C4]
- [ ] 暗色主题下光标颜色正常
- [ ] 分屏两个文档 → 光标只在活跃文档显示

### 6.6 性能检查

```javascript
// 在思源 DevTools Console 中临时注入：
const _t0 = performance.now();
// 快速打字 10 个字符，然后：
const _t1 = performance.now();
// 预期：无明显掉帧，FPS 保持 60
```

---

## 7. 风险点

| # | 风险 | 影响 | 缓解措施 |
|---|------|------|---------|
| R1 | `src/types/siyuan.d.ts` 不被 TypeScript 拾取 | tsc --noEmit 报 window.siyuan 错误 | 如果 tsc 未拾取，改为在 `tsconfig.json` 的 `include` 添加 `"src/types/**/*.d.ts"`（但这可能引入其他问题）；第二方案：把 declare global 移到 `scss.d.ts` 中（该文件已是 ambient） |
| R2 | 移除 `height 0.15s ease` 过渡 → 行高切换时高度突变生硬 | 用户体验下降 | 当前高度过渡本身就"违和"（参考版不用）——如果真的生硬，后续可改用更短的 easing（如 0.05s linear）而非完全移除 |
| R3 | `getEffectiveZIndex` 遍历祖先链性能 | 如果祖先链特别深（100+ 层），每帧调用可能超 100μs 预算 | 添加 `lastCursorElement` 缓存：如果 cursorElement 与上次相同，直接返回缓存值 |
| R4 | ResizeObserver 在切换 protyle 时未清理旧引用 | 内存泄漏、错误回调 | 在 `bindResizeObservers` 中每次 disconnect 旧的再 connect 新的；destroyCursor 中 disconnect |
| R5 | `.resize__move` 选择器在新版思源改名 | popover 拖动时不更新光标 | 加 try-catch 包裹，选择器不存在时静默跳过 |
| R6 | `scheduleThrottledUpdates` 移除后 IME 输入有布局延迟 | 中文输入法确认后光标位置可能偏移 | `compositionend` + `input`（rAF 包裹）应覆盖此场景；如果不覆盖，证明三阶段 throttle 确实需要——届时可恢复但仅对 compositionend 追加 |
| R7 | `isInsidePopupOrDialog` 移除后搜索框/设置面板出现光标 | 用户投诉 | 验证 `.protyle:not(.fn__none) .protyle-content` 检查是否确实排除了这些区域——如果某个对话框意外包含 protyle-content（思源内部结构变化），再加回针对性排除 |

---

## 8. 未做事项（P2 / 本轮不做）

以下事项明确列出，避免 deep-worker 误以为漏做，也避免用户事后追问：

| # | 事项 | 原因 | 计划 |
|---|------|------|------|
| P2-1 | EventBus 迁移（`loaded-protyle-static` 等 9 个事件） | 改动量大、风险高、需 Reviewer 验证 | P2 |
| P2-2 | `getActiveEditor()` / `getFrontend()` 全面使用 | 依赖 EventBus 迁移，目前用手动检测也可工作 | P2 |
| P2-3 | WS 监听迁移到 `ws-main` EventBus | 当前手动 `window.siyuan.ws.ws.addEventListener` 工作正常 | P2 |
| P2-4 | CSS 从 SCSS 迁移到 JS 字符串 | 改动 build 流程，风险高 | P2 |
| P2-5 | `breathing.ts` 改用 rAF 替代 setTimeout | 当前 setTimeout 500ms 已准确；rAF 精度不必要 | P2（可选） |
| P2-6 | `getLineHeight.ts` 的 26px fallback 是否调整 | 26px 是足够的绝对 fallback，实测无误 | 不调整 |
| P2-7 | `hasScroll` / `findAllScrollableAncestors` 与 `boundary.ts` 中的 `findClosestScrollableElement` 去重 | 一个是"最近一个"，一个是"所有"，语义不同 | P2（可选） |
| P2-8 | `isMobile()` 改用 `getFrontend()` | `getFrontend()` 是官方 API，但当前 `document.getElementById("sidebar")` 是参考版已验证方式 | P2（EventBus 迁移时一起改） |
| P2-9 | `isReadMode()` 中的 `document.querySelector(".protyle-content")` 只取第一个 | 分屏时可能取错 editor | P2（minor） |
| P2-10 | `cursor.ts` 中的 `firstProtyleIds` / `clickedProtyleIds` 白名单机制 | 当前由手动 DOM 事件维护，P2 迁移到 EventBus 的 `click-editorcontent` 事件替代 | P2 |

---

## Handoff Plan

下列步骤按优先级和依赖关系排列。deep-worker 应按 A → B（可与 A 并行）→ C 的顺序执行，
每完成一个逻辑组验证一次。

### 第 1 步：A1 — siyuan.d.ts 新建 + cursor.ts 删除 declare global

1. 新建 `src/types/siyuan.d.ts`（内容见 A1 节代码块）
2. 删除 `src/modules/cursor.ts:28-39`
3. 运行 `npx tsc --noEmit` 验证零错误
- **风险**：如果 tsc 不拾取 .d.ts 文件，见 R1 缓解措施
- **测试**：`tsc --noEmit` 零错误

### 第 2 步：A2 — 修复 getCursorElement 导入路径

1. 修改 `src/modules/ripple.ts:1`：import 路径改为 `../utils/getCursorElement`
2. 修改 `src/utils/edgeCases.ts:1`：import 路径改为 `./getCursorElement`
3. 删除 `src/utils/getCursorRect.ts:69-70`（re-export 行）
4. 运行 `npx tsc --noEmit` 验证
- **测试**：tsc 零错误；`rg "getCursorElement.*getCursorRect" src/` 返回空

### 第 3 步：A3/B4 + B1 — index.scss 三处修改（可合并为一次 edit）

1. `src/styles/index.scss:15-17`：transition 改为只有 transform（删除 `, height 0.15s ease`）
2. `src/styles/index.scss:21`：删除 `animation-delay: 0.5s;` 行
3. `src/styles/index.scss:20`：animation shorthand 改为 `zentype-breathe 3s 1.5s ease-in-out infinite`
4. `src/styles/index.scss:40-46`：关键帧改为参考版（见 B1 代码块）
- **测试**：`node build.js --dev` 通过，grep `#zentype-cursor` 在 dev/index.js 中存在

### 第 4 步：A4 — ZWSP marker 缓存

1. 在 `src/utils/getCursorRect.ts` 模块顶层（import 之后）添加 `globalZWSPMarker` 变量
2. 修改 `getZWSPRect` 函数使用 `globalZWSPMarker` 替代 `document.createTextNode`
- **测试**：`tsc --noEmit` 通过

### 第 5 步：A8 — 移除 scheduleThrottledUpdates + 重构事件绑定

1. 删除 `cursor.ts:152-163`（scheduleThrottledUpdates 函数）
2. 删除 `cursor.ts:46`（throttleTimers 变量）
3. 删除 `cursor.ts:234-235`（destroyCursor 中的 throttleTimers 清理）
4. 重构 `cursor.ts:180-199` 的 handlers 数组（见 A8 代码块）
5. 运行 `npx tsc --noEmit` 验证
- **测试**：grep `scheduleThrottledUpdates` 和 `throttleTimers` 在 src/ 下返回空

### 第 6 步：A5/B2 + A6/B3 — isFirstMove + 文本选中检测

1. 在 `cursor.ts:46` 附近添加 `let isFirstMove = true;`
2. 在 `cursor.ts:131`（remove("hidden") 之前）插入 isFirstMove 检查（见 A5 代码块）
3. 紧跟其后插入文本选中检测（见 A6 代码块）
4. 在 `cursor.ts:260` 附近（destroyCursor 末尾）添加 `isFirstMove = true;`
- **测试**：`tsc --noEmit` 通过；思源中验证首次点击无"飞来"动画

### 第 7 步：A9 — 移除 isInsidePopupOrDialog

1. 删除 `src/modules/cursor/boundary.ts:72-79`（popup 检测块）
2. 删除 `boundary.ts:138-145`（isInsidePopupOrDialog 函数）
3. 更新 `boundary.ts` 中的序号注释（第 4 重 → 第 3 重）
- **测试**：`tsc --noEmit` 通过；grep `isInsidePopupOrDialog` 返回空

### 第 8 步：A7/C5 — isMobile 工具 + cursor.ts 移动端 title 跳过

1. 新建 `src/utils/isMobile.ts`（内容见 A7 代码块）
2. 在 `cursor.ts` 顶部添加 `import { isMobile } from "../utils/isMobile";`
3. 在 `doUpdateCursor()` 中添加移动端 title 跳过逻辑（见 A7 代码块）
- **测试**：`tsc --noEmit` 通过

### 第 9 步：C1 — getEffectiveZIndex 工具

1. 新建 `src/utils/getEffectiveZIndex.ts`（内容见 C1 代码块）
2. 修改 `cursor.ts:106-108` 改用 getEffectiveZIndex
3. 修改 `typewriter.ts`：删除 `getEditorZIndex()` 函数，改用 getEffectiveZIndex
- **测试**：`tsc --noEmit` 通过；grep `getEditorZIndex` 在 src/ 下返回空

### 第 10 步：C2 + C3 + C4 — ResizeObserver / Popover 拖动 / 滚动容器事件

这三项可合并实施（都在 cursor.ts 中新增函数 + doUpdateCursor 末尾调用 + destroyCursor 清理）：

1. 添加模块级变量：`protyleContentObserver`、`protyleWysiwygObserver`、`scrollEventBindings`
2. 添加 `bindResizeObservers()` 函数（C2）
3. 添加 `bindPopoverDrag()` 函数（C3）
4. 添加 `bindScrollContainerEvents()` 和 `hasScroll()` / `findAllScrollableAncestors()` 函数（C4）
5. 在 `doUpdateCursor()` 末尾（scheduleResumeBreathe 之后）调用这三个 bind 函数
6. 在 `destroyCursor()` 中添加这三个模块的清理代码
- **风险**：ResizeObserver 可能在旧版浏览器不可用 → 加 `typeof ResizeObserver !== "undefined"` guard
- **测试**：`tsc --noEmit` 通过；思源中验证各项功能（见 6.5 测试清单）

### 第 11 步：最终验证

1. `npx tsc --noEmit` — 零错误
2. `node build.js --dev` — 生成 dev/index.js，无 CSS 警告
3. Bundle grep（见 6.3）
4. 同步到 `D:\SiYuan\data\plugins\siyuan-zen\` + hash 校验
5. 思源中手动验证（见 6.5）

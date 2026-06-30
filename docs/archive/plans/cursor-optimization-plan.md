# 顺滑光标模块——完整优化与验证方案

> 版本：v2.1.0  
> 日期：2026-06-29  
> 执行者：deep-worker  
> 前提：已读完 `参考/` 下所有调研文档 + `siyuan.d.ts` + 当前代码

## ✅ 状态：已完整实施

| 阶段 | 内容 | 落地位置 |
|------|------|----------|
| P0 全部 4 BUG | 呼吸/高度/动画/边界 | `src/modules/cursor.ts` + `cursor/breathing.ts` + `cursor/boundary.ts` + `utils/getCursorRect.ts` + `utils/getLineHeight.ts` |
| 第 6 决策 1 | `LINE_HEIGHT_RATIO = 1.1` | 现统一从 `src/config.ts :: CURSOR_CONFIG.HEIGHT_RATIO` 读取 |
| 第 6 决策 2 | 全局共享 cursor（不每 protyle 一个） | ✅ `cursorEl` 单例 |
| 第 6 决策 3 | 呼吸反向 idle 暂停（默认动 + .no-animation 暂停） | ✅ `breathing.ts` 实现 |
| 第 6 决策 4 | viewport 坐标系 | ✅ `position: fixed` + `getClientRects()` |
| 第 6 决策 5 | z-index 祖先链遍历 + siyuan 全局 max | ✅ 见 `src/utils/getEffectiveZIndex.ts`（P1 阶段实施） |
| 第 6 决策 6 | rAF 节流 + passive + 三阶段 throttle | ⚠️ **throttle 已移除**（P2 round-3 决策 A8：参考版验证只需 rAF + compositionend） |

### 后续优化
- ✅ **Round 3（P1 + 动画 + A1-A9 兼容性）** → `cursor-optimization-round-3.md`
- ✅ **P2（EventBus 迁移 + getActiveEditor/getFrontend + 代码清理）** → `cursor-optimization-p2-plan.md`（v2.2.0）

### 验证状态（2026-06-29）
- `tsc --noEmit`: exit 0
- `node build.js --dev`: exit 0
- 思源插件目录 hash 同步：MATCH
- 圆角修正：已删除 `border-radius: 2px`（直角矩形）

### 后续优化（已规划为 round-3）
见 `cursor-optimization-round-3.md`（9 个兼容性修复 + 动画优化 + P1 实现）。

---

## 目录

1. [架构设计](#1-架构设计)
2. [定位算法——getCursorRect 重写](#2-定位算法getcursorrect-重写)
3. [边界检测——新增功能](#3-边界检测新增功能)
4. [呼吸动画修复](#4-呼吸动画修复)
5. [滚动 / 悬浮窗 / 拖动处理](#5-滚动--悬浮窗--拖动处理)
6. [z-index 动态计算](#6-z-index-动态计算)
7. [性能优化](#7-性能优化)
8. [CSS 重新设计](#8-css-重新设计)
9. [生命周期管理](#9-生命周期管理)
10. [实施分阶段](#10-实施分阶段)
11. [验证方案](#11-验证方案)
12. [风险评估](#12-风险评估)

---

## 1. 架构设计

### 1.1 模块结构

```
src/
├── index.ts                         # 插件入口——EventBus 订阅 + 模块 init/destroy
├── modules/
│   ├── cursor.ts                    # 主模块：DOM 创建、事件绑定、updateCursor、生命周期
│   └── cursor/
│       ├── breathing.ts             # 呼吸动画状态机（startBreathe / pauseBreathe / resumeBreathe）
│       ├── boundary.ts              # 边界检测（isInAllowElements / isAV / isPopover）
│       ├── zIndex.ts                # 动态 z-index 计算（getEffectiveZIndex）
│       └── styles.ts                # CSS 字符串生成（替代散落在 index.scss 中的光标样式）
├── utils/
│   ├── getCursorRect.ts             # 定位算法（重写）
│   ├── getCursorElement.ts          # 提取：从 selection 获取 cursor 所在元素
│   ├── getLineHeight.ts             # 新增：获取目标行的 computed lineHeight
│   ├── getScrollContainers.ts       # 新增：向上遍历全部可滚动容器
│   └── styleManager.ts             # 不变：addStyle / removeStyle
├── styles/
│   └── index.scss                   # 精简：仅保留打字机高亮条 + 暗色变量
└── types/
    └── index.ts                     # 新增：CursorState 类型
```

**拆分理由**：
- `breathing.ts`：独立的状态机，方便单独测试和调试
- `boundary.ts`：4 重检测逻辑复杂，单独文件避免 `cursor.ts` 膨胀
- `zIndex.ts`：祖先链遍历较独立
- `styles.ts`：纯函数返回 CSS 字符串，由 `styleManager` 注入，避免 SCSS 变量污染

### 1.2 与官方 EventBus 的集成

| 事件 | 订阅位置 | 时机 | 用途 |
|------|---------|------|------|
| `loaded-protyle-static` | `src/index.ts` :: `onload()` | 新编辑器加载（打开文档/分屏） | 调用 `onProtyleLoaded(protyle)` 注册该 protyle 上的 select/click 监听 |
| `loaded-protyle-dynamic` | `src/index.ts` :: `onload()` | 动态编辑器（悬浮窗/嵌入块） | 同上 |
| `destroy-protyle` | `src/index.ts` :: `onload()` | 编辑器关闭（关 tab/笔记本） | 调用 `onProtyleDestroyed(protyle)` 清理 |
| `switch-protyle` | `src/index.ts` :: `onload()` | 用户切换到不同编辑器 | 更新 `activeProtyle` 引用 + `updateCursor()` |
| `click-editorcontent` | `src/index.ts` :: `onload()` | 编辑器内点击 | 设置 `clickedProtyleIds` 白名单 + `updateCursor()` |
| `open-menu-content` | `src/index.ts` :: `onload()` | 右键菜单弹出 | 立即隐藏光标（`.hidden` class） |
| `ws-main` | `src/index.ts` :: `onload()` | 任何 WebSocket 消息 | 监听 `cmd === "transactions"` + 匹配当前文档 → `updateCursor()` |
| `mobile-keyboard-show` | `src/index.ts` :: `onload()` | 移动端键盘弹出 | `updateCursor()` 重新定位 |
| `mobile-keyboard-hide` | `src/index.ts` :: `onload()` | 移动端键盘收起 | `updateCursor()` 重新定位 |

**订阅/清理模式**：

```typescript
// src/index.ts
import type { IProtyle, IWebSocketData } from "siyuan/types";

export default class ZenType extends Plugin {
  private allEventBusOff: Array<() => void> = [];

  async onload(): Promise<void> {
    // ... 现有逻辑 ...

    // === EventBus 订阅 ===
    const { eventBus } = this;

    eventBus.on("loaded-protyle-static", this._onProtyleLoaded_static);
    eventBus.on("loaded-protyle-dynamic", this._onProtyleLoaded_dynamic);
    eventBus.on("destroy-protyle", this._onProtyleDestroyed);
    eventBus.on("switch-protyle", this._onProtyleSwitched);
    eventBus.on("click-editorcontent", this._onEditorContentClicked);
    eventBus.on("open-menu-content", this._onMenuOpened);
    eventBus.on("ws-main", this._onWsMain);
    eventBus.on("mobile-keyboard-show", this._onMobileKeyboardShow);
    eventBus.on("mobile-keyboard-hide", this._onMobileKeyboardHide);

    // 保存所有 off 函数引用
    this.allEventBusOff = [
      () => eventBus.off("loaded-protyle-static", this._onProtyleLoaded_static),
      // ... 其余同
    ];
  }

  onunload(): void {
    // 先清理 EventBus
    this.allEventBusOff.forEach(off => off());
    this.allEventBusOff = [];
    // ... 现有 destroy 逻辑 ...
  }
}
```

### 1.3 `getActiveEditor()` 和 `getFrontend()` 的使用

```typescript
// src/modules/cursor.ts 顶部
import { getActiveEditor, getFrontend } from "siyuan";

// 替代现有 getCursorElement() 中的 closest('.protyle') 逻辑：
function validateCursorInActiveEditor(): boolean {
  const activeEditor = getActiveEditor();
  if (!activeEditor) return false;
  const sel = window.getSelection();
  if (!sel?.anchorNode) return false;
  return activeEditor.element.contains(sel.anchorNode);
}

// 替代现有 isMobile()：
const platform = getFrontend(); // "desktop" | "mobile" | "browser-mobile" | ...
const isMobile = platform === "mobile" || platform === "browser-mobile";
```

### 1.4 数据流

```
DOM event (selectionchange / keydown / click / scroll / wheel)
    │
    ▼
[EventBus 事件?] ─── 是 ──→ 更新 activeProtyle / clickedProtyleIds
    │
    ▼
queueUpdate()
    │ rAF 节流（pendingFrame 标志）
    ▼
updateCursor()
    ├── getCursorRect()          ← 定位算法（ZWSP fallback）
    │       └── getLineHeight()  ← computed lineHeight × 1.1
    ├── isInAllowElements()      ← 边界检测（4 重）
    │       ├── validateCursorInActiveEditor() ← getActiveEditor() 校验
    │       ├── isAV()            ← 排除 .av / .av__mask
    │       ├── isPopover()       ← 排除 .block__popover
    │       └── AABB vs protyle-content
    ├── getEffectiveZIndex()     ← 祖先链遍历
    ├── pauseBreathe()           ← 停呼吸（有操作时）
    │
    ▼
设置 CSS：
    cursorEl.style.transform = translate3d(x, y, 0)
    cursorEl.style.height = lineHeight × 1.1 + "px"
    cursorEl.style.zIndex = zIndex
    cursorEl.classList: remove("hidden") / add("no-transition") / ...
    // 强制布局同步（仅当需要读 offset 时）：
    void cursorEl.offsetHeight;
    // 下一帧恢复 transition
    requestAnimationFrame(() => cursorEl.classList.remove("no-transition"));

    // 500ms 后恢复呼吸
    setTimeout(() => resumeBreathe(), 500);
```

---

## 2. 定位算法——getCursorRect 重写

### 2.1 目标签名

```typescript
// src/utils/getCursorRect.ts
export interface CursorRect {
  x: number;       // viewport x (相对于视口)
  y: number;       // viewport y（已经做垂直居中处理）
  height: number;  // lineHeight × 1.1
  width: number;   // 保留 rect.width 供 future 使用
}

export function getCursorRect(): CursorRect | null;
```

### 2.2 实现

```typescript
import { getLineHeight } from "./getLineHeight";

const LINE_HEIGHT_RATIO = 1.1; // 用户硬性要求

export function getCursorRect(): CursorRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);

  // 路径 1：浏览器原生 ClientRects（非空行）
  const rects = Array.from(range.getClientRects());
  let baseRect: DOMRect | null = null;

  if (rects.length > 0 && rects[0].height > 0) {
    // 取最后一个 rect（最接近光标位置，兼容多行选择）
    baseRect = rects[rects.length - 1];
  } else {
    // 路径 2：ZWSP 降级（空行 / 空段落 / 空单元格）
    baseRect = getZWSPRect(range);
    if (!baseRect) return null;
  }

  // 获取行高
  const lineHeight = getLineHeight(range.startContainer) ?? 26; // fallback 26px
  const height = lineHeight * LINE_HEIGHT_RATIO;

  // 垂直居中
  const gap = (baseRect.height - height) / 2;
  const y = baseRect.top + gap;
  const x = baseRect.right; // 光标在字符末尾

  return { x, y, height, width: baseRect.width };
}

/** ZWSP 降级：临时插入零宽字符取 rect，取完立即删除 */
function getZWSPRect(range: Range): DOMRect | null {
  try {
    const marker = document.createTextNode("\u200B");
    range.insertNode(marker);
    range.selectNode(marker);
    const rect = range.getBoundingClientRect();
    marker.remove();
    // 即使 height === 0 也返回（后面会用 fallback lineHeight 算高度）
    return rect;
  } catch {
    return null;
  }
}
```

### 2.3 `getLineHeight()` 新增工具

```typescript
// src/utils/getLineHeight.ts

/**
 * 获取指定节点所在可编辑行的 computed line-height。
 * 优先取 line-height CSS 值，其次 fontSize * 1.625，最后 fallback 26。
 */
export function getLineHeight(node: Node): number | null {
  let el: Element | null =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);

  while (el) {
    // 在 [contenteditable="true"] 或 .protyle-wysiwyg 内取样式
    const editable = el.closest('[contenteditable="true"]') as HTMLElement | null;
    if (editable) {
      return parseLineHeight(editable);
    }
    // 标题特殊处理
    const title = el.closest(".protyle-title__input") as HTMLElement | null;
    if (title) {
      return parseLineHeight(title);
    }
    el = el.parentElement;
  }
  return 26; // 绝对 fallback
}

function parseLineHeight(el: HTMLElement): number {
  const style = window.getComputedStyle(el);
  const lh = parseFloat(style.lineHeight);
  if (!isNaN(lh) && lh > 0) return lh;
  const fs = parseFloat(style.fontSize);
  if (!isNaN(fs) && fs > 0) return fs * 1.625;
  return 26;
}
```

### 2.4 边缘场景处理矩阵

| 场景 | 路径 | 高度来源 | x 坐标来源 |
|------|------|---------|-----------|
| 普通文字行 | ClientRects[last] | `lineHeight × 1.1` | `baseRect.right` |
| 空段落（光标在段落开头） | ZWSP fallback | `lineHeight × 1.1` | `baseRect.right`（ZWSP 字符位置） |
| 表格空单元格 | ZWSP fallback | `lineHeight × 1.1` | `baseRect.right` |
| 嵌入块内（contenteditable） | ClientRects[last] | `lineHeight × 1.1` | `baseRect.right` |
| 文档标题 | ZWSP fallback（如输入框为空） | `lineHeight × 1.1` | `baseRect.right` |
| 公式/行内代码（行内元素） | ClientRects[last] | `lineHeight × 1.1` | `baseRect.right` |
| IME 组合中（composition） | ClientRects[last] | `lineHeight × 1.1` | `baseRect.right` |

### 2.5 坐标系选择

**选定：viewport 坐标**（与 `getClientRects()` 一致）。

理由：
- cursor 元素 `position: fixed` 以 viewport 为基准
- `getClientRects()` 返回 viewport 坐标，零转换
- 滚动时只需更新 `transform`，无需考虑 scroll offset 累加
- 与 legacy / Neo-Plus 一致

---

## 3. 边界检测——新增功能

### 3.1 `isInAllowElements()` 函数设计

```typescript
// src/modules/cursor/boundary.ts
import { getActiveEditor, getFrontend } from "siyuan";
import { getCursorElement } from "../../utils/getCursorElement";

interface AllowResult {
  allowed: boolean;
  cursorElement: Element | null;
  isOuterElement: boolean;
  reason?: string; // 调试用
}

export function isInAllowElements(
  pos: { x: number; y: number },
): AllowResult {
  // 第 1 重：getActiveEditor() 校验——光标是否在当前活跃编辑器内
  const activeEditor = getActiveEditor();
  if (!activeEditor) {
    return { allowed: false, cursorElement: null, isOuterElement: true,
             reason: "no active editor" };
  }

  const cursorElement = getCursorElement();
  if (!cursorElement) {
    return { allowed: false, cursorElement: null, isOuterElement: true,
             reason: "no cursor element" };
  }

  // 第 2 重：AV 数据库块排除
  if (cursorElement.closest(".av, .av__mask, .av__cursor")) {
    return { allowed: false, cursorElement, isOuterElement: true,
             reason: "inside AV database" };
  }

  // 第 3 重：弹窗排除（悬浮窗内的编辑器、搜索框、设置面板等）
  if (isInsidePopupOrDialog(cursorElement)) {
    return { allowed: false, cursorElement, isOuterElement: true,
             reason: "inside popup/dialog" };
  }

  // 第 4 重：AABB 碰撞检测——光标坐标是否在 protyle-content 可视范围内
  const protyleContent = cursorElement.closest(
    ".protyle:not(.fn__none) .protyle-content"
  ) as HTMLElement | null;
  if (!protyleContent) {
    // 标题区域（.protyle-title）特殊处理：如果在标题内，允许
    if (cursorElement.closest(".protyle-title__input")) {
      return { allowed: true, cursorElement, isOuterElement: false };
    }
    return { allowed: false, cursorElement, isOuterElement: true,
             reason: "no protyle-content" };
  }

  const editorRect = protyleContent.getBoundingClientRect();
  const isInEditor =
    pos.x >= editorRect.left &&
    pos.x <= editorRect.right &&
    pos.y >= editorRect.top &&
    pos.y <= editorRect.bottom;

  if (!isInEditor) {
    // 额外检查：是否在滚动元素内（嵌套滚动容器场景）
    const scrollEl = findClosestScrollableElement(cursorElement);
    if (scrollEl && scrollEl !== protyleContent) {
      const scrollRect = scrollEl.getBoundingClientRect();
      const isInScroll =
        pos.x >= scrollRect.left &&
        pos.x <= scrollRect.right &&
        pos.y >= scrollRect.top &&
        pos.y <= scrollRect.bottom;
      return {
        allowed: isInScroll && isInEditor,
        cursorElement,
        isOuterElement: false,
        reason: isInScroll && isInEditor ? undefined : "out of scroll container",
      };
    }

    return { allowed: false, cursorElement, isOuterElement: false,
             reason: "out of editor rect" };
  }

  return { allowed: true, cursorElement, isOuterElement: false };
}

/** 判断光标所在的元素是否在弹窗/对话框内 */
function isInsidePopupOrDialog(el: Element): boolean {
  // block__popover 悬浮窗（块引用、反链等）
  if (el.closest(".block__popover")) return true;
  // b3-dialog 全局对话框（设置面板等）
  if (el.closest(".b3-dialog")) return true;
  // 搜索框
  if (el.closest(".search__layout")) return true;
  // 面包屑
  if (el.closest(".protyle-breadcrumb")) return true;
  // iframe 内（嵌入网页、PDF 等）
  if (el.closest("iframe")) return true;
  return false;
}

/** 找到最近的含滚动条的祖先元素 */
function findClosestScrollableElement(el: Element): HTMLElement | null {
  let current: Element | null = el;
  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    if (
      (overflowY === "scroll" || overflowY === "auto" || overflowX === "scroll" || overflowX === "auto") &&
      (current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth)
    ) {
      return current as HTMLElement;
    }
    current = current.parentElement;
  }
  return null;
}
```

### 3.2 AABB 碰撞检测

已集成在 `isInAllowElements()` 的第 4 重检测中。核心逻辑：

```typescript
const isInRect = (
  posX >= rect.left &&
  posX <= rect.right &&
  posY >= rect.top &&
  posY <= rect.bottom
);
```

此算法对 viewport 坐标直接有效（所有 rect 都来自 `getBoundingClientRect()`）。

---

## 4. 呼吸动画修复

### 4.1 问题诊断

**当前 BUG**：`startBlink()` 仅在 `initCursor()` 末尾调用一次，但每次 `selectionchange`/`keydown`/`mousedown` 都调用 `stopBlink()`，移除 `.breathing` class 后**永不复原**。

### 4.2 修复方案：反向逻辑

采用 legacy 模式——用 `no-animation` class 做**临时禁用**（而非正向添加 `.breathing`）：

```typescript
// src/modules/cursor/breathing.ts

const IDLE_DELAY = 500; // 静止 500ms 后恢复呼吸
const BREATHING_CYCLE = 3; // 秒，一个完整呼吸周期

let breatheTimer: number | null = null;
let cursorEl: HTMLElement | null = null;
let isPaused = false;

export function initBreathing(cursor: HTMLElement): void {
  cursorEl = cursor;
  // 默认启动呼吸（CSS animation 已设置 infinite）
  // 但先 pause 等首次 updateCursor 后再 resume
  cursorEl.classList.add("no-animation");
  resumeBreathe();
}

export function pauseBreathe(): void {
  if (!cursorEl) return;
  clearBreatheTimer();
  cursorEl.classList.add("no-animation");
  isPaused = true;
}

export function resumeBreathe(): void {
  if (!cursorEl || isPaused) return;
  clearBreatheTimer();
  breatheTimer = window.setTimeout(() => {
    if (!cursorEl || isPaused) return;
    cursorEl.classList.remove("no-animation");
  }, IDLE_DELAY);
}

export function destroyBreathing(): void {
  clearBreatheTimer();
  cursorEl?.classList.remove("no-animation");
  cursorEl = null;
  isPaused = false;
}

function clearBreatheTimer(): void {
  if (breatheTimer !== null) {
    clearTimeout(breatheTimer);
    breatheTimer = null;
  }
}
```

### 4.3 关键帧设计

```scss
// 呼吸动画——柔和渐变（不是硬 1/0 切换）
@keyframes zentype-breathe {
  0%   { opacity: 1; }
  45%  { opacity: 1; }   // 0%-45% 保持可见（~1.35s）
  50%  { opacity: 0.15; } // 45%-50% 快速渐出（~0.15s）
  55%  { opacity: 0.15; } // 50%-55% 保持低值（~0.15s）
  100% { opacity: 1; }   // 55%-100% 渐入（~1.35s）
}
```

曲线说明：
- 3s 一个周期（3 × INFINITE）
- 可见 → 渐出（快速，避免拖尾感）→ 低值保持 → 渐入（缓慢，呼吸感）
- 比 legacy 的 `opacity: 0` 硬切更柔和，比 Neo-Plus 的 1s 周期更慢（用户反馈要"呼吸感"）

### 4.4 与 input/composition 的协同

```typescript
// 在 cursor.ts 的 updateCursor 中：
function updateCursor(): void {
  // ... 定位逻辑 ...

  // 任何操作时暂停呼吸
  pauseBreathe();

  // ... 设置 transform / height ...

  // 恢复呼吸（500ms 后）
  resumeBreathe();
}

// 额外：compositionstart 直接暂停
document.addEventListener("compositionstart", () => {
  // 中文输入法激活中，暂停呼吸使其不闪烁
  pauseBreathe();
});
document.addEventListener("compositionend", () => {
  resumeBreathe();
});
```

### 4.5 与 transform transition 协同

使用独立 class 避免冲突：

| Class | 作用 | 与 breathing 互斥？ |
|-------|------|-------------------|
| `.no-transition` | 临时禁用 transform/height transition | ❌ 不互斥（scroll 时同时用两个） |
| `.no-animation` | 临时禁用呼吸 animation | ❌ 不互斥 |
| `.hidden` | 隐藏（opacity 0 + animation none + transition none） | ✅ 互斥（hidden 时 breathing 没意义） |
| `.breathing` | （不再使用，由 `.no-animation` 的反向逻辑取代） | N/A |

---

## 5. 滚动 / 悬浮窗 / 拖动处理

### 5.1 滚动处理

```typescript
// cursor.ts 内
function onScrollOrWheel(): void {
  if (!cursorEl) return;
  // 1. 暂停呼吸
  pauseBreathe();
  // 2. 停止过渡（否则滚动时光标会残留动画，视觉上"悬浮"）
  cursorEl.classList.add("no-transition");
  // 3. 立即更新位置
  queueUpdate();
}

// 事件订阅：
document.addEventListener("scroll", onScrollOrWheel, { capture: true, passive: true });
document.addEventListener("wheel", onScrollOrWheel, { capture: true, passive: true });
document.addEventListener("touchmove", onScrollOrWheel, { passive: true });

// updateCursor 中的恢复：
function updateCursor(): void {
  // ... 定位 ...

  // 强制布局同步，让 no-transition 时也能立即更新位置
  void cursorEl.offsetHeight;

  // 下一帧恢复过渡
  requestAnimationFrame(() => {
    cursorEl.classList.remove("no-transition");
  });
}
```

**关键时序**：
1. scroll 事件触发 → `add("no-transition")` + `updateCursor()` 
2. transform 立即生效（无过渡）
3. rAF 后 `remove("no-transition")` 
4. 下一次 scroll 重复 1-3

### 5.2 悬浮窗拖动

思源悬浮窗（block__popover）可拖动。legacy 实现直接给 `.resize__move` 绑 mousedown/mousemove/mouseup。

但官方 EventBus **没有暴露拖动事件**，需要继续用 DOM 事件：

```typescript
// cursor.ts 内
function bindPopoverDrag(cursorElement: Element): void {
  const popover = cursorElement.closest(".block__popover");
  if (!popover || (popover as any).__zentypeDragBound) return;

  const dragEl = popover.querySelector(".resize__move") as HTMLElement | null;
  if (!dragEl) return;

  (popover as any).__zentypeDragBound = true;

  let isDragging = false;

  dragEl.addEventListener("mousedown", () => { isDragging = true; });
  document.addEventListener("mousemove", (e) => {
    if (isDragging) {
      cursorEl?.classList.add("no-transition");
      queueUpdate();
    }
  });
  document.addEventListener("mouseup", () => {
    isDragging = false;
  });
}
```

### 5.3 ResizeObserver——编辑器尺寸变化

```typescript
let protyleContentObserver: ResizeObserver | null = null;

function bindResizeObserver(protyleContent: HTMLElement): void {
  if (protyleContentObserver) return;
  protyleContentObserver = new ResizeObserver(() => {
    cursorEl?.classList.add("no-transition");
    queueUpdate();
  });
  protyleContentObserver.observe(protyleContent);
}

function unbindResizeObserver(): void {
  protyleContentObserver?.disconnect();
  protyleContentObserver = null;
}
```

---

## 6. z-index 动态计算

### 6.1 `getEffectiveZIndex()` 实现

```typescript
// src/modules/cursor/zIndex.ts

/**
 * 从目标元素向上遍历祖先链，找到第一个创建层叠上下文的元素，
 * 返回其 z-index。结合 window.siyuan.zIndex 确保始终高于思源内置层级。
 */
export function getEffectiveZIndex(targetElement: Element): number {
  let current: Element | null = targetElement;

  while (current && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const zIndex = style.zIndex;
    const position = style.position;

    // 层叠上下文条件 1：position: fixed 或 sticky（自动创建）
    if (position === "fixed" || position === "sticky") {
      return zIndex === "auto" ? 0 : (parseInt(zIndex, 10) || 0);
    }

    // 层叠上下文条件 2：position: absolute/relative + 非 auto z-index
    if (
      (position === "absolute" || position === "relative") &&
      zIndex !== "auto"
    ) {
      return parseInt(zIndex, 10) || 0;
    }

    // 层叠上下文条件 3：opacity < 1
    if (parseFloat(style.opacity) < 1) {
      return 0; // opacity < 1 创建层叠上下文，z-index 复位
    }

    // 层叠上下文条件 4：transform 不为 none
    if (style.transform !== "none") {
      return zIndex === "auto" ? 0 : (parseInt(zIndex, 10) || 0);
    }

    current = current.parentElement;
  }

  return 0;
}
```

### 6.2 与 `window.siyuan.zIndex` 的关系

```typescript
// 使用时：
const base = getEffectiveZIndex(cursorElement);
const siyuanMax = window.siyuan?.zIndex ?? 0;
cursorEl.style.zIndex = String(Math.max(base + 1, siyuanMax + 1));
```

**逻辑**：取"祖先链 z-index + 1"与"思源全局 z-index + 1"中的较大值，确保光标始终在思源所有弹窗之上。

### 6.3 缓存

```typescript
let cachedZIndex = 0;
let lastCursorElement: Element | null = null;

export function getEffectiveZIndexCached(el: Element): number {
  if (el === lastCursorElement) return cachedZIndex;
  cachedZIndex = getEffectiveZIndex(el);
  lastCursorElement = el;
  return cachedZIndex;
}
```

---

## 7. 性能优化

### 7.1 rAF 节流

```typescript
// cursor.ts 内
let pendingFrame: number | null = null;

function queueUpdate(): void {
  if (pendingFrame !== null) return; // 已有待处理的帧
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    doUpdateCursor();
  });
}
```

**收益**：无论事件触发多频繁（`selectionchange` 可在一次鼠标拖拽中触发数百次），每帧最多执行一次 `doUpdateCursor()`。

### 7.2 多阶段 throttle（200/400/600ms）

借鉴 Neo-Plus 模式，在 keyup/mouseup 后追加定时器：

```typescript
let throttleTimers: number[] = [];

function scheduleThrottledUpdates(): void {
  throttleTimers.forEach(clearTimeout);
  throttleTimers = [];
  [200, 400, 600].forEach(delay => {
    const timer = window.setTimeout(() => {
      queueUpdate();
      const idx = throttleTimers.indexOf(timer);
      if (idx > -1) throttleTimers.splice(idx, 1);
    }, delay);
    throttleTimers.push(timer);
  });
}

// keyup / mouseup 后调用
document.addEventListener("keyup", scheduleThrottledUpdates);
document.addEventListener("mouseup", scheduleThrottledUpdates);
```

**目的**：处理 IME 输入后布局延迟（输入法弹出→排版变化→光标位移）、自动换行后光标抖动。

### 7.3 passive 事件

```typescript
document.addEventListener("scroll", handleScroll, { capture: true, passive: true });
document.addEventListener("wheel", handleScroll, { capture: true, passive: true });
document.addEventListener("touchmove", handleScroll, { passive: true });
```

`passive: true` 告诉浏览器不会调用 `preventDefault()`，浏览器可以立即滚动而不是等待 JS 执行完毕。

### 7.4 缓存策略

| 缓存项 | 变量 | 失效条件 |
|--------|------|---------|
| 行高 | `cachedLineHeight` | `focusElement` 变化时重新计算 |
| 滚动容器 | `cachedScrollContainer` | `focusElement` 变化时重新计算 |
| z-index | `cachedZIndex` | `cursorElement` 变化时重新计算 |
| cursor 元素引用 | `cursorEl`（模块级常量） | 始终有效（只在 destroy 时置 null） |
| computed style（行高） | 不缓存（浏览器已优化） | — |

### 7.5 避免 reflow / repaint 的原则

| 做法 | 说明 |
|------|------|
| **用 `transform` 不用 `top/left`** | `transform` 只触发合成（composite），不触发回流/重绘 |
| **用 `height` 设置高度** | 必须用（alternative: `scaleY` 会变形）但已声明 `will-change: height` |
| **批量读、批量写** | `getClientRects()`（读）→ `getComputedStyle()`（读）→ 设置 `style.transform`/`style.height`（写）— 写操作放在最后 |
| **避免 `offsetHeight` 读** | 只在 `no-transition` 时强制读一次保证无过渡的位置更新 |
| **`will-change`** | `transform, height` 已在 CSS 中声明 |

### 7.6 性能预算

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| `doUpdateCursor()` 单次耗时 | < 100μs | `performance.now()` 差值 |
| 每帧总时间 | < 1ms（含浏览器布局） | Chrome DevTools Performance 面板 |
| 事件处理时间 | < 50μs | 事件回调内 `performance.now()` 差值 |
| 内存 | 光标元素 < 1KB（1 个 div + 模块级变量） | Memory 面板 |
| 掉帧率 | < 1%（60fps 下） | rAF 内 timestamp 间隔监控 |

---

## 8. CSS 重新设计

### 8.1 基础样式

CSS 由 `src/modules/cursor/styles.ts` 生成字符串，通过 `styleManager.addStyle("cursor", css)` 注入：

```typescript
// src/modules/cursor/styles.ts
export const CURSOR_CSS = `
/* 隐藏编辑器原生光标（限定在编辑器内，排除 iframe/input/textarea） */
.protyle-wysiwyg [data-node-id]:not(.av):not(.av__cursor) { caret-color: transparent; }
.protyle-title__input { caret-color: transparent; }

/* zenType 顺滑光标 */
#zentype-cursor {
  position: fixed;
  pointer-events: none;
  z-index: 9999; /* fallback，会被 JS 动态覆盖 */
  width: 3px;
  border-radius: 2px;
  background: var(--zt-cursor-color, #5d8cd7);
  transform: translate3d(0, 0, 0);
  will-change: transform, height;
  backface-visibility: hidden;
  transition:
    transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1),
    height 0.15s ease;
  opacity: 1;
  animation: zentype-breathe 3s ease-in-out infinite;
  animation-delay: 0.5s;
}

/* 暗色模式 */
[data-theme-mode="dark"] #zentype-cursor {
  --zt-cursor-color: #8ab4f8;
}

/* 状态类 */
#zentype-cursor.hidden {
  opacity: 0 !important;
  animation: none !important;
  transition: none !important;
}

#zentype-cursor.no-animation {
  animation: none !important;
}

#zentype-cursor.no-transition {
  transition: none !important;
}

/* 呼吸动画关键帧 */
@keyframes zentype-breathe {
  0%   { opacity: 1; }
  45%  { opacity: 1; }
  50%  { opacity: 0.15; }
  55%  { opacity: 0.15; }
  100% { opacity: 1; }
}

/* 侧边栏拖动手柄禁止选中（防止拖动时插入 marker） */
.layout__resize { user-select: none; }
`;
```

### 8.2 状态类一览

| Class | 作用 | 何时添加 | 何时移除 |
|-------|------|---------|---------|
| `.hidden` | 完全隐藏（opacity 0 + animation off + transition off） | 边界检测失败 / `open-menu-content` / 无选区 | 定位成功且通过边界检测 |
| `.no-animation` | 暂停呼吸动画 | 操作中（keydown/input/click/scroll） | 静止 500ms 后 |
| `.no-transition` | 暂停过渡动画 | 滚动/首次移动/拖动悬浮窗 | 下一个 rAF |
| （默认） | 呼吸动画已启用 | CSS 声明 `animation: zentype-breathe infinite` | — |

### 8.3 与打字机高亮条的视觉协调

| 属性 | 光标 (#zentype-cursor) | 高亮条 (#zentype-highlight-line) | 协调 |
|------|----------------------|---------------------------------|------|
| width | 3px | 100% | ✅ 不重叠 |
| z-index | 动态（≥10000） | max(editorZ + 1, 1000) | 光标 > 高亮条 |
| 颜色 | `--zt-cursor-color` | `--zt-highlight-bg` | 不同 CSS 变量 |
| transition | 0.15s ease | 0.15s ease | ✅ 同步速度 |
| opacity | 1 → 呼吸 | 0 → 1（visible 时） | ✅ 不冲突 |

---

## 9. 生命周期管理

### 9.1 `Plugin.onload` 时机

```
onload() 被调用
  │
  ├── this.loadData()          ← 读配置
  ├── addStyle("main", css)    ← 注入打字机 CSS
  ├── addStyle("cursor", cursorCss) ← 注入光标 CSS（新增）
  ├── this.addCommand(...)     ← 注册快捷键
  ├── this.addTopBar(...)      ← 顶栏按钮
  │
  ├── [EventBus 订阅]          ← loaded-protyle-static/dynamic、destroy-protyle 等
  │
  ├── initCursor()             ← DOM 创建 + DOM 事件绑定 + 呼吸初始化 + 首次定位
  ├── initTypewriter()         ← 打字机初始化
  └── initRipple()             ← 涟漪初始化

onunload() 被调用
  ├── [EventBus 退订]          ← allEventBusOff.forEach(off => off())
  ├── destroyCursor()          ← DOM 移除 + DOM 事件清理 + WS 清理 + 定时器清理
  ├── destroyTypewriter()      ← 高亮条清理
  ├── destroyRipple()          ← 涟漪清理
  ├── removeStyle("main")      ← 移除打字机 CSS
  └── removeStyle("cursor")    ← 移除光标 CSS（新增）
```

**关键时序**：
- `getActiveEditor()` 在 `onload()` 时**可能还不存在**（用户还没打开任何文档）
- `initCursor()` 时应处理 `getActiveEditor() === null` 的情况——不报错，等 `loaded-protyle-static` 事件触发再激活
- `EventBus` 在 `Plugin` 构造函数中已初始化，`onload()` 时完全可用

### 9.2 多 protyle 场景（分屏）

**决策：共享一个全局 cursor 元素，跟随活动编辑器。**

理由：
- `window.getSelection()` 是全局唯一的——同一时间只有一个编辑器有焦点
- 每个 protyle 创建自己的 cursor 元素会造成：
  - 多个 position: fixed 的 div 竞逐 z-index
  - 非焦点编辑器的光标残留
- legacy 实现也是全局一个 cursor（已验证可行）

处理方式：
- `switch-protyle` 事件触发时，更新 `activeProtyle` 引用并立即 `queueUpdate()`
- `updateCursor()` 中通过 `getActiveEditor()` 校验当前选区属于哪个编辑器

### 9.3 `onunload` 清理清单

```typescript
export function destroyCursor(): void {
  // 1. 清理所有 DOM 事件
  eventListeners.forEach(([event, handler, options]) => {
    document.removeEventListener(event, handler, options);
  });
  eventListeners = [];

  // 2. 清理呼吸状态机
  destroyBreathing();

  // 3. 清理 throttle 定时器
  throttleTimers.forEach(clearTimeout);
  throttleTimers = [];

  // 4. 清理 ResizeObserver
  unbindResizeObserver();

  // 5. 清理 rAF
  if (pendingFrame !== null) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }

  // 6. 清理 WS 监听
  if (wsHandler && window.siyuan?.ws?.ws) {
    window.siyuan.ws.ws.removeEventListener("message", wsHandler);
    wsHandler = null;
  }

  // 7. 移除 DOM 元素
  if (cursorEl) {
    cursorEl.remove();
    cursorEl = null;
  }

  // 8. 清理缓存
  lastCursorElement = null;
  cachedZIndex = 0;
  cachedLineHeight = null;
  clickedProtyleIds = [];
  firstProtyleIds = [];
}
```

### 9.4 移动端键盘事件

```typescript
// 在 EventBus 回调中：
_onMobileKeyboardShow = (): void => {
  queueUpdate();
};
_onMobileKeyboardHide = (): void => {
  queueUpdate();
};
```

---

## 10. 实施分阶段

### 阶段 1（P0 — 必修）：解决 4 个 BUG

**目标**：用户报告的 4 个问题全部修复。功能可正常工作。

| # | 改动 | 涉及文件 | 改动量 | 风险 |
|---|------|---------|--------|------|
| 1.1 | 呼吸动画：反向逻辑 + idle 暂停/恢复 | `src/modules/cursor.ts`（替换 blinkTimer 逻辑）+ 新增 `src/modules/cursor/breathing.ts` | ~80 行 | 低——逻辑参考 legacy |
| 1.2 | 高度修复：`lineHeight × 1.1` | `src/utils/getCursorRect.ts`（重写）+ 新增 `src/utils/getLineHeight.ts` | ~60 行 | 低——新函数可单独测试 |
| 1.3 | 滚动时停过渡 + 停呼吸 | `src/modules/cursor.ts`（改写 scroll/wheel 处理） | ~30 行 | 低——逻辑参考 legacy |
| 1.4 | 边界检测：`isInAllowElements()` | 新增 `src/modules/cursor/boundary.ts` | ~100 行 | 中——需实测思源 DOM 结构 |

**阶段 1 函数清单**：

```
新增函数:
  getLineHeight(node: Node): number | null              (getLineHeight.ts)
  getCursorRect(): CursorRect | null                     (getCursorRect.ts 重写)
  getZWSPRect(range: Range): DOMRect | null              (getCursorRect.ts 内部)
  initBreathing(cursor: HTMLElement): void               (breathing.ts)
  pauseBreathe(): void                                    (breathing.ts)
  resumeBreathe(): void                                   (breathing.ts)
  destroyBreathing(): void                                (breathing.ts)
  isInAllowElements(pos): AllowResult                    (boundary.ts)
  isInsidePopupOrDialog(el): boolean                     (boundary.ts 内部)
  findClosestScrollableElement(el): HTMLElement | null   (boundary.ts 内部)
  getCursorElement(): Element | null                     (getCursorElement.ts 从 getCursorRect.ts 拆出)

修改函数:
  initCursor(): void                                     (+ 调用 initBreathing + 改造 scroll/wheel 处理)
  updateCursor() → doUpdateCursor(): void                (+ pauseBreathe/resumeBreathe + isInAllowElements)
  destroyCursor(): void                                  (+ destroyBreathing)
  createCursorElement(): HTMLDivElement                  (几乎不变)
```

### 阶段 2（P1 — 应做）：提升稳健性

**目标**：防止光标出现在编辑器外、z-index 遮挡、多 protyle 场景。

| # | 改动 | 涉及文件 | 改动量 | 风险 |
|---|------|---------|--------|------|
| 2.1 | 动态 z-index：`getEffectiveZIndex()` | 新增 `src/modules/cursor/zIndex.ts` | ~50 行 | 低——逻辑参考 legacy |
| 2.2 | ResizeObserver：编辑器尺寸变化 | `src/modules/cursor.ts`（新增 `bindResizeObserver`） | ~20 行 | 低 |
| 2.3 | 悬浮窗拖动处理 | `src/modules/cursor.ts`（新增 `bindPopoverDrag`） | ~30 行 | 中——需实测悬浮窗 DOM |
| 2.4 | AV / 数据库 / 弹窗排除（完善 boundary） | `src/modules/cursor/boundary.ts` | +20 行 | 低——扩展 isInsidePopupOrDialog |

**阶段 2 函数清单**：

```
新增函数:
  getEffectiveZIndex(targetElement: Element): number     (zIndex.ts)
  getEffectiveZIndexCached(el: Element): number          (zIndex.ts)
  bindResizeObserver(protyleContent: HTMLElement): void  (cursor.ts)
  unbindResizeObserver(): void                            (cursor.ts)
  bindPopoverDrag(cursorElement: Element): void          (cursor.ts)
```

### 阶段 3（P2 — 锦上添花）：架构改善

**目标**：充分利用官方 API、长期可维护。

| # | 改动 | 涉及文件 | 改动量 | 风险 |
|---|------|---------|--------|------|
| 3.1 | EventBus 订阅：`loaded-protyle-static/dynamic`、`destroy-protyle` 等 9 个事件 | `src/index.ts` | ~80 行 | 中——EventBus API 老版本兼容性 |
| 3.2 | `getActiveEditor()` 校验替代手动 DOM 遍历 | `src/modules/cursor.ts` + `boundary.ts` | +10 行（改现有逻辑） | 低 |
| 3.3 | `getFrontend()` 替代 `isMobile()` | `src/modules/cursor.ts` | +5 行 | 低 |
| 3.4 | CSS 由 JS 字符串生成（替代 SCSS） | 新增 `src/modules/cursor/styles.ts` + 改 `src/index.ts` | +60 行 | 低 |
| 3.5 | `ws-main` 事件替代手动 WS 监听 | `src/index.ts` | +15 行 | 中——事件格式与手动监听略有差异 |
| 3.6 | `caret-color` 限定到非 AV 区域 | `styles.ts`（纯字符串） | +2 行 | 低 |

**阶段 3 函数清单**：

```
新增函数（index.ts）:
  _onProtyleLoaded_static(e): void
  _onProtyleLoaded_dynamic(e): void
  _onProtyleDestroyed(e): void
  _onProtyleSwitched(e): void
  _onEditorContentClicked(e): void
  _onMenuOpened(e): void
  _onWsMain(e): void
  _onMobileKeyboardShow(): void
  _onMobileKeyboardHide(): void

新增文件:
  src/modules/cursor/styles.ts    (export CURSOR_CSS: string)

修改：
  src/index.ts → 加 EventBus 订阅/退订
  src/styles/index.scss → 移除光标相关 CSS（只保留高亮条）
```

---

## 11. 验证方案

### 11.1 BUG 自动化测试用例

以下测试用例可由 reviewer agent 在思源开发环境中逐条执行。

#### BUG 1：呼吸动画

| 步骤 | 操作 | 期望 |
|------|------|------|
| 1 | 打开思源，新建文档，点击编辑器任意位置 | 光标出现，约 0.5s 后开始呼吸（opacity 渐变动画可见） |
| 2 | 输入文字 "hello" | 光标呼吸暂停（opacity 固定为 1） |
| 3 | 停止输入，等待 0.5s | 光标恢复呼吸 |
| 4 | 用鼠标选中一段文字 | 呼吸仍暂停（因为 selectionchange 触发） |
| 5 | 点击取消选中，等 0.5s | 光标恢复呼吸 |
| 6 | 切换 IME 到中文输入法，输入 "你好"（composition 中） | 光标呼吸暂停 |
| 7 | 按回车确认输入，等 0.5s | 光标恢复呼吸 |
| 8 | 切换 tab 到另一个文档再切回 | 光标在新文档正常呼吸（旧 tab 光标消失） |

#### BUG 2：光标高度

| 步骤 | 操作 | 期望 |
|------|------|------|
| 1 | 在空段落（新行的段落开始）点击 | 光标高度 ≈ 行高 × 1.1（如行高 26px → 光标 ~28.6px），不是 16-18px |
| 2 | 在表格空单元格点击 | 同上，光标高度正常 |
| 3 | 在嵌入块内点击 | 同上 |
| 4 | 切换字号（小 → 大） | 光标高度随行高变化 |
| 5 | 在标题（H1, H2, H3）点击 | 光标高度匹配标题行高 |

#### BUG 3：移动动画

| 步骤 | 操作 | 期望 |
|------|------|------|
| 1 | 在一个长段落中，用键盘左右键移动光标 | 光标在两个字符间平滑过渡（约 0.15s），不是瞬移 |
| 2 | 快按左右键 5 次 | 光标跟随按键，无明显抖动或位置跳错 |
| 3 | 用鼠标在段落中间点击 | 光标从旧位置平滑移到新位置 |
| 4 | 在文档底部点击，然后在上方 100 行处点击 | 光标有 0.15s 移动轨迹，中途不消失 |
| 5 | 快速滚动（鼠标滚轮） | 光标紧跟行内容，无残留动画（因为 no-transition） |

#### BUG 4：出现在编辑区之外

| 步骤 | 操作 | 期望 |
|------|------|------|
| 1 | 在搜索框（Ctrl+P）内点击 | 光标**不出现**在搜索框内 |
| 2 | 在设置面板内点击文本输入框 | 光标**不出现** |
| 3 | 在数据库视图（.av）的单元格点击 | 光标**不出现** |
| 4 | 在悬浮窗（block__popover）内的编辑器点击 | 光标在悬浮窗内正常工作，但**不显示在主编辑器区域**（考虑：悬浮窗内显示 OK 还是也隐藏？根据用户反馈"编辑区之外"，悬浮窗内应该是要显示的，因为它是编辑器。但我们暂时隐藏，因为悬浮窗坐标系通常不一致） |
| 5 | 在 iframe 内点击 | 光标**不出现** |

### 11.2 性能基准

在 Chrome DevTools Performance 面板中录制：

| 测试 | 操作 | 指标 | 目标 |
|------|------|------|------|
| 打字 | 连续输入 100 个字符（英文） | `doUpdateCursor()` 平均耗时 | < 100μs |
| 快速移动 | 连续按右箭头 50 次 | 每帧总时间 | < 1ms |
| 滚动 | 鼠标滚轮快速滚动 3 页 | 掉帧率 | 0%（无 long task > 50ms） |
| 空闲 | 停止操作 10s | CPU 占用 | 0%（除呼吸动画外无 JS 执行） |
| 内存 | 打开 5 个文档，在它们之间切换 | 内存增长 | < 1MB（积累的引用/闭包） |

**测量代码**（可在 debug 模式开启）：

```typescript
const DEBUG = false;
function doUpdateCursor(): void {
  if (DEBUG) {
    const t0 = performance.now();
    // ... 实际逻辑 ...
    const dt = performance.now() - t0;
    if (dt > 0.1) console.warn(`[zenType] updateCursor took ${dt.toFixed(3)}ms`);
  }
}
```

### 11.3 跨场景测试

| 场景 | 操作 | 期望 |
|------|------|------|
| 空段落 | 在空段落行首点击 | 光标正常显示 + 呼吸动画 |
| 表格 | 在表格单元格内点击、编辑、退出 | 光标正确跟随 |
| 嵌入块 | 在嵌入块内点击编辑 | 光标正确显示在嵌入块内 |
| 多分屏 | 打开 2 个文档分屏，在左右编辑器之间切换 | 只有一个光标，跟随活跃编辑器 |
| 搜索跳转 | 从搜索框 Ctrl+Click 打开链接 | 光标隐藏等待第一次 click 后显示（需 click 白名单） |
| 悬浮窗拖动 | 拖拉悬浮窗 .resize__move | 光标跟随悬浮窗移动 |
| 暗色模式 | 切换到暗色主题 | 光标颜色变为 `var(--zt-cursor-color)` 暗色版 |
| 移动端 | 在移动端打开思源 | 光标正常显示，键盘弹出/收起重定位 |
| 中文输入法 | 用输入法输入中文（composition） | 呼吸暂停，输入完成后自动恢复 |

### 11.4 用户手动测试清单

用户在思源中逐项检查（约 10 分钟）：

- [ ] 光标在"空行"点击时高度是否正常（不低于周围文字）
- [ ] 输入文字后，停止约 1 秒，光标是否开始呼吸
- [ ] 按住右箭快速移动，光标移动是否流畅无边
- [ ] 在搜索框 / 设置面板点击，光标是否不出现
- [ ] 打开浮窗（如块引用），光标是否正常
- [ ] 用鼠标滚轮快速滚动，光标是否紧跟（不滞后）
- [ ] 分屏两个文档，光标是否只在活跃文档显示
- [ ] 切 Tab，光标是否在 1 秒内正确出现在新 Tab
- [ ] 暗色主题下，光标颜色是否与主题匹配

---

## 12. 风险评估

### 12.1 EventBus 在老版本思源的兼容性

**风险**：思源 v2.x 到 v3.x 可能调整了 EventBus 的事件名或 detail 结构。

**缓解**：
```typescript
// 用可选链 + try/catch 包裹
try {
  this.eventBus?.on?.("loaded-protyle-static", this._onProtyleLoaded_static);
} catch {
  console.warn("[zenType] EventBus not available, falling back to DOM events");
  initCursorLegacyMode();
}
```

或者检查 `this.eventBus` 是否存在：
```typescript
if (this.eventBus && typeof this.eventBus.on === "function") {
  // 使用 EventBus
} else {
  // 降级：手动 MutationObserver 监听 .protyle 的增删
}
```

### 12.2 `getActiveEditor()` 返回 null

**场景**：用户尚未打开任何文档（刚启动思源、所有 tab 关闭）。

**处理**：
```typescript
function validateActiveEditor(): boolean {
  const editor = getActiveEditor();
  if (!editor) {
    cursorEl?.classList.add("hidden");
    return false;
  }
  return true;
}
```
在 `updateCursor()` 开头调用，null 时直接隐藏光标。等 `loaded-protyle-static` 事件触发后再激活。

### 12.3 多 protyle 共享 cursor 的边界条件

**场景**：
- 用户在分屏 A 打字，B 的文本被 WebSocket 同步更新
- A 和 B 各自有独立的 `.protyle-content`，但全局只有一个 Selection

**风险**：如果 B 的 WS 更新触发了 `updateCursor()`，但焦点在 A，光标可能被错误定位到 B 的旧选区。

**缓解**：`updateCursor()` 中使用 `getActiveEditor().element.contains(selection.anchorNode)` 判断选区属于哪个编辑器。不匹配则隐藏。

### 12.4 性能回退的可能场景

| 场景 | 风险 | 缓解 |
|------|------|------|
| 极端长文档（10000+ 块） | `getLineHeight()` 中的 `closest()` 可能深遍历 | 缓存行高（按 `focusElement` 做 key） |
| 频繁切换 Tab（每次切换都触发 `switch-protyle`） | throttleTimers 堆积 | 每次 schedule 前 `forEach(clearTimeout)` |
| 快速连续滚动 | `no-transition` 反复添加/移除 | rAF 驱逐——每帧至多一次 add/remove |
| 悬浮窗拖动 + 键盘输入同时触发 | 两路 `queueUpdate()` 竞逐 | rAF 标志保证每帧只跑一次 |
| ResizeObserver 触发频次 | 拖拽分屏时连续触发 | ResizeObserver 自带节流（每帧一次） |

---

## 附录 A：与三版对比的改进小结

| 特性 | 当前（v2.0.0） | 方案后（v2.1.0） | 借鉴来源 |
|------|:---------:|:---------:|---------|
| 定位算法 | ZWSP fallback（简） | ZWSP fallback + 行高计算 | Neo-Plus + legacy |
| 高度 | `rect.height` | `lineHeight × 1.1` | legacy + 用户要求 |
| 呼吸动画 | ⚠️ 触发 BUG | 反向 idle 逻辑 | legacy |
| 移动动画 | ⚠️ 感知不到 | no-transition 时序修复 | legacy |
| 边界检测 | ❌ 无 | 4 重检测 | legacy |
| z-index | 硬编码 9999 | 祖先链动态计算 | legacy |
| 滚动处理 | 直接 update | stop transition + stop animation | legacy |
| ResizeObserver | ❌ | ✅ | legacy |
| 悬浮窗拖动 | ❌ | ✅ | legacy |
| AV 排除 | ❌ | ✅ | legacy |
| EventBus | ❌ | ✅ 9 个事件 | 官方 |
| getActiveEditor | ❌ | ✅ | 官方 |
| getFrontend | ❌ | ✅ | 官方 |
| rAF 节流 | ✅ | ✅ | 当前 |
| passive 事件 | ⚠️ 部分 | ✅ 全覆盖 | Neo-Plus + 当前 |
| 多阶段 throttle | ❌ | ✅ 200/400/600ms | Neo-Plus |
| 性能缓存 | ❌ | ✅ lineHeight / zIndex / scrollContainer | 当前 |

---

## 附录 B：文件清单

### 新建文件（6 个）

```
src/modules/cursor/breathing.ts       — 呼吸动画状态机
src/modules/cursor/boundary.ts        — 边界检测
src/modules/cursor/zIndex.ts          — 动态 z-index 计算
src/modules/cursor/styles.ts          — CSS 字符串生成
src/utils/getCursorElement.ts         — 从 getCursorRect.ts 拆出
src/utils/getLineHeight.ts            — 行高获取
```

### 修改文件（5 个）

```
src/index.ts                          — +EventBus 订阅/退订 + CSS 注入调用
src/modules/cursor.ts                 — 重写（~250 行）
src/utils/getCursorRect.ts            — 重写（~70 行）
src/styles/index.scss                 — 移除光标 CSS（~30 行→20 行）
src/types/index.ts                    — +CursorRect 接口
```

### 不修改文件

```
src/utils/styleManager.ts             — 不变
src/modules/typewriter.ts             — 不变（参照用）
src/modules/ripple.ts                 — 不变（参照用）
src/utils/edgeCases.ts                — 不变（辅助用）
```

---

## Handoff Plan

下列步骤按阶段顺序排列。deep-worker 应按 P0 → P1 → P2 的顺序执行，每完成一个阶段提交一次。

### 阶段 1（P0）

1. **创建 `src/utils/getCursorElement.ts`**：从 `getCursorRect.ts` 拆出 `getCursorElement()` 函数（保持现有实现不变）。
2. **创建 `src/utils/getLineHeight.ts`**：实现 `getLineHeight(node: Node): number | null`，向上查找 `[contenteditable="true"]` 或 `.protyle-title__input`，取 `computedStyle.lineHeight`，fallback `fontSize * 1.625`，再 fallback 26。
3. **重写 `src/utils/getCursorRect.ts`**：实现 `getCursorRect(): CursorRect | null`（返回 `{ x, y, height, width }`），使用 `lineHeight × 1.1`，内置 `getZWSPRect()` fallback。修改 `src/types/index.ts` 加 `CursorRect` 接口。
4. **创建 `src/modules/cursor/breathing.ts`**：实现 `initBreathing` / `pauseBreathe` / `resumeBreathe` / `destroyBreathing`。反向逻辑（默认有动画，操作时 `no-animation`，500ms 后恢复）。
5. **创建 `src/modules/cursor/boundary.ts`**：实现 `isInAllowElements()` 含 4 重检测 + `isInsidePopupOrDialog()` + `findClosestScrollableElement()`。
6. **重写 `src/modules/cursor.ts`**：
   - 删除 `startBlink` / `stopBlink` / `blinkTimer` 相关代码
   - 导入 `breathing.ts` 和 `boundary.ts`
   - `doUpdateCursor()`（原 `updateCursor()`）新增：`isInAllowElements()` 调用、`pauseBreathe()`/`resumeBreathe()`、`no-transition` class 处理、`getEffectiveZIndex()` 调用
   - scroll/wheel/touchmove 处理改为 `add("no-transition")` + `queueUpdate()` + rAF 后 `remove("no-transition")`
   - `getCursorRect()` 改为返回 `CursorRect`，高度使用 `pos.height`
7. **更新 `src/types/index.ts`**：新增 `CursorRect` 接口导出。
- **风险**：边界检测需要实测思源 DOM 结构，`.av`、`.block__popover` 选择器可能随版本变化。
- **测试**：在思源中按 11.4 用户检查清单逐项验证。`pnpm run dev` 确保编译通过。

### 阶段 2（P1）

1. **创建 `src/modules/cursor/zIndex.ts`**：实现 `getEffectiveZIndex()` + 缓存版 + 结合 `window.siyuan.zIndex`。
2. **`cursor.ts` 中新增 ResizeObserver 支持**：`bindResizeObserver` / `unbindResizeObserver`，监听 `.protyle-content`，变化时 `no-transition` + `queueUpdate()`。
3. **`cursor.ts` 中新增悬浮窗拖动支持**：`bindPopoverDrag()`，处理 `.resize__move` 的 mousedown/mousemove/mouseup。
4. **完善 `boundary.ts`**：扩展 `isInsidePopupOrDialog()`，增加更多弹窗选择器。
- **风险**：悬浮窗 DOM `.resize__move` 可能在新版本思源改名。
- **测试**：拖拽悬浮窗光标是否跟随；缩放侧边栏光标是否重定位。

### 阶段 3（P2）

1. **创建 `src/modules/cursor/styles.ts`**：从 `index.scss` 提取光标 CSS 为 JS 字符串 `CURSOR_CSS`（包含 `.hidden`、`.no-animation`、`.no-transition`、`@keyframes zentype-breathe`）。
2. **修改 `src/styles/index.scss`**：移除 `#zentype-cursor`、`#zentype-cursor.hidden`、`#zentype-cursor.breathing`、`@keyframes zentype-blink`、`[data-theme-mode="dark"]`  的光标部分、`.layout__resize`，只保留高亮条 + 暗色变量 + 原生光标隐藏。
3. **修改 `src/index.ts`**：
   - 在 `onload()` 中调用 `addStyle("cursor", CURSOR_CSS)`
   - 在 `onunload()` 中调用 `removeStyle("cursor")`
   - 添加 9 个 EventBus 订阅方法（`_onProtyleLoaded_static` 等）
   - `onunload()` 中添加全部 `eventBus.off()` 调用
   - 用 `getActiveEditor()` 校验替代 `closest('.protyle')`
   - 用 `getFrontend()` 替代手动移动端判定
   - `ws-main` 事件替代手动 `window.siyuan.ws.ws.addEventListener`
4. **`cursor.ts` 中适配**：移除 `getCursorElement()` 中冗余的 protyle 遍历，依赖边界检测的 `validateCursorInActiveEditor()`。
- **风险**：EventBus 事件名在老版本思源可能不同，须加兼容降级。`ws-main` 事件格式可能与手动监听略有差异。
- **测试**：编译通过 + 在思源中所有功能正常。用 Chrome DevTools 验证性能指标。

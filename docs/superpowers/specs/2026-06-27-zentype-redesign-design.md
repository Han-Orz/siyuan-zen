# zenType v2 设计文档

> **本文档是 zenType 思源笔记插件 v2 重构的完整设计。**
>
> - **作者**：用户 + Sisyphus 编排
> - **日期**：2026-06-27
> - **版本**：v2（基于用户第二轮反馈：顺滑光标常驻 + 鼠标聚焦模式 + 嵌入块策略 + 嵌套块先简单方案）
> - **状态**：草案，待用户最终审阅
> - **目标读者**：用户本人（编程小白）+ 实施此项目的工程师/AI 代理

---

## 1. 项目背景与目标

### 1.1 现状

zenType 是一个思源笔记（SiYuan Note）插件，**距离上次更新已经过去约一年半**。现有代码库存在以下问题：

| 问题 | 严重度 |
|------|--------|
| 模板代码占 90%，实际插件逻辑只有 355 行（2 个文件） | 中 |
| 没有 Git 仓库，无法追踪历史 | 中 |
| `src/参考/` 下有 9 个草稿文件混在一起 | 低 |
| 思源 API 可能已演进（`minAppVersion: 3.0.0` 偏旧） | 高 |
| 两个已知 bug 未修复：全屏模式高亮条层级、退格/回车时空行聚焦 | 中 |
| 设置面板、i18n 未接入 | 低 |

### 1.2 目标

**推倒重做** zenType v2，保留三大核心功能（顺滑光标 + 打字机模式 + 涟漪聚焦），并补齐架构、构建链、代码质量。

### 1.3 v1 不做的事（明确范围）

为防止范围蔓延，以下功能**推迟到 v2+**：

- ❌ 设置面板 UI（v1 用「总开关 + 命令面板」最小可用替代）
- ❌ 快捷键自定义
- ❌ 鼠标流体拖尾（性能开销大，不做）
- ❌ 主题色自定义（保留接口但 v1 不暴露 UI）

---

## 2. 用户场景

| 场景 | 用户在做什么 | 哪个功能帮到他 |
|------|------------|--------------|
| 写笔记 | 在编辑器里打字 | **顺滑光标** — 光标移动有丝滑过渡，看起来更精致，眼睛不累 |
| 写长文 | 光标位置离视口中心越来越远 | **打字机模式** — 光标永远在视线中心，不用低头找 |
| 专注写作 | 周围段落会干扰注意力 | **涟漪聚焦** — 当前段最亮，其他段淡淡变暗，专注当下 |

三个功能**默认全开**，互不冲突，可单独关闭。

---

## 3. 功能清单

### 3.1 顺滑光标

| 项 | 规格 |
|----|------|
| **做什么** | 替换浏览器原生的「竖线光标」，改为蓝色自定义光标，移动时有过渡动画 |
| **默认** | 开 |
| **颜色（亮主题）** | `#5d8cd7`（浅蓝） |
| **颜色（暗主题）** | `#8ab4f8`（更亮的浅蓝） |
| **动画曲线** | `cubic-bezier(0.25, 0.1, 0.25, 1)`，时长 150ms |
| **闪烁** | 静止 500ms 后开始呼吸式闪烁，opacity 1 → 0 |
| **不处理** | 输入框、文本域、`av`（属性视图）、`contenteditable=false` 区域 |
| **边界行为** | **除非用户显式关闭，否则永不暂停**。选中多行、悬浮窗、嵌入块、嵌套块都不影响光标显示 |

### 3.2 打字机模式

| 项 | 规格 |
|----|------|
| **做什么** | 当光标位置偏离视口中心超过阈值，自动滚动让光标回到屏幕中央偏上 |
| **默认** | 开 |
| **目标位置** | 屏幕高度的 **38%**（黄金分割偏上） |
| **触发阈值** | 光标与目标位置偏差 **≥ 40px** 才触发 |
| **滚动时长** | **400ms**（比 Neo-Plus 默认 600ms 快，更跟手） |
| **缓动曲线** | `easeInOutCubic`（开始慢、中间快、结束慢） |
| **视觉指示** | 高亮条（亮主题米黄 `#f2ecde99` / 暗主题深灰 `#36343373`）跟随光标 |
| **不处理** | 选中多行、悬浮窗、只读模式、**嵌入块** |

### 3.3 涟漪聚焦

| 项 | 规格 |
|----|------|
| **做什么** | 当前编辑块最亮 + 带背景高亮条，周围块按距离渐淡 |
| **默认** | 开 |
| **渐淡单位** | **块级**（按 Protyle 的 `[data-node-id]`），**包括嵌入块** |
| **渐变曲线** | 100% → 85% → 60% → 35% → 15% → 5%（连续 5 级） |
| **过渡** | `transition: opacity 0.3s ease-out` |
| **当前块背景** | 与打字机模式共用高亮条（米黄/深灰） |
| **嵌套块** | **v1 简单方案**：只处理当前光标所在的最小块，外层不递归渐淡 |
| **嵌入块** | **作为渐淡单位参与**（v1），但**不触发打字机滚动** |
| **鼠标聚焦模式** | 只读模式 / 编辑模式 + 鼠标静止 2s 以上 / 鼠标移到非文本光标位置 → 自动切换为以鼠标位置为中心 |
| **暂停条件** | 选中多行、悬浮窗、只读模式（鼠标聚焦除外） |

#### 3.3.1 鼠标中心聚焦模式（v1 新增）

这是一种**辅助模式**，让涟漪聚焦在以下情况下跟着鼠标走：

| 触发条件 | 行为 |
|---------|------|
| 只读模式（思源文档被挂起） | 鼠标移到哪个块，那个块就是焦点 |
| 编辑模式 + 文本光标位置 **2 秒未变化** | 鼠标移到新块时，焦点跟随鼠标切换 |
| 鼠标移到文本光标**当前所在块之外** | 立即切换焦点到鼠标所在块（即使不到 2s） |

**回退条件**（自动切回文本光标中心）：

- 编辑模式下文本光标位置再次变化（用户开始打字/移动光标）
- 鼠标离开编辑器区域

**边界处理**：

- 鼠标在滚动条、悬浮窗、右键菜单上：忽略（不更新）
- 鼠标移动超过视口边界（如 F11 全屏边角）：忽略

### 3.4 模块行为总览

| 模式 | 顺滑光标 | 打字机模式 | 涟漪聚焦 |
|------|---------|----------|---------|
| **编辑 + 文本光标活动** | ✅ | ✅ | ✅（文本光标中心） |
| **编辑 + 鼠标静止 2s+** | ✅ | ✅（保持） | ✅（鼠标中心） |
| **只读模式** | ✅ | ⏸ 暂停 | ✅（鼠标中心） |
| **选中多行** | ✅ | ⏸ 暂停 + 渐出 | ⏸ 暂停 + 渐出 |
| **悬浮窗编辑** | ✅ | ⏸ 暂停 | ⏸ 暂停 |
| **嵌入块（视频/iframe/PDF）** | ✅ | ⏸ 暂停 | ✅（作为渐淡单位） |
| **嵌套块** | ✅ | ✅ | ✅（简单方案，不递归） |

---

## 4. 架构设计

### 4.1 模块划分

```
zenType 插件
├── 入口（index.ts）
│   ├── 生命周期管理
│   ├── 总开关
│   └── 协调三个模块
│
├── 模块 1：顺滑光标（cursor.ts）
│   ├── 监听 selectionchange / scroll / keyup
│   ├── 用 requestAnimationFrame 更新位置
│   └── 闪烁控制
│
├── 模块 2：打字机模式（typewriter.ts）
│   ├── 监听 selectionchange
│   ├── 距离判定 + 阈值触发
│   ├── easeInOutCubic 滚动
│   └── 高亮条同步
│
├── 模块 3：涟漪聚焦（ripple.ts）
│   ├── 监听 selectionchange
│   ├── 找到当前块 + 周围块
│   ├── 计算距离 → 设置透明度
│   └── 嵌套块处理
│
└── 公共工具
    ├── getCursorRect()：光标位置获取
    ├── detectEdgeCase()：边界场景判定
    └── styleManager：注入和清理样式
```

**原则**：每个模块**完全独立**，可单独打开/关闭，可单独测试。

### 4.2 技术栈

| 层 | 选择 | 理由 |
|----|------|------|
| **语言** | TypeScript | 类型检查，与 Neo-Plus 一致 |
| **构建工具** | esbuild | 比 Vite 轻量，单命令构建 |
| **样式** | sass | 嵌套 + 变量管理主题色 |
| **前端框架** | 无（vanilla TS + DOM） | 简单场景，框架增加复杂度 |
| **运行时依赖** | 无 | 只用浏览器原生 API + 思源 SDK |

### 4.3 目录结构

```
zenType/
├── src/
│   ├── index.ts                    # 入口，编排三大模块
│   ├── modules/
│   │   ├── cursor.ts               # 顺滑光标
│   │   ├── typewriter.ts           # 打字机模式
│   │   └── ripple.ts               # 涟漪聚焦
│   ├── utils/
│   │   ├── getCursorRect.ts        # 光标位置工具
│   │   ├── edgeCases.ts            # 边界场景判定
│   │   └── styleManager.ts         # 样式管理
│   ├── types/
│   │   └── index.ts                # TypeScript 类型定义
│   └── styles/
│       └── index.scss              # 全局样式
├── 参考/                            # 外部参考（保留）
│   └── 顺滑光标.js
├── docs/superpowers/specs/         # 设计与计划文档
├── plugin.json
├── package.json
├── tsconfig.json
├── build.js                        # esbuild 脚本
└── README.md / README_zh_CN.md
```

### 4.4 入口文件骨架

```typescript
import { Plugin } from "siyuan";
import { initCursor, destroyCursor } from "./modules/cursor";
import { initTypewriter, destroyTypewriter } from "./modules/typewriter";
import { initRipple, destroyRipple } from "./modules/ripple";

export default class ZenType extends Plugin {
  private enabled = {
    cursor: true,
    typewriter: true,
    ripple: true,
  };

  async onload() {
    this.addCommand({
      command: "toggle-cursor",
      callback: () => this.toggle("cursor"),
    });
    this.addCommand({
      command: "toggle-typewriter",
      callback: () => this.toggle("typewriter"),
    });
    this.addCommand({
      command: "toggle-ripple",
      callback: () => this.toggle("ripple"),
    });

    if (this.enabled.cursor) initCursor();
    if (this.enabled.typewriter) initTypewriter();
    if (this.enabled.ripple) initRipple();
  }

  onunload() {
    destroyCursor();
    destroyTypewriter();
    destroyRipple();
  }

  private toggle(module: keyof typeof this.enabled) {
    this.enabled[module] = !this.enabled[module];
    // 销毁后重新初始化（或完全跳过）
    // 详细逻辑见模块设计
  }
}
```

---

## 5. 数据流

### 5.1 三大模块的协作

```
用户操作（键盘/鼠标/滚动）
    ↓
selectionchange / scroll / keyup 等事件
    ↓
┌─────────────────┬─────────────────┬─────────────────┐
│  顺滑光标模块    │  打字机模式模块   │  涟漪聚焦模块    │
│                 │                 │                 │
│  1. 读光标位置   │  1. 读光标位置   │  1. 找当前块     │
│  2. 更新光标 div │  2. 算距离      │  2. 找周围块     │
│  3. 控制闪烁    │  3. 触发滚动    │  3. 设透明度    │
│                 │  4. 同步高亮条  │                 │
└─────────────────┴─────────────────┴─────────────────┘
    ↓                          ↓                  ↓
修改 DOM / 修改 transform    修改 scrollTop    修改 opacity
```

**关键点**：三个模块**互不通信**，都从同一个 `selectionchange` 事件源读数据，各自独立处理。

### 5.2 事件订阅清单

| 事件 | 顺滑光标 | 打字机模式 | 涟漪聚焦 |
|------|---------|----------|---------|
| `selectionchange` | ✅ | ✅ | ✅ |
| `scroll` | ✅ | ✅（防抖） | ❌ |
| `keyup` / `keydown` | ✅ | ✅ | ✅ |
| `mouseup` / `click` | ✅ | ✅ | ✅ |
| `wheel` | ✅ | ❌ | ❌ |
| `resize` | ✅ | ✅ | ✅ |
| WS `transactions` | ✅ | ❌ | ❌ |

---

## 6. 详细设计

### 6.1 顺滑光标模块（cursor.ts）

**核心算法**（基于 Neo-Plus `getselection.ts`）：

```typescript
function getCursorRect(): Rect | null {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;

  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);

  // 优先用浏览器原生 rect
  const rects = Array.from(range.getClientRects());
  if (rects.length > 0) return rects[rects.length - 1];

  // fallback：插入零宽字符作为占位
  const marker = document.createTextNode("\u200B");
  range.insertNode(marker);
  const rect = marker.getBoundingClientRect();
  marker.remove();
  return rect;
}
```

**位置更新**（每帧最多一次）：

```typescript
function updateCursorPosition() {
  if (pendingFrame) return;
  pendingFrame = requestAnimationFrame(() => {
    const rect = getCursorRect();
    if (!rect) {
      cursorEl.classList.add("hidden");
      return;
    }
    cursorEl.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    cursorEl.style.height = `${rect.height}px`;
    cursorEl.classList.remove("hidden");
  });
}
```

**闪烁逻辑**：

```typescript
let blinkTimer: number;
function onCursorIdle() {
  clearTimeout(blinkTimer);
  blinkTimer = setTimeout(() => {
    cursorEl.classList.add("breathing"); // CSS animation
  }, 500);
}
function onCursorMove() {
  cursorEl.classList.remove("breathing");
  onCursorIdle();
}
```

### 6.2 打字机模式模块（typewriter.ts）

**核心算法**（基于 Neo-Plus `immersivemode.ts`，但更激进）：

```typescript
const TARGET_RATIO = 0.38;      // 38% 高度
const THRESHOLD = 40;            // 阈值
const DURATION = 400;            // ms
const container = document.querySelector(".protyle-content");

function checkAndScroll() {
  const cursorRect = getCursorRect();
  if (!cursorRect) return;

  const containerRect = container.getBoundingClientRect();
  const targetY = containerRect.top + containerRect.height * TARGET_RATIO;
  const offset = cursorRect.top - targetY;

  if (Math.abs(offset) < THRESHOLD) return; // 在阈值内，不动

  const startScroll = container.scrollTop;
  const endScroll = startScroll + offset;
  const startTime = performance.now();

  function step() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / DURATION, 1);
    const eased = easeInOutCubic(t);
    container.scrollTop = startScroll + (endScroll - startScroll) * eased;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
```

**高亮条同步**：与光标共用同一目标位置，但用 `background-color` 实现，挂在 `body` 下避免被编辑器 CSS 影响。

### 6.3 涟漪聚焦模块（ripple.ts）

**核心算法**：

```typescript
const OPACITY_LEVELS = [1.0, 0.85, 0.6, 0.35, 0.15, 0.05];

// 状态机
type Mode = "text" | "mouse" | "paused";
let mode: Mode = "text";
let lastTextCursorChange = 0;
let lastMouseBlock: Element | null = null;
let lastTextBlock: Element | null = null;
let pendingFrame: number | null = null;

function getCurrentBlock(): Element | null {
  if (mode === "mouse" && lastMouseBlock) return lastMouseBlock;
  const cursorEl = getCursorElement();
  return cursorEl?.closest("[data-node-id]") ?? null;
}

function applyRipple() {
  if (pendingFrame) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    const currentBlock = getCurrentBlock();
    if (!currentBlock) return;

    // 收集所有同级块 + 嵌入块
    const container = currentBlock.closest(".protyle-wysiwyg");
    if (!container) return;
    const allBlocks = Array.from(
      container.querySelectorAll('[data-node-id], iframe, video')
    );

    // 简单方案：按 DOM 兄弟序号算距离（v1 不递归嵌套块）
    allBlocks.forEach((block) => {
      const distance = calculateBlockDistance(currentBlock, block);
      const opacity = OPACITY_LEVELS[Math.min(distance, 5)];
      block.style.opacity = String(opacity);
    });

    currentBlock.style.opacity = "1";
  });
}

function calculateBlockDistance(from: Element, to: Element): number {
  // 简化：DOM 兄弟序号差（v1 简单方案，不递归嵌套块）
  const fromParent = from.parentElement;
  const siblings = Array.from(fromParent?.children ?? []);
  const fromIndex = siblings.indexOf(from);
  const toIndex = siblings.indexOf(to);
  return Math.abs(fromIndex - toIndex);
}
```

#### 6.3.1 模式切换逻辑

```typescript
// 文本光标变化
document.addEventListener("selectionchange", () => {
  lastTextCursorChange = Date.now();
  lastTextBlock = getCursorElement()?.closest("[data-node-id]") ?? null;
  if (mode !== "paused") {
    mode = "text";
    applyRipple();
  }
});

// 鼠标移动
document.addEventListener("mousemove", throttle((e) => {
  // 鼠标在编辑器外？回退到文本光标
  if (!e.target?.closest(".protyle-wysiwyg")) {
    if (mode === "mouse") {
      mode = "text";
      applyRipple();
    }
    return;
  }

  // 鼠标在滚动条/菜单上？跳过
  const target = document.elementFromPoint(e.clientX, e.clientY);
  if (!target || isOverScrollbar(e, target)) return;

  const mouseBlock = target.closest('[data-node-id], iframe, video');
  if (!mouseBlock) return;
  lastMouseBlock = mouseBlock;

  // 决定是否切到 mouse 模式
  const editor = document.querySelector(".protyle-content");
  const isReadMode = !editor?.isContentEditable;
  const idleTooLong = Date.now() - lastTextCursorChange > 2000;
  const mouseInDifferentBlock =
    lastTextBlock && !mouseBlock.contains(lastTextBlock) && !lastTextBlock.contains(mouseBlock);

  if (isReadMode || idleTooLong || mouseInDifferentBlock) {
    if (mode !== "mouse") {
      mode = "mouse";
      applyRipple();
    } else {
      applyRipple();
    }
  }
}, 100));
```

#### 6.3.2 嵌套块说明（v1 简单方案）

- 列表 / 引用块里的子项：如果光标在子项里，**只对子项所在那一层做渐淡**
- 外层（列表项本身）保持 100%，不会被影响
- 这避免了性能问题和 DOM 操作复杂性
- **v2 升级**：如果用户反馈需要"递归渐淡"（父级 80% → 60% → 40%），单独迭代

#### 6.3.3 嵌入块说明

- 嵌入块（`iframe`、`video`、PDF 预览）**作为 1 个渐淡单位**参与涟漪
- 它们和普通块一样根据距离算透明度
- 但**不触发打字机滚动**（详见 6.2）

### 6.4 边界场景判定（edgeCases.ts）

```typescript
const editor = document.querySelector(".protyle-content[contenteditable]");

// 顺滑光标**永远不暂停**，无判定函数

export function shouldPauseFocusAndTypewriter(): boolean {
  const sel = window.getSelection();
  if (sel?.toString().length > 0) return true; // 选中多行
  if (isInPopup()) return true; // 悬浮窗编辑
  return false;
}

export function shouldPauseTypewriter(): boolean {
  if (isInPopup()) return true;
  if (isReadMode()) return true;
  if (isInEmbedBlock()) return true; // 嵌入块里不滚动
  return false;
}

export function isInPopup(): boolean {
  return !!document.querySelector(".block__popover--open");
}

export function isReadMode(): boolean {
  const ed = document.querySelector(".protyle-content");
  return !ed?.isContentEditable;
}

export function isInEmbedBlock(): boolean {
  const cursor = getCursorElement();
  return !!cursor?.closest(
    "iframe, video, [data-type='NodeIFrame'], [data-type='NodeVideo']"
  );
}
```

每个模块在更新前调用这些判定，返回 `true` 时**优雅降级**（光标不隐藏、聚焦不清除、高亮条保留但停用滚动）。

---

## 7. UI 设计

### 7.1 顶栏图标

- **位置**：思源顶栏右侧
- **图标**：一个简单的「笔 + 光标」图标（SVG，可自定义）
- **行为**：点击切换总开关（开/关所有三个功能）
- **状态**：
  - 启用：图标正常颜色
  - 禁用：图标灰色 + 删除线

### 7.2 命令面板（Ctrl+Shift+P）

思源原生命令面板里注册三个命令：

| 命令 | 描述 | 快捷键（v1 不支持自定义） |
|------|------|-----------------------|
| `zenType: 切换顺滑光标` | 切换光标模块 | 无（v1） |
| `zenType: 切换打字机模式` | 切换打字机模块 | 无（v1） |
| `zenType: 切换涟漪聚焦` | 切换涟漪模块 | 无（v1） |
| `zenType: 总开关` | 一键启用/禁用 | 无（v1） |

### 7.3 颜色规范（亮 / 暗主题）

```scss
:root {
  --zt-cursor-color: #5d8cd7;
  --zt-highlight-bg: rgba(242, 236, 222, 0.6); // 米黄
}

[data-theme-mode="dark"] {
  --zt-cursor-color: #8ab4f8;
  --zt-highlight-bg: rgba(54, 52, 51, 0.45); // 深灰
}

#zt-cursor {
  background: var(--zt-cursor-color);
}

#zt-highlight-line {
  background: var(--zt-highlight-bg);
}
```

CSS 变量方式预留扩展点，v2+ 设置面板可改这些值。

---

## 8. 性能与兼容性

### 8.1 性能预算

| 指标 | 目标 |
|------|------|
| `selectionchange` 处理耗时 | < 5ms |
| 每帧 DOM 操作次数 | ≤ 3 次 |
| 滚动 FPS | ≥ 55（接近 60） |
| 内存占用 | < 10MB |
| CPU 占用（静态） | < 1% |

**关键优化**：
- 用 `requestAnimationFrame` 合并多次更新
- 防抖（debounce）滚动事件
- 涟漪聚焦只在 selectionchange 触发，不在 scroll 时重算
- DOM 遍历用 `closest()` 而非全局查询

### 8.2 兼容性要求

| 项 | 要求 |
|----|------|
| `minAppVersion` | `3.0.12`（保守，覆盖大多数用户） |
| 浏览器 | Chromium（思源内置，无需额外考虑） |
| 移动端 | 暂不优化（桌面端优先） |
| CSS 特性 | `:has()`（思源 3.0+ 已支持） |

---

## 9. 边界场景处理（汇总）

| 场景 | 顺滑光标 | 打字机模式 | 涟漪聚焦（文本中心） | 涟漪聚焦（鼠标中心） |
|------|---------|----------|------------------|-------------------|
| **选中多行**（拖蓝一段文字） | ✅ 保持 | ⏸ 暂停 + 渐出动画 | ⏸ 暂停 + 渐出动画 | — |
| **只读模式** | ✅ 保持 | ⏸ 暂停 | — | ✅ 激活（鼠标跟随） |
| **悬浮窗编辑** | ✅ 保持 | ⏸ 暂停 | ⏸ 暂停 | — |
| **嵌入块**（视频/iframe/PDF） | ✅ 保持 | ⏸ 暂停 | ✅ 作为渐淡单位 | ✅ 作为渐淡单位 |
| **嵌套块**（光标在子项） | ✅ 保持 | ✅ | ✅ 简单方案（只处理当前最小块） | ✅ 简单方案 |
| **代码块** | ✅ 保持 | ✅ | ✅ 整块作为 1 个渐淡单位 | ✅ |
| **编辑模式 + 鼠标静止 2s+** | ✅ | ✅ | — | ✅ 激活（鼠标移动即切换） |
| **鼠标移到非文本光标块** | ✅ | ✅ | — | ✅ 立即切换 |
| **鼠标离开编辑器** | ✅ | ✅ | — | ⏸ 回退到文本中心 |

**核心规则**：

1. **顺滑光标永不停**：除非用户在命令面板显式关闭
2. **聚焦/打字机是「可暂停」**：暂停时用 0.3s 渐出动画，不要突然消失
3. **鼠标聚焦是「自动切换」**：基于规则自动判定，不需要用户配置

**实现机制**：

```typescript
// edgeCases.ts
export function shouldPauseFocusAndTypewriter(): boolean {
  const sel = window.getSelection();
  if (sel?.toString().length > 0) return true; // 选中多行
  if (isInPopup()) return true; // 悬浮窗
  return false;
}

export function isInEmbed(): boolean {
  return !!getCursorElement()?.closest(
    "iframe, video, [data-type='NodeIFrame'], [data-type='NodeVideo']"
  );
}

export function isReadMode(): boolean {
  const editor = document.querySelector(".protyle-content");
  return !editor?.isContentEditable;
}
```

---

## 10. 未来扩展（v2+）

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 设置面板 UI | P0 | 暴露所有可调参数（透明度、阈值、颜色、是否启用鼠标聚焦等） |
| 快捷键自定义 | P1 | 让用户绑定自己习惯的快捷键 |
| 主题色自定义 | P1 | 用 CSS 变量 + 设置面板 |
| **嵌套块递归渐淡**（v1 简单方案的升级） | P2 | 用户反馈需要时再做：父级 80% → 60% → 40% 递归 |
| 句子级聚焦（叠加在涟漪之上） | P2 | 来自 Obsidian `focus-active-sentence` 思路 |
| 嵌入块的打字机支持 | P3 | 让嵌入块也能滚动居中（场景有限） |
| 鼠标流体拖尾 | P3 | 性能允许时考虑 |
| 移动端适配 | P3 | 桌面端稳定后再做 |

---

## 11. 风险与开放问题

| 风险 | 影响 | 缓解 |
|------|------|------|
| 思源 Protyle DOM 结构未来可能变化 | 高 | 用 `closest()` 和语义化选择器，避免硬编码类名 |
| 鼠标聚焦和文本聚焦切换有「闪烁感」（透明度跳变） | 中 | 切换模式时也走 `transition: opacity 0.3s` |
| 鼠标移动触发涟漪时性能开销 | 中 | `mousemove` 用 100ms 节流 + `requestAnimationFrame` 合并 |
| 嵌套块的渐淡效果不如用户预期 | 低 | README 写清楚 v1 简化方案（v2 可升级） |

---

## 12. 实施清单（概览）

> 详细实施计划见 `docs/superpowers/plans/2026-06-27-zentype-redesign-plan.md`（下一步生成）

- [ ] 搭建项目骨架（package.json、tsconfig、build.js）
- [ ] 实现公共工具（getCursorRect、edgeCases、styleManager）
- [ ] 实现顺滑光标模块（cursor.ts）
- [ ] 实现打字机模式模块（typewriter.ts）含高亮条
- [ ] 实现涟漪聚焦模块（ripple.ts）含**文本/鼠标双模式状态机**
- [ ] 实现顶栏图标 + 命令面板注册
- [ ] 接入思源插件生命周期
- [ ] 在 README 中说明：嵌套块处理 / 鼠标聚焦 / 嵌入块策略
- [ ] 手动测试（每个边界场景）+ 截图

---

## 13. 参考资料

1. **思源内核 API**：https://leolee9086.github.io/siyuan-kernelApi-docs
2. **Neo-Plus（顺滑光标 + 沉浸模式）**：https://github.com/QYLexpired/Neo-Plus
3. **Neo-Plus 顺滑光标源码**：`src/visual/smoothcaret.ts`
4. **Neo-Plus 沉浸模式源码**：`src/extension/immersivemode.ts`
5. **Neo-Plus 光标位置获取**：`src/modules/getselection.ts`
6. **思源社区顺滑光标参考实现**：`参考/顺滑光标.js`
7. **Obsidian 纯 CSS 涟漪聚焦原帖**：https://forum-zh.obsidian.md/t/topic/33359

---

**下一步**：本文档待用户审阅。用户确认后，调用 `writing-plans` 技能生成详细实施计划。
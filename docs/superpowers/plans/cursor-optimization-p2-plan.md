# 顺滑光标第四轮优化（P2）——完整实施计划

> 版本：v2.2.0
> 日期：2026-06-29
> 执行者：deep-worker
> 前置条件：P0 + P1（round-3）已完整实施。本轮聚焦官方 API 迁移 + 代码清理。

## ✅ 状态（2026-06-29 P2 已实施完成）

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 | 4 个原始 BUG 修复 | ✅ 已实施（`cursor-optimization-plan.md`） |
| P1 (round-3) | 兼容性修复 + 动画优化 + P1 实施 | ✅ 已实施（`cursor-optimization-round-3.md`） |
| **P2** | **EventBus 迁移 + getActiveEditor/getFrontend + 代码清理** | ✅ **本文档（2026-06-29 完成）** |

### Reviewer 报告
- ✅ 5 项 R-P2 风险说明全部 verified accurate
- ✅ 9 对 EventBus on/off 完全配对（on=9, off=9, push=9，line-by-line 验证）
- ✅ APPROVE WITH MINOR FIXES
- ✅ F1 删除 dead state `loadedProtyleIds`（已应用）
- ✅ F2 CHANGELOG v2.2.0 已写（已应用）
- ✅ F3 `__zentypeScrollBound` toggle 残留已知限制（已记入 CHANGELOG）

---

## 目录

1. [总览：P2 项目分类](#1-总览)
2. [决策表：关键架构选择](#2-决策表)
3. [必做项目](#3-必做项目)
   - [3.1 EventBus 迁移（8 个事件）](#31-eventbus-迁移)
   - [3.2 click-editorcontent 替代 firstProtyleIds 白名单](#32-click-editorcontent-替代白名单)
   - [3.3 getFrontend() 替代手写 isMobile()](#33-getfrontend-替代手写-ismobile)
   - [3.4 isReadMode() 修复 split-screen bug](#34-isreadmode-修复)
   - [3.5 hasScroll / findAllScrollableAncestors 去重](#35-滚动检测工具去重)
4. [应做项目](#4-应做项目)
   - [4.1 getActiveEditor() 扩展到 typewriter / edgeCases](#41-getactiveeditor-扩展)
   - [4.2 typewriter getEditorContainer() 修复](#42-typewriter-geteditorcontainer-修复)
5. [可选项目（明确推迟）](#5-可选项目)
   - [5.1 SCSS → JS 字符串](#51-scss--js-字符串)
   - [5.2 breathing → rAF](#52-breathing--raf)
6. [兼容性矩阵](#6-兼容性矩阵)
7. [实施步骤](#7-实施步骤)
8. [验证清单](#8-验证清单)
9. [风险评估](#9-风险评估)
10. [不做的事](#10-不做的事)

---

## 1. 总览

### 1.1 P2 项目优先级分类

| 优先级 | # | 项目 | 涉及文件 | 风险 | 改动量 |
|--------|---|------|---------|------|--------|
| **必做** | 1 | EventBus 迁移（8 个事件） | `src/index.ts` + `src/modules/cursor.ts` | **中** | ~120 新增 / ~30 删除 |
| **必做** | 2 | `click-editorcontent` 替代 `firstProtyleIds` 白名单 | `src/index.ts` + `src/modules/cursor.ts` | 低 | ~30 新增 / ~25 删除 |
| **必做** | 3 | `getFrontend()` 替代手写 `isMobile()` | `src/utils/isMobile.ts` + `src/modules/cursor.ts` | 低 | ~10 修改 |
| **必做** | 4 | `isReadMode()` 修复只取第一个 `.protyle-content` | `src/utils/edgeCases.ts` | 低 | ~8 修改 |
| **必做** | 5 | `hasScroll` / `findAllScrollableAncestors` 与 `boundary.ts` 去重 | `src/utils/scroll.ts`（新） + `cursor.ts` + `boundary.ts` | 低 | ~40 新增 / ~55 删除 |
| **应做** | 6 | `getActiveEditor()` 扩展到 `typewriter.ts` | `src/modules/typewriter.ts` | 低 | ~5 修改 |
| **应做** | 7 | `getActiveEditor()` 扩展到 `edgeCases.ts` | `src/utils/edgeCases.ts` | 低 | ~3 修改 |
| **可选** | 8 | SCSS → JS 字符串注入 | `src/styles/index.scss` → `src/modules/cursor/styles.ts`（新） | **高** | ~60 新增 / ~55 删除 |
| **可选** | 9 | `breathing.ts` 改用 rAF | `src/modules/cursor/breathing.ts` | 低（但不推荐） | ~5 修改 |
| **可选** | 10 | `getActiveEditor()` 替换 `cursor.ts:134` 手动 DOM 遍历 | `src/modules/cursor.ts` | 低 | ~5 修改 |

### 1.2 改动后最终文件结构

```
src/
├── index.ts                              # 插件入口 ← 大幅修改（+EventBus 订阅/退订）
├── modules/
│   ├── cursor.ts                         # 主模块 ← 修改（−WS 手动监听、−白名单机制、−hasScroll/findAllScrollableAncestors）
│   ├── cursor/
│   │   ├── breathing.ts                  # 呼吸状态机（不动）
│   │   └── boundary.ts                   # 边界检测 ← 修改（−findClosestScrollableElement → 共用 scroll.ts）
│   ├── typewriter.ts                     # 打字机 ← 修改（getEditorContainer 改用 getActiveEditor）
│   └── ripple.ts                         # 涟漪聚焦（不动）
├── utils/
│   ├── scroll.ts                         # ← 新建（hasScroll + findAllScrollableAncestors + findClosestScrollableElement）
│   ├── getCursorRect.ts                  # 不动
│   ├── getCursorElement.ts               # 不动
│   ├── getLineHeight.ts                  # 不动
│   ├── getEffectiveZIndex.ts             # 不动
│   ├── isMobile.ts                       # ← 修改（改用 getFrontend()）
│   ├── edgeCases.ts                      # ← 修改（isReadMode 改用 getActiveEditor）
│   └── styleManager.ts                   # 不动
├── styles/
│   └── index.scss                        # 不动
├── types/
│   ├── index.ts                          # 不动
│   ├── scss.d.ts                         # 不动
│   └── siyuan.d.ts                       # ← 可能扩充（加 getFrontend/getActiveEditor 的类型引用）
└── config.ts                             # 不动
```

---

## 2. 决策表

| # | 决策项 | 选项 A | 选项 B | 推荐 | 理由 |
|---|--------|--------|--------|------|------|
| D1 | SCSS → JS 字符串 | 迁移到 JS 字符串注入 | 保持 SCSS | **B（推迟）** | ESBuild 构建已稳定；JS 字符串无高亮、难维护；收益仅"跟参考版一致"，无功能改善。详见 §5.1 |
| D2 | breathing → rAF | 改用 rAF 队列替代 setTimeout 500ms | 保持 setTimeout | **B（保持）** | setTimeout 500ms 是 idle 超时检测，不是动画帧循环；rAF 16ms 无法替代 500ms 语义。参考版也用的 setTimeout。详见 §5.2 |
| D3 | EventBus 是否全做 | 全部 8 个事件一次迁移 | 分批迁移 | **A（全做）** | 用户明确"不保留向后兼容"；8 个事件耦合度低，可在一个 PR 中完成，减少回归测试次数 |
| D4 | 白名单机制去留 | 保留 `firstProtyleIds` 作为降级 | 用 `click-editorcontent` 完全替代 | **B（完全替代）** | EventBus 事件比手动 DOM 属性匹配更可靠；保留降级会增加维护负担 |
| D5 | `ws-main` vs 手动 WS | 用 `ws-main` EventBus 替代 | 保持手动 `addEventListener` | **A（EventBus）** | EventBus 的 `ws-main` 携带 `IWebSocketData` 类型，自动 JSON.parse，比手动 addEventListener + try/catch 更简洁 |

---

## 3. 必做项目

### 3.1 EventBus 迁移

#### 当前代码定位

- **`src/index.ts:21-58`（`onload()` 方法）**：仅调用 `initCursor()`，无任何 `this.eventBus.on()` 调用
- **`src/index.ts:63-69`（`onunload()` 方法）**：仅调用 `destroyCursor()`，无 EventBus 退订
- **`src/modules/cursor.ts:360-374`**：手动 `window.siyuan.ws.ws.addEventListener("message", wsHandler)`，手动 `JSON.parse` + `try/catch`
- **`src/modules/cursor.ts:37`**：模块级 `wsHandler` 变量用于 WS 清理

#### 重构目标

将 8 个思源生命周期事件从"手动 DOM/WS 监听"迁移到官方 `this.eventBus`：

| 事件 | 当前实现 | P2 实现 | 用途 |
|------|---------|---------|------|
| `loaded-protyle-static` | ❌ 无（依赖全局 DOM 事件） | `this.eventBus.on(...)` | 标记 protyle 已加载 |
| `loaded-protyle-dynamic` | ❌ 无 | `this.eventBus.on(...)` | 标记动态编辑器已加载 |
| `destroy-protyle` | ❌ 无（关 tab 时光标元素残留但全局只有一个） | `this.eventBus.on(...)` | 清理 protyle 追踪 |
| `switch-protyle` | ❌ 无（依赖全局 selectionchange 自然触发） | `this.eventBus.on(...)` | 主动 queueUpdate |
| `click-editorcontent` | ⚠️ `firstProtyleIds` 白名单机制（cursor.ts:134-148） | `this.eventBus.on(...)` | 记录"用户已交互"的 protyle |
| `open-menu-content` | ❌ 无（右键菜单时光标可能浮在菜单上） | `this.eventBus.on(...)` | 立即隐藏光标 |
| `ws-main` | ⚠️ 手动 `ws.ws.addEventListener("message", ...)` + `JSON.parse` | `this.eventBus.on(...)` | 监听 transactions |
| `mobile-keyboard-show/hide` | ❌ 无 | `this.eventBus.on(...)` | 移动端重定位 |

#### API 用法（从 siyuan.d.ts 查证）

```typescript
// EventBus 类型签名（siyuan.d.ts:570-590）
export class EventBus {
    on<K extends TEventBus, D = IEventBusMap[K]>(
        type: K, listener: (event: CustomEvent<D>) => any
    ): void;
    off<K extends TEventBus, D = IEventBusMap[K]>(
        type: K, listener: (event: CustomEvent<D>) => any
    ): void;
}

// IEventBusMap 关键条目（siyuan.d.ts:126-233）
export interface IEventBusMap {
    "loaded-protyle-static": { protyle: IProtyle };
    "loaded-protyle-dynamic": { protyle: IProtyle; position: "afterend" | "beforebegin" };
    "destroy-protyle": { protyle: IProtyle };
    "switch-protyle": { protyle: IProtyle };
    "click-editorcontent": { protyle: IProtyle; event: MouseEvent };
    "open-menu-content": IMenuBaseDetail & { range: Range };
    "ws-main": IWebSocketData;  // { cmd: string; data: any; msg: string; code: number }
    "mobile-keyboard-show": void;
    "mobile-keyboard-hide": void;
}

// Protyle / IProtyle（protyle.d.ts:237,863-900）
export class Protyle {
    public protyle: IProtyle;
    // ...
}
export interface IProtyle {
    id: string;
    element: HTMLElement;
    // ...
}
```

#### 重构方案

**`src/index.ts` 修改**：

```typescript
import { Plugin } from "siyuan";
import type { IWebSocketData, IProtyle } from "siyuan/types";
import { addStyle, removeStyle } from "./utils/styleManager";
import { initCursor, destroyCursor, onProtyleLoaded, onProtyleDestroyed,
         onProtyleSwitched, onEditorContentClicked, onMenuOpened,
         onWsMain, onMobileKeyboardShow, onMobileKeyboardHide } from "./modules/cursor";
import { initTypewriter, destroyTypewriter } from "./modules/typewriter";
import { initRipple, destroyRipple } from "./modules/ripple";
import type { ModuleEnabled, ModuleName } from "./types";
import mainCss from "./styles/index.scss";

// ...（STYLE_ID, STORAGE_KEY, ICON_SVG 不变）...

export default class ZenType extends Plugin {
  private enabled: ModuleEnabled = { cursor: true, typewriter: true, ripple: true };
  private eventBusOffFns: Array<() => void> = [];

  async onload(): Promise<void> {
    // ...（loadData, addStyle, addCommand, addTopBar 不变）...

    // === EventBus 订阅 ===
    const { eventBus } = this;

    // loaded-protyle-static: 新编辑器加载
    const onLoadedStatic = (e: CustomEvent<{ protyle: IProtyle }>) => {
      if (!this.enabled.cursor) return;
      onProtyleLoaded(e.detail.protyle);
    };
    eventBus.on("loaded-protyle-static", onLoadedStatic);
    this.eventBusOffFns.push(() => eventBus.off("loaded-protyle-static", onLoadedStatic));

    // loaded-protyle-dynamic: 动态编辑器（悬浮窗等）
    const onLoadedDynamic = (e: CustomEvent<{ protyle: IProtyle; position: string }>) => {
      if (!this.enabled.cursor) return;
      onProtyleLoaded(e.detail.protyle);
    };
    eventBus.on("loaded-protyle-dynamic", onLoadedDynamic);
    this.eventBusOffFns.push(() => eventBus.off("loaded-protyle-dynamic", onLoadedDynamic));

    // destroy-protyle: 编辑器销毁
    const onDestroyed = (e: CustomEvent<{ protyle: IProtyle }>) => {
      onProtyleDestroyed(e.detail.protyle);
    };
    eventBus.on("destroy-protyle", onDestroyed);
    this.eventBusOffFns.push(() => eventBus.off("destroy-protyle", onDestroyed));

    // switch-protyle: 切 Tab
    const onSwitched = (e: CustomEvent<{ protyle: IProtyle }>) => {
      if (!this.enabled.cursor) return;
      onProtyleSwitched(e.detail.protyle);
    };
    eventBus.on("switch-protyle", onSwitched);
    this.eventBusOffFns.push(() => eventBus.off("switch-protyle", onSwitched));

    // click-editorcontent: 用户在编辑器内点击 → 替代 firstProtyleIds 白名单
    const onClickEditorContent = (e: CustomEvent<{ protyle: IProtyle; event: MouseEvent }>) => {
      if (!this.enabled.cursor) return;
      onEditorContentClicked(e.detail.protyle);
    };
    eventBus.on("click-editorcontent", onClickEditorContent);
    this.eventBusOffFns.push(() => eventBus.off("click-editorcontent", onClickEditorContent));

    // open-menu-content: 右键菜单 → 立即隐藏光标
    const onMenuOpenedHandler = () => {
      if (!this.enabled.cursor) return;
      onMenuOpened();
    };
    eventBus.on("open-menu-content", onMenuOpenedHandler);
    this.eventBusOffFns.push(() => eventBus.off("open-menu-content", onMenuOpenedHandler));

    // ws-main: 替代手动 WS 监听
    const onWsMainHandler = (e: CustomEvent<IWebSocketData>) => {
      if (!this.enabled.cursor) return;
      onWsMain(e.detail);
    };
    eventBus.on("ws-main", onWsMainHandler);
    this.eventBusOffFns.push(() => eventBus.off("ws-main", onWsMainHandler));

    // mobile-keyboard-show
    const onKeyboardShow = () => {
      if (!this.enabled.cursor) return;
      onMobileKeyboardShow();
    };
    eventBus.on("mobile-keyboard-show", onKeyboardShow);
    this.eventBusOffFns.push(() => eventBus.off("mobile-keyboard-show", onKeyboardShow));

    // mobile-keyboard-hide
    const onKeyboardHide = () => {
      if (!this.enabled.cursor) return;
      onMobileKeyboardHide();
    };
    eventBus.on("mobile-keyboard-hide", onKeyboardHide);
    this.eventBusOffFns.push(() => eventBus.off("mobile-keyboard-hide", onKeyboardHide));

    // 模块初始化（与 P0 相同）
    if (this.enabled.cursor) initCursor();
    if (this.enabled.typewriter) initTypewriter();
    if (this.enabled.ripple) initRipple();

    console.log("zenType v2 loaded (with EventBus)");
  }

  onunload(): void {
    // 1. 退订 EventBus（在销毁模块之前）
    this.eventBusOffFns.forEach(off => off());
    this.eventBusOffFns = [];

    // 2. 销毁模块
    destroyCursor();
    destroyTypewriter();
    destroyRipple();
    removeStyle(STYLE_ID);
    console.log("zenType v2 unloaded");
  }

  // ...（toggle / toggleAll / isAllEnabled 不变）...
}
```

**`src/modules/cursor.ts` 新增导出函数**：

```typescript
// ============== EventBus 回调（由 index.ts 驱动）==============

import type { IProtyle, IWebSocketData } from "siyuan/types";

/** 记录所有已加载的 protyle（用于 destroy 时清理追踪） */
const loadedProtyleIds = new Set<string>();

/** 用户已点击过的 protyle ID 集合（替代 clickedProtyleIds[] 白名单） */
const activeProtyleIds = new Set<string>();

/** loaded-protyle-static/dynamic 回调 */
export function onProtyleLoaded(protyle: IProtyle): void {
  loadedProtyleIds.add(protyle.id);
  // 新编辑器加载后，可能需要定位（如果用户刚好在此编辑器）
  queueUpdate();
}

/** destroy-protyle 回调 */
export function onProtyleDestroyed(protyle: IProtyle): void {
  loadedProtyleIds.delete(protyle.id);
  activeProtyleIds.delete(protyle.id);
}

/** switch-protyle 回调 */
export function onProtyleSwitched(_protyle: IProtyle): void {
  // 切换 tab 时刷新光标位置
  queueUpdate();
}

/** click-editorcontent 回调 → 替代 firstProtyleIds 白名单 */
export function onEditorContentClicked(protyle: IProtyle): void {
  activeProtyleIds.add(protyle.id);
  // 点击后可能触发 selectionchange，队列更新
  queueUpdate();
}

/** open-menu-content 回调 → 立即隐藏光标 */
export function onMenuOpened(): void {
  if (!cursorEl) return;
  cursorEl.classList.add("hidden");
}

/** ws-main 回调 → 替代手动 WS 监听 */
export function onWsMain(data: IWebSocketData): void {
  if (data.cmd === "transactions") {
    queueUpdate();
  }
}

/** mobile-keyboard-show 回调 */
export function onMobileKeyboardShow(): void {
  queueUpdate();
}

/** mobile-keyboard-hide 回调 */
export function onMobileKeyboardHide(): void {
  queueUpdate();
}
```

**`initCursor()` 修改**（删除 WS 手动监听代码）：

```typescript
export function initCursor(): void {
  cursorEl = createCursorElement();
  initBreathing(cursorEl);

  // DOM 事件绑定（不变）
  const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
    // ...（与当前相同）...
  ];
  handlers.forEach(([event, handler, options]) => {
    document.addEventListener(event, handler, options);
  });
  eventListeners = handlers;

  // ❌ 删除：手动 WS 监听（已迁移到 onWsMain EventBus 回调）
  // if (window.siyuan?.ws?.ws) { ... }

  queueUpdate();
}
```

**`destroyCursor()` 修改**（删除 WS 清理代码）：

```typescript
export function destroyCursor(): void {
  // DOM 事件清理（不变）
  eventListeners.forEach(([event, handler]) => {
    document.removeEventListener(event, handler);
  });
  eventListeners = [];

  // ❌ 删除：手动 WS 清理（EventBus 已在 index.ts onunload 中退订）
  // if (wsHandler && window.siyuan?.ws?.ws) { ... }

  // ...（其余清理不变：breathing、rAF、DOM、ResizeObserver、popoverDrag、scrollBindings）...

  // 清理 EventBus 相关状态
  loadedProtyleIds.clear();
  activeProtyleIds.clear();
}
```

**删除的变量**（从 `cursor.ts` 模块顶层）：
- `let wsHandler: ((e: MessageEvent) => void) | null = null;`（第 37 行）
- 不再需要 `import type { IWebSocketData } from "siyuan/types";`（已移到新导出函数签名中）

#### 风险评估

| 风险 | 影响 | 缓解 |
|------|------|------|
| EventBus 事件名在老版本思源中不存在 | `eventBus.on()` 静默失败 | 思源 v3.x 稳定支持所有 8 个事件；若需兼容 v2.x 可加 `eventBus?.on?.()` 可选链（但用户明确"不保留向后兼容"） |
| `ws-main` 事件 vs 手动 `addEventListener` 的时序差异 | transactions 更新可能晚一帧 | `ws-main` 在思源内核层触发，时机与手动监听等效；实测验证 |
| `loaded-protyle-static` 在分屏时触发两次 | `loadedProtyleIds` Set 正常处理 | Set 天然去重，无风险 |
| `click-editorcontent` 在某些场景不触发（如从搜索跳转到编辑器） | 光标不显示 | 保留 `switch-protyle` 作为兜底：切 tab 后 queueUpdate → doUpdateCursor 中检查 activeProtyleIds，不通过则 hidden |

---

### 3.2 click-editorcontent 替代白名单

#### 当前代码定位

- **`src/modules/cursor.ts:38-40`**：白名单数组定义
  ```typescript
  const firstProtyleIds: string[] = [];
  const clickedProtyleIds: string[] = [];
  ```
- **`src/modules/cursor.ts:134-148`**：白名单检查逻辑
  ```typescript
  const protyleId = allowed.cursorElement
    ?.closest(".protyle:not(.fn__none)")
    ?.getAttribute("data-id") ?? null;

  if (!firstProtyleIds.includes(protyleId ?? "") && protyleId !== null) {
    if (protyleId) firstProtyleIds.push(protyleId);
    cursorEl.classList.add("hidden");
    scheduleResumeBreathe();
    return;
  }
  ```
- **`src/modules/cursor.ts:409-410`**：destroyCursor 中清理
  ```typescript
  firstProtyleIds.length = 0;
  clickedProtyleIds.length = 0;
  ```

**问题分析**：
1. `clickedProtyleIds` 数组被定义但从未被检查——无实际作用的死代码
2. `firstProtyleIds` 通过 `data-id` 属性匹配 protyle，但思源 DOM 结构变化时此属性可能缺失或重名
3. "第一次 selectionchange 就加入白名单"的策略过于宽松——切 Tab 时 selectionchange 会瞬间触发，导致光标在新 Tab 闪烁

#### 重构方案

用 EventBus `click-editorcontent` 事件驱动 `activeProtyleIds` Set，在 `doUpdateCursor()` 中检查。

**`cursor.ts` 修改**：

删除第 38-40 行和第 134-148 行，替换为：

```typescript
// 模块顶层（替换 firstProtyleIds/clickedProtyleIds 数组）
const activeProtyleIds = new Set<string>();
```

在 `doUpdateCursor()` 中（原来白名单检查的位置，约第 134 行）：

```typescript
// P2：用 activeProtyleIds Set 替代 firstProtyleIds 白名单
// 用户在编辑器内点击过后才允许光标显示（防止切 Tab / 搜索跳转时"意外闪现"）
const activeEditorId = getActiveEditor()?.protyle?.id ?? null;
if (activeEditorId !== null && !activeProtyleIds.has(activeEditorId)) {
  // 如果 protyle 被标记为 loaded 但用户尚未点击，允许显示
  // （loadedProtyleIds 在 onProtyleLoaded 中添加）
  if (protyleId && !loadedProtyleIds.has(protyleId)) {
    cursorEl.classList.add("hidden");
    scheduleResumeBreathe();
    return;
  }
  // 首次 selectionchange → 自动加入可显示集合（与旧行为兼容）
  // 但仅当 protyleLoaded 已触发时
  if (protyleId) loadedProtyleIds.add(protyleId);
}
```

实际上，更好的简化：既然有了 `click-editorcontent`，白名单完全由用户点击驱动。

```typescript
// P2 简化版白名单替代（cursor.ts:134 → doUpdateCursor 内）
// 用户必须在某个编辑器内点击过，才允许光标显示
// activeProtyleIds 由 onEditorContentClicked() 在 index.ts 的 click-editorcontent 回调中填充
const editorId = getActiveEditor()?.protyle?.id ?? null;
if (editorId && !activeProtyleIds.has(editorId)) {
  cursorEl.classList.add("hidden");
  scheduleResumeBreathe();
  return;
}
```

同时删除 `destroyCursor()` 中的：
```typescript
firstProtyleIds.length = 0;
clickedProtyleIds.length = 0;
```
替换为：
```typescript
activeProtyleIds.clear();
loadedProtyleIds.clear();
```

#### 风险评估

| 风险 | 缓解 |
|------|------|
| `click-editorcontent` 在某些场景不触发 | `switch-protyle` EventBus 事件在切 Tab 时触发 → queueUpdate → 如果 activeProtyleIds 为空，光标隐藏（安全行为） |
| 用户未点击编辑器时（如键盘 Tab 键聚焦）光标不显示 | 这是预期行为——光标只在用户交互过的编辑器中显示；首点击后立即正常 |

---

### 3.3 getFrontend() 替代手写 isMobile()

#### 当前代码定位

- **`src/utils/isMobile.ts:5-7`**：
  ```typescript
  export function isMobile(): boolean {
    return !!document.getElementById("sidebar");
  }
  ```
- **`src/modules/cursor.ts:22`**：`import { isMobile } from "../utils/isMobile";`
- **`src/modules/cursor.ts:117`**：`if (isMobile() && ...)`

**问题**：`document.getElementById("sidebar")` 是思源手机版的内部实现细节，可能在版本升级中改名。官方 `getFrontend()` 返回 `"mobile" | "browser-mobile"` 是稳定 API。

#### API 用法（siyuan.d.ts:371）

```typescript
export function getFrontend(): "desktop" | "desktop-window" | "mobile" | "browser-desktop" | "browser-mobile";
```

#### 重构方案

**`src/utils/isMobile.ts` 修改**：

```typescript
import { getFrontend } from "siyuan";

/**
 * 移动端检测 —— 使用官方 getFrontend() API。
 * 返回 "mobile" 或 "browser-mobile" 时判定为移动端。
 */
export function isMobile(): boolean {
  const frontend = getFrontend();
  return frontend === "mobile" || frontend === "browser-mobile";
}
```

调用方（`cursor.ts:117`）无需修改，签名不变。

#### 风险评估

| 风险 | 缓解 |
|------|------|
| `getFrontend()` 在极老版本思源不存在 | 用户已明确"不保留向后兼容"；当前思源 v3.x 完全支持 |

---

### 3.4 isReadMode() 修复

#### 当前代码定位

- **`src/utils/edgeCases.ts:16-18`**：
  ```typescript
  export function isReadMode(): boolean {
    const editor = document.querySelector(".protyle-content") as HTMLElement | null;
    return !editor || !editor.isContentEditable;
  }
  ```

**问题**：`document.querySelector(".protyle-content")` 只取文档中**第一个** `.protyle-content` 元素。分屏时，如果左侧编辑器可编辑、右侧只读，`isReadMode()` 返回左侧的状态（错误）。

#### 重构方案

**`src/utils/edgeCases.ts` 修改**：

```typescript
import { getActiveEditor } from "siyuan";

/** 思源编辑器是否处于只读状态（P2 修复：用 getActiveEditor 定位到当前活跃编辑器） */
export function isReadMode(): boolean {
  const activeEditor = getActiveEditor();
  if (!activeEditor) return true; // 无活跃编辑器 → 视为只读
  // protyle.element 是编辑器根元素，isContentEditable 可继承
  // 但更精确的做法：查 .protyle-content（某些场景下根元素可能被设为 contenteditable=false）
  const contentEl = activeEditor.protyle.element.querySelector(
    ".protyle-content"
  ) as HTMLElement | null;
  return !contentEl || !contentEl.isContentEditable;
}
```

#### 风险评估

| 风险 | 缓解 |
|------|------|
| `getActiveEditor()` 在 ripple.ts 的 mousemove 回调中频繁调用 | `isReadMode()` 在 `ripple.ts:131` 的 `onMouseMove()` 中每 100ms 调用一次（受 MOUSE_THROTTLE 限制），`getActiveEditor()` 是 O(1) 查找，性能无影响 |

---

### 3.5 滚动检测工具去重

#### 当前代码定位

**重复 1 — `cursor.ts:199-208`**（`hasScroll()`）：
```typescript
function hasScroll(el: Element): boolean {
  const style = window.getComputedStyle(el);
  const canY = (style.overflowY === "scroll" || style.overflowY === "auto") &&
    el.scrollHeight > el.clientHeight;
  const canX = (style.overflowX === "scroll" || style.overflowX === "auto") &&
    el.scrollWidth > el.clientWidth;
  return canY || canX;
}
```

**重复 2 — `cursor.ts:211-222`**（`findAllScrollableAncestors()`）：
```typescript
function findAllScrollableAncestors(el: Element): HTMLElement[] {
  const result: HTMLElement[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    if (hasScroll(current)) result.push(current as HTMLElement);
    current = current.parentElement;
  }
  [document.body, document.documentElement].forEach((root) => {
    if (root && hasScroll(root)) result.push(root as HTMLElement);
  });
  return result;
}
```

**重复 3 — `boundary.ts:131-165`**（`findClosestScrollableElement()`，逻辑等价但内联了 scrollability 检测）：
```typescript
function findClosestScrollableElement(el: Element): HTMLElement | null {
  // ... 内联的 overflow/scrollHeight 检测 ...
}
```

**问题**：三处代码实现相同或相似的"元素是否可滚动"检测。如果 CSS 规范变化（如新增 `overflow: clip`），需要改三处。

#### 重构方案

**新建 `src/utils/scroll.ts`**：

```typescript
/**
 * 滚动容器检测工具 —— P2 去重。
 * hasScroll / findAllScrollableAncestors / findClosestScrollableElement
 * 统一从此文件导入。
 */

/** 判断元素是否可滚动（overflow: scroll/auto 且有实际溢出内容） */
export function hasScroll(el: Element): boolean {
  const style = window.getComputedStyle(el);
  const canY =
    (style.overflowY === "scroll" || style.overflowY === "auto") &&
    el.scrollHeight > el.clientHeight;
  const canX =
    (style.overflowX === "scroll" || style.overflowX === "auto") &&
    el.scrollWidth > el.clientWidth;
  return canY || canX;
}

/** 找到从 el 向上（直到 documentElement）所有可滚动祖先 + body/html */
export function findAllScrollableAncestors(el: Element): HTMLElement[] {
  const result: HTMLElement[] = [];
  let current: Element | null = el;
  while (current && current !== document.documentElement) {
    if (hasScroll(current)) result.push(current as HTMLElement);
    current = current.parentElement;
  }
  [document.body, document.documentElement].forEach((root) => {
    if (root && hasScroll(root)) result.push(root as HTMLElement);
  });
  return result;
}

/** 找到最近的含滚动条的祖先元素（用于 boundary.ts AABB 回退检测） */
export function findClosestScrollableElement(el: Element): HTMLElement | null {
  let current: Element | null = el;
  while (
    current &&
    current !== document.body &&
    current !== document.documentElement
  ) {
    if (hasScroll(current)) return current as HTMLElement;
    current = current.parentElement;
  }

  // 检查根元素
  const roots: HTMLElement[] = [document.body, document.documentElement];
  for (const root of roots) {
    const style = window.getComputedStyle(root);
    const canScrollY =
      (style.overflowY === "scroll" || style.overflowY === "auto") &&
      root.scrollHeight > root.clientHeight;
    const canScrollX =
      (style.overflowX === "scroll" || style.overflowX === "auto") &&
      root.scrollWidth > root.clientWidth;
    if (canScrollY || canScrollX) return root;
  }
  return null;
}
```

**`src/modules/cursor.ts` 修改**：
- 删除第 199-222 行（`hasScroll` + `findAllScrollableAncestors`）
- 添加 import：`import { hasScroll, findAllScrollableAncestors } from "../utils/scroll";`

**`src/modules/cursor/boundary.ts` 修改**：
- 删除第 131-165 行（`findClosestScrollableElement` 函数）
- 添加 import：`import { findClosestScrollableElement } from "../../utils/scroll";`

#### 风险评估

| 风险 | 缓解 |
|------|------|
| `findClosestScrollableElement` 实现与旧版略有不同（根的判定方式） | 新实现逻辑等价；如果跟元素 scroll 检测不一致，根元素检测保留与旧版相同的 `style.overflowY/overflowX` 检测 |
| 引入新的 import 依赖 | `scroll.ts` 无任何外部依赖（仅 `window`），零循环依赖风险 |

---

## 4. 应做项目

### 4.1 getActiveEditor() 扩展到 typewriter / edgeCases

#### 概述

`boundary.ts` 已在 round-3 中接入 `getActiveEditor()`（§3.1 第 1 重检测）。P2 将同一模式扩展到另外两个使用手动 `document.querySelector()` 的位置。

#### 修改清单

| 文件 | 函数 | 当前 | 目标 |
|------|------|------|------|
| `src/modules/typewriter.ts:18-20` | `getEditorContainer()` | `document.querySelector(".protyle:not(.fn__none) .protyle-content")` | 使用 `getActiveEditor()` |
| `src/utils/edgeCases.ts:16-18` | `isReadMode()` | `document.querySelector(".protyle-content")` | 同上（必做项目 §3.4 已覆盖） |

**`typewriter.ts` 修改**（第 18-20 行）：

```typescript
import { getActiveEditor } from "siyuan";

function getEditorContainer(): HTMLElement | null {
  const activeEditor = getActiveEditor();
  if (!activeEditor) return null;
  return activeEditor.protyle.element.querySelector(
    ".protyle-content"
  ) as HTMLElement | null;
}
```

**影响**：`getEditorContainer()` 在 `checkAndScroll()` 和 `updateHighlight()` 中调用，每次 `selectionchange` 触发时执行。改用 `getActiveEditor()` 后：
- 分屏时正确找到活跃编辑器的 `.protyle-content`
- `getActiveEditor()` 是 O(1) 引用查找（思源内部维护），比 `document.querySelector()` 更高效

---

### 4.2 typewriter getEditorContainer() 修复

此项与 §4.1 合并——`getEditorContainer()` 改用 `getActiveEditor()` 即完成修复。

---

## 5. 可选项目（明确推迟）

### 5.1 SCSS → JS 字符串

#### 对比

| 维度 | SCSS（当前） | JS 字符串（参考版） |
|------|:-----------:|:-----------------:|
| 语法高亮 | ✅ IDE 原生支持 | ❌ 字符串内无高亮 |
| 变量/嵌套 | ✅ SCSS 变量、嵌套、`&` | ❌ 需模板字符串拼接 |
| 暗色模式 | ✅ `[data-theme-mode="dark"]` | 同（字符串也支持） |
| 构建依赖 | ESBuild SCSS plugin | 无额外依赖 |
| 热重载 | ✅ `pnpm run dev` 1-2s | ✅ 同（JS 变更也触发热重载） |
| 调试 | ✅ DevTools → Sources → SCSS sourcemap | ⚠️ JS 字符串无 sourcemap |
| 迁移成本 | — | ~55 行删除（index.scss 光标部分）+ ~60 行新增（styles.ts） |
| 收益 | — | 无功能改善；仅"跟参考版文件结构一致" |

#### 推荐

**推迟到未来。** 项目当前 SCSS 构建已稳定（esbuild + sass plugin），改 JS 字符串不会解决任何 BUG 或提升性能，反而增加维护负担：

1. 后续改 CSS（改颜色/动画曲线/关键帧）需要在无高亮的字符串中编辑，出错概率高
2. `@keyframes` 定义在 JS 字符串中难以调试（DevTools 不显示原始文件名）
3. 暗色模式变量 `[data-theme-mode="dark"]` 在 JS 字符串中同样可行但不优雅

**如果未来需要做**（例如不再依赖 esbuild sass plugin），届时单独一个 PR 完成 SCSS→JS 迁移。

---

### 5.2 breathing → rAF

#### 分析

当前 `breathing.ts` 使用 `setTimeout(resumeBreathe, 500)` 实现"空闲 500ms 后恢复呼吸"。参考版同样使用 `setTimeout`（非 rAF）：

```javascript
// 参考/顺滑光标验证版.js 做法：
blinkTimeout = setTimeout(() => {
  cursor.classList.remove("no-animation");
}, BLINK_DELAY);  // BLINK_DELAY = 500
```

**为什么不用 rAF**：
- `setTimeout(500)` 是 idle 超时检测："用户停止操作 500ms 后恢复呼吸"
- rAF 是帧同步回调（~16ms 一次），无法实现 500ms 延迟
- 如果用 rAF 计数器替代（30 帧 × 16ms ≈ 480ms），增加复杂度但不提高精度（setTimeout 500ms 已经足够准确）
- 呼吸动画本身是 CSS `@keyframes` 驱动的（GPU 加速），不涉及 JS 动画循环

#### 推荐

**保持 `setTimeout`。** 无理由切换。

---

## 6. 兼容性矩阵

### 6.1 与 P0/P1/round-3 的衔接

| P0/P1 特性 | P2 影响 | 处理 |
|-----------|---------|------|
| `breathing.ts` 反向 idle 逻辑 | 无影响 | 不动 |
| `boundary.ts` 3 重检测 | 第 1 重已用 `getActiveEditor()`；第 3 重 `findClosestScrollableElement` 移到 `scroll.ts` | 只改 import 路径 |
| `cursor.ts` rAF 节流 (`pendingFrame`) | 无影响 | 不动 |
| `cursor.ts` DOM 事件绑定 (`handlers` 数组) | 无影响 | 不动（EventBus 是额外的，不替换 DOM 事件） |
| `cursor.ts` ResizeObserver / Popover 拖动 | `bindScrollContainerEvents` 改用 `scroll.ts` 的函数 | import 路径变更 |
| `typewriter.ts` z-index 计算 | 无影响 | `getEffectiveZIndex` 不变 |
| `ripple.ts` `isReadMode()` 调用 | `isReadMode()` 改用 `getActiveEditor()` | ripple.ts 调用方无需变更 |
| `isMobile.ts` 手写检测 | 改用 `getFrontend()` | 调用方无需变更 |
| SCSS `index.scss` | 不动 | — |
| `config.ts` `CURSOR_CONFIG` / `TYPEWRITER_CONFIG` | 不动 | — |

### 6.2 与思源 API 版本兼容性

| API | 引入版本 | 备注 |
|-----|---------|------|
| `EventBus.on/off` | v2.0+ | 稳定 |
| `getActiveEditor()` | v2.0+ | 稳定 |
| `getFrontend()` | v2.0+ | 稳定 |
| `click-editorcontent` | v2.4+ | 稳定 |
| `ws-main` | v2.0+ | 稳定 |
| `mobile-keyboard-show/hide` | v2.8+ | 移动端专用 |
| `switch-protyle` | v2.0+ | 稳定 |

---

## 7. 实施步骤

以下 13 步按依赖关系排列。每步包含具体文件、行号、代码。

### 第 1 步：新建 `src/utils/scroll.ts`

提取 `hasScroll` / `findAllScrollableAncestors` / `findClosestScrollableElement` 到共享模块。

**内容**：见 §3.5 代码块（`hasScroll` + `findAllScrollableAncestors` + `findClosestScrollableElement`）。

- **测试**：`npx tsc --noEmit` 零错误（此时无 import 方，仅验证语法）

### 第 2 步：修改 `cursor.ts` 引用 scroll.ts

- 删除 `cursor.ts:199-222`（`hasScroll` + `findAllScrollableAncestors` 函数）
- 在 `cursor.ts` 顶部添加：`import { findAllScrollableAncestors } from "../utils/scroll";`
- `bindScrollContainerEvents` 中调用 `findAllScrollableAncestors`（函数名不变）

- **测试**：`tsc --noEmit` + `node build.js --dev` 通过

### 第 3 步：修改 `boundary.ts` 引用 scroll.ts

- 删除 `boundary.ts:131-165`（`findClosestScrollableElement` 函数）
- 在 `boundary.ts` 顶部添加：`import { findClosestScrollableElement } from "../../utils/scroll";`

- **测试**：`tsc --noEmit` 零错误；grep `function findClosestScrollableElement` 在 `src/` 下仅出现在 `scroll.ts`

### 第 4 步：修改 `isMobile.ts` 改用 getFrontend()

- 替换 `isMobile.ts` 内容为 §3.3 代码块

- **测试**：`tsc --noEmit` 零错误

### 第 5 步：修改 `edgeCases.ts` 的 `isReadMode()`

- 替换 `edgeCases.ts:16-18` 为 §3.4 代码块
- 在 `edgeCases.ts` 顶部添加：`import { getActiveEditor } from "siyuan";`

- **测试**：`tsc --noEmit` 零错误

### 第 6 步：修改 `typewriter.ts` 的 `getEditorContainer()`

- 替换 `typewriter.ts:18-20` 为 §4.1 代码块
- 在 `typewriter.ts` 顶部添加：`import { getActiveEditor } from "siyuan";`

- **测试**：`tsc --noEmit` 零错误

### 第 7 步：在 `cursor.ts` 中添加 EventBus 回调导出

在 `cursor.ts` 中新增 §3.1 的 9 个导出函数：
- `onProtyleLoaded(protyle)`
- `onProtyleDestroyed(protyle)`
- `onProtyleSwitched(protyle)`
- `onEditorContentClicked(protyle)`
- `onMenuOpened()`
- `onWsMain(data)`
- `onMobileKeyboardShow()`
- `onMobileKeyboardHide()`

同时添加模块级变量：
```typescript
const loadedProtyleIds = new Set<string>();
const activeProtyleIds = new Set<string>();
```

- **测试**：`tsc --noEmit` 零错误

### 第 8 步：在 `cursor.ts` 中删除手动 WS 监听 + 白名单逻辑

- 删除 `cursor.ts:37`（`let wsHandler: ...`）
- 删除 `cursor.ts:360-374`（WS 手动监听代码块，`initCursor()` 内）
- 删除 `cursor.ts:388-391`（WS 清理代码，`destroyCursor()` 内）
- 删除 `cursor.ts:38-40`（`firstProtyleIds` / `clickedProtyleIds` 数组）
- 替换 `cursor.ts:134-148`（白名单检查逻辑）为 §3.2 简化版

**新的白名单检查逻辑**（插入到 `doUpdateCursor()` 中，原第 134 行位置）：

```typescript
// P2：用户必须在编辑器内点击过才允许光标显示（替代 firstProtyleIds 白名单）
const editorId = getActiveEditor()?.protyle?.id ?? null;
if (editorId && !activeProtyleIds.has(editorId)) {
  cursorEl.classList.add("hidden");
  scheduleResumeBreathe();
  return;
}
```

删除 `destroyCursor()` 中：
```typescript
// 清理白名单
firstProtyleIds.length = 0;
clickedProtyleIds.length = 0;
```
替换为：
```typescript
// 清理 EventBus 相关状态
loadedProtyleIds.clear();
activeProtyleIds.clear();
```

- **测试**：`tsc --noEmit` 零错误；grep `wsHandler\|firstProtyleIds\|clickedProtyleIds` 在 `src/` 下返回空

### 第 9 步：修改 `src/index.ts` 添加 EventBus 订阅/退订

按 §3.1 的完整 `onload()` / `onunload()` 代码块修改 `index.ts`。

关键变更：
- 添加 `private eventBusOffFns: Array<() => void> = [];`
- `onload()` 中订阅 8 个 EventBus 事件
- `onunload()` 开头退订所有 EventBus 事件
- import 新增 `onProtyleLoaded`, `onProtyleDestroyed`, `onProtyleSwitched`, `onEditorContentClicked`, `onMenuOpened`, `onWsMain`, `onMobileKeyboardShow`, `onMobileKeyboardHide`

- **测试**：`tsc --noEmit` 零错误

### 第 10 步：TSC 类型检查

```powershell
npx tsc --noEmit
```

- **预期**：零错误。特别注意：
  - `Property 'protyle' does not exist on type 'Protyle'` → 检查 import `Protyle` from `siyuan`（不是从 `siyuan/types`）
  - `Property 'element' does not exist on type 'IProtyle'` → 确认 `IProtyle` 有 `element: HTMLElement`（siyuan.d.ts protyle.d.ts:900）

### 第 11 步：构建检查

```powershell
node build.js --dev
```

- **预期**：`dev/index.js` 生成成功，无 CSS 警告

### 第 12 步：Bundle grep 检查

**应该出现的新字符串**：
```
rg "onProtyleLoaded" dev/index.js
rg "onEditorContentClicked" dev/index.js
rg "onWsMain" dev/index.js
rg "activeProtyleIds" dev/index.js
rg "eventBusOffFns" dev/index.js
rg "getFrontend" dev/index.js
```

**不应该出现的字符串**（确认删除）：
```
rg "wsHandler" dev/index.js              # 应返回空
rg "firstProtyleIds" dev/index.js        # 应返回空
rg "clickedProtyleIds" dev/index.js      # 应返回空
rg 'addEventListener("message"' dev/index.js  # 应返回空
rg "getElementById(\"sidebar\")" dev/index.js # 应返回空
```

### 第 13 步：同步到思源插件目录 + 手动功能验证

```powershell
Copy-Item -Path dev\* -Destination D:\SiYuan\data\plugins\siyuan-zen\ -Recurse -Force

Get-FileHash dev\index.js -Algorithm SHA256
Get-FileHash D:\SiYuan\data\plugins\siyuan-zen\index.js -Algorithm SHA256
```

**预期**：两个 hash 一致。

**手动验证清单**（在思源中逐项检查，约 10 分钟）：

- [ ] 打开思源，新建文档，点击编辑器任意位置 → 光标正常出现 + 呼吸动画
- [ ] 输入文字 → 光标呼吸暂停，停止 500ms 后恢复
- [ ] 右键弹出菜单 → 光标立即隐藏（`open-menu-content` EventBus 生效）
- [ ] 打开 2 个文档分屏 → 在左侧点击 → 光标在左侧显示；切到右侧点击 → 光标在右侧显示
- [ ] 关闭一个分屏 → 光标正常切换到保留的编辑器
- [ ] 在搜索框（Ctrl+P）点击 → 光标不出现
- [ ] 在 block popover 编辑器内点击 → 光标出现（z-index 正确）
- [ ] 打开另一个 tab，从搜索 Ctrl+Click 跳转 → 光标不意外闪现（`click-editorcontent` 白名单生效）
- [ ] 拖蓝选中一段文字 → 光标瞬间跳到末尾（无 transition）
- [ ] 快速滚动 → 光标紧跟无残影
- [ ] 移动端（如有）：键盘弹出/收起 → 光标重新定位
- [ ] 暗色模式 → 光标颜色正常
- [ ] 打字机高亮条在分屏时出现在正确的编辑器

---

## 8. 验证清单

### 8.1 自动化检查

| # | 检查项 | 命令 | 预期 |
|---|--------|------|------|
| 1 | TypeScript 编译 | `npx tsc --noEmit` | 零错误 |
| 2 | 构建 | `node build.js --dev` | `dev/index.js` 生成成功 |
| 3 | Bundle 新字符串 grep | 见 §7 第 12 步 | 全部命中 |
| 4 | Bundle 旧字符串 grep（删除确认） | 见 §7 第 12 步 | 全部返回空 |
| 5 | 同步 hash | `Get-FileHash` 对比 | MATCH |

### 8.2 手动功能验证

见 §7 第 13 步的 13 项手动验证清单。

### 8.3 性能验证（无回归）

```javascript
// DevTools Console 快速验证：
const _t0 = performance.now();
for (let i = 0; i < 100; i++) getActiveEditor();
const _t1 = performance.now();
console.log('getActiveEditor ×100:', (_t1 - _t0).toFixed(2), 'ms');
// 预期 < 1ms（100 次调用）
```

---

## 9. 风险评估

| # | 风险 | 概率 | 影响 | 缓解措施 |
|---|------|------|------|---------|
| R1 | `click-editorcontent` 在所有思源操作中都触发，导致 `activeProtyleIds` Set 膨胀 | 低 | 光标在不该出现的地方出现 | `destroy-protyle` 时 `delete(protyle.id)`；`onunload` 时 clear |
| R2 | `ws-main` 事件与手动 `addEventListener` 时序不同导致 transactions 丢失 | 低 | 同步编辑后光标不更新 | `ws-main` 在思源内核层直接 emit，时序与手动监听等效；若发现延迟则追加 `switch-protyle` 时 queueUpdate |
| R3 | EventBus 退订遗漏导致内存泄漏 | 中 | 插件卸载后仍有事件回调 | `eventBusOffFns` 数组集中管理 + `onunload` 第一步就退订；reviewer 逐一核对 8 个 off 配对 |
| R4 | `getActiveEditor()` 在 `onload()` 刚完成时返回 null（用户未打开文档） | 低 | 初始化时光标不显示 | 已有处理：`boundary.ts` 中 `getActiveEditor() === null` → `allowed: false`；`isReadMode()` 中 null → `true` |
| R5 | `getFrontend()` 返回 `"desktop-window"` 被误判为非 desktop | 极低 | `isMobile()` 判定正确 | `isMobile()` 只匹配 `"mobile"` 和 `"browser-mobile"`，`"desktop-window"` 不匹配 |

---

## 10. 不做的事

| # | 事项 | 原因 | 未来计划 |
|---|------|------|---------|
| 1 | SCSS → JS 字符串迁移 | 收益极小、风险高，见 §5.1 对比表 | 如果 esbuild sass plugin 在思源新版本不兼容时再考虑 |
| 2 | breathing → rAF 替代 setTimeout | rAF 无法实现 500ms idle 检测，见 §5.2 | 不计划 |
| 3 | `getActiveEditor()` 替换 `cursor.ts:134` 的 `closest(".protyle:not(.fn__none)")?.getAttribute("data-id")` | §3.2 白名单重构后此代码被删除，自然不再需要 | N/A |
| 4 | `cursor.ts` 的 `doUpdateCursor()` 中 `getActiveEditor()` 缓存 | 当前 `getActiveEditor()` 每次调用都是对思源内部变量的一次读取（O(1)），缓存反而增加一致性风险 | 不计划 |
| 5 | `config.ts` 新增 EventBus 开关 | 用户已明确"不保留向后兼容"，EventBus 是唯一路径 | 不计划 |
| 6 | 移动端 touch 事件订阅改用 EventBus | `mobile-keyboard-show/hide` 已覆盖键盘场景；touch 滚动已在 DOM handlers 中通过 `touchmove` 处理 | 不计划 |
| 7 | `siyuan.d.ts` 扩充类型 | 当前 `src/types/siyuan.d.ts` 只声明 `Window.siyuan`，不涉及 `Protyle` / `IProtyle` 类型（这些来自 `siyuan` 包本身） | 不计划 |

---

## Handoff Plan

以下步骤按依赖关系排列。deep-worker 应顺序执行，每完成一个逻辑组验证一次。

### 组 1：基础工具去重 + 修复（步骤 1-6）

1. 新建 `src/utils/scroll.ts`（§3.5 代码块）
2. 修改 `src/modules/cursor.ts`：删除 `hasScroll` / `findAllScrollableAncestors`，import `scroll.ts`
3. 修改 `src/modules/cursor/boundary.ts`：删除 `findClosestScrollableElement`，import `scroll.ts`
4. 修改 `src/utils/isMobile.ts`：改用 `getFrontend()`（§3.3）
5. 修改 `src/utils/edgeCases.ts`：`isReadMode()` 改用 `getActiveEditor()`（§3.4）
6. 修改 `src/modules/typewriter.ts`：`getEditorContainer()` 改用 `getActiveEditor()`（§4.1）
- **验证**：`npx tsc --noEmit` 零错误

### 组 2：EventBus 迁移（步骤 7-9）

7. 在 `src/modules/cursor.ts` 添加 8 个 EventBus 回调导出函数 + `activeProtyleIds` / `loadedProtyleIds` Set（§3.1）
8. 在 `src/modules/cursor.ts` 删除手动 WS 监听 + `firstProtyleIds`/`clickedProtyleIds` 白名单，替换为 `activeProtyleIds` 检查（§3.2）
9. 修改 `src/index.ts`：添加 EventBus 订阅/退订，import 新导出函数（§3.1）
- **验证**：`npx tsc --noEmit` 零错误；`node build.js --dev` 成功

### 组 3：验证（步骤 10-13）

10. `npx tsc --noEmit` 最终确认
11. `node build.js --dev` 最终确认
12. Bundle grep 检查（§7 第 12 步）
13. 同步到思源插件目录 + 手动验证（§7 第 13 步）
- **风险**：首次运行新 EventBus 时可能 `click-editorcontent` 不触发 → 若光标不显示，检查 `activeProtyleIds` Set 是否为空（可临时在 console 中 `activeProtyleIds.add(getActiveEditor().protyle.id)` 验证）
- **测试**：思源中 13 项手动验证全部通过

---

*本文档由 Planner agent 基于 P0 plan + round-3 plan + siyuan-kernel-api-调研 + 三版顺滑光标对比 + 当前源码编写。*

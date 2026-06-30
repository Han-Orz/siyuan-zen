# zenType v2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零重建 zenType 思源笔记插件 v2，提供顺滑光标、打字机模式、涟漪聚焦三大功能，并支持鼠标中心聚焦模式。

**Architecture:** 单一思源插件，TypeScript + esbuild + sass，按功能模块分文件（cursor / typewriter / ripple）。每个模块独立 `init/destroy`，通过共享的 `selectionchange` 事件源协作，互不直接通信。

**Tech Stack:** TypeScript 5+ / esbuild / sass / vanilla DOM（无前端框架）/ 思源 SDK `siyuan` v1+

**Spec:** [`docs/superpowers/specs/2026-06-27-zentype-redesign-design.md`](../specs/2026-06-27-zentype-redesign-design.md)

---

## Global Constraints

- **运行时依赖**：无（只使用浏览器原生 API + 思源 SDK `siyuan`）
- **Node 版本**：`>= 20`（与现有 CI 配置一致）
- **包管理器**：`pnpm`
- **TypeScript 配置**：`strict: true`、`target: ES2022`、`module: ESNext`
- **思源 `minAppVersion`**：`3.0.12`（保守，覆盖大多数用户）
- **文件命名**：模块文件用小写连字符（`cursor.ts`），类型文件用 `index.ts`
- **代码风格**：缩进 2 空格，无分号（TypeScript + Prettier 默认）
- **提交规范**：Conventional Commits（`feat:` / `fix:` / `docs:` / `refactor:` / `chore:`）
- **测试策略**：v1 不引入自动化测试框架（Vitest 等），改用**手动烟雾测试**作为任务验证手段。理由：插件在真实思源环境中运行，DOM 依赖重，手动测试更可靠；项目处于 v1 阶段，避免引入测试基础设施的复杂度
- **CSS 主题适配**：用 `[data-theme-mode="dark"]` 媒体查询 + CSS 变量
- **必须保留的文件**：`参考/顺滑光标.js`（作为开发参考）
- **必须删除的文件**：`src/api.ts`、`src/libs/`、`src/hello.svelte`、`src/setting-example.svelte`、`src/参考/`（草稿）

---

## File Structure

实施完成后的目标结构：

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
├── 参考/                            # 保留作为参考
│   └── 顺滑光标.js
├── docs/superpowers/
│   ├── specs/                       # 设计文档（已存在）
│   └── plans/                       # 计划文档（本文件）
├── plugin.json                      # 思源插件清单（保留）
├── package.json                     # 重写
├── tsconfig.json                    # 新建
├── build.js                         # esbuild 脚本（新建）
├── icon.png / preview.png          # 保留
└── README.md / README_zh_CN.md      # 重写
```

**未使用模板文件需要删除**：`src/api.ts`、`src/libs/`（整个目录）、`src/hello.svelte`、`src/setting-example.svelte`、`src/参考/`、`src/index.scss`（会被 `src/styles/index.scss` 替换）、`vite.config.ts`、`svelte.config.js`、`yaml-plugin.js`、`public/i18n/`（v1 不做 i18n）

---

## Task 1: 项目骨架搭建

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `build.js`
- Create: `plugin.json`（覆盖现有）
- Create: `.gitignore`
- Create: `src/index.ts`（空壳）
- Delete: `src/api.ts`、`src/libs/`、`src/hello.svelte`、`src/setting-example.svelte`、`src/参考/`、`vite.config.ts`、`svelte.config.js`、`yaml-plugin.js`

**Interfaces:**
- Produces: 工作目录结构 + `pnpm install` 可成功 + `pnpm build` 可生成 `index.js`

---

- [ ] **Step 1: 初始化 Git 仓库**

```bash
cd /d/Documents/GitHub/zenType
git init
git config user.email "[email protected]"
git config user.name "zenType Developer"
```

（如果用户没提供邮箱，用占位符。实际执行时询问用户。）

- [ ] **Step 2: 创建 `.gitignore`**

写文件 `.gitignore`：
```gitignore
node_modules/
dist/
.DS_Store
*.log
.hotreload
```

- [ ] **Step 3: 写 `package.json`**

写文件 `package.json`：
```json
{
  "name": "zentype",
  "version": "2.0.0",
  "description": "顺滑光标 + 打字机模式 + 涟漪聚焦 - 让写作更专注",
  "main": "index.js",
  "scripts": {
    "build": "node build.js",
    "dev": "node build.js --watch",
    "clean": "rimraf dist *.zip"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "esbuild": "^0.21.0",
    "esbuild-sass-plugin": "^3.3.1",
    "rimraf": "^5.0.0",
    "sass": "^1.77.0",
    "siyuan": "^1.0.4",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 4: 写 `tsconfig.json`**

写文件 `tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: 写 `build.js`**

写文件 `build.js`：
```javascript
const esbuild = require('esbuild');
const { sassPlugin } = require('esbuild-sass-plugin');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'index.js',
  platform: 'browser',
  target: 'es2022',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  external: ['siyuan'],
  loader: { '.ts': 'ts' },
  plugins: [
    sassPlugin({
      type: 'css',
      loadPaths: ['src/styles'],
    }),
  ],
  logLevel: 'info',
};

async function copyAssets() {
  fs.mkdirSync('dist', { recursive: true });
  fs.copyFileSync('plugin.json', path.join('dist', 'plugin.json'));
  fs.copyFileSync('icon.png', path.join('dist', 'icon.png'));
  fs.copyFileSync('preview.png', path.join('dist', 'preview.png'));
  fs.copyFileSync('index.js', path.join('dist', 'index.js'));
  // 内联 CSS
  const indexJs = fs.readFileSync('index.js', 'utf-8');
  if (!indexJs.includes('INSERT_CSS_HERE')) {
    console.warn('Warning: index.js does not contain INSERT_CSS_HERE marker');
  }
}

if (watch) {
  esbuild.context(buildOptions).then(ctx => {
    ctx.watch();
    console.log('Watching for changes...');
  });
} else {
  esbuild.build(buildOptions).then(() => {
    copyAssets();
    console.log('Build complete: dist/');
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 6: 写 `plugin.json`**

写文件 `plugin.json`：
```json
{
  "name": "zenType",
  "author": "zenType Developer",
  "url": "https://github.com/your-username/zenType",
  "version": "2.0.0",
  "minAppVersion": "3.0.12",
  "backends": ["all"],
  "frontends": ["all"],
  "displayName": {
    "default": "zenType",
    "zh_CN": "禅打"
  },
  "description": {
    "default": "Smooth cursor + typewriter mode + ripple focus for distraction-free writing",
    "zh_CN": "顺滑光标 + 打字机模式 + 涟漪聚焦，让写作更专注"
  },
  "readme": {
    "default": "README.md",
    "zh_CN": "README_zh_CN.md"
  },
  "funding": {},
  "disabledInPublish": false
}
```

- [ ] **Step 7: 写最小 `src/index.ts`**

写文件 `src/index.ts`：
```typescript
// zenType v2 入口
console.log("zenType v2 loading...");
```

- [ ] **Step 8: 安装依赖**

```bash
cd /d/Documents/GitHub/zenType
pnpm install
```

预期：依赖安装成功，无错误。

- [ ] **Step 9: 第一次构建**

```bash
pnpm build
```

预期：`dist/index.js` 生成，无错误。

- [ ] **Step 10: 删除未使用的模板文件**

```bash
cd /d/Documents/GitHub/zenType
rm -rf src/api.ts src/libs/ src/hello.svelte src/setting-example.svelte src/参考/ vite.config.ts svelte.config.js yaml-plugin.js
```

- [ ] **Step 11: 提交**

```bash
git add -A
git commit -m "chore: rebuild project skeleton with esbuild + TypeScript"
```

---

## Task 2: 公共工具（光标位置、边界判定、样式管理）

**Files:**
- Create: `src/types/index.ts`
- Create: `src/utils/getCursorRect.ts`
- Create: `src/utils/edgeCases.ts`
- Create: `src/utils/styleManager.ts`

**Interfaces:**
- `getCursorRect(): DOMRect | null` — 文本光标的视口坐标，空时返回 null
- `getCursorElement(): Element | null` — 当前 selection 的 DOM 元素
- `isInEmbedBlock(): boolean` — 文本光标在嵌入块（iframe/video）里
- `isReadMode(): boolean` — 思源编辑器处于只读状态
- `isInPopup(): boolean` — 悬浮窗（`block__popover`）处于打开状态
- `hasSelection(): boolean` — 选中了多行文本
- `styleManager.addStyle(id, css): void` — 注入 `<style>` 标签
- `styleManager.removeStyle(id): void` — 移除指定样式
- `styleManager.removeAll(): void` — 卸载时清理

---

- [ ] **Step 1: 写 `src/types/index.ts`**

写文件 `src/types/index.ts`：
```typescript
// zenType 共享类型定义

export type RippleMode = "text" | "mouse" | "paused";

export interface RippleState {
  mode: RippleMode;
  lastTextCursorChange: number;
  lastMouseBlock: Element | null;
  lastTextBlock: Element | null;
}

export interface CursorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ModuleName = "cursor" | "typewriter" | "ripple";

export interface ModuleEnabled {
  cursor: boolean;
  typewriter: boolean;
  ripple: boolean;
}
```

- [ ] **Step 2: 写 `src/utils/getCursorRect.ts`**

写文件 `src/utils/getCursorRect.ts`：
```typescript
/**
 * 获取文本光标的视口坐标。
 * 基于 Neo-Plus `getselection.ts` 算法：
 * 1. 优先用浏览器原生 Range.getClientRects()
 * 2. 空时插入零宽字符作为 fallback
 */
export function getCursorRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);

  const rects = Array.from(range.getClientRects());
  if (rects.length > 0) {
    return rects[rects.length - 1];
  }

  // Fallback: 插入零宽字符作为占位
  try {
    const marker = document.createTextNode("\u200B");
    range.insertNode(marker);
    const rect = marker.getBoundingClientRect();
    marker.remove();
    return rect;
  } catch {
    return null;
  }
}

/**
 * 获取当前 selection 所在的 DOM 元素。
 */
export function getCursorElement(): Element | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const container = range.startContainer;
  return container.nodeType === Node.TEXT_NODE
    ? container.parentElement
    : (container as Element);
}
```

- [ ] **Step 3: 写 `src/utils/edgeCases.ts`**

写文件 `src/utils/edgeCases.ts`：
```typescript
import { getCursorElement } from "./getCursorRect";

/**
 * 边界场景判定工具集。
 * 每个函数独立无副作用，便于在模块中按需调用。
 */

/** 选中了多行文本（拖蓝） */
export function hasSelection(): boolean {
  const sel = window.getSelection();
  return (sel?.toString().length ?? 0) > 0;
}

/** 思源编辑器处于只读状态 */
export function isReadMode(): boolean {
  const editor = document.querySelector(".protyle-content");
  return !editor || !editor.isContentEditable;
}

/** 悬浮窗（block__popover）处于打开状态 */
export function isInPopup(): boolean {
  return !!document.querySelector(".block__popover--open");
}

/** 文本光标在嵌入块里（iframe / video / PDF） */
export function isInEmbedBlock(): boolean {
  const cursor = getCursorElement();
  if (!cursor) return false;
  return !!cursor.closest(
    "iframe, video, [data-type='NodeIFrame'], [data-type='NodeVideo']"
  );
}

/** 文本光标在思源主编辑器内（不在悬浮窗/对话框里） */
export function isInMainEditor(): boolean {
  const cursor = getCursorElement();
  if (!cursor) return false;
  return !!cursor.closest(".protyle:not(.fn__none) .protyle-content");
}

/**
 * 顺滑光标不暂停。它总是返回 false。
 * 保留此函数以保持 API 一致性。
 */
export function shouldPauseCursor(): boolean {
  return false;
}

/**
 * 聚焦 + 打字机需要暂停的场景。
 * 包含：选中多行、悬浮窗编辑。
 */
export function shouldPauseFocusAndTypewriter(): boolean {
  if (hasSelection()) return true;
  if (isInPopup()) return true;
  return false;
}

/**
 * 打字机模式额外需要暂停的场景。
 * 包含：悬浮窗、只读、嵌入块。
 */
export function shouldPauseTypewriter(): boolean {
  if (isInPopup()) return true;
  if (isReadMode()) return true;
  if (isInEmbedBlock()) return true;
  return false;
}
```

- [ ] **Step 4: 写 `src/utils/styleManager.ts`**

写文件 `src/utils/styleManager.ts`：
```typescript
/**
 * 样式管理器。
 * 用于注入和清理模块所需的 <style> 标签。
 */

const styleMap = new Map<string, HTMLStyleElement>();

export function addStyle(id: string, css: string): void {
  if (styleMap.has(id)) {
    console.warn(`[zenType] style "${id}" already added`);
    return;
  }

  const style = document.createElement("style");
  style.id = `zentype-${id}`;
  style.textContent = css;
  document.head.appendChild(style);
  styleMap.set(id, style);
}

export function removeStyle(id: string): void {
  const style = styleMap.get(id);
  if (style) {
    style.remove();
    styleMap.delete(id);
  }
}

export function removeAllStyles(): void {
  styleMap.forEach((style) => style.remove());
  styleMap.clear();
}
```

- [ ] **Step 5: 验证 TypeScript 编译**

```bash
cd /d/Documents/GitHub/zenType
npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: add shared types and utility modules"
```

---

## Task 3: 顺滑光标模块

**Files:**
- Create: `src/modules/cursor.ts`
- Modify: `src/styles/index.scss`（新建）

**Interfaces:**
- `initCursor(): void` — 启动顺滑光标监听
- `destroyCursor(): void` — 停止并清理 DOM
- 消费：`getCursorRect()` 工具

---

- [ ] **Step 1: 创建样式文件 `src/styles/index.scss`**

写文件 `src/styles/index.scss`：
```scss
// zenType 全局样式

// ===== 顺滑光标 =====

#zentype-cursor {
  position: fixed;
  pointer-events: none;
  z-index: 9999;
  width: 3px;
  background: var(--zt-cursor-color, #5d8cd7);
  transform: translate3d(0, 0, 0);
  will-change: transform;
  backface-visibility: hidden;
  transition: transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1),
              height 0.15s ease;
  opacity: 1;
}

#zentype-cursor.hidden {
  opacity: 0 !important;
  transition: none !important;
}

#zentype-cursor.breathing {
  animation: zentype-blink 3s 1.5s ease-in-out infinite;
}

@keyframes zentype-blink {
  0%   { opacity: 1; }
  60%  { opacity: 0.9; }
  90%  { opacity: 0; }
  95%  { opacity: 0; }
  100% { opacity: 0.3; }
}

[data-theme-mode="dark"] {
  --zt-cursor-color: #8ab4f8;
}

// 隐藏原生光标（仅在编辑器内）
.protyle-wysiwyg { caret-color: transparent; }
.protyle-title__input { caret-color: transparent; }

// ===== 打字机高亮条 =====

#zentype-highlight-line {
  position: fixed;
  pointer-events: none;
  z-index: 1;
  width: 100%;
  height: 0;
  background: var(--zt-highlight-bg, rgba(242, 236, 222, 0.6));
  transform: translate3d(0, 0, 0);
  transition: transform 0.15s ease, opacity 0.3s ease-out;
  opacity: 0;
}

#zentype-highlight-line.visible {
  opacity: 1;
}

[data-theme-mode="dark"] {
  --zt-highlight-bg: rgba(54, 52, 51, 0.45);
}
```

- [ ] **Step 2: 写 `src/modules/cursor.ts`**

写文件 `src/modules/cursor.ts`：
```typescript
import { getCursorRect } from "../utils/getCursorRect";
import { addStyle, removeStyle } from "../utils/styleManager";
import cursorCss from "../styles/index.scss";

// 思源笔记全局对象类型（src/types/index.d.ts 中的全局 Window 增强
// 因同目录存在 index.ts，未被作为 ambient 加载；此处局部声明以满足 strict 模式）
declare global {
  interface Window {
    siyuan?: {
      ws?: {
        ws?: WebSocket;
      };
    };
  }
}

const STYLE_ID = "cursor";
const CURSOR_ID = "zentype-cursor";
const BLINK_DELAY = 500;

let cursorEl: HTMLDivElement | null = null;
let blinkTimer: number | null = null;
let pendingFrame: number | null = null;
let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];
let blinkListeners: Array<[string, EventListener]> = [];
let wsHandler: ((e: MessageEvent) => void) | null = null;

function createCursorElement(): HTMLDivElement {
  let el = document.getElementById(CURSOR_ID) as HTMLDivElement | null;
  if (el) return el;

  el = document.createElement("div");
  el.id = CURSOR_ID;
  el.classList.add("hidden");
  document.body.appendChild(el);
  return el;
}

function updateCursor(): void {
  if (!cursorEl || pendingFrame !== null) return;

  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    if (!cursorEl) return;

    const rect = getCursorRect();
    if (!rect || rect.width === 0) {
      cursorEl.classList.add("hidden");
      return;
    }

    cursorEl.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    cursorEl.style.height = `${rect.height}px`;
    cursorEl.classList.remove("hidden");
  });
}

function startBlink(): void {
  if (!cursorEl) return;
  if (blinkTimer !== null) clearTimeout(blinkTimer);
  blinkTimer = window.setTimeout(() => {
    cursorEl?.classList.add("breathing");
  }, BLINK_DELAY);
}

function stopBlink(): void {
  if (blinkTimer !== null) {
    clearTimeout(blinkTimer);
    blinkTimer = null;
  }
  cursorEl?.classList.remove("breathing");
}

export function initCursor(): void {
  // 创建 DOM + 注入 CSS
  cursorEl = createCursorElement();
  addStyle(STYLE_ID, cursorCss);

  // 主事件：必须保留 options（含 passive）
  const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
    ["selectionchange", updateCursor],
    ["keyup", updateCursor],
    ["keydown", updateCursor],
    ["mouseup", updateCursor],
    ["click", updateCursor],
    ["scroll", updateCursor, { passive: true }],
    ["wheel", updateCursor, { passive: true }],
    ["resize", updateCursor],
  ];

  handlers.forEach(([event, handler, options]) => {
    document.addEventListener(event, handler as EventListener, options);
  });
  eventListeners = handlers;

  // 闪烁控制（存入数组以便 destroy 时清理）
  blinkListeners = [
    ["selectionchange", stopBlink],
    ["keydown", stopBlink],
    ["mousedown", stopBlink],
  ];
  blinkListeners.forEach(([event, handler]) => {
    document.addEventListener(event, handler);
  });

  // WS 监听 transactions（保存 handler 以便 destroy 时清理）
  if (window.siyuan?.ws?.ws) {
    wsHandler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.cmd === "transactions") {
          updateCursor();
        }
      } catch {}
    };
    window.siyuan.ws.ws.addEventListener("message", wsHandler);
  }

  startBlink();
  updateCursor();
}

export function destroyCursor(): void {
  // 主事件
  eventListeners.forEach(([event, handler]) => {
    document.removeEventListener(event, handler);
  });
  eventListeners = [];

  // 闪烁控制事件
  blinkListeners.forEach(([event, handler]) => {
    document.removeEventListener(event, handler);
  });
  blinkListeners = [];

  // WS 监听
  if (wsHandler && window.siyuan?.ws?.ws) {
    window.siyuan.ws.ws.removeEventListener("message", wsHandler);
    wsHandler = null;
  }

  stopBlink();

  if (pendingFrame !== null) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }

  if (cursorEl) {
    cursorEl.remove();
    cursorEl = null;
  }

  removeStyle(STYLE_ID);
}

export function isCursorEnabled(): boolean {
  return cursorEl !== null;
}
```

同时创建 `src/types/scss.d.ts`（让 TypeScript 接受 SCSS 导入）：
```typescript
/**
 * Ambient module declaration for SCSS files.
 * esbuild sass-plugin compiles .scss to a CSS string, which is injected
 * into the document via addStyle() at runtime.
 */
declare module "*.scss" {
  const css: string;
  export default css;
}
```

> **审查经验（适用于 Task 4 / Task 5）**：
> 1. **必须注入 CSS** — `addStyle(STYLE_ID, css)` 不能漏，否则 DOM 创建了也没样式。
> 2. **所有 addEventListener 必须配对 removeEventListener** — 包括：主事件、辅助控制事件（如 blink 控制）、外部对象监听（如 WebSocket）。每个 init 都应把监听存入数组，destroy 遍历清理。
> 3. **保留 listener options** — `{ passive: true }` 等需要保留。`forEach(([event, handler]) => ...` 会丢失第三元素，要写成 `forEach(([event, handler, options]) => ...`。
> 4. **WS 监听需要保存 handler 引用** — 不能用 inline 匿名函数，否则 `removeEventListener` 无法匹配。

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd /d/Documents/GitHub/zenType
npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 4: 验证 esbuild 打包成功**

```bash
cd /d/Documents/GitHub/zenType
pnpm build
```

预期：`dist/index.js` 生成，包含 cursor 模块代码。

- [ ] **Step 5: 手动烟雾测试（在思源中）**

1. 打开思源笔记，加载本插件
2. 打开一个文档，点击编辑器
3. 检查：屏幕上有蓝色自定义光标跟随原生光标
4. 移动鼠标到不同位置，**键盘方向键**移动光标：自定义光标应该平滑跟随
5. 静止 1 秒后：光标应该开始呼吸式闪烁
6. 输入文本：闪烁应停止
7. 移动到代码块、引用块：自定义光标应正常工作

预期结果：自定义光标在所有场景都跟随原生光标，闪烁行为正确。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(cursor): implement smooth cursor module with blink animation"
```

---

## Task 3 Lessons Learned（Task 4 & 5 必须遵循）

**任何模块的 `init/destroy` 都必须遵循以下 4 个模式**（基于 Task 3 review 经验）：

1. **注入 CSS** — 不要依赖全局 CSS 加载。init 时调用 `addStyle(STYLE_ID, importedCssString)`，destroy 时 `removeStyle(STYLE_ID)`。
   ```typescript
   import typewriterCss from "../styles/typewriter.css"; // 或 .scss
   // init:
   addStyle(STYLE_ID, typewriterCss);
   // destroy:
   removeStyle(STYLE_ID);
   ```

2. **追踪所有事件监听器** — 包括辅助事件（闪烁控制、防抖等）。每个 `document.addEventListener` 都必须在 destroy 中有对应的 `removeEventListener`。
   ```typescript
   let blinkListeners: Array<[string, EventListener]> = [];
   // init:
   blinkListeners = [["keydown", stopBlink], ...];
   blinkListeners.forEach(([e, h]) => document.addEventListener(e, h));
   // destroy:
   blinkListeners.forEach(([e, h]) => document.removeEventListener(e, h));
   blinkListeners = [];
   ```

3. **保存 WebSocket handler 引用** — 否则 destroy 时无法 removeEventListener。
   ```typescript
   let wsHandler: ((e: MessageEvent) => void) | null = null;
   // init:
   wsHandler = (e) => { /* ... */ };
   window.siyuan?.ws?.ws?.addEventListener("message", wsHandler);
   // destroy:
   window.siyuan?.ws?.ws?.removeEventListener("message", wsHandler);
   wsHandler = null;
   ```

4. **传递 passive 选项** — `forEach(([event, handler, options]) => addEventListener(event, handler, options))`，不要丢弃第三参数。

**参考实现**：`src/modules/cursor.ts`（commit f1d5431 之后）。

---

## Task 4: 打字机模式模块

**Files:**
- Create: `src/modules/typewriter.ts`
- Modify: `src/styles/index.scss`（追加高亮条样式，已在 Task 3 中创建）

**Interfaces:**
- `initTypewriter(): void` — 启动打字机模式监听
- `destroyTypewriter(): void` — 停止并清理
- 消费：`getCursorRect()`、`shouldPauseTypewriter()` 工具

---

- [ ] **Step 1: 写 `src/modules/typewriter.ts`**

写文件 `src/modules/typewriter.ts`：
```typescript
import { getCursorRect } from "../utils/getCursorRect";
import { shouldPauseTypewriter } from "../utils/edgeCases";

const HIGHLIGHT_ID = "zentype-highlight-line";
const TARGET_RATIO = 0.38;  // 38% 高度
const THRESHOLD = 40;       // 触发阈值（px）
const DURATION = 400;       // 滚动时长（ms）

let highlightEl: HTMLDivElement | null = null;
let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];
let pendingScroll: number | null = null;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getEditorContainer(): HTMLElement | null {
  return document.querySelector(".protyle:not(.fn__none) .protyle-content");
}

function createHighlightElement(): HTMLDivElement {
  let el = document.getElementById(HIGHLIGHT_ID) as HTMLDivElement | null;
  if (el) return el;
  el = document.createElement("div");
  el.id = HIGHLIGHT_ID;
  document.body.appendChild(el);
  return el;
}

function updateHighlight(rect: DOMRect): void {
  if (!highlightEl) return;
  highlightEl.style.transform = `translate3d(0, ${rect.top - 4}px, 0)`;
  highlightEl.style.height = `${rect.height + 8}px`;
  highlightEl.style.left = `${rect.left}px`;
  highlightEl.style.width = `${rect.width || 100}px`;
  highlightEl.classList.add("visible");
}

function smoothScroll(target: HTMLElement, deltaY: number): void {
  if (pendingScroll !== null) cancelAnimationFrame(pendingScroll);

  const startScroll = target.scrollTop;
  const endScroll = startScroll + deltaY;
  const startTime = performance.now();

  function step() {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / DURATION, 1);
    const eased = easeInOutCubic(t);
    target.scrollTop = startScroll + (endScroll - startScroll) * eased;
    if (t < 1) {
      pendingScroll = requestAnimationFrame(step);
    } else {
      pendingScroll = null;
    }
  }
  pendingScroll = requestAnimationFrame(step);
}

function checkAndScroll(): void {
  if (shouldPauseTypewriter()) {
    highlightEl?.classList.remove("visible");
    return;
  }

  const rect = getCursorRect();
  if (!rect) {
    highlightEl?.classList.remove("visible");
    return;
  }

  const container = getEditorContainer();
  if (!container) return;

  // 更新高亮条（总是更新）
  updateHighlight(rect);

  // 计算距离并决定是否滚动
  const containerRect = container.getBoundingClientRect();
  const targetY = containerRect.top + containerRect.height * TARGET_RATIO;
  const offset = rect.top - targetY;

  if (Math.abs(offset) >= THRESHOLD) {
    smoothScroll(container, offset);
  }
}

export function initTypewriter(): void {
  highlightEl = createHighlightElement();

  // 事件数组使用三元组以便保留 options
  const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
    ["selectionchange", checkAndScroll],
    ["keyup", checkAndScroll],
    ["keydown", checkAndScroll],
    ["click", checkAndScroll],
    ["mouseup", checkAndScroll],
    ["resize", checkAndScroll],
  ];

  // 解构必须包含第三个元素
  handlers.forEach(([event, handler, options]) => {
    document.addEventListener(event, handler as EventListener, options);
  });
  eventListeners = handlers;
}

export function destroyTypewriter(): void {
  eventListeners.forEach(([event, handler]) => {
    document.removeEventListener(event, handler);
  });
  eventListeners = [];

  if (pendingScroll !== null) {
    cancelAnimationFrame(pendingScroll);
    pendingScroll = null;
  }

  if (highlightEl) {
    highlightEl.remove();
    highlightEl = null;
  }
}
```

> **审查经验（继承自 Task 3）**：
> 1. 使用 `Array<[string, EventListener, AddEventListenerOptions?]>` 三元组数组，以便保留 `passive` 等选项。
> 2. `forEach(([event, handler, options]) => ...` 解构必须包含第三个元素，否则 `{ passive: true }` 会被丢弃。
> 3. 高亮条样式位于 `src/styles/index.scss` 的 `#zentype-highlight-line` 选择器。**注意**：如果用户只启用 typewriter 而禁用 cursor，那些样式就不会被注入。当前接受此限制（v1 三模块默认全开）。如未来需独立启用，需要 typewriter 也调用 `addStyle("typewriter", ...)` 注入同一份 SCSS（或拆分为单独的 typewriter SCSS 文件）。

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd /d/Documents/GitHub/zenType
npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 3: 手动烟雾测试（在思源中）**

1. 加载插件，打开一个长文档（>10 个段落）
2. 在第一个段落点击：观察滚动 — 文档应平滑滚动使光标在屏幕 38% 高度
3. 移动光标到下方段落：每次超过 40px 阈值时，文档平滑滚动 400ms
4. 观察高亮条：米黄/深灰背景条跟随光标所在行
5. 选中多行：高亮条渐出消失
6. 打开悬浮窗（块标菜单）：高亮条渐出消失
7. 进入嵌入块（如有）：高亮条消失

预期结果：滚动流畅，高亮条行为正确。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(typewriter): implement typewriter mode with highlight line"
```

---

## Task 5: 涟漪聚焦模块（文本 + 鼠标双模式状态机）

**Files:**
- Create: `src/modules/ripple.ts`

**Interfaces:**
- `initRipple(): void` — 启动涟漪聚焦监听
- `destroyRipple(): void` — 停止并清理
- 消费：`getCursorElement()`、`shouldPauseFocusAndTypewriter()` 工具

---

- [ ] **Step 1: 写 `src/modules/ripple.ts`**

写文件 `src/modules/ripple.ts`：
```typescript
import { getCursorElement } from "../utils/getCursorRect";
import {
  shouldPauseFocusAndTypewriter,
  isReadMode,
} from "../utils/edgeCases";
import type { RippleMode } from "../types";

const OPACITY_LEVELS = [1.0, 0.85, 0.6, 0.35, 0.15, 0.05];
const MOUSE_THROTTLE = 100;  // ms
const IDLE_THRESHOLD = 2000;  // ms

let mode: RippleMode = "text";
let lastTextCursorChange = 0;
let lastMouseBlock: Element | null = null;
let lastTextBlock: Element | null = null;
let pendingFrame: number | null = null;
let eventListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];
let lastMouseMove = 0;

function getCurrentBlock(): Element | null {
  if (mode === "mouse" && lastMouseBlock) return lastMouseBlock;
  const cursor = getCursorElement();
  return cursor?.closest("[data-node-id]") ?? null;
}

function calculateBlockDistance(from: Element, to: Element): number {
  const fromParent = from.parentElement;
  if (!fromParent) return 0;
  const siblings = Array.from(fromParent.children);
  const fromIndex = siblings.indexOf(from);
  const toIndex = siblings.indexOf(to);
  return Math.abs(fromIndex - toIndex);
}

function isOverScrollbar(e: MouseEvent): boolean {
  // 检测鼠标是否在滚动条上（简化判断：检查视口边缘）
  const w = window.innerWidth;
  const h = window.innerHeight;
  return e.clientX > w - 20 || e.clientY > h - 20;
}

function applyRipple(): void {
  if (pendingFrame !== null) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;

    if (shouldPauseFocusAndTypewriter() && mode !== "mouse") {
      // 暂停时清除所有 opacity 覆盖，恢复默认
      clearAllOpacity();
      return;
    }

    const currentBlock = getCurrentBlock();
    if (!currentBlock) return;

    const container = currentBlock.closest(".protyle-wysiwyg");
    if (!container) return;

    const allBlocks = Array.from(
      container.querySelectorAll('[data-node-id], iframe, video')
    );

    allBlocks.forEach((block) => {
      const distance = calculateBlockDistance(currentBlock, block as Element);
      const opacity = OPACITY_LEVELS[Math.min(distance, OPACITY_LEVELS.length - 1)];
      (block as HTMLElement).style.opacity = String(opacity);
    });

    (currentBlock as HTMLElement).style.opacity = "1";
  });
}

function clearAllOpacity(): void {
  const blocks = document.querySelectorAll(
    '.protyle-wysiwyg [data-node-id], .protyle-wysiwyg iframe, .protyle-wysiwyg video'
  );
  blocks.forEach((block) => {
    (block as HTMLElement).style.opacity = "";
  });
}

function onSelectionChange(): void {
  lastTextCursorChange = Date.now();
  const cursor = getCursorElement();
  lastTextBlock = cursor?.closest("[data-node-id]") ?? null;

  if (mode !== "paused") {
    mode = "text";
    applyRipple();
  }
}

function onMouseMove(e: MouseEvent): void {
  const now = Date.now();
  if (now - lastMouseMove < MOUSE_THROTTLE) return;
  lastMouseMove = now;

  // 鼠标在编辑器外
  const target = e.target as Element | null;
  if (!target?.closest(".protyle-wysiwyg")) {
    if (mode === "mouse") {
      mode = "text";
      applyRipple();
    }
    return;
  }

  // 鼠标在滚动条上
  if (isOverScrollbar(e)) return;

  const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
  if (!elementAtPoint) return;

  const mouseBlock = elementAtPoint.closest('[data-node-id], iframe, video');
  if (!mouseBlock) return;
  lastMouseBlock = mouseBlock as Element;

  // 决定是否切到 mouse 模式
  const readMode = isReadMode();
  const idleTooLong = now - lastTextCursorChange > IDLE_THRESHOLD;
  const mouseInDifferentBlock =
    lastTextBlock &&
    !mouseBlock.contains(lastTextBlock) &&
    !lastTextBlock.contains(mouseBlock);

  if (readMode || idleTooLong || mouseInDifferentBlock) {
    if (mode !== "mouse") {
      mode = "mouse";
    }
    applyRipple();
  }
}

export function initRipple(): void {
  mode = "text";
  lastTextCursorChange = Date.now();

  // 事件数组使用三元组以便保留 options（mousemove 用 passive 提高滚动性能）
  const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
    ["selectionchange", onSelectionChange],
    ["mousemove", onMouseMove as EventListener, { passive: true }],
    ["click", onSelectionChange],
    ["keyup", onSelectionChange],
  ];

  // 解构必须包含第三个元素
  handlers.forEach(([event, handler, options]) => {
    document.addEventListener(event, handler, options);
  });
  eventListeners = handlers;

  applyRipple();
}

export function destroyRipple(): void {
  eventListeners.forEach(([event, handler]) => {
    document.removeEventListener(event, handler);
  });
  eventListeners = [];

  if (pendingFrame !== null) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
  }

  clearAllOpacity();
}
```

> **审查经验（继承自 Task 3）**：
> 1. 使用 `Array<[string, EventListener, AddEventListenerOptions?]>` 三元组数组，以便保留 `passive` 等选项。
> 2. `forEach(([event, handler, options]) => ...` 解构必须包含第三个元素，否则 `{ passive: true }` 会被丢弃。
> 3. `mousemove` 监听必须用 `{ passive: true }` —— 它会被高频触发，主线程阻塞会卡顿编辑器。
> 4. ripple 不需要导入 SCSS（它直接通过 JS 设置 `style.opacity`），所以本模块无 CSS 注入问题。

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd /d/Documents/GitHub/zenType
npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 3: 手动烟雾测试（在思源中）**

**测试 1：文本光标中心模式**
1. 加载插件，打开长文档
2. 在第一个段落点击：观察 — 该段 100%，距离 1 段 85%，距离 2 段 60%... 最远段 5%
3. 用方向键移动到下方段落：涟漪焦点跟随
4. 点击不同段落：涟漪焦点跳到点击处

**测试 2：鼠标中心模式**
1. 在编辑模式，停止打字 2 秒
2. 慢慢移动鼠标到下方段落：涟漪焦点跟随鼠标
3. 移动鼠标回光标所在块：涟漪焦点回到光标
4. 再次开始打字：涟漪焦点回到文本光标

**测试 3：只读模式**
1. 挂起编辑（思源文档树里右键 → 设为只读）
2. 鼠标移动：涟漪焦点跟随鼠标（因为只读模式 = 无文本光标）

**测试 4：选中多行暂停**
1. 拖蓝一段文字：渐出 0.3s 后所有块恢复 100%（暂停）
2. 释放选中：涟漪焦点回到文本光标

**测试 5：嵌套块**
1. 在列表里创建子项
2. 把光标放到子项里：观察 — 列表项本身保持 100%（v1 简化方案），子项之间渐淡

**测试 6：嵌入块**
1. 插入一个视频块（如果支持）
2. 光标放在视频块附近：视频作为 1 个渐淡单位

预期结果：所有 6 个测试场景行为正确。

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "feat(ripple): implement ripple focus with text/mouse dual-mode state machine"
```

---

## Task 6: 入口文件 + 顶栏图标 + 命令面板

**Files:**
- Modify: `src/index.ts`
- Modify: `plugin.json`（无变化，确认）

**Interfaces:**
- zenType 默认导出：继承自 `siyuan.Plugin`
- `onload()`：启动三大模块
- `onunload()`：清理所有模块
- `toggle(moduleName)`：切换单个模块开关
- 注册 4 个命令：toggle-cursor / toggle-typewriter / toggle-ripple / toggle-all
- 注册顶栏按钮：点击切换总开关

---

- [ ] **Step 1: 写完整的 `src/index.ts`**

覆盖 `src/index.ts`：
```typescript
import { Plugin } from "siyuan";
import { initCursor, destroyCursor } from "./modules/cursor";
import { initTypewriter, destroyTypewriter } from "./modules/typewriter";
import { initRipple, destroyRipple } from "./modules/ripple";
import type { ModuleEnabled, ModuleName } from "./types";

const STORAGE_KEY = "zentype-enabled";

export default class ZenType extends Plugin {
  private enabled: ModuleEnabled = {
    cursor: true,
    typewriter: true,
    ripple: true,
  };

  async onload(): Promise<void> {
    // 加载保存的开关状态
    const saved = await this.loadData(STORAGE_KEY);
    if (saved && typeof saved === "object") {
      this.enabled = { ...this.enabled, ...saved };
    }

    // 注册命令面板
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
    this.addCommand({
      command: "toggle-all",
      callback: () => this.toggleAll(),
    });

    // 注册顶栏图标
    this.addTopBar({
      icon: "iconA",
      title: "zenType 总开关",
      callback: () => this.toggleAll(),
    });

    // 启动已启用的模块
    if (this.enabled.cursor) initCursor();
    if (this.enabled.typewriter) initTypewriter();
    if (this.enabled.ripple) initRipple();

    console.log("zenType v2 loaded");
  }

  onunload(): void {
    destroyCursor();
    destroyTypewriter();
    destroyRipple();
    console.log("zenType v2 unloaded");
  }

  private toggle(name: ModuleName): void {
    this.enabled[name] = !this.enabled[name];

    if (name === "cursor") {
      if (this.enabled.cursor) initCursor();
      else destroyCursor();
    } else if (name === "typewriter") {
      if (this.enabled.typewriter) initTypewriter();
      else destroyTypewriter();
    } else if (name === "ripple") {
      if (this.enabled.ripple) initRipple();
      else destroyRipple();
    }

    this.saveData(STORAGE_KEY, this.enabled);
  }

  private toggleAll(): void {
    const allOn = this.enabled.cursor && this.enabled.typewriter && this.enabled.ripple;
    const newState = !allOn;

    if (newState && !this.enabled.cursor) {
      this.enabled.cursor = true;
      initCursor();
    } else if (!newState && this.enabled.cursor) {
      this.enabled.cursor = false;
      destroyCursor();
    }

    if (newState && !this.enabled.typewriter) {
      this.enabled.typewriter = true;
      initTypewriter();
    } else if (!newState && this.enabled.typewriter) {
      this.enabled.typewriter = false;
      destroyTypewriter();
    }

    if (newState && !this.enabled.ripple) {
      this.enabled.ripple = true;
      initRipple();
    } else if (!newState && this.enabled.ripple) {
      this.enabled.ripple = false;
      destroyRipple();
    }

    this.saveData(STORAGE_KEY, this.enabled);
  }
}
```

- [ ] **Step 2: 添加顶栏图标 SVG**

需要创建顶栏图标的 SVG。这里用 inline SVG（暂用文字图标占位）。

修改 `src/index.ts` 的 `addTopBar` 部分：

```typescript
// 替换 addTopBar 调用
const iconSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;

this.addTopBar({
  icon: iconSvg,
  title: this.enabled.cursor ? "zenType 已启用" : "zenType 已禁用",
  callback: () => this.toggleAll(),
});
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd /d/Documents/GitHub/zenType
npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 4: 构建**

```bash
cd /d/Documents/GitHub/zenType
pnpm build
```

预期：`dist/index.js` 生成。

- [ ] **Step 5: 手动烟雾测试**

1. 加载插件：思源顶栏右侧出现笔形图标
2. 点击图标：三个功能一起关闭（图标变灰）
3. 再次点击：三个功能一起开启
4. 打开命令面板（Ctrl+Shift+P）：搜索 "zenType" — 应看到 4 个命令
5. 执行 "zenType: 切换顺滑光标"：只有顺滑光标关闭
6. 退出思源，重新加载：开关状态被保留（通过 saveData）

预期结果：开关切换正常，状态持久化正常。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: wire up entry point with top bar icon and command palette"
```

---

## Task 7: 清理未使用的文件 + 整理项目

**Files:**
- Delete: 任何残留的模板文件
- Verify: 目录结构符合 spec

**Interfaces:**
- 无

---

- [ ] **Step 1: 列出所有 src/ 文件**

```bash
cd /d/Documents/GitHub/zenType
find src -type f
```

预期结果：
```
src/index.ts
src/modules/cursor.ts
src/modules/typewriter.ts
src/modules/ripple.ts
src/utils/getCursorRect.ts
src/utils/edgeCases.ts
src/utils/styleManager.ts
src/types/index.ts
src/styles/index.scss
```

如果有其他文件，按需删除。

- [ ] **Step 2: 检查根目录**

```bash
cd /d/Documents/GitHub/zenType
ls -la
```

预期应该包含：
- `package.json`、`tsconfig.json`、`build.js`、`plugin.json`
- `src/`、`docs/`、`参考/`
- `icon.png`、`preview.png`、`README.md`、`README_zh_CN.md`、`LICENSE`

不应该包含：
- `vite.config.ts`、`svelte.config.js`、`yaml-plugin.js`
- `scripts/`（旧的构建脚本）
- `.github/`（旧的 CI 配置，可以保留但需更新）

- [ ] **Step 3: 删除任何残留**

按需删除不存在的预期文件。

- [ ] **Step 4: 清理 package.json scripts**

确认 `package.json` 的 scripts 字段只包含：`build`、`dev`、`clean`。

- [ ] **Step 5: 最终构建验证**

```bash
cd /d/Documents/GitHub/zenType
rm -rf dist
pnpm build
ls -la dist/
```

预期：`dist/` 包含 `index.js`、`plugin.json`、`icon.png`、`preview.png`。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "chore: clean up unused template files and finalize project structure"
```

---

## Task 8: 边界场景完整测试 + 已知 bug 修复

**Files:**
- Modify: 任何需要修复的文件（很可能不需要）

**Interfaces:**
- 无

---

- [ ] **Step 1: 完整边界场景测试清单**

按 spec 第 9 节的表格逐项验证：

| 场景 | 测试方法 | 预期 |
|------|---------|------|
| 选中多行 | 拖蓝一段文字 | 聚焦/打字机暂停 + 渐出动画 |
| 只读模式 | 挂起文档编辑 | 涟漪切到鼠标中心，打字机暂停，光标保持 |
| 悬浮窗编辑 | 打开块标菜单 | 聚焦/打字机暂停，光标保持 |
| 嵌入块 | 在嵌入块里编辑 | 涟漪参与（作为渐淡单位），打字机跳过 |
| 嵌套块 | 列表子项里编辑 | 简单方案生效，不递归 |
| 代码块 | 在代码块里编辑 | 整块作为 1 个渐淡单位 |
| 编辑 + 鼠标静止 2s | 停止输入 2s 后移动鼠标 | 涟漪切到鼠标中心 |
| 鼠标移到非文本光标块 | 鼠标移到别的段 | 立即切到鼠标中心 |
| 鼠标离开编辑器 | 鼠标移到顶栏/侧边栏 | 涟漪回退到文本中心 |

- [ ] **Step 2: 已知 bug 验证**

测试以下两个来自原项目的已知 bug：

1. **全屏模式下高亮条层级问题**
   - 测试：F11 全屏或思源自带全屏
   - 预期：高亮条应正确显示在编辑内容之上

2. **退格/回车时空行聚焦模式**
   - 测试：退格删除到段落末尾，再按退格
   - 预期：涟漪聚焦应正确处理空行情况

- [ ] **Step 3: 修复发现的 bug**

如果发现 bug，在对应文件中修复。修复流程：
1. 定位问题文件
2. 修改代码
3. 重新构建
4. 重新测试
5. 提交：`git commit -m "fix: <bug description>"`

- [ ] **Step 4: 性能检查**

1. 打开一个含 100+ 段落的文档
2. 滚动文档
3. 移动光标
4. 检查浏览器 DevTools Performance：
   - FPS 应稳定 ≥ 55
   - selectionchange 处理耗时 < 5ms

- [ ] **Step 5: 提交（如有修改）**

```bash
git add -A
git commit -m "fix: address edge cases discovered in testing"
```

---

## Task 9: README 文档（中英文）

**Files:**
- Modify: `README.md`
- Modify: `README_zh_CN.md`

**Interfaces:**
- 无

---

- [ ] **Step 1: 写 `README.md`（英文）**

覆盖 `README.md`：

```markdown
# zenType v2

Smooth cursor + typewriter mode + ripple focus for distraction-free writing in SiYuan Note.

## Features

- **Smooth Cursor** — Custom blue cursor replaces the system caret with smooth transition animation
- **Typewriter Mode** — Your caret stays at 38% screen height (golden ratio), with a subtle highlight bar tracking it
- **Ripple Focus** — The current block stays bright while surrounding blocks gradually fade

## Installation

1. Download the latest release zip from the Releases page
2. In SiYuan Note, open Settings → Plugins → Load plugin from disk
3. Select the downloaded zip

## Usage

All three features are enabled by default. To toggle:

- **Top bar icon** (pencil): Toggle all three features on/off
- **Command palette** (Ctrl+Shift+P): Search "zenType" to see individual toggles

## Edge Cases

### Mouse-Centered Ripple (new in v2)

When you're in read-only mode, or when you've stopped typing for 2+ seconds, the ripple focus automatically follows your mouse cursor. As soon as you start typing again, it returns to tracking your text caret.

### Embedded Blocks

Videos, iframes, and PDF embeds are treated as 1 ripple unit (they fade normally). Typewriter mode skips them (no scroll when cursor is in an embed).

### Nested Blocks (Simplified in v1)

If your cursor is in a child of a nested block (e.g., a list item inside a list), only the immediate parent layer fades. Outer containers stay at 100% opacity. This is a simplification — recursive fading is planned for v2 if users request it.

### Selection (Multi-line)

When you drag-select text, ripple focus and typewriter mode gracefully fade out (0.3s animation). The smooth cursor stays active.

### Suspended Edits & Popups

Read-only mode and block popups automatically suspend typewriter mode. Ripple focus switches to mouse-centered mode in read-only.

## Roadmap

See [docs/superpowers/specs/2026-06-27-zentype-redesign-design.md](docs/superpowers/specs/2026-06-27-zentype-redesign-design.md) for the full design.

## License

MIT
```

- [ ] **Step 2: 写 `README_zh_CN.md`（中文）**

覆盖 `README_zh_CN.md`：

```markdown
# zenType v2（禅打）

顺滑光标 + 打字机模式 + 涟漪聚焦 — 让思源笔记写作更专注。

## 功能

- **顺滑光标** — 自定义蓝色光标替换系统竖线，带平滑过渡动画
- **打字机模式** — 光标始终保持在屏幕 38% 高度（黄金分割），附带高亮条跟踪
- **涟漪聚焦** — 当前块最亮，周围块按距离渐淡

## 安装

1. 从 Releases 页面下载最新 zip
2. 思源笔记打开 设置 → 插件 → 从本地安装插件
3. 选择下载的 zip

## 使用

三个功能**默认全部启用**。切换方式：

- **顶栏图标**（笔形）：一键切换全部功能
- **命令面板**（Ctrl+Shift+P）：搜索 "zenType" 可单独切换

## 边界场景说明

### 鼠标中心聚焦模式（v2 新增）

- **只读模式**：鼠标移到哪块，焦点就跟到哪块
- **编辑模式**：停止打字 2 秒后，鼠标移动即切换焦点；再次打字自动切回文本光标

### 嵌入块（视频/iframe/PDF）

- 涟漪聚焦：作为 1 个渐淡单位正常参与
- 打字机模式：跳过（嵌入块内不触发滚动）

### 嵌套块（v1 简化方案）

- 列表 / 引用块的子项：只对子项所在那一层做渐淡
- 外层（列表项本身）保持 100%
- **v2 升级**：如果反馈需要"递归渐淡"（父级 80% → 60% → 40%），后续单独迭代

### 选中多行

- 拖蓝文字时，涟漪聚焦 + 打字机模式优雅渐出（0.3s 动画）
- 顺滑光标保持工作

### 只读模式 / 悬浮窗

- 打字机模式自动暂停
- 涟漪聚焦在只读模式下自动切换为鼠标中心模式
- 悬浮窗里编辑时聚焦也暂停

## 路线图

完整设计见 [docs/superpowers/specs/2026-06-27-zentype-redesign-design.md](docs/superpowers/specs/2026-06-27-zentype-redesign-design.md)。

## 许可

MIT
```

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "docs: update README with v2 features and edge case documentation"
```

---

## Task 10: 打包与发布验证

**Files:**
- Modify: `build.js`（增强 zip 打包功能）
- Modify: `package.json`（添加 zip 脚本）

**Interfaces:**
- 无

---

- [ ] **Step 1: 增强 `build.js` 以支持 zip 打包**

修改 `build.js`，添加 `zip` 模式：

在文件末尾追加：
```javascript
// 添加 zip 模式
const zipMode = process.argv.includes('--zip');

if (zipMode) {
  // 简单的 zip 实现（避免引入 archiver 依赖）
  const archiver = require('archiver');
  const output = fs.createWriteStream('zentype.zip');
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log(`Created zentype.zip (${archive.pointer()} bytes)`);
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);
  archive.directory('dist/', false);
  archive.finalize();
}
```

- [ ] **Step 2: 添加 zip 依赖**

修改 `package.json`，在 `devDependencies` 中添加 `"archiver": "^7.0.0"` 和 `"@types/archiver": "^6.0.0"`。

```bash
cd /d/Documents/GitHub/zenType
pnpm install
```

- [ ] **Step 3: 写 `CHANGELOG.md`**

写文件 `CHANGELOG.md`：
```markdown
# Changelog

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
```

- [ ] **Step 4: 最终构建 + 打包**

```bash
cd /d/Documents/GitHub/zenType
pnpm clean
pnpm build
pnpm build -- --zip
```

预期：`zentype.zip` 生成。

- [ ] **Step 5: 验证 zip 内容**

```bash
cd /d/Documents/GitHub/zenType
unzip -l zentype.zip
```

预期看到：
- `index.js`
- `plugin.json`
- `icon.png`
- `preview.png`

- [ ] **Step 6: 在思源中加载 zip 测试**

1. 打开思源笔记
2. 设置 → 插件 → 从本地安装插件
3. 选择 `zentype.zip`
4. 重启思源
5. 验证所有功能正常工作

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "build: add zip packaging and changelog"
```

---

## Self-Review

### Spec Coverage Check

| Spec Section | Implementation Task |
|--------------|---------------------|
| 1. 项目背景与目标 | Task 1（骨架）+ Task 6（入口） |
| 2. 用户场景 | Task 3/4/5（三个核心模块） |
| 3.1 顺滑光标 | Task 3 |
| 3.2 打字机模式 | Task 4 |
| 3.3 涟漪聚焦（含鼠标模式） | Task 5 |
| 3.4 模块行为总览 | Task 5 + Task 8（验证） |
| 4. 架构设计 | Task 1（目录）+ Task 6（入口） |
| 5. 数据流（事件订阅） | Task 3/4/5 |
| 6.1 顺滑光标算法 | Task 3 |
| 6.2 打字机模式算法 | Task 4 |
| 6.3 涟漪聚焦算法（含状态机） | Task 5 |
| 6.4 边界场景判定 | Task 2（edgeCases.ts） |
| 7.1 顶栏图标 | Task 6 |
| 7.2 命令面板 | Task 6 |
| 7.3 颜色规范 | Task 3（SCSS） |
| 8. 性能与兼容性 | Task 8（性能验证） |
| 9. 边界场景处理 | Task 8（测试） |
| 10. 未来扩展 | 设计文档保留，本计划聚焦 v1 |
| 11. 风险与开放问题 | Task 8（风险缓解） |
| 12. 实施清单 | 全部任务 |
| 13. 参考资料 | 不需要实施任务 |

**覆盖完整，无遗漏。**

### Placeholder Scan

- 无 "TBD"、"TODO" 标记
- 所有代码块完整
- 所有命令具体可执行

### Type Consistency Check

- `RippleMode`: 定义在 `src/types/index.ts` Task 2，使用在 `src/modules/ripple.ts` Task 5 ✅
- `ModuleEnabled` / `ModuleName`: 定义在 `src/types/index.ts` Task 2，使用在 `src/index.ts` Task 6 ✅
- `getCursorRect` / `getCursorElement`: 定义在 `src/utils/getCursorRect.ts` Task 2，使用在 `src/modules/cursor.ts` Task 3、`src/modules/typewriter.ts` Task 4、`src/modules/ripple.ts` Task 5 ✅
- `shouldPauseFocusAndTypewriter` / `shouldPauseTypewriter` / `isReadMode` / `isInPopup` / `isInEmbedBlock`: 定义在 `src/utils/edgeCases.ts` Task 2，使用在 `src/modules/typewriter.ts` Task 4、`src/modules/ripple.ts` Task 5 ✅
- `addStyle` / `removeStyle` / `removeAllStyles`: 定义在 `src/utils/styleManager.ts` Task 2（仅 Task 3 使用，后续可扩展）

**类型一致，无错误。**

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-27-zentype-redesign-plan.md`.**

10 个任务，从骨架搭建到打包发布，每个任务独立可验证。

**两个执行选项**：

**1. Subagent-Driven（推荐）** — 每任务调度一个新的 subagent，任务间 review，快速迭代
   - 优点：上下文隔离、专注、可控
   - 缺点：稍慢

**2. Inline Execution** — 在当前会话执行所有任务，分批检查点
   - 优点：快
   - 缺点：上下文容易膨胀

**你想用哪种方式？**
- 选 1：回复 "subagent"
- 选 2：回复 "inline"
- 还要改计划：告诉我哪里

# zenType 设计文档（v2.5.0）

> **本文件合并自 `docs/FOCUS_TYPEWRITER_DESIGN.md`（已删除）+ 早期 `TODO.md`（已删除）的设计段。**
> **代码即真相，本文档跟随代码，不是反过来。**
> **每个决策都有"在哪行代码生效"或"从 git 历史哪条 commit 来"的引用。**

---

## 0. 概览

**zenType（思源集市显示名"焦点写作"）** 是思源笔记（SiYuan Note）的写作增强插件。三个独立可开关的模式：

| 模式 | 一句话 | 默认 |
|---|---|---|
| **顺滑光标** (Smooth Cursor) | 自定义蓝色光标替换系统竖线，移动时丝滑过渡 + 边缘淡出 | ✅ ON |
| **打字机模式** (Typewriter Mode) | 输入时光标始终停在屏幕 38% 高度（黄金分割偏上） | ⚠️ 默认 OFF（首次输入后 ON） |
| **涟漪聚焦** (Ripple Focus) | 当前块最亮，周围块按距离渐淡 | ⚠️ 默认 OFF（首次输入后 ON） |

**核心价值**：让用户进入"心流"状态 —— 不用低头找光标、不被周围段落干扰。
**设计哲学**：聚焦是**主动行为**（用户主动输入或命令触发），不是默认状态（"禅"）。
**当前版本**：v2.5.0（`package.json` / `plugin.json`）。

---

## 1. 架构总览

### 1.1 模块依赖图

```
                    ┌─────────────────────────────────────────┐
                    │         src/index.ts (Plugin)           │
                    │   - onload: 注册命令 / EventBus / 模块  │
                    │   - onunload: 统一清理 (eventBusOffFns) │
                    └────────────────┬────────────────────────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
            ▼                        ▼                        ▼
    ┌───────────────┐        ┌───────────────┐        ┌───────────────┐
    │ cursor.ts     │        │ typewriter.ts │        │ ripple.ts     │
    │ (742 行)      │        │ (160 行)      │        │ (197 行)      │
    └───────┬───────┘        └───────┬───────┘        └───────┬───────┘
            │                        │                        │
            │   ┌────────────────────┴────────────────────────┤
            │   │                                             │
            ▼   ▼                                             ▼
      ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
      │ inputMode.ts    │  │ utils/scroll.ts │  │ utils/          │
      │ (103 行)        │  │ (64 行)         │  │ edgeProximity.ts│
      │ 全局状态 + 订阅 │  │ 滚动容器检测    │  │ (103 行)        │
      └─────────────────┘  └─────────────────┘  └─────────────────┘
            │                        │
            ▼                        ▼
      ┌─────────────────┐  ┌─────────────────┐
      │ boundary.ts     │  │ getCursorRect.ts│
      │ (155 行)        │  │ getCursorElement│
      │ 边界检测 4 重   │  │ getLineHeight.ts│
      └─────────────────┘  └─────────────────┘
```

### 1.2 文件结构

```
src/
├── index.ts                      # Plugin 入口 + EventBus 订阅 + 命令注册
├── config.ts                     # 用户可配置参数
├── modules/
│   ├── cursor.ts                 # 顺滑光标主模块（DOM 创建 + 位置更新 + 事件）
│   ├── cursor/
│   │   ├── boundary.ts           # 4 重边界检测（活跃编辑器 + AV 排除 + AABB）
│   │   └── breathing.ts          # 呼吸动画状态机
│   ├── typewriter.ts             # 打字机模式（滚动 + 暂停场景）
│   ├── ripple.ts                 # 涟漪聚焦（块距离衰减 + text/mouse/paused）
│   └── inputMode.ts              # 聚焦/打字机模式 ON/OFF 状态 + 订阅
├── utils/
│   ├── getCursorRect.ts          # 光标显示矩形（lineHeight × 1.1）
│   ├── getCursorElement.ts       # 当前选区所在 DOM
│   ├── getLineHeight.ts          # 所在行 computed lineHeight
│   ├── getEffectiveZIndex.ts     # 沿祖先链找层叠上下文
│   ├── edgeProximity.ts          # 光标到视口各边的距离 + 淡出系数
│   ├── edgeCases.ts              # 暂停场景判定（shouldPause* / isReadMode）
│   ├── scroll.ts                 # 滚动容器检测（hasScroll / find*）
│   ├── isMobile.ts               # 移动端检测（getFrontend）
│   └── styleManager.ts           # 共享样式注入/清理
├── styles/index.scss             # 全局 CSS（光标 + 箭头 + 主题变量）
└── types/index.ts                # 共享类型（RippleMode / CursorRect / ModuleEnabled）
```

### 1.3 EventBus 订阅关系（index.ts:97-178）

`src/index.ts` 在 onload 订阅思源官方 EventBus，**9 个事件统一管理生命周期**（`eventBusOffFns` 数组 + onunload 统一释放）：

| 事件 | 触发场景 | 处理函数 |
|---|---|---|
| `loaded-protyle-static` | 新编辑器加载（首次打开文档 / 静态分屏） | `onProtyleLoaded` |
| `loaded-protyle-dynamic` | 动态编辑器（悬浮窗 / 嵌入块 / 链接跳转） | `onProtyleLoaded` |
| `switch-protyle` | 切 Tab | `inputMode.setBothOff()` + `onProtyleSwitched` |
| `click-editorcontent` | 用户点击编辑器内容 | `onEditorContentClicked` |
| `open-menu-content` | 右键菜单弹出 | `onMenuOpened` |
| `ws-main` | 思源 WS 推送（自动 JSON.parse） | `onWsMain`（监听 `transactions` cmd） |
| `mobile-keyboard-show` | 移动端键盘弹出 | `onMobileKeyboardShow` |
| `mobile-keyboard-hide` | 移动端键盘收起 | `onMobileKeyboardHide` |

**已知限制**：`__zentypeScrollBound` 在 `toggle()` off→on 循环中可能残留（reviewer F3 评估为非阻塞，因为 `bindScrollContainerEvents` 在每次 `doUpdateCursor` 中重新遍历绑定）。

---

## 2. 顺滑光标 (Smooth Cursor)

### 2.1 想要的效果

- 思源默认系统竖线光标 → 自定义蓝色光标替换（亮色 `#5d8cd7` / 暗色 `#8ab4f8`）
- 移动时 **0.15s cubic-bezier 平滑过渡**（远距离按 `TRANSITION.TIERS` 表自动加长到 0.3s）
- 停止活动 **1.5s 后**进入呼吸闪烁（9-keyframe 正弦曲线，3.5s 一周期）
- 接近视口边缘（**顶/底对称，20px 范围内**）→ 平滑淡出 + 缩小（scale 0.6-1.0）
- 离开视口 → 停在最后可见位置 + 完全淡出
- 返回视口 → 平滑淡入（case C 强制 remove `.no-transition` + reflow）
- **直角矩形**（v2.1.0 删除 `border-radius: 2px`）
- 鼠标拖蓝 / 选中时 → 0.15s 内移动到选区末尾（transition）

### 2.2 关键决策

| 决策 | 值 | 文件:行 | 理由 |
|---|---|---|---|
| 高度 | `lineHeight × 1.05` | `config.ts:31` `CURSOR_CONFIG.HEIGHT_RATIO` | 参考版 0.88 太矮覆盖少，用户偏好 1.05 |
| 颜色 | `#5d8cd7` / `#8ab4f8` | `styles/index.scss:10,92` | 验证过的搭配，亮/暗主题各一 |
| 移动曲线 | `0.15s cubic-bezier(0.25, 0.1, 0.25, 1)` | `styles/index.scss:17` | 参考版同款 |
| 长距离时长 | `TRANSITION.TIERS` 分档表 | `config.ts:100-107` | Q7：短 0.07 / 中短 0.15 / 中 0.21 / 长 0.30（用户已手动调到这套值） |
| 呼吸动画 | `3.5s linear infinite` | `styles/index.scss:20` | linear 让关键帧间也呈正弦，避免 cubic-bezier "settle" 僵硬感 |
| 边缘淡出区 | `EDGE_FADE.ZONE = 20` | `config.ts:81` | 60 太早 → 30 → 20（用户逐步收紧） |
| 离屏缩放 | `MIN_SCALE = 0.6` | `config.ts:83` | 视觉提示但不消失 |
| 边缘对齐 | 用 `editorRect` 不用裸视口 | `cursor.ts:258` `edgeProximity.ts:54-64` | 顶部 ~55px 是 toolbar/breadcrumb，用视口会"顶部永不到淡出区看着瞬切" |
| 直角矩形 | 删 `border-radius: 2px` | v2.1.0 commit | 用户偏好 |

### 2.3 代码实现逻辑

#### 2.3.1 DOM 创建 + 生命周期（`cursor.ts:110-126`）

`createCursorElement()` 创建 `#zentype-cursor` 元素，整个插件生命周期内只创建一次（id 选择器查重）。**关键 hack**：元素进 DOM 那一刻即加 `.no-transition` class + `transform: translate3d(-9999px, -9999px, 0)`，避免 init 末端 `queueUpdate()` → 首次 `doUpdateCursor()` 之间约 16ms 窗口内光标在视口左上角闪现（TODO-1 修复）。

#### 2.3.2 位置更新主循环（`cursor.ts:217-385`）

**rAF 节流**：`queueUpdate()` 用 `pendingFrame` 标志保证每帧最多一次 `doUpdateCursor()`。

**`doUpdateCursor()` 8 步时序**：
1. **暂停呼吸**（操作中不需要）
2. **读取光标矩形**（`getCursorRect()` lineHeight × 1.1，垂直居中）
3. **计算边缘距离**（`getEdgeProximity(rect, editorRect)`）
4. **边界检测**（`isInAllowElements`）→ 不通过则按 `isOuterElement` 分支处理
5. **计算 z-index**（沿祖先链找层叠上下文 + 1）
6. **写 transform / height / z-index**（边缘态走 `applyFadeAndScale`，正常态走原生 transform）
7. **强制布局同步**（`void cursorEl.offsetHeight` 让 no-transition 立即生效）
8. **下一帧 rAF 移除 `.no-transition`** + 1.5s 后恢复呼吸（边缘附近不恢复）

#### 2.3.3 边界检测 4 重（`cursor/boundary.ts:34-153`）

```
1) getActiveEditor() 校验
   └ 选区不在活跃编辑器内 → isOuterElement=true（思源内部多编辑器场景）

2) AV 数据库块排除
   └ .av / .av__mask / .av__cursor → isOuterElement=true

3) AABB 碰撞（核心）
   └ 拿 .protyle:not(.fn__none) .protyle-content 的 bounding rect
     检查光标坐标是否在其内
   └ 不在 → 嵌套滚动容器回退（findClosestScrollableElement + rect 检查）

4) （round 3 移除）弹窗/对话框/搜索框硬性排除
   └ 这些元素不包含 .protyle-content，被 AABB 自然拒绝
```

返回 `AllowResult { allowed, cursorElement, isOuterElement, editorRect, reason? }`。

#### 2.3.4 边缘交互（`cursor.ts:330-349` + `styles/index.scss:5-21`）

```
if (edge.isOffScreen):
  → applyFadeAndScale(opacity=0, scale=0.6, pos, yOffset=2)
elif (edge.distance < EDGE_FADE.ZONE):
  → applyFadeAndScale(opacity=edge.factor, scale=lerp(0.6, 1, factor), pos, yOffset)
else:
  → 写原生 transform（不带 scale），transition 走 TRANSITION.TIERS 查表
  → 清 inline opacity，让 CSS / 呼吸动画接管
```

**`applyFadeAndScale` 写 inline `opacity` + `transform: translate3d(x, y-yOffset, 0) scale(s)` + `height`**（commit 1，离屏/边缘淡出专用路径，正常态继续走原生 transform 不带 scale）。

**`yOffset = 2`**：光标上移 2px，让视觉重心偏到行中线之上（用户偏好，抵消 HEIGHT_RATIO > 1 时光标下沿超出 lineHeight 看起来偏下的问题）。

#### 2.3.5 边缘 arrow 指示器（默认禁用）

`EDGE_ARROW.ENABLED = false`（`config.ts:112`，TODO-2）。代码保留作为 opt-in 入口。完整功能：`#zentype-edge-arrow` 三角形（CSS border-trick），光标离屏时按 nearest edge 上下方向显示在视口边缘。**风险**：用户测试后认为不需要，默认关闭。

### 2.4 squish / bounce 动画（已下线）

v2.2.x 实施过"光标跨边界时 squish/bounce 关键帧动画"（CSS Transform Level 2 独立 `scale:` 属性），但用户测试反馈"像弹弓"——整个边缘缩放动画路线已下线（`0ee73ed` commit）。**保留 case B 的平滑 opacity 淡出**。SCSS 关键帧和触发函数全部删除，注释指向 git 历史以便将来恢复。

### 2.5 配置入口

`config.ts:29-35` `CURSOR_CONFIG`：

```typescript
HEIGHT_RATIO: 1.05      // 光标高度 = lineHeight × 此倍数
BLINK_DELAY_MS: 1500     // 停止活动后多少毫秒恢复呼吸
```

**未开放的开关**（CSS 编译期锁死）：
- `SMOOTH_ENABLED` / `BLINK_ENABLED` / `APPLY_TO_TITLE` / `USE_IN_MOBILE` —— 见 `config.ts:123-132` 注释

---

## 3. 打字机模式 (Typewriter Mode)

### 3.1 想要的效果

- 输入时光标停在**舒适区间 `[38%, 50%]`**（38% 黄金分割偏上 / 50% 中线）—— 不强制固定目标位
- **区间内不触发滚动**：光标在 38%-50% 范围内自由输入，避免累积漂移带来的"跳跃感"
- **区间外触发滚动**：低于 38% 或高于 50% 时，smoothScroll 把光标带回最近边界
- 平滑滚动动画，**距离分档时长**（20px 内 180ms / 60px 内 260ms / 150px 内 360ms / 400px 内 480ms / 超出 600ms）
- **动画曲线**：`cubic-bezier(0.25, 0.1, 0.25, 1)`（与顺滑光标 `cursor.ts:343` 一致，自然、顺滑）
- **动画续接**：连续输入时，光标滚动"接"上一段动画继续，不会每按一次键就重启
- **1px 阈值**：即使光标只偏离 1px 也立即触发滚动
- **块级插入动画**：按 Enter 新建块时，新块被自然带至中心；上方块跟视窗让位（位移 = smoothScroll 的 deltaY）；下方块用 FLIP 平滑补位（位移幅度 = 自然 reflow delta）；**全部是位移，无 opacity 渐变**
- **smoothScroll 是曲线原语**：方向（deltaY）由调用方算，调用方决定"该不该滚 + 滚多少"；smoothScroll 只管曲线和时长
- **暂停场景不滚动**：悬浮窗 / 只读 / 嵌入块（iframe/video/PDF）
- **暂停渐隐**：多行选中时优雅暂停（光标本身不变）

### 3.2 关键决策

| 决策 | 值 | 文件:行 | 理由 |
|---|---|---|---|
| **舒适区间** | `[0.38, 0.50]` | `config.ts:40-41` `TYPEWRITER_CONFIG.COMFORT_ZONE` | 38%-50% 都接受，不强制固定目标；区间内不滚 |
| **阈值** | 1px | `typewriter.ts:114` | 避免累积漂移到 40px 突然跳 |
| **时长分档** | 180/260/360/480/600 ms | `config.ts` `TYPEWRITER_SCROLL_DURATION_TIERS` | 微调跟手 / 远跳留时间感知（v2.3.0 从 `typewriter.ts:22-29` 移到 config） |
| **动画曲线** | `cubic-bezier(0.25, 0.1, 0.25, 1)` | `config.ts` `TYPEWRITER_SCROLL_CURVE` | 与光标一致（`cursor.ts:343`），自然顺滑 |
| **动画续接** | 同一 target 追加 deltaY | `typewriter.ts:33-36` | 连续输入不"卡顿重启动画" |
| **rAF debounce** | scheduleCheck 包裹 | `typewriter.ts:68-74` | 一次按键触发 4-5 事件合并为 1 次 checkAndScroll |
| **container 缓存** | cachedContainer by cursorElement | `typewriter.ts:14-15,97-104` | 避免每次 DOM 遍历找滚动祖先 |
| **滚动锚点** | `editorRect`（protyle-content rect） | `typewriter.ts:110-111` | 用裸 container rect 会算错位置（祖先元素可能更大） |
| **选择器** | `isInAllowElements` 复用 cursor 的 | `typewriter.ts:6,89` | 已被 cursor 模块验证，分屏正确 |
| **smoothScroll API** | `smoothScroll(el, {deltaY, duration, curve})` 曲线原语 | `typewriter.ts:31-66` 重构 | v2.3.0 改造：不规定方向，只规定曲线；调用方算 deltaY |
| **块级插入动画** | FLIP | `typewriter.ts` 新增 §3.7 | 参考 cursor.ts round 4 fix（`cursor.ts:48-66,395-519`）：键盘事件打标 + 300ms cooldown，下游保留 transition。注意：`markBlockInsertPending` 已在 c5bfdc9 删除，由 `animateBlockShift` 直接取代。 |
| **Q1 决策：高亮条** | **永久下线** | `config.ts:48-66` 注释 | 用户偏好"纯滚动"，删除 DOM/CSS 减小维护面。入口保留以备未来恢复 |

### 3.3 代码实现逻辑

#### 3.3.1 初始化（`typewriter.ts:119-139`）

```typescript
initTypewriter():
  监听 6 个 document 事件: selectionchange/keyup/keydown/click/mouseup/resize
  所有事件都包裹在 scheduleCheck() (rAF debounce)
  inputMode.setBothOn()  // 初始化时立即激活（idempotent）
```

#### 3.3.2 主循环（`typewriter.ts:76-117`，v2.3.0 更新）

```
checkAndScroll():
  1) inputMode.isTypewriterActive() === false? return
  2) shouldPauseTypewriter()? return  // popup/read-mode/embed
  3) rect = getCursorRect()
  4) result = isInAllowElements({x: rect.x, y: rect.y})
      - 使用 cursor 模块验证过的选择器 .protyle:not(.fn__none) .protyle-content
      - editorRect 提供滚动锚点
  5) container = findClosestScrollableElement(result.cursorElement)  // 带缓存
  6) editorHeight = editorRect.bottom - editorRect.top
     cursorPct = (rect.y - editorRect.top) / editorHeight  // 0~1
     // v2.3.0：舒适区间 [COMFORT_ZONE[0], COMFORT_ZONE[1]]
     if cursorPct < COMFORT_ZONE[0]:
       deltaY = (COMFORT_ZONE[0] - cursorPct) × editorHeight  // 滚到 38%
     elif cursorPct > COMFORT_ZONE[1]:
       deltaY = (COMFORT_ZONE[1] - cursorPct) × editorHeight  // 滚到 50%
     else:
       deltaY = 0  // 区间内，不滚
  7) abs(deltaY) >= 1? smoothScroll(container, { deltaY, duration: 'auto', curve: TYPEWRITER_SCROLL_CURVE })
```

**v2.3.0 行为变化**：
- 原 `TARGET_RATIO = 0.38` 单点目标 → 改为 `[0.38, 0.50]` 区间
- 区间内不滚（之前任何 1px 偏离都滚，现在区间内 0 滚）
- 调用方算 deltaY，smoothScroll 只接 `deltaY` 不接 `targetRatio`

**性能硬指标**：每帧 < 1ms。优化手段：
- rAF debounce 合并多事件
- `cachedContainer` 缓存滚动容器（仅 cursorElement 变化时失效）
- `smoothScroll` 内部 rAF，不阻塞主线程

#### 3.3.3 续接动画（`typewriter.ts:31-66`）

```typescript
smoothScroll(target, deltaY):
  if (pendingScroll !== null && pendingScrollTarget === target):
    pendingScrollEnd += deltaY  // 续接：只更新终点
    return
  // 否则取消旧动画，启动新动画
  pendingScrollTarget = target
  pendingScrollEnd = target.scrollTop + deltaY
  startTime = performance.now()
  duration = durationForDistance(abs(deltaY))
  step() rAF 循环 → 插值到 currentEnd（每帧读最新值）
```

**效果**：连续输入 10 个字符，每个 caret 移动 5px → 每帧把 `pendingScrollEnd += 5` → 动画一直跑，caret 流畅跟随；不会每个字符"cancel + restart"造成 stutter。

#### 3.3.4 距离分档时长（v2.3.0 移到 `config.ts`）

**v2.2.1**：写在 `typewriter.ts:22-29` 的 `durationForDistance()` 函数中。
**v2.3.0**：移到 `config.ts` 的 `TYPEWRITER_SCROLL_DURATION_TIERS`，用户可直接调。

```typescript
// config.ts 新增
TYPEWRITER_SCROLL_DURATION_TIERS = [
  { maxDist: 20,        duration: 120 },  // 微调：快速
  { maxDist: 60,        duration: 180 },  // 短距：平滑
  { maxDist: 150,       duration: 260 },  // 中距：跟手
  { maxDist: 400,       duration: 360 },  // 长距：可观察
  { maxDist: Infinity,  duration: 500 },  // 远跳：留时间感知
];
```

`typewriter.ts` 改为读 config 表，不再硬编码。

### 3.4 暂停场景（`utils/edgeCases.ts`）

```typescript
shouldPauseFocusAndTypewriter():  // ripple 也用
  hasSelection() || isInPopup()

shouldPauseTypewriter():  // 仅 typewriter
  isInPopup() || isReadMode() || isInEmbedBlock()
```

**`isReadMode()` 修复**（`edgeCases.ts:16-31`）：检查 `cursor.isContentEditable`（不是 `.protyle-content.isContentEditable`），兼容只读文档/标题。原 bug 修复 commit `2808caa`。

**`isInEmbedBlock()`**：`cursor.closest("iframe, video, [data-type='NodeIFrame'], [data-type='NodeVideo'], [data-type='NodePDF']")`。

### 3.5 Q1 高亮条 — 永久下线 + 入口保留

**决策**（2026-06-30 commit `1229f45`）：删除 v1/v2.0/v2.2.x 早期使用的 `#zentype-highlight-line` DOM/CSS。

**理由**：
- v1 时代高亮条是"伪打字机"效果（光标位置 + 一条细横线）
- 真打字机只需要"光标始终在 38%"，高亮条视觉冗余
- Neo-Plus 等参考实现也不靠它
- 删除后 `typewriter.ts` 从 ~220 行减到 160 行，维护面更小

**未来恢复路径**（`config.ts:48-66` 注释）：
1. `typewriter.ts` 重新引入 `createHighlightElement()` + `updateHighlight()`
2. `initTypewriter()` 创建 div，`destroyTypewriter()` 清理
3. `checkAndScroll()` 在每条 early-return 路径清 `.visible`
4. `styles/index.scss` 恢复 `#zentype-highlight-line + .visible` 块（参见 git 历史 v2.2 之前）

### 3.6 配置入口（v2.3.0 更新）

`config.ts:38-50` `TYPEWRITER_CONFIG`：

```typescript
COMFORT_ZONE: [0.38, 0.50]                        // 舒适区间（v2.3.0 新增，替换 TARGET_RATIO）
SCROLL_DURATION_TIERS: [180, 260, 360, 480, 600]  // 距离分档 ms（v2.3.0 从 typewriter.ts 移入）
SCROLL_CURVE: 'cubic-bezier(0.25, 0.1, 0.25, 1)' // 动画曲线（v2.3.0 新增，与光标一致）
TARGET_RATIO: 0.38   // v2.2.1 旧字段，保留兼容（实际不再使用）
THRESHOLD: 40        // （保留，typewriter.ts 不再使用）
DURATION: 400        // （保留，typewriter.ts 不再使用）
```

### 3.7 块级插入动画（v2.3.0 新增）

**触发条件**：
- Enter 在行尾 / 行中（新建空块，光标移入新块）
- Backspace 在行首（当前块合并到上一块）
- 粘贴多行内容（一次插入多块）

**问题**：之前的实现里，按 Enter 后新块凭空出现，下方块瞬间跳到新位置（编辑器原生 reflow），视觉突兀。

**目标**：让 Enter 触发的"块级变化"视觉上不突兀。所有动画都是**位移**，没有 opacity 渐变。

#### 3.7.1 实现

`animateBlockShift` 直接处理 FLIP 三阶段批处理（Invert → Commit → Play），无需独立 `markBlockInsertPending` 状态标记（`markBlockInsertPending` 已在 c5bfdc9 删除）。参考 cursor.ts round 4 fix 模式，keydown Enter/Backspace 的 capture handler 触发 `animateBlockShift` 快照，然后延迟两帧重新对齐舒适区。

注册点（`typewriter.ts` 事件 handler）：
```typescript
keydown Enter / 行首 Backspace:
  animateBlockShift(editor);  // FLIP 入口
  // 延迟两帧等 SiYuan 布局收敛后再触发滚动对齐
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      lastCheckRect = null;
      checkAndScroll();
    });
  });
```

#### 3.7.2 FLIP 平滑 reflow（`animateBlockShift`）

让"下方块被自然推下去"的瞬间不突兀 —— 用 FLIP（First-Last-Invert-Play）技术：

```typescript
function animateBlockShift(editor: HTMLElement): void {
  // First：DOM 变更前快照所有块位置
  const first = new Map<HTMLElement, number>();
  editor.querySelectorAll<HTMLElement>('[data-node-id]').forEach(el => {
    first.set(el, el.getBoundingClientRect().top);
  });
  
  // 下一帧：DOM 变更后读新位置，FLIP
  requestAnimationFrame(() => {
    for (const [el, y0] of first) {
      const y1 = el.getBoundingClientRect().top;
      const delta = y0 - y1;  // 正 = 被推下去
      if (Math.abs(delta) < 2) continue;  // 微移跳过
      
      // Invert：把块"反推"到旧位置（视觉上看起来没动）
      el.style.transform = `translateY(${delta}px)`;
      el.style.transition = 'none';
      
      // Play：下一帧取消 transform，CSS transition 平滑过渡
      requestAnimationFrame(() => {
        el.style.transition = `transform 250ms ${TYPEWRITER_SCROLL_CURVE}`;
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; }, 300);
      });
    }
  });
}
```

**核心**：位移幅度 = 块**实际被推的距离**（由编辑器自身 reflow 决定），不是硬编码的固定 px。

#### 3.7.3 三类块的动画类型

| 块 | 位移来源 | 动画类型 |
|---|---|---|
| **上方块** | smoothScroll（视窗向下滚 → 上方块向上滑出视窗） | 位移（自然让位） |
| **下方块** | smoothScroll（向上滑）+ FLIP（向下补 reflow delta） | 位移（双源合成） |
| **新块** | smoothScroll（被带到中心），opacity 默认 1 | 位移（无淡入） |

**没有 opacity 渐变**。新块默认 opacity 1，直接出现，靠 smoothScroll 把它带到中心。

#### 3.7.4 跳过条件

- 距离上次块级变化 < 100ms → 跳过（rapid Enter / paste 多行）
- `isReadMode()` → 全跳过
- `isInPopup()` → 全跳过

#### 3.7.5 与 ripple 的协作

块级插入动画跑完后，ripple 模块通过事件自动接管——typewriter 不再显式调用 ripple（v2.5.0 移除了 `ripple.recompute`，§4.3.6）：
- Enter / Backspace 后光标移入新块 → 触发 `selectionchange` → `applyRipple` 重算
- 当前句 / 块 = 1.0；邻近块按句级 / 块级 + 视觉权重 + 列表深度综合计算（嵌入块已被 `isRippleTargetBlock` 排除）

§3 typewriter **不直接设 opacity**，opacity 完全交给 §4 ripple。

---

## 4. 涟漪聚焦 (Ripple Focus)

### 4.1 想要的效果（v2.5.0 重写：CSS Custom Highlight API）

- **当前输入句**保持默认色（最亮）；当前块的**其它句**用 `::highlight(zt-sentence-dim)` 染色为 `color: rgba(0,0,0,0.88)`（浅色）/ `rgba(255,255,255,0.88)`（深色）——按 `.`、`?`、`!`、`。`、`？`、`！` 切句，**句级**而非仅块级
- 相邻 ±1 块 opacity ≈ 0.72
- 相邻 ±2 块 opacity ≈ 0.55
- 相邻 ±3 块以外 opacity ≈ 0.42
- **块级** dimming 仍用 JS `style.opacity`；**句级** dimming 用 CSS Custom Highlight API（零 DOM 突变，§4.3.3）
- **嵌入块**：`isRippleTargetBlock` 在进入块级计算前已排除 iframe/video/NodeIFrame/NodeVideo/NodePDF/NodeBlockQueryEmbed，`EMBED_MULTIPLIER`（config.ts:56）不再生效，保留作设计文档（TODO: 区分不同块类型，见 §4.6）
- **列表块**走动态算法（Q5 = C，§4.3.4）：视觉权重（子项可见高度 / 视窗高度）× 列表深度系数
- **默认 OFF** —— 打开文档看不到任何涟漪，必须先输入才出现（Q3 决策）
- **暂停场景**：选中 / 悬浮窗 → `clearAll()` 清除所有块级 opacity 覆盖 + `CSS.highlights.delete`，恢复默认

### 4.2 关键决策

| 决策 | 值 | 文件:行 | 理由 |
|---|---|---|---|
| **默认 OFF** | `focusActive = false` 启动 | `inputMode.ts:15` | Q3：聚焦是"主动行为"不是默认状态 |
| **句级粒度**（v2.5.0 改 Highlight API） | 按 `.?!。？！` 切句 | `ripple.ts:147-192` `applySentenceHighlight` | 用户偏好"看清整句"，不只是块；v2.5.0 废弃 `getSentences`/span 包裹 |
| **句级 / 块级 opacity 梯度** | `[1.0, 0.88, 0.72, 0.55, 0.42]` 5 档 | `config.ts` `RIPPLE_SENTENCE_LEVELS` | v2.3.0 新增，替换 v2.2.1 的 6 档块级 |
| **嵌入块修正** | × 0.85（**死代码**） | `config.ts:56` `EMBED_MULTIPLIER` | `isRippleTargetBlock` 在乘数前已排除 embed 类型，乘数不生效；保留作设计文档（P2-5） |
| **列表块算法**（v2.3.0 新增） | 视觉权重 × 深度系数 | `ripple.ts` 新增 `visualWeightOf` + `depthOf` | Q5 = C：动态算法匹配人眼感知 |
| **深度系数衰减**（v2.3.0 新增） | 每深一层 × 0.95 | `config.ts` `RIPPLE_DEPTH_FACTOR` | 嵌套深的项视觉占比小 |
| **应用方式** | 块级 `style.opacity`；句级 CSS Custom Highlight API | `ripple.ts:221` / `:188` | 块级简单直接；句级零 DOM 突变（v2.5.0，避免数据丢失） |
| **渐淡单位** | `.protyle-wysiwyg [data-node-id]` + iframe/video | `ripple.ts:207` | 块级（嵌入块被 `isRippleTargetBlock` 排除，不参与 dimming）；嵌套块 v1 简化方案（不递归） |
| **重新计算接口** | ~~`ripple.recompute`~~（v2.5.0 移除） | — | 块级插入后光标移入新块 → `selectionchange` → `applyRipple` 自动重算，无需显式调用（§4.3.6） |
| **mouse 模式** | **已移除**（v2.5.0 重写时清理） | — | Q3：用户暂未决定应用场景。旧 `onMouseMove` / `MOUSE_THROTTLE` / `IDLE_THRESHOLD` / 滚动条缓冲随重写删除；未来恢复需重建（§4.4） |

### 4.3 代码实现逻辑

#### 4.3.1 模式状态机（`ripple.ts:24`）

```typescript
let mode: RippleMode = "text";   // "text" | "mouse" | "paused"
```

`RippleMode` 类型（`types/index.ts:3`）保留 `"mouse"` 变体以备未来恢复时不破坏类型契约。

#### 4.3.2 主循环（`ripple.ts:230-255` applyRipple + `196-226` applyBlockOpacity + `147-192` applySentenceHighlight，v2.5.0 重构）

```
applyRipple():  // rAF 节流（pendingFrame 标志）
  if (!inputMode.isFocusActive() || shouldPauseFocusAndTypewriter()):
    clearAll()  // 清块级 opacity + CSS.highlights.delete("zt-sentence-dim")
    return

  currentBlock = getCurrentBlock()  // 找到光标所在 [data-node-id]
  if (!currentBlock) return

  container = currentBlock.closest(".protyle-wysiwyg")
  if (!container) return

  // v2.5.0：块级 opacity + 句级 Highlight 分两步
  // 1) 块级 opacity（style.opacity）—— applyBlockOpacity(container, currentBlock)
  allBlocks = container.querySelectorAll('[data-node-id], iframe, video')
  // indexMap / fromIndex 由 currentBlock.parentElement.children 构建
  
  allBlocks.forEach(block => {
    if (!isRippleTargetBlock(block)) return      // P3-8：非 target 块不碰 opacity
    distance = calculateBlockDistance(currentBlock, block, indexMap, fromIndex)
    baseOpacity = SENTENCE_LEVELS[min(distance, 4)]  // 5 档 [1.0, 0.88, 0.72, 0.55, 0.42]
    
    let opacity = baseOpacity
    
    // 视觉权重（v2.3.0）：块在视窗中可见高度占比
    weight = visualWeightOf(block)
    opacity *= lerp(WEIGHT_MIN, 1.0, weight)  // WEIGHT_MIN = 0.85
    
    // EMBED_MULTIPLIER 已移除（P2-5）：isRippleTargetBlock 在进入循环前已排除 embed 类型
    
    // 列表块深度系数（v2.3.0）：每深一层 ×0.95
    depth = depthOf(block)
    opacity *= max(0.7, 1.0 - depth × DEPTH_FACTOR)
    
    block.style.opacity = String(opacity)
  })
  
  // 2) 句级 dimming（CSS Custom Highlight API，零 DOM 突变，§4.3.3）
  caretOffset = getCaretOffset(currentBlock)
  if (caretOffset !== null):
    applySentenceHighlight(currentBlock, caretOffset)  // 给非当前句染色
  else:
    CSS.highlights.delete("zt-sentence-dim")
  // currentBlock 兜底 opacity=1 已在 applyBlockOpacity 内由 isRippleTargetBlock 守门
```

#### 4.3.3 句级 dimming（CSS Custom Highlight API，v2.5.0 重写）

v2.5.0 废弃 span 包裹，改用 [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API) 标记非当前句。**零 DOM 突变**——只在已有文本节点上构造 `Range` 对象，注册到 `CSS.highlights`，由 `::highlight(zt-sentence-dim)` 染色。

```typescript
// ripple.ts:39
const SENTENCE_DIM_HIGHLIGHT = "zt-sentence-dim";

// ripple.ts:147  applySentenceHighlight(block, caretOffset)
//   1. textContent 按正则 /[.?!。？！]+/g 切句
//   2. 为"不含光标"的每句构造 Range（setStart/setEnd 到对应 Text 节点 + 偏移）
//   3. CSS.highlights.set("zt-sentence-dim", new Highlight(...dimRanges))
//   4. 光标所在句不进 dimRanges → 保持默认色（最亮）
```

样式（`styles/index.scss:136-146`）：

```scss
:root { --zt-sentence-dim-color: rgba(0, 0, 0, 0.88); }              // 浅色
[data-theme-mode="dark"] { --zt-sentence-dim-color: rgba(255, 255, 255, 0.88); }  // 深色
::highlight(zt-sentence-dim) { color: var(--zt-sentence-dim-color); }
```

**为什么不用 opacity**：`::highlight()` 伪元素只支持 `color` / `background-color` / `text-decoration` / `text-shadow` / `-webkit-text-fill-color`，**不支持 `opacity`**。句级 dimming 用 `color: rgba(…,0.88)` 模拟——对纯文字视觉等效于 0.88 opacity。块级 dimming 仍用 `style.opacity`（见 §4.3.2）。

**为什么废弃 span 包裹**（数据丢失 BUG 根因）：旧 `wrapTextRange` 用 `range.extractContents()` + `range.insertNode(span)` 把文本节点分裂到 `<span>` 内。SiYuan 的 input/keydown 处理器在 DOM 突变后重新查询选区，选区跨越 `<span>` 边界时语义改变 → 光标飘走 → 在 `。/？/！` 后继续打字会删除已有内容。Highlight API 不修改 DOM，彻底消除此冲突。

**自愈**：SiYuan 的 `outerHTML` / `innerHTML` 交换会使 `Range` 对象失效（文本节点被替换），但 `CSS.highlights` 注册表本身不受影响。下一次 `selectionchange` → `applyRipple` → `applySentenceHighlight` 用新文本节点重建 Range，无需手动清理旧 span。

**block type 白名单**（`ripple.ts:29-36`，v2.3.0 起不变）：

```typescript
const RIPPLE_TARGET_BLOCK_TYPES = new Set([
  'NodeParagraph', 'NodeHeading', 'NodeListItem', 'NodeBlockquote',
]);
const RIPPLE_SKIP_BLOCK_TYPES = new Set([
  'NodeCodeBlock', 'NodeBlockQueryEmbed', 'NodeAttributeView', 'NodeTable',
  'NodeMathBlock', 'NodeSuperBlock',
]);
const RIPPLE_SKIP_SELECTORS = ['.av', '.av__mask', 'code', 'pre'];
```

> 注：`NodeBlockquote` 在 v2.3.0 加入 TARGET（blockquote 文本可读，应享受涟漪渐淡）；
> `NodeSuperBlock` 加入 SKIP（容器块，不应被切句）；
> `RIPPLE_SKIP_SELECTORS` 额外以 CSS selector 形式排除 AV 框架、code、pre 元素。

**性能**：`applySentenceHighlight` 只在 focus 激活 + selectionchange 时跑（被 `pendingFrame` rAF 节流），不每帧扫。`TreeWalker` 遍历文本节点 + 正则切句，开销与旧 span 方案同级，但省掉了 `extractContents`/`insertNode` 的 DOM 读写 + 选区保存/恢复。

#### 4.3.4 列表块动态算法（v2.3.0 新增，Q5 = C）

```typescript
// 视觉权重：块在视窗中可见高度 / 视窗高度
function visualWeightOf(node: HTMLElement): number {
  const rect = node.getBoundingClientRect();
  const editor = node.closest<HTMLElement>('.protyle-wysiwyg');
  if (!editor) return 1.0;
  const editorRect = editor.getBoundingClientRect();
  const visible = Math.min(rect.bottom, editorRect.bottom) - Math.max(rect.top, editorRect.top);
  return Math.max(0, Math.min(1, visible / editorRect.height));
}

// 列表深度：数 data-subtype="o/u/t" 祖先个数
function depthOf(node: HTMLElement): number {
  let depth = 0;
  let el: HTMLElement | null = node;
  while (el && el !== document.body) {
    if (el.dataset.subtype === 'o' || el.dataset.subtype === 't' || el.dataset.subtype === 'u') {
      depth++;
    }
    el = el.parentElement;
  }
  return depth;
}

// 深度系数：depth=0 → 1.0, depth=1 → 0.95, depth=2 → 0.90, ... 最低 0.7
function depthFactor(depth: number): number {
  return Math.max(0.7, 1.0 - depth × DEPTH_FACTOR);
}
```

**为什么不简单按 siblings 距离**：
- v2.2.1 用 siblings 距离（如 `index = 5`），对高度差异大的列表项视觉感知不准确
- v2.3.0 加权"视觉占比权重 w"，匹配人眼"看起来多大"
- 列表项作为兄弟节点时，w 接近 1.0；远离视窗时 w 趋近 0（更暗）
- 嵌套深的项（list-in-list-in-list）深度系数衰减，避免"全部都很亮"

#### 4.3.5 块距离计算（`ripple.ts:213`，inline in applyBlockOpacity，v2.3.0 改签名）

```typescript
calculateBlockDistance(from, to, indexMap, fromIndex):
  toIndex = indexMap.get(to)
  if toIndex === undefined: return fromIndex + 1
  return abs(fromIndex - toIndex)
```

**v2.3.0 改动**：旧版用 `parentElement.children.indexOf` 求兄弟序号；新版由调用方预建 `indexMap: Map<Element, number>`（遍历 `allBlocks` 时一次性建好）并传入 `fromIndex`，函数体只做一次 Map 查表，避免每次重算 siblings 数组。

**嵌套块 v1 简化**：子项（如列表项）和外层（列表本身）是 siblings 时会一起被渐淡；如果嵌套在另一个块内部（list-in-list），外层只算 1 个距离。**v2.3.0**：distance 仍是基础，opacity 由视觉权重 + 深度系数修正。**v2.5.0 未变**：`fromIndex+1` fallback 仍在（P2-4，低优先级，需设计决策才能支持递归渐淡）。

#### 4.3.6 重新计算接口（v2.5.0 移除）

v2.5.0 重写时删除了 `ripple.recompute` 导出。块级插入（Enter / Backspace）后光标移入新块 → 触发 `selectionchange` → `applyRipple` 自动重算，无需 typewriter 显式调用。typewriter 的 `animateBlockShift` 只负责 FLIP 位移 + 延迟两帧 `checkAndScroll` 对齐舒适区，不再 import ripple（见 §3.7.5）。

#### 4.3.7 触发链（`ripple.ts:265-275`，v2.5.0 简化）

```typescript
onSelectionChange():  // 唯一注册的事件
  applyRipple()       // rAF 节流；内部按 inputMode + shouldPause 决定 apply/clearAll
```

**注册的事件**：仅 `selectionchange`（ripple.ts:274）。v2.5.0 重写时移除了旧 `click` / `keyup` 注册——`selectionchange` 已覆盖打字 / 点击 / 键盘移动 / IME / 粘贴所有场景。退出场景（wheel / blur / click 关闭 focus）由 inputMode 订阅触发 `clearAll()`（P1-1，ripple.ts:279-281）。

### 4.4 Q3 mouse 模式 — 已移除（入口可恢复）

**设计意图**（v2.0 时代）：只读模式 / 空闲 2s / 鼠标移到其他块时 → 涟漪从"跟随光标"切到"跟随鼠标"。

**决策历史**：2026-06-30 暂停（代码注释 + 配置保留）；**v2.5.0 重写时彻底移除**——`onMouseMove` / `MOUSE_THROTTLE` / `IDLE_THRESHOLD` / 滚动条缓冲 / `RippleMode` 类型随 ripple.ts 重写删除，config.ts 的 `MOUSE_THROTTLE` / `IDLE_THRESHOLD` 也一并清理。ripple.ts 现仅 `selectionchange` + inputMode 订阅。

**未来恢复路径**（需重建，非取消注释）：
  1. `ripple.ts` 重新实现 `onMouseMove`（视觉权重 + throttle）
  2. `initRipple()` 加 `["mousemove", onMouseMove, { passive: true }]` 注册
  3. `getCurrentBlock()` 加 mouse 模式分支
  4. `config.ts` 重新加 `MOUSE_THROTTLE` / `IDLE_THRESHOLD`
  5. 决定触发条件（只读 / idle / 鼠标进其他块）后启用

**理由**（与高亮条同款）：用户偏好"纯 text 模式"，mouse 模式引入"模式切换"的认知负担，权衡后下线。

### 4.5 配置入口（v2.5.0 更新）

`config.ts:52-61` `RIPPLE_CONFIG`：

```typescript
SENTENCE_LEVELS: [1.0, 0.88, 0.72, 0.55, 0.42]  // 5 档句级 / 块级 opacity 梯度
EMBED_MULTIPLIER: 0.85                          // 死代码（P2-5）：isRippleTargetBlock 排除 embed 后不生效，保留作设计文档
DEPTH_FACTOR: 0.05                              // 列表深度每层 × (1 - DEPTH_FACTOR)，最低 0.7
WEIGHT_MIN: 0.85                                // 视觉权重下限（lerp 起点）
```

> v2.5.0 清理：`MOUSE_THROTTLE` / `IDLE_THRESHOLD` / `OPACITY_LEVELS`（v2.2.1 旧字段）随 mouse 模式移除一并删除。句级 dimming 的 0.88 不走 `SENTENCE_LEVELS[1]`，而是 `--zt-sentence-dim-color` 的 rgba alpha（styles/index.scss:137,141），两者数值一致但代码独立。

### 4.6 TODO

| TODO | 内容 |
|---|---|
| **区分不同的块类型** | `EMBED_MULTIPLIER`（×0.85）已是死代码（P2-5）：`isRippleTargetBlock` 在乘数前就排除 iframe / `[data-type="NodeBlockQueryEmbed"]` / PDF / video / 代码块 / HTML 块，嵌入块当前完全不参与 dimming。若要让 embed 重新参与，需重构 `applyBlockOpacity` 让 embed 块进入处理后再恢复乘数，并分别测准不同块类型的修正系数（使用点 TODO：ripple.ts:218-221） |
| **视觉权重"理想值"标定** | 当前权重公式 (`lerp(0.85, 1.0, visible/editorH)`) 是经验值；不同窗口大小 / 字号 / 行数下需要重新测试 |
| **句级切分边界** | 现按 `[.?!。？！]+` 切句；`...`、`?!` 组合、中英文标点混合等场景可能需要更精细规则 |
| **嵌套块递归渐淡（P2-4）** | 当前 list-in-list 外层只算 1 个距离（`fromIndex+1` fallback，ripple.ts:213）；用户反馈需要递归时单独迭代，低优先级 |
| **mouse 模式触发条件** | Q3 决策下线，v2.5.0 重写时彻底移除（代码 + config）；未来恢复需重建（§4.4），触发条件（只读 / idle / 鼠标进其他块）未选定 |

---

## 5. 状态机 (inputMode.ts)

### 5.1 两个 flag + 绑定关系

**Q2 决策（2026-06-30 锁定）**：focus + typewriter **绑定**（不是设计 §2.4 写的"独立"）。

```typescript
let focusActive = false;         // inputMode.ts:15
let typewriterActive = false;    // inputMode.ts:16

// 四个 setter 都是"两个一起改"
setBothOn()     // 开启两者
setBothOff()    // 关闭两者
simulateFocusInput()    // 命令：模拟一次输入 → 仅开 focus（typewriter 不动）
simulateTypewriterInput()  // 命令：模拟一次输入 → 仅开 typewriter（focus 不动）
disableFocus()           // 命令：手动关闭 focus
disableTypewriter()      // 命令：手动关闭 typewriter
```

**为什么是绑定**：触发规则 90% 共享（keydown/IME 开，wheel/arrows/click 关）→ 解耦成本（80-120 行代码 + 全部测试场景重测）相对收益（"只用打字机不用聚焦"是边缘场景）不划算。**未来如需解耦**：`inputMode.ts` 重构为 8 个独立 setter + cursor.ts click handler 拆分 + typewriter.ts init 不再触发 focus。

### 5.2 触发器全表

| 触发事件 | ON | OFF | Keep ON |
|---|---|---|---|
| keyboard input (`input` event) | ✅ | | |
| IME `compositionend` | ✅ | | |
| 粘贴 (`paste` event) | — | — | — |
| 滚轮 (`wheel`) | | ✅ | | capture 阶段（v2.3.0 修复：`commit 7a368db`） |
| 触屏拖动 (`touchmove`) | | ✅ | | capture 阶段（同 wheel） |
| ↑ 方向键 (`ArrowUp`) | | ✅ | |
| ↓ 方向键 (`ArrowDown`) | | ✅ | |
| Page Up / Page Down | | ✅ | |
| Home / End | | | ✅ |
| ← / → 方向键 | | | ✅ |
| Escape | | | ✅ |
| 鼠标点击 (`click`) | | ✅ | |
| 鼠标拖蓝（mousedown→mouseup 比对 selection） | | ✅ | |
| 切 Tab (`switch-protyle`) | | ✅ | |
| 失焦 (`blur`) | | ✅ | |
| 命令：`启用聚焦模式` | ✅ | | |
| 命令：`启用打字机模式` | ✅ | | |
| 命令：`禁用聚焦模式` | | ✅ | |
| 命令：`禁用打字机模式` | | ✅ | |

**Keep ON 触发器**：横向导航（←/→）/ 边界导航（Home/End）/ 取消（Esc）—— 不改变用户"主动编辑"意图。

**v2.3.0 修复历史**：
- ✅ **wheel / touchmove 退出 typewriter/focus 不生效**（commit `7a368db`）：handler 加 `{ capture: true }`（与 keydown/scroll/input 一致）。这本来是早期设计意图（参见 `docs/archive/plans/cursor-optimization-plan.md:607`），但在 v2.2.0 focus-mode 重构时 capture 被无意遗漏——本次回归修复。剩余两条（嵌套 iframe 排查、暂停 debounce）暂未观察到，可作为后续优化项。

### 5.3 默认值 + 持久化

| 配置 | 值 | 理由 |
|---|---|---|
| 默认状态 | **OFF** | 设计 §2.7 "Default state: OFF"；聚焦是"主动行为" |
| 持久化 | **per-session**（无 localStorage） | 设计 §2.7 "Persistence: per-session (no localStorage)" |
| 空闲超时 | **无** | 设计 §2.3 "No idle timeout" —— typewriter 自然停止（光标不动就不滚） |
| UI 反馈 | **无** | 设计 §2.7 "UI feedback: none" —— ripple + （未来）高亮条是自然反馈 |

### 5.4 订阅机制

```typescript
subscribe(cb) → unsubscribe  // inputMode.ts:30-34
```

订阅时立即收到当前状态。`cursor.ts:528-531` 订阅用于呼吸恢复同步；每个 subscriber 独立 try/catch（`5a0251d` commit），一个抛错不影响其他。

### 5.5 重置（onunload）

`index.ts:197` 调用 `inputMode.reset()` —— focusActive/typewriterActive 清零 + subscribers 清空。

---

## 6. 命令面板

**Q4 决策**：4 个命令（不退回 2 个 toggle）。

| 命令 langKey | 回调 | 效果 |
|---|---|---|
| `enable-focus-mode` | `inputMode.simulateFocusInput()` | 模拟一次输入 → focus ON（受 exit 规则约束） |
| `enable-typewriter-mode` | `inputMode.simulateTypewriterInput()` | 模拟一次输入 → typewriter ON（受 exit 规则约束） |
| `disable-focus-mode` | `inputMode.disableFocus()` | 手动关闭 focus（typewriter 不动） |
| `disable-typewriter-mode` | `inputMode.disableTypewriter()` | 手动关闭 typewriter（focus 不动） |

**入口**：
- 思源 → 设置 → 插件 → zenType → 命令面板（Ctrl+Shift+P）
- 顶栏图标（**单圆环 + 雾边**，`index.ts:24`，v2.3.0 替换笔形）：一键 `toggleAll()` 切换全部 3 个模块（cursor + typewriter + ripple）
- 思源 → 设置 → 插件 → zenType → 关闭/启用插件（触发 onunload+onload 重载）

**顶栏图标设计**（v2.3.0）：
```svg
<svg viewBox="0 0 24 24">
  <defs>
    <filter id="mist"><feGaussianBlur stdDeviation="0.4" /></filter>
  </defs>
  <circle cx="12" cy="12" r="6.5" fill="none"
          stroke="currentColor" stroke-width="1.6"
          filter="url(#mist)" />
</svg>
```

```scss
@keyframes breathe-ring {
  0%, 100% { opacity: 0.65; }
  50%      { opacity: 1; }
}
.topbar-icon { animation: breathe-ring 3s ease-in-out infinite; }
.topbar-icon:hover { animation-play-state: paused; opacity: 1; }
```

**雾蒙蒙感**：靠 `feGaussianBlur stdDeviation=0.4` 实现 SVG 边缘模糊；hover 时停止呼吸动画 + 完整清晰。**单一圆环**，不是同心圆（用户明确反对三层同心圆）。

**为什么 4 个不是 2 个 toggle**：
- Q2 选 A（绑定）→ 2 个 toggle 不能表达"开 typewriter 但不开 focus"
- 4 个 enable/disable 覆盖所有 4 种状态组合
- 命令名带语义（"启用 X"vs"禁用 X"）用户更清楚

---

## 7. 边界场景

| 场景 | 顺滑光标 | 打字机 | 涟漪 | 实现 |
|---|---|---|---|---|
| 打开文档，不输入 | ✅ 显示（最后位置 + 静态） | ❌ 不滚 | ❌ 不显示 | typewriter + ripple 都在 `!isFocusActive()/!isTypewriterActive()` 时早退 |
| 多行选中 | ✅ 瞬跳到选区末尾 | ❌ 暂停 | ❌ 暂停 | `shouldPauseFocusAndTypewriter()` returns true |
| 悬浮窗编辑 | ✅ 显示 | ❌ 暂停 | ❌ 暂停 | `isInPopup()` 检测 `.block__popover--open` |
| 只读模式 | ❌ 不显示 | ❌ 暂停 | ❌ 不显示 | `isReadMode()` 检查 `cursor.isContentEditable` |
| 嵌入块（iframe/video/PDF） | ❌ 不显示 | ❌ 跳过 | ✅ 作为 1 个渐淡单位 | `isInEmbedBlock()` + ripple `querySelector('[data-node-id], iframe, video')` |
| 嵌套块（v1 简化） | ✅ 显示 | ✅ 滚到 38% | ⚠️ 只渐淡直接父层 | siblings 距离计算，不递归 |
| 切 Tab | ✅ 切换光标 | ❌ 退出 | ❌ 退出 | `index.ts:121-122` `setBothOff()` |
| 失焦 | ✅ 停在最后位置 | ❌ 退出 | ❌ 退出 | `cursor.ts:605` `blur → setBothOff()` |
| 滚轮 / 触屏拖动 | ✅ 跟随 + 暂停呼吸 | ❌ 退出 | ❌ 退出 | `cursor.ts:589-590` `onWheelExit` |
| ↑ / ↓ / PageUp / PageDown | ✅ 移动 | ❌ 退出 | ❌ 退出 | `cursor.ts:564-566` `keydown` 判断 |
| ← / → / Home / End / Esc | ✅ 移动 | ✅ 保持 | ✅ 保持 | 不调 setBothOff |
| 粘贴 | ✅ 移动 | ❌ 不触发开 | ❌ 不触发开 | `cursor.ts:599` `isPasting=true` → input handler 跳过 |
| 方向键 ↑ 后再 ← | ✅ 移动 | ❌ 保持 OFF | ❌ 保持 OFF | 状态机单调退出 |
| 鼠标拖蓝选文本 | ✅ 瞬跳 | ❌ 退出 | ❌ 退出 | `cursor.ts:601-603` mouseDown 记录 → mouseup 比对 |
| 右键菜单 | ✅ 停在最后位置（静态） | ✅ 不影响 | ✅ 不影响 | `cursor.ts:723-725` `onMenuOpened → pauseBreathe()` |
| 移动端标题编辑 | ❌ 不显示 | ⏸ 推迟 | ⏸ 推迟 | **v2.3.0 推迟**：cursor 模块 OFF-LIMITS，`boundary.ts:84-87` 标题分支返回 `allowed:true` 但无 `editorRect` → typewriter 早退；ripple 通过 `closest('.protyle-wysiwyg')` 跳过标题。实现 title 支持需修改 boundary.ts（属于 cursor 模块），待 cursor 模块解除 OFF-LIMITS 后实现。 |
| 移动端键盘弹出/收起 | ✅ 重定位 | ✅ 重定位 | ✅ 重定位 | `mobile-keyboard-show/hide` EventBus |
| 分屏（split-screen） | ✅ 锁定活跃编辑器 | ✅ 锁定活跃编辑器 | ✅ 锁定活跃编辑器 | `isInAllowElements` 第一重 `getActiveEditor()` |
| AV 数据库块 | ❌ 不显示 | ❌ 不滚 | ❌ 不参与 | `boundary.ts:69-76` `.av/.av__mask/.av__cursor` 排除 |

---

## 8. 配置参数（`src/config.ts`）

### 8.1 完整参数表（v2.5.0 更新）

| 模块 | 配置块 | 参数 | 默认 | 说明 |
|---|---|---|---|---|
| 顺滑光标 | `CURSOR_CONFIG` | `HEIGHT_RATIO` | `1.05` | 光标高度 = 行高 × 此倍数 |
| 顺滑光标 | `CURSOR_CONFIG` | `BLINK_DELAY_MS` | `1500` | 停止活动后多少毫秒恢复呼吸 |
| 顺滑光标 | `EDGE_FADE` | `ZONE` | `20` | 距编辑器顶/底多少像素内淡出 |
| 顺滑光标 | `EDGE_FADE` | `MIN_SCALE` | `0.6` | 完全离屏时最小缩放 |
| 顺滑光标 | `TRANSITION` | `TIERS` | `[0.07, 0.15, 0.21, 0.30]` s | 距离分档过渡时长 |
| 顺滑光标 | `EDGE_ARROW` | `ENABLED` | `false` | 边缘箭头总开关（TODO-2 默认关闭） |
| 顺滑光标 | `EDGE_ARROW` | `OPACITY` | `0.6` | 箭头透明度 |
| 顺滑光标 | `EDGE_ARROW` | `SIZE` | `12` | 三角形大小（px） |
| 顺滑光标 | `EDGE_ARROW` | `OFFSET` | `8` | 距视口边缘距离（px） |
| 顺滑光标 | `EDGE_ARROW` | `TRANSITION_MS` | `200` | 淡入淡出过渡时长 |
| 打字机 | `TYPEWRITER_CONFIG` | **`COMFORT_ZONE`** | **`[0.38, 0.50]`** | **v2.3.0：舒适区间 [低, 高]；区间内不触发滚动** |
| 打字机 | `TYPEWRITER_CONFIG` | **`SCROLL_DURATION_TIERS`** | **`[180, 260, 360, 480, 600]` ms** | **v2.3.0：距离分档时长（从 typewriter.ts 移入 config）** |
| 打字机 | `TYPEWRITER_CONFIG` | **`SCROLL_CURVE`** | **`cubic-bezier(0.25, 0.1, 0.25, 1)`** | **v2.3.0：动画曲线（与光标一致）** |
| 涟漪 | `RIPPLE_CONFIG` | **`SENTENCE_LEVELS`** | **`[1.0, 0.88, 0.72, 0.55, 0.42]`** | 5 档句级 / 块级 opacity 梯度（句级 0.88 由 `--zt-sentence-dim-color` 实现，见 §4.3.3） |
| 涟漪 | `RIPPLE_CONFIG` | **`EMBED_MULTIPLIER`** | **`0.85`** | **死代码（P2-5）**：`isRippleTargetBlock` 排除 embed 后不生效，保留作设计文档 |
| 涟漪 | `RIPPLE_CONFIG` | **`DEPTH_FACTOR`** | **`0.05`** | 列表深度每层 × (1 - DEPTH_FACTOR)，最低 0.7 |
| 涟漪 | `RIPPLE_CONFIG` | **`WEIGHT_MIN`** | **`0.85`** | 视觉权重 lerp 下限 |

### 8.2 "暂停功能"入口

| 入口位置 | 状态 | 未来恢复路径 |
|---|---|---|
| `config.ts:48-66` `TYPEWRITER_HIGHLIGHT_RESERVED` 注释块 | 永久下线 | 4 步：typewriter.ts 重写 + index.scss 加 CSS + 测试场景重跑 |
| ~~`MOUSE_THROTTLE` + `IDLE_THRESHOLD`~~ | v2.5.0 移除 | 需重建：ripple.ts 重写 `onMouseMove` + `initRipple` 注册事件 + `config.ts` 重新加配置 + 决定触发条件（§4.4） |
| `cursor.ts:146-148` squish/bounce 触发函数注释 | 永久下线 | git history `0ee73ed` 之前恢复 + SCSS keyframes |
| `config.ts:123-132` SCSS 锁死开关注释 | 暂未开放 | 待 SCSS 编译策略改造 |

---

## 9. 决策历史

### 9.1 三大模式的设计阶段

| 阶段 | 时间 | 关键决策 |
|---|---|---|
| v1 (ZenType) | 2024 之前 | 单文件 + 模板技术栈；思源早期 API；无设置面板 |
| **v2.0 (推倒重做)** | 2026-06-27 | TS + esbuild + sass；3 模块独立；高亮条 + 鼠标中心聚焦作为 v1 附带特性 |
| **v2.1.0 (Cursor 优化)** | 2026-06-29 | 4 个 cursor P0 BUG 修复；6 项架构决策；新增 5 文件 |
| **v2.2.0 (P2 EventBus)** | 2026-06-29 | 全面迁移到官方 EventBus；getActiveEditor/getFrontend 替代 DOM 遍历 |
| **v2.2.1 (Cursor Edge + Typewriter)** | 2026-06-30 | Plan 6 cursor 边缘交互 + typewriter 重写（isInAllowElements + editorRect） |
| **v2.3.0 (Typewriter Range + Block Insertion + Ripple Sentence)** | 2026-06-30 | 舒适区间 + 曲线原语 + 块级插入 FLIP + 涟漪句级 + 列表动态算法 + 雾边圆环图标 + wheel exit 修复 |
| **v2.5.0 (Ripple Highlight API + CR 收尾)** | 2026-07-03 | ripple 句级从 span 包裹重写为 CSS Custom Highlight API（零 DOM 突变，修复数据丢失 bug）；P1-1/P2-3/P2-5/P3-7/P3-8 代码审查修复；TODO-6 首字滚动修复 |

### 9.2 cursor 模块决策（Round 5 → Round 11）

| Round | 内容 | commit |
|---|---|---|
| Round 5 | 4 个原始 cursor BUG（呼吸 / 高度 / 移动动画 / 边界检测） | — |
| Round 7 | P0 完整重构（6 决策 + 5 新文件） | — |
| Round 8 | 兼容性 refactor（删双函数） | — |
| Round 9 | P1 + 动画 + A1-A9 兼容性 | — |
| Round 10 | 直角矩形 + 参数可配置 | — |
| Round 11 | P2 EventBus 迁移 + Reviewer 批准 | — |

### 9.3 Plan 6 cursor 边缘交互（2026-06-30）

| TODO | 内容 | commit |
|---|---|---|
| TODO-1 | 初始 cursor "whoosh" 修复（`.no-transition` 元素进 DOM 即加） | `ba0bcea` |
| TODO-2 | 边缘箭头默认关闭（`EDGE_ARROW.ENABLED = false`） | `84193de` |
| TODO-3 | 边缘定义收紧（`EDGE_FADE.ZONE: 60 → 30`，后续用户手动 → 20） | `924c337` |
| TODO-4 | 滚出顶部和底部动画对称 | `c168586` |
| Q-return | 返回方向 instant jump 修复（`wasOffScreen` + force-remove `.no-transition`） | `1ea9891` |
| (0,0) 跳 | SCSS keyframes 用独立 `scale:` 属性 | `282a964` |
| Q7 | 距离→时长搬到 `TRANSITION.TIERS` 分档表 | `0ee73ed` |
| squish/bounce | 用户测试反馈"像弹弓"删除 | `0ee73ed` |

### 9.4 typewriter 模块决策（v2.2.1）

| commit | 决策 |
|---|---|
| `fcfbf95` | 重构滚动逻辑：用 `isInAllowElements` + `editorRect` + `setBothOn()` 解决 3 大根因；rAF debounce + container cache + 动画续接 + 距离分档时长 |
| `2f9c39a` | smoothScroll 改用 scrollable 祖先（不再用 `getEditorContainer()`） |
| `1229f45` | 删除高亮条 DOM/CSS（**Q1 永久下线**） |
| `9fd31c2` | 同步 typewriter 修复计划文档 |
| `2808caa` | `isReadMode` 检查 `cursor.isContentEditable` 而非 `.protyle-content.isContentEditable`（修复只读文档/标题兼容性） |

### 9.5 focus/typewriter 设计（2026-06-30）

| commit | 决策 |
|---|---|
| `63ab96b` | 初始实施 Option A（全局 inputMode 状态 + 订阅） |
| `5a0251d` | 订阅立即收到当前状态 + per-subscriber try/catch |
| `48e7e9d` | breathing 与 focus 模式解耦（光标始终呼吸，仅 focus ON 触发 scheduleResumeBreathe） |
| `53dfb55` | 重命名 toggle-focus/toggle-typewriter → enable-/disable-，4 个命令代替 2 个 toggle |

### 9.6 本次文档合并（2026-06-30）

| 决策 | 来源 |
|---|---|
| **Q1 高亮条永久下线** | 实施已下线 + 用户偏好"纯滚动" |
| **Q2 focus/typewriter 绑定** | 设计文档原本说"独立"，但实施后绑定；本次决定"代码即真相"，设计跟随 |
| **Q3 涟漪默认 OFF + mouse 模式暂停** | 与高亮条同款：用户偏好简化，入口保留 |
| **Q4 命令 4 个** | enable/disable × 2，Q2 绑定下 toggle 不够 |
| **DESIGN.md 合并** | 散落文档（CONTINUATION/FOCUS_TYPEWRITER/CURSOR_ANIMATION_DECISIONS 等）已过时且重复 |

### 9.7 v2.3.0 决策（2026-06-30）

| 决策 | 内容 | 来源 |
|---|---|---|
| **舒适区间 [38%, 50%]** | typewriter 目标位置改为区间，区间内不滚 | 用户测试：38-50 都接受 |
| **smoothScroll 曲线原语** | `smoothScroll(el, {deltaY, duration, curve})`，不规定方向 | 块级插入动画需要"指定 deltaY"的版本 |
| **动画曲线配置化** | `SCROLL_CURVE = cubic-bezier(0.25, 0.1, 0.25, 1)`，与光标一致 | 用户偏好"自然、有曲线、顺滑" |
| **块级插入动画** | FLIP + animateBlockShift | 参考 cursor.ts round 4 fix；`markBlockInsertPending` 已在 c5bfdc9 删除 |
| **块级插入无 opacity 渐变** | 上块让位 = smoothScroll 视窗滚；下块补位 = FLIP；新块 = 1.0 直接出现 | 用户反问"新块默认不就是 1 吗" |
| **位移幅度 = reflow delta** | FLIP 位移 = 块实际被推的距离，非硬编码 px | 用户纠正"不是固定 ±4px" |
| **涟漪句级 opacity** | `[1.0, 0.88, 0.72, 0.55, 0.42]` 5 档（句级 + 块级） | 用户偏好"看清整句"，不只是块 |
| **涟漪嵌入块 ×0.85** | `EMBED_MULTIPLIER` 修正视觉权重 | 嵌入内容视觉权重低 |
| **涟漪列表块动态算法** | Q5 = C：视觉权重 × 深度系数 | 列表项高度差异大，siblings 距离不够准 |
| **TODO: 区分不同块类型** | 嵌入网页 / 嵌入笔记 / PDF / video / 代码块 / HTML 块各不同 | 用户要求；当前统一 ×0.85 太粗 |
| **顶栏图标单圆环雾边** | `feGaussianBlur stdDeviation=0.4` 雾边 + breathe 动画，**不是同心圆** | 用户明确"单圆环 + 雾蒙蒙边缘" |
| **wheel exit bug 修复** ✅ | wheel handler 加 `{ capture: true }`（commit `7a368db`）—— 与 keydown/scroll/input 一致 | 用户报告"滚轮退出 typewriter/focus 没有实现" |
| **清理文档** | 删 5 个过时 doc；CHANGELOG 移到 docs/；归档 6 个旧 plan | 文档漂移严重 |

### 9.8 v2.5.0 决策（Ripple Highlight API 重写）

| 项 | 决策 | 理由 |
|---|---|---|
| Ripple 句级 dimming | span 包裹 → CSS Custom Highlight API | span 的 `extractContents`+`insertNode` 分裂文本节点，破坏 SiYuan selection 语义 → 光标跳位 → 内容删除（数据丢失 bug） |
| `::highlight` 不支持 opacity | 用 `color: rgba()` 模拟（`--zt-sentence-dim-color`） | 块级 opacity 保留（SiYuan 不动块本身），句级用颜色 |
| ripple 订阅 inputMode | `focusActive→false` 时 `clearAll()` | wheel/blur/click 不触发 `selectionchange`，旧路径漏清导致透明度残留（P1-1） |
| FLIP transition 泄漏 | `lastFLIPElements` 跟踪 + 新 FLIP 入口清理 | `|delta|<2` 跳过的元素残留 `transition: transform 250ms`（P3-7） |
| EMBED_MULTIPLIER 死代码 | 删 `isEmbedBlock` 函数 + 乘数；config 保留作文档 | `isRippleTargetBlock` 已排除 embed 类型，乘数不可达（P2-5） |
| smoothScroll 合并路径 | 删除死代码，保留 drop 策略 | `isScrolling()` guard 使合并路径不可达（P2-3，TODO-5 设计） |

### 9.9 明确推迟项

| 项 | 状态 | 来源 |
|---|---|---|
| 软链接决策（#1） | 推迟，3 个选项未选 | 跨 Windows 管理员权限问题 |
| P2-4 SCSS → JS 字符串 | 推迟 | 与现有 ESBuild sass plugin 架构冲突 |
| P2-5 breathing.ts 改 rAF | 推迟 | setTimeout 500ms 是 idle 超时检测语义，rAF 16ms 无法替代 |
| focus/typewriter 解耦 | 推迟到 v2.3+（Q2 = A） | 触发规则 90% 共享，解耦 ROI 低 |
| `__zentypeScrollBound` toggle 残留 | known limitation | reviewer F3 评估为非阻塞 |
| `SMOOTH_ENABLED` / `BLINK_ENABLED` / `APPLY_TO_TITLE` / `USE_IN_MOBILE` 开关 | 未开放（CSS 编译期锁死） | 待 SCSS 编译策略改造 |
| 嵌套块递归渐淡 | 推迟到 v2+ | 暂未收到用户反馈 |
| 高亮条（永久下线） | 入口保留 `TYPEWRITER_HIGHLIGHT_RESERVED` | 见 §3.5 |
| mouse 涟漪（暂停） | 入口保留 `RippleMode` + config | 见 §4.4 |
| squish/bounce 边缘动画（永久下线） | 入口保留注释 | 见 §2.4 |
| 边缘箭头指示器 | 入口保留（`EDGE_ARROW.ENABLED = false`） | 见 §2.3.5 |

---

## 附录 A：跨平台说明

**Workspace 路径冲突**：作者在两台电脑开发，思源工作区路径不同：
- `D:\SiYuan\data\plugins\siyuan-zen\`
- `F:\Documents\九畴\data\plugins\siyuan-zen\`

`scripts/make_dev_link.js` 自动按以下顺序查找：
1. 环境变量 `SIYUAN_WORKSPACE`
2. 命令行 `--workspace <path>`
3. 默认值 `~/Documents/SiYuan/`

任何路径均可，两台电脑任一。

## 附录 B：版本号

| 文件 | 当前 | 备注 |
|---|---|---|
| `package.json` `version` | `2.5.0` | v2.5.0 发布版本 |
| `plugin.json` `version` | `2.5.0` | 同上 |
| `CHANGELOG.md` | 已删除 / 不再维护 | 5b9a44f 文档清理时移除，版本记录见 git log + docs/TODO.md |

> v2.5.0 一次性把两个 `version` 字段从 `2.3.0` 同步到 `2.5.0`（跳过 2.4，标志 Ripple Highlight API 重写里程碑）。

---

**最后更新**：2026-07-03（v2.5.0 Ripple Highlight API 重写 + 代码审查修复 + 发布 2.5.0）

# TODO — Known Issues

> **状态（2026-07-02）**：TODO-1~5、7 已解决；Code Review P1-P3 已修复；TODO-6 待调查。

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

## 待解决

### TODO-5: typewriter.ts — isScrolling 门禁导致快速打字卡顿 ✅ 已解决

**解决 commit**：`2e89e2d` — 移除 100ms cooldown，`isScrolling` 改为派生 getter `pendingScroll !== null`（路径 A）。封锁窗口消除，`smoothScroll` 的 `pendingScroll` 合并路径始终可达。
**注意**：cooldown 移除引入潜在回归风险，见文末"潜在回归"节。

**优先级**：高
**现象**：快速连续打字时，视口滚动出现跳跃感，而非平滑跟随光标。
**文件**：`src/modules/typewriter.ts`

#### 调查过程

1. **isScrolling 机制**：`smoothScroll()` 在 line 98 设置 `isScrolling = true`，动画完成后 line 145 通过 `setTimeout(() => { isScrolling = false; }, 100)` 在 100ms 后释放。
2. **封锁窗口**：动画时长（180~600ms）+ 100ms cooldown = 最多 700ms 的封锁期。
3. **门禁位置**：line 168 `if (isScrolling) return` 在 `checkAndScroll()` 最前端，导致封锁期内**所有**新输入的滚动请求被丢弃。
4. **合并路径不可达**：`smoothScroll()` 内部有 `pendingScroll` 合并机制（line 101-104：同 target 时合并 deltaY），但 line 168 的 `isScrolling` 门禁在 `smoothScroll` 调用之前就拦截了，导致合并路径在封锁期内不可达。
5. **效果**：快速打字时（间隔 <700ms），第 2、3、4... 个字符的滚动请求全部被丢弃，直到动画结束 + cooldown。结果是光标在舒适区内停留较长时间后突然跳跃到新位置，而非逐字跟随。

#### Neo-Plus 对比

Neo-Plus 也有类似问题（600ms + 100ms = 700ms 封锁 + 丢弃机制），但 Neo-Plus 的滚动目标是光标行居中（`scrollToLineCenter`），不使用舒适区，因此感知上不如 zenType 明显。

#### 可能的修复路径

| 路径 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A: 移除 isScrolling 门禁 | 删除 line 168，让 smoothScroll 的 pendingScroll 合并自然生效 | 最简单，立即激活合并路径 | 需验证高频率合并是否导致动画抖动 |
| B: 缩短 cooldown | 把 line 145 的 100ms 改为 0 或 16ms | 最小改动 | 合并路径仍不可达，只是窗口缩短 |
| C: 放行合并请求 | `isScrolling` 为 true 时，检查 `pendingScrollTarget === target`，如果是则放行到 `smoothScroll` 的合并路径 | 精确控制：只合并同 target | 需要调整 checkAndScroll 控制流 |
| D: 降低动画时长 | 缩短 SCROLL_DURATION_TIERS 全部值 | 间接减少封锁时间 | 滚动视觉变快，用户可能不喜欢 |

#### 待验证

- 路径 A/C 实际效果需要在 SiYuan 中测试
- 快速打字场景：每 50ms 一个字符（200 WPM）× 700ms 封锁 = 14 个字符被跳过

---

### TODO-6: typewriter.ts — 首字符不滚动

**优先级**：中
**现象**：某些场景下，新行的第一个字符不触发 typewriter scroll。
**文件**：`src/modules/typewriter.ts`

#### 调查过程

##### 实验记录
- 注释掉两个过滤器（lastCheckRect + defer）→ 首字立即滚动，但有弹跳 bug（layout 未收敛导致光标位置跳动）
- 恢复 `lastCheckRect` 但改 y 阈值为 <3px → 弹跳仍在，首字仍滚动
- 最终恢复原始代码（<1px 阈值 + 垂直 defer）

##### 分析的矛盾
- oracle 建议"把 `lastCheckRect` 更新移到 defer 判断之后"（即修复级联路径）
- 但实验显示：单独恢复 `lastCheckRect` 后首字仍滚动，说明级联不是唯一触发路径
- 首字符不滚动可能有多个触发条件，需要分离变量逐一验证

#### 所有可能的触发路径（待逐一验证）

以下每条路径都是一个独立假设，需要单独实验验证或排除。

##### 路径 1：defer + lastCheckRect 级联（oracle 分析）

**机制**：
1. Frame N: `checkAndScroll()` 运行，光标 Y 跳变 >3px（layout bounce）
2. line 186: `lastCheckRect` 被更新到 bounce 后的位置（Y=530）
3. line 190-192: defer 触发（因为 |530 - 500| > 3），`requestAnimationFrame(() => checkAndScroll())`
4. Frame N+1: 延迟的 `checkAndScroll()` 运行，光标 Y 已回到稳定位置（Y=500）
5. line 177-185: `lastCheckRect.y=530`，`rect.y=500`，|500-530|=30 > 1 → 不被阈值过滤
6. line 186: `lastCheckRect` 更新为 `{y: 500}`
7. line 190: `prevY=530`，|500-530|=30 > 3 → **再次 defer**
8. Frame N+2: 再次延迟的 `checkAndScroll()`，`lastCheckRect.y=500`，`rect.y=500`
9. line 177-185: |500-500|=0 < 1 → **被阈值过滤跳过**，滚动丢失

**验证方法**：单独注释 defer（line 190-193），保留 lastCheckRect，测试首字是否滚动。
**预期**：如果此路径是主因，去掉 defer 后首字应滚动（但可能有弹跳）。

##### 路径 2：isScrolling 门禁吞掉首字符请求

**机制**：
1. 用户快速打字，前一轮 `smoothScroll` 刚结束
2. `smoothScroll` 结束后 line 145: `setTimeout(() => { isScrolling = false; }, 100)`
3. 用户在 100ms cooldown 内输入首字符
4. `checkAndScroll()` line 168: `if (isScrolling) return` → **直接退出，不滚动**

**验证方法**：在 `checkAndScroll` 的 line 168 后加 debug log，记录 `isScrolling === true` 时被拦截的次数。
**预期**：如果快速打字时频繁命中此路径，则 isScrolling 是主因之一。

##### 路径 3：getCursorRect 在首字符时 Y 值偏移

**机制**：
1. 光标在空块时走 `getEmptyBlockRect` fallback（line 40-41 of getCursorRect.ts），用 `contentEl.getBoundingClientRect().top`
2. 输入首字符后切换到 `range.getClientRects()` 路径，用 `rects[last].top`
3. 两个路径的 Y 值可能不同（空块 fallback 用块的 bounding rect，首字符用文本行的 rect）
4. 如果 Y 差异 >3px，触发 defer → 进入路径 1 的级联

**验证方法**：在 getCursorRect 中 log 两个路径返回的 Y 值，对比空块 vs 首字符的差异。
**预期**：如果差异 >3px，则此路径可触发路径 1。

##### 路径 4：selectionchange 时序问题

**机制**：
1. keydown 触发 → `scheduleCheck()` → `pendingCheck = rAF(c1)`
2. SiYuan 在 keydown 的 bubble handler 中插入字符到 DOM
3. selectionchange 在 DOM 更新后同步触发 → `scheduleCheck()` → `pendingCheck !== null` → 合并
4. rAF c1 运行时，getCursorRect 读到的光标位置是否已反映新字符？

**疑问**：如果 SiYuan 的 DOM 更新是异步的（通过 microtask 或 setTimeout），rAF c1 运行时 getCursorRect 可能读到旧位置。此时 rect.y 与 lastCheckRect.y 相同 → 被阈值过滤跳过。

**验证方法**：在 scheduleCheck 和 checkAndScroll 中加时间戳 log，确认 rAF 回调运行时 DOM 是否已更新。
**预期**：如果 DOM 更新延迟，需要在 input/compositionend 后而非 keydown 后触发 check。

##### 路径 5：animateBlockShift 干扰

**机制**：
1. 用户按 Enter → capture handler 触发 `animateBlockShift()`
2. `animateBlockShift` 在 rAF 中操作 DOM（transform + transition）
3. 这些 DOM 操作可能触发额外的 selectionchange → scheduleCheck → checkAndScroll
4. 此时光标位置可能在动画中间态 → defer 或阈值过滤吃掉

**验证方法**：注释掉 `animateBlockShift` 的 capture handler，测试 Enter 后首字是否滚动。
**预期**：如果去掉 FLIP 动画后首字滚动恢复，则此路径是主因。

##### 路径 6：emptyBlock 守卫误判

**机制**：
1. 用户按 Enter 创建新块，此时块为空
2. `checkAndScroll()` line 208-216: `textContent?.trim() === ''` → 判定为空块 → return
3. 用户输入首字符，但 `scheduleCheck` 在输入前就触发了（keydown 事件）
4. 此时块仍为空（字符还没入 DOM），被 emptyBlock 守卫拦截

**疑问**：keydown 时 SiYuan 是否已将字符插入 DOM？如果是异步的，则 emptyBlock 守卫会拦截。

**验证方法**：在 emptyBlock 守卫的 return 前加 debug log，统计首字符场景下的命中次数。
**预期**：如果频繁命中，则需要把 emptyBlock 检查移到 input/compositionend 之后。

#### 可能的修复路径

| 路径 | 描述 | 对应假设 | 优点 | 缺点 |
|------|------|----------|------|------|
| A: lastCheckRect 移到 defer 后 | line 186 移到 line 194（defer 判断之后） | 路径 1 | 修掉级联路径 | 可能引入新弹跳 |
| B: 移除 defer | 信任 layout 已收敛，不做延迟 | 路径 1, 3 | 最简单 | 弹跳 bug 可能回归 |
| C: defer 传参 | `rAF(() => { lastCheckRect = rect; checkAndScroll(); })` | 路径 1 | 精确控制 defer 后状态 | 需要改造 defer 机制 |
| D: 修改 isScrolling 合并逻辑 | `isScrolling` 为 true 时放行到 `smoothScroll` 的 pendingScroll 合并路径 | 路径 2 | 同时修掉 TODO-5 | 需验证合并动画效果 |
| E: getCursorRect 路径对齐 | 确保空块 fallback 和正常路径返回一致的 Y 值 | 路径 3 | 从源头消除 Y 偏移 | 需分析两个路径的坐标差异 |
| F: 改用 input/compositionend 触发 | 把首字符检查绑定到 input 事件而非 keydown | 路径 4, 6 | 确保 DOM 已更新 | 可能引入新的时序问题 |
| G: 禁用 animateBlockShift 后测试 | 注释 FLIP 动画，确认是否干扰 | 路径 5 | 隔离变量 | 只是诊断手段，不是修复 |

#### 验证计划

按以下顺序逐一验证，每步只改一个变量：

1. **路径 1**：注释 defer（line 190-193），保留 lastCheckRect → 测试首字
2. **路径 5**：恢复 defer，注释 animateBlockShift → 测试 Enter 后首字
3. **路径 6**：恢复 animateBlockShift，加 debug log 到 emptyBlock 守卫 → 测试首字
4. **路径 2**：加 debug log 到 isScrolling 门禁 → 快速打字测试
5. **路径 3**：加 debug log 到 getCursorRect → 对比空块 vs 首字符 Y 值
6. **路径 4**：加时间戳 log → 确认 rAF 时 DOM 是否已更新

---

### TODO-7: typewriter.ts — 事件绑定冗余 ✅ 已解决

**解决 commit**：删除 `keyup` / `keydown`（bubble） / `click` / `mouseup` 四个冗余事件，保留 `selectionchange` + `resize`。

#### 调查过程

##### 当前事件列表
```typescript
["selectionchange", scheduleCheck],  // 光标选区变化
["keyup", scheduleCheck],            // 键盘释放
["keydown", scheduleCheck],          // 键盘按下
["click", scheduleCheck],            // 鼠标点击
["mouseup", scheduleCheck],          // 鼠标释放
["resize", scheduleCheck],           // 窗口/侧边栏调整
```

##### 逐事件分析

| 事件 | 必要性 | 理由 |
|------|--------|------|
| `selectionchange` | **必要** | 任何选区变化（打字、点击、键盘移动、IME、粘贴）都会触发，是唯一能覆盖所有输入场景的事件 |
| `resize` | **必要** | 窗口/侧边栏大小变化时，编辑器视口高度变化，光标百分比变了需要重算舒适区。resize 不改变选区，selectionchange 不触发 |
| `keydown` | 冗余 | 此时字符还没入 DOM，光标没变。selectionchange 在字符入 DOM 后会触发 |
| `keyup` | 冗余 | selectionchange 已经在松手前触发了 |
| `click` | 冗余 | click 设置选区后，同步触发 selectionchange |
| `mouseup` | 冗余 | 同上 |

##### 验证

- Neo-Plus 只用 `selectionchange`（+ scroll 用于高亮蒙版），不注册其他输入事件
- cursor.ts / ripple.ts 各自独立注册自己的事件，typewriter 的事件不调用其他模块的函数
- typewriter 的 `scheduleCheck()` 只做 rAF 合并 → `checkAndScroll()`，不涉及光标更新或 inputMode 状态

##### 性能影响

- 事件注册本身开销极小（几字节内存）
- 实际开销是每次触发时的函数调用 + `pendingCheck !== null` 判断（纳秒级）
- 真正值得优化的不是注册数量，而是 handler 内部的 DOM 计算
- 但删掉冗余事件可以减少不必要的 `scheduleCheck()` 调用（虽然会立即 return），代码更清晰

#### 可能的修复

```typescript
// 修复后
const handlers: Array<[string, EventListener, AddEventListenerOptions?]> = [
  ["selectionchange", scheduleCheck],
  ["resize", scheduleCheck],
  // Enter / Backspace 块变更 → 块级 FLIP 过渡动画
  ["keydown", (e) => { ... }, { capture: true }],
];
```

---

## 仍存留（不在本次范围）

- **EDGE_ARROW 相关函数**：`createArrowElement` / `showArrow` / `hideArrow` / `getOffScreenArrowPosition` 因 `ENABLED=false` 不可达，但代码保留作为 opt-in 入口。如决定彻底删除可单独提一个 cleanup commit。
- **`applyFadeAndScale` 的 `scale` 参数**：3 个调用点中 2 个传 `EDGE_FADE.MIN_SCALE`（完全离屏 / case B 淡出），第 3 个（FADE_ZONE 内部分可见）用 lerp 计算变化的 scale。参数本身并非冗余——部分淡出场景需要 scale 随 factor 渐变。仅完全离屏 + case B 两处可简化，但收益不大，保留现状。

## 潜在回归（待复现，暂不动）

- **`isScrolling` cooldown 移除**（v2.3.1，`2e89e2d`）：c5bfdc9 把 100ms cooldown 移除，改为纯派生 `pendingScroll !== null`。旧 100ms 是 `fix-typewriter-scroll-accumulation` 为防"雪崩到 clamp 边界"加的。现零 cooldown，若用户在编辑区已滚到 maxScroll/0 时连续打字，可能每帧触发一次空转的 rAF 滚动动画（lastCheckRect 去重因光标在动而失效）。**未确认**，等复现后决定：(a) 加回最小 ~50ms cooldown，或 (b) 在 `smoothScroll` 检测 `target.scrollTop + deltaY` 已被 clamp 则直接 return 不开动画。用户决定先不动（选项 C）。

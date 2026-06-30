# v2.3.0 Delta（vs v2.2.1）

**日期**：2026-06-30
**基础版本**：v2.2.1（`2808caa`，fix/v2.2.0-cursor-optimization HEAD）
**目标版本**：v2.3.0

---

## 1. 行为变化（用户可见）

### 1.1 打字机模式

| 行为 | v2.2.1 | v2.3.0 |
|---|---|---|
| 目标位置 | 38% 固定 | **[38%, 50%] 舒适区间**，区间内不滚 |
| 滚动曲线 | `ease-out`（默认） | **`cubic-bezier(0.25, 0.1, 0.25, 1)`**（与光标一致） |
| 滚动时长 | `typewriter.ts` 硬编码 | **移到 config** `SCROLL_DURATION_TIERS` |
| smoothScroll 接口 | `smoothScroll(el, deltaY)` | **`smoothScroll(el, {deltaY, duration, curve})`** 曲线原语 |
| 按 Enter 新建块 | 新块凭空出现，下方块瞬间跳位 | **smoothScroll 带位 + FLIP 补位**，无 opacity 渐变 |
| 粘贴多行 | 多块瞬间出现 | **markBlockInsertPending + FLIP**，连续 reflow 平滑 |
| 行首 Backspace 合并 | 上方块瞬间拉下来 | **FLIP 上滑到位** |

### 1.2 涟漪聚焦

| 行为 | v2.2.1 | v2.3.0 |
|---|---|---|
| 粒度 | 仅块级（6 档 `[1.0, 0.85, 0.6, 0.35, 0.15, 0.05]`） | **句级 + 块级**（5 档 `[1.0, 0.88, 0.72, 0.55, 0.42]`） |
| 句级切分 | — | 按 `.?!。？！` 切句，当前句 opacity = 1.0 |
| 嵌入块修正 | ×1.0（统一处理） | **×0.85**（TODO: 区分不同块类型） |
| 列表项 | siblings 距离计算 | **视觉权重 × 深度系数**（Q5 = C 动态算法） |
| 块级插入后重算 | — | **`ripple.recompute(focusBlock)`** 接口（typewriter §3.7 调用） |

### 1.3 顶栏图标

| 行为 | v2.2.1 | v2.3.0 |
|---|---|---|
| 图标 | 笔形 SVG（静态） | **单圆环 + 雾边**（`feGaussianBlur stdDeviation=0.4`） |
| 呼吸动画 | 无 | **breathe 3s ease-in-out infinite**，hover 时停止 |
| 形状 | 笔 | **单一圆环**，不是同心圆 |

---

## 2. Bug 修复清单

### 2.1 wheel / touchmove 退出 typewriter/focus 不生效 ✅（v2.3.0 已修复，commit `7a368db`）

**症状**：用户报告滚轮后 typewriter/focus 仍处于 ON 状态

**根因**：
- `cursor.ts:534-590` 的 `onWheelExit` 已注册 wheel/touchmove handler
- 但 handler 之前缺少 `{ capture: true }`（与 keydown/scroll/input 不一致）
- 思源 scroll 容器内部 stopPropagation 可能拦截 bubble 末端的 document-level handler
- **历史背景**：早期 cursor-optimization-plan.md:607 设计就是 `{ capture: true, passive: true }`，v2.2.0 focus-mode 重构（commit 63ab96b）时 capture 被无意遗漏——本次回归修复

**修复**：
```typescript
// Before
["wheel", onWheelExit, { passive: true }],
["touchmove", onWheelExit, { passive: true }],

// After
["wheel", onWheelExit, { capture: true, passive: true }],
["touchmove", onWheelExit, { capture: true, passive: true }],
```

**验证场景**：
- 在普通段落上滚轮 → focus + typewriter 都退出
- 在嵌入 iframe 内滚轮 → focus + typewriter 都退出（capture 阶段）
- 在悬浮窗上滚轮 → 不影响 focus/typewriter（暂停场景）
- typewriter 自动滚屏（Enter 后 smoothScroll）→ 不误退（程序触发不派发 wheel 事件）

### 2.2 块级插入动画突兀（v2.3.0 修复）

**症状**：按 Enter 新建块后，新块凭空出现，下方块瞬间跳位

**根因**：
- 编辑器原生 reflow 立即生效，无任何过渡
- typewriterr 滚动只对**当前光标所在块**生效，不处理新块 / 下移的块

**修复**：见 DESIGN.md §3.7
- Enter / 行首 Backspace / 多行粘贴 → `markBlockInsertPending()`
- 下一帧 → `animateNaturalReflow()` 用 FLIP 让下方块平滑补位
- 300ms cooldown 期间 typewriter 主循环跳过 transition 关闭

---

## 3. 新增配置参数

`src/config.ts` v2.3.0 新增：

```typescript
TYPEWRITER_CONFIG = {
  // v2.3.0 新增
  COMFORT_ZONE: [0.38, 0.50],
  SCROLL_DURATION_TIERS: [120, 180, 260, 360, 500],
  SCROLL_CURVE: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  
  // v2.2.1 兼容（实际不再使用）
  TARGET_RATIO: 0.38,
  THRESHOLD: 40,
  DURATION: 400,
};

RIPPLE_CONFIG = {
  // v2.3.0 新增
  SENTENCE_LEVELS: [1.0, 0.88, 0.72, 0.55, 0.42],
  EMBED_MULTIPLIER: 0.85,
  DEPTH_FACTOR: 0.05,
  WEIGHT_MIN: 0.85,
  
  // v2.2.1 兼容
  OPACITY_LEVELS: [1.0, 0.85, 0.6, 0.35, 0.15, 0.05],
  MOUSE_THROTTLE: 100,
  IDLE_THRESHOLD: 2000,
};
```

---

## 4. 代码改动范围

### 4.1 `src/config.ts`
- 新增 `COMFORT_ZONE` / `SCROLL_DURATION_TIERS` / `SCROLL_CURVE` / `SENTENCE_LEVELS` / `EMBED_MULTIPLIER` / `DEPTH_FACTOR` / `WEIGHT_MIN`
- 旧字段保留兼容（`TARGET_RATIO` / `OPACITY_LEVELS` / `THRESHOLD` / `DURATION`）

### 4.2 `src/modules/typewriter.ts`
- `smoothScroll()` 重构为曲线原语（接受 `{deltaY, duration, curve}`）
- `durationForDistance()` 移到 config
- `checkAndScroll()` 主循环改为区间逻辑（[38%, 50%]）
- 新增 `markBlockInsertPending()` + `animateNaturalReflow()` FLIP 机制（§3.7）
- 注册 Enter / 行首 Backspace / 多行 paste handler → 调用上面两个函数

### 4.3 `src/modules/ripple.ts`
- 新增 `getSentences(block)` / `getCurrentSentence(block)`
- 新增 `visualWeightOf(node)` / `depthOf(node)` / `depthFactor(depth)`
- `applyRipple()` 主循环重构为句级 + 视觉权重 + 深度系数 + 嵌入块修正
- 新增 `recompute(focusBlock)` 导出函数（typewriter §3.7 调用）

### 4.4 `src/index.ts`
- 顶栏图标 SVG 从笔形 → 单圆环 + 雾边 filter
- SCSS 顶部加 `@keyframes breathe-ring` + `.topbar-icon` 样式

### 4.5 `src/modules/cursor.ts`
- wheel / touchmove handler 加 `{ capture: true }`

---

## 5. 回归测试场景（17 + 4 = 21）

### 5.1 原有 17 场景（v2.2.1 baseline）

| # | 场景 | 预期 |
|---|---|---|
| 1 | 打开文档 | 光标显示在最后位置，不滚不涟漪 |
| 2 | 多行选中 | 光标瞬跳到选区末尾，typewriter/ripple 暂停 |
| 3 | 悬浮窗编辑 | typewriter/ripple 暂停 |
| 4 | 只读模式 | 全部暂停 |
| 5 | 嵌入块 | typewriter 跳过，ripple 视为 1 单位 |
| 6 | 嵌套块（list-in-list） | siblings 距离，ripple 不递归 |
| 7 | 切 Tab | typewriter/ripple 退出 |
| 8 | 失焦 | typewriter/ripple 退出 |
| 9 | 滚轮退出 | **v2.3.0 修复点：必生效** |
| 10 | ↑/↓/PageUp/PageDown | typewriter/ripple 退出 |
| 11 | ←/→/Home/End/Esc | typewriter/ripple 保持 |
| 12 | 粘贴 | 不触发 typewriter 开启（`isPasting`） |
| 13 | 方向键 ↑ 后再 ← | typewriter/ripple 保持 OFF |
| 14 | 鼠标拖蓝 | 退出 |
| 15 | 右键菜单 | 暂停呼吸（`pauseBreathe`） |
| 16 | 移动端标题编辑 | typewriter 滚到 38%，ripple 跟随（**v2.3.0 推迟**：cursor 模块 OFF-LIMITS，待解除后实现） |
| 17 | 分屏 | 锁定活跃编辑器 |

### 5.2 新增 4 场景（v2.3.0）

| # | 场景 | 预期 |
|---|---|---|
| 18 | **舒适区间内输入** | 光标在 38%-50% 自由输入，typewriter 不滚 |
| 19 | **按 Enter 新建块** | 上方块让位（smoothScroll），新块 smoothScroll 带位，**下方块 FLIP 平滑下移** |
| 20 | **句级涟漪** | 当前句 = 1.0，块内其它句 ≈ 0.88，相邻块按句级 / 块级梯度 |
| 21 | **列表项视觉权重** | 短列表项（部分在视窗外）opacity 明显衰减；嵌套深的项 × 0.95 |

---

## 6. 风险与回滚

### 6.1 性能风险

- **句级切分**：`getSentences()` 每帧扫块文本（被 rAF 节流）
- **FLIP reflow**：每块 1 次 getBoundingClientRect（优化：跳过 < 2px 微移）
- **视觉权重**：每块 2 次 getBoundingClientRect（节点 + editor）

预期：单个事件 handler 跑 < 5ms（vs v2.2.1 ~2ms），用户感知不到。

### 6.2 回滚

git revert HEAD（如果合并后出问题）：

```bash
git revert <v2.3.0-merge-commit> --no-edit
```

旧字段（`TARGET_RATIO` / `OPACITY_LEVELS` / `THRESHOLD` / `DURATION`）保留兼容，
回滚后即使新代码还在，配置 fallback 到旧字段。

---

## 7. 不在 v2.3.0 范围

- **focus / typewriter 解耦**：Q2 = A 绑定，触发规则 90% 共享
- **高亮条**：Q1 永久下线
- **mouse 涟漪模式**：Q3 暂停，入口保留
- **嵌套块递归渐淡**：推迟到 v2+
- **SCSS → JS 字符串**：推迟（与 ESBuild sass plugin 架构冲突）

---

## 8. 发布检查清单

- [ ] `package.json` version `2.0.0` → `2.3.0`
- [ ] `plugin.json` version `2.0.0` → `2.3.0`
- [ ] `CHANGELOG.md` 补 v2.2.1 typewriter + v2.3.0 段
- [ ] 删除过时文档（CONTINUATION / CURSOR_ANIMATION_DECISIONS / FOCUS_TYPEWRITER_DESIGN / TESTING_GUIDE_v2.2.0 / development）
- [ ] 归档 `docs/superpowers/plans/*` 6 个到 `docs/archive/plans/`
- [ ] 删除 `docs/superpowers/specs/2026-06-27-zentype-redesign-design.md`
- [ ] 删除 `docs/superpowers/research/2026-06-28-siyuan-plugin-rename-and-dev-workflow.md`
- [ ] 移 `CHANGELOG.md` → `docs/CHANGELOG.md`
- [ ] 删 root `TODO.md`（保留 `docs/TODO.md`）
- [ ] README 暂不改（user 决定）
- [ ] 跑 Phase B+C 17+4 回归测试
- [ ] 提交清理 commit + 实现 commit（分开两个 PR 更清晰）
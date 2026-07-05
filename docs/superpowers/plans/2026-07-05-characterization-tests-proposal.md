# Characterization Tests 提案

日期：2026-07-05
关联：`docs/superpowers/plans/2026-07-05-architecture-refactor-roadmap.md` Task 5

## 目标

为重构后的纯/半纯 helper 加一层 characterization 安全网，**不试图模拟思源运行时**。
测试刻画的是"当前行为"——重构后只要这些测试还过，行为就没有意外漂移。

## 候选函数清单（Step 1）

按"是否需要 DOM / 是否需要导出"分三档：

### A. 完全纯函数（无 DOM、无 window）— 零依赖可测

| 函数 | 文件:行 | 输入 → 输出 | 刻画的行为 |
|---|---|---|---|
| `easeOutCubic(t)` | `typewriter.ts:38` | `number ∈ [0,1] → number` | 缓出曲线：`f(0)=0, f(1)=1, f(0.5)≈0.875`，单调递增 |
| `easeInOutCubic(t)` | `typewriter.ts:43`、`ripple.ts:285`（两处重复定义） | `number ∈ [0,1] → number` | 缓起缓收：`f(0)=0, f(1)=1, f(0.5)=0.5`，前半加速后半减速 |
| `durationForDistance(dist)` | `typewriter.ts:200` | `px → ms` | 距离分档：`<20→180, <60→260, <150→360, <400→480, ≥400→600`（与 `SCROLL_DURATION_TIERS` 对应） |
| `shouldAnimateBlockShiftForKey(key)` | `typewriter.ts:442` | `string → boolean` | 仅 `"Enter"` / `"Backspace"` 返回 true，其他 false |
| `splitSentences(text)` | `ripple.ts:197` | `string → SentenceRange[]` | 按 `.?!。？！…` 切句；小数点 `3.14` 不切；空串返回 `[{0,0}]` |
| `parseRgbColor(value)` | `ripple.ts:289` | `string → Rgba \| null` | 解析 `rgb(...)` / `rgba(...)`；非法返回 null；缺省 alpha=1 |
| `colorToCss(color)` | `ripple.ts:272` | `Rgba → string` | 输出 `rgba(r,g,b,a)`，alpha clamp 到 `[0,1]` |
| `mixColor(from, to, t)` | `ripple.ts:276` | `(Rgba, Rgba, number) → Rgba` | 线性插值各通道；`t=0` 返回 from，`t=1` 返回 to |
| `textNodeMapMatchesSnapshot(map, snapshot)` | `ripple.ts:125` | `(TextNodeEntry[], snapshot) → boolean` | 节点引用 + len 全相等才 true；长度不同直接 false |
| `resolveTextNodeAt(map, charOffset)` | `ripple.ts:139` | `(TextNodeEntry[], number) → {node, localOffset} \| null` | 二分查找：超 total 返回 null；命中返回对应 Text + 余数 offset |
| `getEdgeProximity(rect, editorRect?)` | `edgeProximity.ts:54` | `(CursorRect, rect?) → EdgeProximity` | 见下方专门节 |

> **`getEdgeProximity` 唯一的非纯点**：`vpW = window.innerWidth`、`vpH = window.innerHeight`。
> jsdom 提供这两值（可 `Object.defineProperty(window, 'innerWidth', ...)`），其余纯算术。
> 归为 A 档（jsdom 已够，不需要真实布局）。

### B. 半纯函数（需要 DOM，但不需要思源结构）— jsdom 可测

| 函数 | 文件:行 | 需要的 DOM | 刻画的行为 |
|---|---|---|---|
| `buildTextNodeMap(root)` | `ripple.ts:108` | 一个有文本子节点的 element | 单次 TreeWalker 前序遍历；`start` 累计；空 root 返回 `[]` |
| `snapshotTextNodeMap(map)` | `ripple.ts:121` | 无（输入是 map） | 输出 `{node, len}` 数组，引用相等 |
| `pickClosestTextNode(container, offset)` | `ripple.ts:86` | Text / Element 节点 | Text 节点：clamp offset；Element：取 childNodes[offset] 或 lastChild；空返回 null |
| `rangeFromOffsets(map, start, end)` | `ripple.ts:213` | map 中的 Text 节点需挂在 document 上 | 用 `new Range()` setStart/setEnd；越界返回 null；非法 throw 被吞返回 null |
| `buildDimRanges(sentenceRanges, map, excluded)` | `ripple.ts:237` | 同上 | 排除 `excludedRanges` 中 start 相等的句；其余构造 Range |
| `getTopLevelBlock(currentBlock, container)` | `ripple.ts:66` | 嵌套 element 结构 | 沿 parentElement 上溯到 container 的直接子级 |
| `visualWeightOf(block, editorRect)` | `ripple.ts:76` | 需要 `getBoundingClientRect` | 视口可见高度 / editorRect.height，clamp `[0,1]` |
| `isBlockElement(el)` | `typewriter.ts:68` | Element | HTMLElement + 有 `data-node-id` 属性 |
| `addSiblingWindow(block, blocks)` | `typewriter.ts:72` | sibling 链 | 向前向后各采 `FLIP_BLOCK_RADIUS=30` 个块节点 |
| `collectFlipBlocks(editor, range)` | `typewriter.ts:110` | 含 `[data-node-id]` 的 editor + range | 围绕选区起止块采样 + 祖先层级；空时 fallback 全量扫描 |

> B 档测试需要在 jsdom 里手工构造小型 DOM 树（5-10 个 div），**不模拟思源 protyle/wysiwyg 嵌套**——只用最小结构验证算法逻辑。

### C. 不建议测试（依赖思源运行时或全局状态）

- `applyBlockOpacity` / `applyRippleNow` / `applySentenceHighlight` / `startSentenceFade` — 依赖 `CSS.highlights`、`inputMode` 全局状态、MutationObserver；jsdom 不支持 CSS Custom Highlight API，mock 成本高于收益
- `smoothScroll` / `checkAndScroll` — 依赖 `requestAnimationFrame` + `scrollTop` 真实布局；rAF 在 jsdom 下是 noop，测了也没意义
- `animateBlockShift` — 三阶段 rAF + setTimeout + getBoundingClientRect 时序；jsdom 布局是 0，无法刻画
- `getCaretOffset` — 依赖 `window.getSelection()`；jsdom 选区支持有限
- `getBlockTextColor` / `getThemeDimColor` — 依赖 `getComputedStyle` 和 `data-theme-mode`；jsdom computed style 是空字符串

> 这些函数的行为验证仍靠思源内手测（roadmap 每个任务的 manual test focus 已覆盖）。

## 提案：最小测试设置（Step 2）

### 测试 runner：Vitest

**理由**：
1. 项目已是 esbuild + TypeScript，Vitest 原生支持 TS，零配置转译
2. Vitest 提供 `jsdom` environment，覆盖 B 档所有 DOM 需求
3. 与现有 `npm run build`（esbuild）共享同一套 TS 编译管线，不引入第二个编译器
4. 比 Jest 启动快、配置少；比 node:test 提供 `jsdom` 集成更顺

**不选 Jest 的理由**：配置更重、ts-jest 需要额外维护；项目用 esbuild 不用 tsc 编译，Jest 的 TS 集成反而要绕路。
**不选 node:test 的理由**：原生 node:test 无 `jsdom`，B 档测不了。

### 依赖（最小集）

```
devDependencies:
  vitest ^1.6.0      # 测试 runner
  jsdom ^24.0.0      # DOM 环境（peer of vitest）
```

**不加** `@testing-library/dom` / `happy-dom` / `@vitest/coverage` —— 提案只做 characterization，不追求覆盖率、不需要用户交互模拟。`jsdom` 比 `happy-dom` 更接近真实浏览器 API（TreeWalker、Range、Text 节点齐全）。

### npm scripts（追加到 package.json `scripts`）

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

不加 `test:ci` —— 本地跑就够，CI 在 Task 7 环境修复后再考虑。

### 配置文件

新建 `vitest.config.ts`（项目根）：

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
    globals: false,           // 不污染全局，显式 import { describe, it, expect }
    css: false,               // 不处理 SCSS（测试不碰样式）
  },
});
```

### 测试文件结构

```
tests/
├── edgeProximity.test.ts        # A 档：getEdgeProximity
├── easing.test.ts               # A 档：easeOutCubic / easeInOutCubic（两处定义都测）
├── typewriter-helpers.test.ts   # A 档：durationForDistance / shouldAnimateBlockShiftForKey / isBlockElement
├── sentence.test.ts             # A 档：splitSentences
├── color.test.ts                # A 档：parseRgbColor / colorToCss / mixColor
├── textNodeMap.test.ts          # A+B 档：buildTextNodeMap / resolveTextNodeAt / snapshotTextNodeMap / textNodeMapMatchesSnapshot
├── ranges.test.ts               # B 档：rangeFromOffsets / buildDimRanges / pickClosestTextNode
├── flipBlocks.test.ts           # B 档：collectFlipBlocks / addSiblingWindow（jsdom 小型 DOM）
└── topLevelBlock.test.ts        # B 档：getTopLevelBlock / visualWeightOf
```

预估每个文件 3-8 个用例，总共 ~50 个用例。

### 导出策略（不污染生产 API）

候选函数当前都是 module-private（不 export）。两种方案：

**方案 1（推荐）：通过 `vitest` 的 `vi.importActual` + 内部导出**
- 在 `ripple.ts` / `typewriter.ts` 末尾加一个 `export const __test = { splitSentences, parseRgbColor, ... }` 块
- 测试文件 `import { __test } from "../src/modules/ripple"` 后解构
- 生产 bundle 体积不受影响（esbuild tree-shake 掉 `__test`，因为 `src/index.ts` 不引用它）
- 优点：函数本身仍 private，不暴露给业务代码；测试通过显式 `__test` 入口拿引用

**方案 2：直接 `export`** 那些纯函数
- 改 module 公共 API 面，破坏"内部 helper"语义；不建议

> **提案选方案 1**。如果你反对在源文件加 `__test` 导出块，可改为方案 3：把纯函数搬到 `src/utils/` 新文件（如 `easing.ts`、`color.ts`、`sentence.ts`），从原 module re-import。这是更大的重构，超出 Task 5 范围，需要单独授权。

### 每个测试刻画的行为（示例）

```typescript
// sentence.test.ts
import { describe, it, expect } from "vitest";
import { __test } from "../src/modules/ripple";
const { splitSentences } = __test;

describe("splitSentences", () => {
  it("splits on ASCII sentence enders", () => {
    expect(splitSentences("Hi. Bye?")).toEqual([
      { start: 0, end: 3 }, { start: 3, end: 7 },
    ]);
  });
  it("splits on CJK sentence enders", () => {
    expect(splitSentences("你好。再见！")).toEqual([
      { start: 0, end: 3 }, { start: 3, end: 6 },
    ]);
  });
  it("does not split decimal points (3.14 stays one sentence)", () => {
    expect(splitSentences("3.14 is pi.")).toEqual([{ start: 0, end: 10 }]);
  });
  it("returns single full-range for empty string", () => {
    expect(splitSentences("")).toEqual([{ start: 0, end: 0 }]);
  });
  it("handles trailing text without ending punctuation", () => {
    expect(splitSentences("Done. trailing")).toEqual([
      { start: 0, end: 5 }, { start: 5, end: 14 },
    ]);
  });
});
```

```typescript
// edgeProximity.test.ts
import { describe, it, expect } from "vitest";
import { getEdgeProximity } from "../src/utils/edgeProximity";

describe("getEdgeProximity", () => {
  it("returns factor=1 when rect is well inside viewport", () => {
    // jsdom default innerWidth/Height = 1024x768
    const r = getEdgeProximity({ x: 500, y: 400, width: 4, height: 20 });
    expect(r.factor).toBe(1);
    expect(r.isOffScreen).toBe(false);
  });
  it("returns factor=0 when off-screen", () => {
    const r = getEdgeProximity({ x: -100, y: 400, width: 4, height: 20 });
    expect(r.factor).toBe(0);
    expect(r.isOffScreen).toBe(true);
    expect(r.edge).toBe("left");
  });
  it("fades proportionally within EDGE_FADE.ZONE", () => {
    // ZONE = 20; rect 10px from top → factor ≈ 0.5
    const r = getEdgeProximity({ x: 500, y: 10, width: 4, height: 20 });
    expect(r.distance).toBe(10);
    expect(r.factor).toBeCloseTo(0.5, 5);
  });
  it("respects editorRect.top offset (toolbar ~55px)", () => {
    const r = getEdgeProximity(
      { x: 500, y: 60, width: 4, height: 20 },
      { top: 55, bottom: 700, left: 0, right: 1024 },
    );
    // distance = 60 - 55 = 5; factor = 5/20 = 0.25
    expect(r.distance).toBe(5);
    expect(r.factor).toBeCloseTo(0.25, 5);
  });
});
```

### 不测的内容（明确边界）

- 不测 `CSS.highlights`（jsdom 不支持）
- 不测 `requestAnimationFrame`（jsdom 是 noop）
- 不测 `getComputedStyle`（jsdom 返回空）
- 不测 `window.getSelection()`（jsdom 支持不稳定）
- 不测思源 protyle/wysiwyg DOM 嵌套（用最小 div 结构验证算法）
- 不追求覆盖率指标（只刻画关键行为）

## 工作量预估

- 新增 `vitest.config.ts` + `package.json` 2 行 scripts + 2 个 devDependencies
- 新增 `tests/` 9 个文件，~50 用例
- 源文件改动：`ripple.ts` + `typewriter.ts` 末尾各加一个 `__test` 导出块（~15 行/文件）
- 总计 ~400 行测试代码 + ~30 行源文件改动

## 风险

1. **导出策略**：方案 1 的 `__test` 块需要在源文件加代码。如果你完全反对动源文件，需改用方案 3（搬纯函数到 utils/），那是更大的重构
2. **jsdom 局限**：B 档测试里 `getBoundingClientRect` 在 jsdom 返回全 0，`visualWeightOf` 测试需要 mock `getBoundingClientRect`（vitest 提供 `vi.spyOn`）
3. **依赖增加**：vitest + jsdom 是 2 个新 devDependencies。AGENTS.md 要求"无新依赖无显式授权"——本提案的目的就是等你授权
4. **维护成本**：characterization tests 刻画的是"当前行为"，未来如果有意改行为需要同步更新测试（这是 feature，不是 bug）

## 执行前置条件（等你确认）

- [ ] 同意引入 `vitest` + `jsdom` 两个 devDependencies
- [ ] 同意方案 1（在 `ripple.ts` / `typewriter.ts` 末尾加 `__test` 导出块）
- [ ] 同意新增 `tests/` 目录和 `vitest.config.ts`
- [ ] 同意 `package.json` 加 `test` / `test:watch` 两个 scripts

确认后我会按 A 档 → B 档顺序写测试，每写完一个文件跑一次 `npm test` 验证。

## 不在本提案范围内

- Task 7 的环境修复（pnpm-workspace.yaml / lockfile）—— 如果 lockfile 损坏，`npm install vitest jsdom` 可能失败；建议先 Task 7 或显式批准跳过 lockfile 修复
- C 档函数的行为验证（仍靠思源手测）
- 覆盖率工具 / CI 集成

# 后续会话指南（Handoff Notes）

> **写给未来要继续修复/改进 zenType 的 AI 助手或用户本人。**
> 当前会话已经把 v2.0.0 从设计到实施到发布全部跑完，下面是接手前必读。

---

## 🔄 最新工作（2026-06-30，HEAD = `58d20f6`，16 commits ahead of origin）

> **⚠️ Known Issues — see [docs/TODO.md](TODO.md)** for 4 known bugs/UX issues
> discovered during user testing on 2026-06-30 (after Plan 6 landed).
> - TODO-1: Initial cursor position transition is janky
> - TODO-2: Edge arrow indicator not needed (decision: disable via config flag)
> - TODO-3: Edge definition too loose — `FADE_ZONE = 60px` is too aggressive
> - TODO-4: Scroll direction asymmetry (UP works, DOWN doesn't)

### Round 5-11 完整光标优化 已完成

| 阶段 | 内容 | 状态 |
|------|------|------|
| Round 5 | 4 个原始 cursor BUG | ✅ shipped |
| Round 7 | P0 完整重构（6 决策 + 新建 5 文件） | ✅ shipped |
| Round 8 | 兼容性 refactor（删除双函数） | ✅ shipped |
| Round 9 | P1 + 动画 + A1-A9 兼容性 | ✅ shipped |
| Round 10 | 直角矩形 + 参数可配置 + 文档更新 | ✅ shipped |
| **Round 11** | **P2 EventBus 迁移 + 代码清理 + Reviewer 批准** | ✅ **shipped** |
| **Plan 6** | **Edge interaction: Fade+Scale + Squash/Bounce + Arrow** | ✅ **shipped (2 commits, see note)** |

> **Plan 6 commit structure note**: The plan was originally 3 separate commits
> (Commit 1: Fade+Scale, Commit 2: Squash/Bounce, Commit 3: Arrow). In practice
> Squash/Bounce and Arrow were **combined into a single commit (58d20f6)** —
> Commit 1 = `68297da`, Commit 2+3 combined = `58d20f6`. This means reverting
> the arrow (per TODO-2) cannot be done with `git revert` alone, since the
> commit also contains squash/bounce. See `docs/TODO.md` TODO-2 for the
> recommended resolution (Option C: add `EDGE_ARROW.ENABLED: false` flag).

### 本次会话关键改动（**未提交到 git**）
- **Round 11 P2**：新建 `src/utils/scroll.ts` 集中滚动工具；`cursor.ts` 删 `wsHandler` + 手动 WS + 白名单；`index.ts` 订阅 9 个 EventBus 事件（`eventBusOffFns` 数组统一管理）；`isMobile.ts` / `edgeCases.ts` / `typewriter.ts` 改用 `getActiveEditor()` / `getFrontend()`；`activeProtyleIds` Set + `click-editorcontent` 驱动
- **Reviewer F1**：删除 dead state `loadedProtyleIds`（仅声明/add/delete/clear，从未被读）
- **CHANGELOG**：v2.1.0 → v2.2.0，记录 P2 + F3 known limitation
- **TODO**：Round 11 段 + 明确推迟项（P2-4/P2-5）

### 待办（按用户要求）
1. **#1 软链接决策**：用户说推迟，3 个选项仍未选（A: 管理员 PS / B: 开发者模式 / C: 重写脚本为 watcher+copy）
2. **GitHub commit / release**：用户说"等一切就绪再上线"——P2 完成后 v2.2.0 可发
3. **集市上架**：v2.2.0 release 后自动索引
4. **用户实际测试**：v2.2.0 完整测试（见"用户测试指南"段，m0123）

### 工作目录 hash 已同步
- `D:\Documents\GitHub\zenType\dev/` → `D:\SiYuan\data\plugins\siyuan-zen/` 5/5 MATCH
- 用户测试方式：思源 → 插件 → 焦点写作 → 禁用 → 启用（触发 onunload+onload 重载）

### 设计文档已就位
- `docs/superpowers/plans/cursor-optimization-plan.md` —— P0 方案（v2.1.0）
- `docs/superpowers/plans/cursor-optimization-round-3.md` —— P1 + 动画 + A1-A9（v2.2.0）
- `参考/Neo-Plus-顺滑光标分析.md` —— Neo-Plus 参考实现分析
- `参考/siyuan-kernel-api-调研.md` —— SiYuan 内核 API 调研（EventBus / getActiveEditor 等）
- `参考/三版顺滑光标对比.md` —— 25 维特性对比（当前 22/25，超越 Neo-Plus 13/25）

---

## 📍 项目当前状态

- **仓库**：`Han-Orz/siyuan-zen`（GitHub）
- **本地路径**：`D:\Documents\GitHub\zenType`
- **HEAD commit**：`58d20f6`（feat(cursor): viewport edge arrow indicator — Plan 6 squash/bounce+arrow combined）
- **Branch**：`fix/v2.2.0-cursor-optimization`
- **Ahead of origin**：16 commits (Plan 6 + 10 other fixes since 8e0f2e9)
- **最新 release**：v2.0.0 @ https://github.com/Han-Orz/siyuan-zen/releases/tag/v2.0.0
- **集市状态**：1-3 小时内自动索引
- **GitHub issue #4**（88250 改名要求）：✅ 已关闭
- **GitHub `Han-Orz/zenType` 仓库**：保留为空壳（用户后期可能复用）

### Untracked files（user accepted, do not add）
- `package-lock.json` — intentionally left untracked (user choice; relying on `pnpm-lock.yaml` instead)
- `docs/CURSOR_ANIMATION_DECISIONS.md`, `docs/FOCUS_TYPEWRITER_DESIGN.md`, `docs/superpowers/plans/2026-06-30-plan-6-edge-interaction.md` — also untracked; will be added in the docs-update commit

### v1.0.6 → v2.0.0 关键变化

| 项目 | v1.0.6 | v2.0.0 |
|---|---|---|
| `plugin.json` name | `ZenType` | `siyuan-zen` |
| 仓库 | `Han-Orz/siyuan-zen` | `Han-Orz/siyuan-zen`（不变） |
| 代码架构 | 单文件 + 模板 | 单一入口 + 三模块（cursor/typewriter/ripple） |
| 构建工具 | Vite | esbuild + sass |
| dev 工作流 | build → zip → 拖入 → 重启 | watch + 符号链接 → 热重载 |
| 用户操作 | 必须重启思源 | 改代码几秒自动生效 |

---

## 🔧 环境配置（必做，新会话要先确认）

### Windows PowerShell 必备设置

```powershell
# 1. Node.js 加到 PATH（用户用 corepack 启用 pnpm）
$env:Path = "D:\scoop\apps\NodeJS-LTS\current;" + $env:Path
$env:HTTP_PROXY = "http://127.0.0.1:7897"
$env:HTTPS_PROXY = "http://127.0.0.1:7897"

# 2. pnpm 安装/操作
pnpm install
pnpm run build       # 输出 dist/ + 生成 zentype.zip
pnpm run build:dev   # 输出 dev/
pnpm run dev         # watch 模式 + 重建到 dev/
pnpm run link        # 建符号链接（一次性）
pnpm run clean       # 清理 dist/ + dev/ + *.zip

# 3. 清理代理变量
Remove-Item Env:HTTP_PROXY
Remove-Item Env:HTTPS_PROXY
```

### GitHub CLI 已登录

```powershell
gh issue list --repo Han-Orz/siyuan-zen --state all --limit 10
gh release list --repo Han-Orz/siyuan-zen
```

### 思源工作区路径

- 默认：`C:\Users\Han\SiYuan`
- 设置环境变量 `SIYUAN_WORKSPACE` 跳过交互

---

## 🐛 待修复的 4 个 Open Issues

```
#1  [BUG] 光标偏移
#2  [BUG] 输入后点击不会让其他块变亮
#3  [功能] 希望给高亮条加独立开关
#5  [性能] 光标速度过慢
```

详细分析和代码定位见：
**审查报告**：`D:\Documents\GitHub\zenType\.superpowers\review\zenType-v2-review.md`
（`.superpowers/` 是 gitignored 的会话产物，不在 repo 里）

### Issue #5（最简单，建议先修）

- **文件**：`src/styles/index.scss:14-15`
- **问题**：CSS transition `0.15s` 太慢
- **修复**：改 `0.08s` 或 `0.1s`

### Issue #2（中等）

- **文件**：`src/modules/ripple.ts:94-104`
- **问题**：`onSelectionChange()` 不完整触发
- **修复**：在 `click` 和 `keyup` 事件中强制触发状态更新；考虑添加 `input` 事件监听

### Issue #3（中等，需要重构）

- **文件**：`src/modules/typewriter.ts:102-141` + `src/index.ts:2-4`
- **问题**：`ModuleEnabled` 缺少细粒度配置
- **修复**：扩展 `ModuleEnabled` 类型，或把 typewriter 拆为 `scrollToCenter` + `highlightLine` 两个子功能

### Issue #1（中等，需要实机测试）

- **文件**：`src/utils/getCursorRect.ts:19-30` + `src/modules/cursor.ts:46-50`
- **问题**：`getCursorRect()` fallback 可能返回错误坐标
- **修复**：增加边界检查，确保光标只在 `.protyle-wysiwyg` 区域内显示

---

## 📋 其他待办事项

### Important（来自审查报告）

- **I-5 删除 build.js 遗留 marker 检查**（`build.js:39-42`，4 行死代码）
- **添加单元测试**（`getCursorRect`、`edgeCases` 等工具函数）

### Minor（可选）

- M-1：cursor.ts Window 类型声明注释更清晰
- M-2：typewriter 参数可配置化（`TARGET_RATIO`、`THRESHOLD`、`DURATION`）
- M-3：ripple.ts `IDLE_THRESHOLD` 可配置化
- 添加 CHANGELOG.md

---

## 📁 项目结构速查

```
zenType/
├── src/
│   ├── index.ts              # 入口（编排）
│   ├── modules/
│   │   ├── cursor.ts         # 顺滑光标
│   │   ├── typewriter.ts     # 打字机模式（含高亮条）
│   │   └── ripple.ts         # 涟漪聚焦
│   ├── utils/
│   │   ├── getCursorRect.ts  # 光标位置获取
│   │   ├── edgeCases.ts      # 边界场景判定
│   │   └── styleManager.ts   # 样式管理
│   ├── types/
│   │   ├── index.ts          # ModuleEnabled 等类型
│   │   └── scss.d.ts         # SCSS 模块声明
│   └── styles/index.scss     # 全局样式
├── build.js                  # 构建脚本（esbuild + sass + zip）
├── plugin.json               # name=siyuan-zen
├── package.json              # scripts: build/build:dev/dev/link/clean
├── pnpm-workspace.yaml       # pnpm 11 allowBuilds 配置
├── tsconfig.json
├── scripts/make_dev_link.js  # 跨平台符号链接脚本
├── docs/
│   ├── README.md             # 英文文档（含升级提示）
│   ├── README_zh_CN.md       # 中文文档（含升级提示）
│   ├── development.md        # 开发指南（大白话）
│   └── superpowers/
│       ├── specs/2026-06-27-zentype-redesign-design.md  # 设计文档
│       ├── plans/2026-06-27-zentype-redesign-plan.md    # 实施计划
│       └── research/2026-06-28-siyuan-plugin-rename-and-dev-workflow.md
└── 参考/顺滑光标.js          # 用户保留的参考代码（不构建）
```

---

## 💬 给后续 AI 会话的开场提示词（可直接复制）

### 提示词 A：修复单个 issue（推荐）

```
你是一个接手的 AI 助手，要修复思源笔记插件 siyuan-zen 的 Issue #<编号>。

## 项目上下文
- 本地路径：D:\Documents\GitHub\zenType
- 当前 HEAD：8fa3a1f
- 完整历史：17 个 commit，Tasks 1-10 全部完成
- dev 工作流已搭好（pnpm run dev = watch + 热重载）
- 关键文档：
  - 设计：docs/superpowers/specs/2026-06-27-zentype-redesign-design.md
  - 计划：docs/superpowers/plans/2026-06-27-zentype-redesign-plan.md
  - 审查报告：.superpowers/review/zenType-v2-review.md
  - 接手指南：docs/CONTINUATION.md

## 你的任务
修复 Issue #<编号>：<标题>

详细描述：
<粘贴 issue 内容>

## 关键信息
- Issue #1 (光标偏移)：src/utils/getCursorRect.ts:19-30
- Issue #2 (点击不变亮)：src/modules/ripple.ts:94-104
- Issue #3 (缺开关)：src/modules/typewriter.ts:102-141
- Issue #5 (光标慢)：src/styles/index.scss:14-15

## 环境配置（必做）
$env:Path = "D:\scoop\apps\NodeJS-LTS\current;" + $env:Path
$env:HTTP_PROXY = "http://127.0.0.1:7897"
$env:HTTPS_PROXY = "http://127.0.0.1:7897"

## 验证命令
node node_modules/typescript/bin/tsc --noEmit    # 类型检查
node build.js --dev                              # 构建 dev/

## 工作流程建议
1. 先 Read 相关文件，理解现状
2. 用 brainstorming skill（如果改动较大）或直接动手（如果是简单 CSS 调整）
3. 改完后用 subagent-driven-development 调度 deep-worker 实施 + reviewer 审查
4. 用户是编程小白，每个步骤都要解释清楚

回我"开始"就开始。
```

### 提示词 B：批量修复（高级）

```
你是一个接手的 AI 助手，要批量处理 zenType 项目的多个问题。

任务清单（按优先级）：
1. Issue #5 光标速度慢（src/styles/index.scss，简单）
2. I-5 删除 build.js 遗留 marker 检查（build.js:39-42，简单）
3. Issue #2 点击不变亮（src/modules/ripple.ts:94-104，中等）
4. Issue #3 高亮条独立开关（src/modules/typewriter.ts:102-141，中等）
5. Issue #1 光标偏移（src/utils/getCursorRect.ts:19-30，中等，需实机测试）

每个任务请用 subagent-driven-development：
- 用 deep-worker 实施
- 用 reviewer 审查
- 用户是编程小白，每个步骤都要用大白话解释

环境配置：
$env:Path = "D:\scoop\apps\NodeJS-LTS\current;" + $env:Path
$env:HTTP_PROXY = "http://127.0.0.1:7897"
$env:HTTPS_PROXY = "http://127.0.0.1:7897"

回我"开始"就开始。
```

### 提示词 C：添加新功能

```
你是一个接手的 AI 助手，要给 zenType 插件添加新功能。

## 必读
- 接手指南：docs/CONTINUATION.md（项目状态、环境配置、文件结构）
- 设计文档：docs/superpowers/specs/2026-06-27-zentype-redesign-design.md
- 实施计划：docs/superpowers/plans/2026-06-27-zentype-redesign-plan.md

## 工作流程（必须遵循）
1. **brainstorming skill**：明确用户需求、设计方案、边界场景
2. **writing-plans skill**：把方案变成可执行的实施计划
3. **subagent-driven-development skill**：用 deep-worker 实施 + reviewer 审查

## 用户身份
编程小白。所有解释必须用大白话，避免编程术语堆砌。

## 用户要的新功能
<在这里描述>

回我"开始 brainstorm"就启动 brainstorming skill。
```

---

## 🔗 关键链接

- **Release v2.0.0**：https://github.com/Han-Orz/siyuan-zen/releases/tag/v2.0.0
- **Issues 列表**：https://github.com/Han-Orz/siyuan-zen/issues
- **Issue #4（已关闭）**：https://github.com/Han-Orz/siyuan-zen/issues/4
- **bazaar 仓库**：https://github.com/siyuan-note/bazaar
- **siyuan-plugin-cli**：https://github.com/frostime/siyuan-plugin-cli
- **Neo-Plus（参考）**：https://github.com/QYLexpired/Neo-Plus

---

## 📝 决策历史（避免重蹈覆辙）

1. **v2.0.0 name 必须等于 repo name** —— 88250 强制要求，已用 siyuan-zen
2. **不要用 `pnpm build`，用 `node build.js`** —— pnpm 11 的 ERR_PNPM_IGNORED_BUILDS 问题
3. **构建产物必须叫 `package.zip`** —— 集市索引认这个名字
4. **README 文件名是 README.md / README_zh_CN.md** —— 不是中文文件名
5. **`.superpowers/` 是 gitignored** —— 审查报告等会话产物不会污染 repo
6. **大文件 `参考/顺滑光标.js` 不参与构建** —— 仅作参考
7. **不要随便改仓库名** —— 现有 4⭐1 fork，重命名代价大

---

**最后更新**：2026-06-29（v2.0.0 改名完成 + 审查完成后）
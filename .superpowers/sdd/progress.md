# zenType v2 SDD Progress Ledger

> 此文件由 Sisyphus (orchestrator) 维护，跨上下文压缩后用于恢复进度。
> git 是真实记录，ledger 是恢复地图。

## 任务状态

| Task | 标题 | 状态 | Commits | Review |
|------|------|------|---------|--------|
| 1 | 项目骨架搭建 | ⏳ Pending | — | — |
| 2 | 公共工具 | ⏳ Pending | — | — |
| 3 | 顺滑光标模块 | ⏳ Pending | — | — |
| 4 | 打字机模式模块 | ⏳ Pending | — | — |
| 5 | 涟漪聚焦模块 | ⏳ Pending | — | — |
| 6 | 入口文件 + 顶栏 + 命令面板 | ⏳ Pending | — | — |
| 7 | 清理未使用文件 | ⏳ Pending | — | — |
| 8 | 边界场景测试 + bug 修复 | ⏳ Pending | — | — |
| 9 | README 文档 | ⏳ Pending | — | — |
| 10 | 打包与发布验证 | ⏳ Pending | — | — |

## 关键决策（来自 brainstorm）

- **顺滑光标**：永不暂停
- **鼠标聚焦模式**：只读模式 / 编辑模式 2s 静止 / 鼠标移出当前块 → 切到鼠标中心
- **嵌入块**：涟漪参与，打字机跳过
- **嵌套块**：v1 简单方案（不递归）
- **顶栏 UI**：总开关 + 命令面板（4 个命令）
- **minAppVersion**：3.0.12

## 文档路径

- **设计**：`docs/superpowers/specs/2026-06-27-zentype-redesign-design.md`
- **计划**：`docs/superpowers/plans/2026-06-27-zentype-redesign-plan.md`
- **此台账**：`.superpowers/sdd/progress.md`
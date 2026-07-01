# zenType 已知问题记录

跟踪已发现但未修复、或暂时保留的问题。修复后从本文档删除。

---

## KW-001: typewriter 滚动与顺滑光标适配问题

**报告版本**: v2.3.1  
**状态**: 待优化  
**优先级**: P3  
**发现 commit**: 5b92cfa (SIGN fix) 之后用户测试报告

### 现象
- SIGN fix (commit 5b92cfa) 修复了 typewriter 滚动到顶/底的根因（deltaY 符号反）
- 但动画过渡仍不完美，与顺滑光标模块可能存在协调问题
- 复现条件未知，需要更多场景测试

### 已观察现象（用户报告，待复现验证）
- 打字时顺滑光标的过渡时长与 typewriter scroll 动画的协调（视觉抖动？）
- FLIP 动画（块级插入）与 typewriter scroll 的并发
- 快速打字时 cursor 移动曲线与 scroll 曲线不匹配

### 已尝试 / 不可行方案
- ~~累加 bug 防御 (e040ac6, isScrolling + 100ms 冷却)~~ — 留作防御层，但根因不是累加
- ~~百分比 + 反推算法 bug~~ — 不是，oracle 报告原假设被 DevTools 推翻

### 下一步
1. 收集更多复现场景（具体操作步骤 + DevTools 截图）
2. 决定是否需要 B 方案（仿 Neo-Plus 绝对 target 算法重写 typewriter scroll）
3. 优先级评估：vs 其他 v2.3.x bug 修复

---

## 修订记录

- **2026-07-01**: 创建文件，记录 KW-001 typewriter 适配问题（用户反馈）
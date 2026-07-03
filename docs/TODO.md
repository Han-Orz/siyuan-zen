### 思源集市没有更新 → 改名 zenType（方案 B，执行中）
- **根因**：bazaar stage/plugins.json 冻结 siyuan-zen 在 v1.0.6（name="ZenType"），v2.0.0 起 plugin.json name 改为 "siyuan-zen" 触发 stage 校验冲突，stage 静默保留旧数据，集市从未更新。
- **方案**：统一改名 zenType（repo + plugin.json name + plugins.txt path），两步 PR 重新上架。
- **进度**：
  - [x] 调研根因 + bazaar 校验/清理机制
  - [x] PR #1 删旧 path：plugins.txt 移除 Han-Orz/siyuan-zen → siyuan-note/bazaar#1894（等合并）
  - [ ] 本仓库改名（plugin.json name/url/version→zenType, zh_CN→zh-CN, make_dev_link.js, README）
  - [ ] GitHub repo 改名 siyuan-zen → zenType + 发 v2.6.1 release（package.zip 标 Latest）
  - [ ] PR #2 加新 path：plugins.txt 加 Han-Orz/zenType → 等 stage 收录

### 更新撰写一份详尽的项目设计文档
目的是为了让我这样的编辑小白也能理清楚插件是怎么工作的,有问题的时候能快速定位.
主要说明 + 三个模块如何工作.

---

## 已完成

### ✅ 聚焦模式句级 dim 切换动画（v2.6.1）
- 验证结论：不改 `Range + CSS Custom Highlight API` 架构也能做句级动画；多 highlight 名称承载稳定 dim、fade-in、fade-out 三层
- 实现：旧当前句 `zt-sentence-fade-out` 从原文字色插值到 dim 色；新当前句 `zt-sentence-fade-in` 从 dim 色插值到原文字色；`requestAnimationFrame + easeInOutCubic` 驱动颜色插值
- POC：`参考/highlight-animation-poc.html`
- 当前句稳定态偏淡根因：当前块原先会乘 `visualWeightOf`，当块在视窗边缘时整体 opacity 小于 1；已改为 `distance === 0` 强制 `1.0`
- 文档：`docs/DESIGN.md` 已更新 v2.6.1 设计、配置和决策记录

### ✅ 聚焦模式嵌套列表透明度叠加 bug（v2.6.1, commit f121839)
- 嵌套列表出现透明度×透明度叠加（父块 opacity × 子块 opacity → 几乎不可见）
- 退出聚焦模式（wheel/arrow/click）和关闭插件（destroyRipple）均无法恢复透明度
- 根因：v2.6.0 的 `isConnected` 检查 + P0-3 缓存导致清理不可靠，断开/脱离追踪的块残留 opacity
- 修复：移除三处 `isConnected` 检查；`clearAll`/`destroyRipple` 加 `querySelectorAll` 兜底清理；清 `--zt-sentence-dim-color` CSS 变量

### ✅ 打字机模式的滚动问题（v2.6.1, commit f121839)
- 首字不滚动：vertical-jump defer 内部清 `lastCheckRect=null` + keydown 加 `setBothOn` 修复
- 连续键入不滚动/空隙滚动：input 监听维护 `lastInputAt`，debounce gate（`TYPING_GAP_MS=400`），首字 `firstCharAfterIdle` 立即滚
- 滚动拖 IME 候选窗一卡一卡：`compositionstart`/`compositionend` 监听 + `composing` 门禁，compositionstart 取消 in-flight smoothScroll
- Enter/Backspace 立即滚至中心；click 居中（Option B [0.25,0.75]，缓起缓收 +加长40%）

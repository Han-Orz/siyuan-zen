# 开发者指南

> 写给非程序员的快速上手：改一行代码 → 保存 → 思源里立刻生效。

---

## 一次性设置（约 2 分钟）

**1. 安装依赖**（下载项目里用到的小工具）

```bash
pnpm install
```

**2. 创建符号链接**（告诉思源"我的插件代码在这里"）

```bash
pnpm run link
```

脚本会按以下顺序找你的思源工作区：

1. 环境变量 `SIYUAN_WORKSPACE`
2. 命令行参数 `--workspace <路径>`
3. 默认值：`~/Documents/SiYuan/`

如果脚本提示"找不到思源工作区"，说明你的思源装在了别的地方。用下面这条命令手动指定：

```bash
pnpm run link -- --workspace "C:\Users\<你的用户名>\SiYuan"
```

> 怎么知道自己的思源工作区在哪？打开思源 → 右上角菜单 → "关于" → 看 "工作空间目录"。或者直接打开思源的设置面板，第一页就显示。

**注意**：
- Windows 上创建符号链接需要 **管理员权限** 或 **开发者模式**（设置 → 更新和安全 → 开发者选项 → 开发人员模式）。如果没开，脚本会自动改用 "junction" 链接，效果一样。
- 脚本会创建一个指向项目内 `dev/` 目录的链接。`dev/` 是 watch 模式编译的产物，思源会监听这个目录自动重载。

---

## 日常开发（保存即生效！）

打开 **一个** 终端窗口，跑：

```bash
pnpm run dev
```

效果：
- 终端里看到 `Watching for changes... Output: dev/`
- 现在去改 `src/` 下面的任何 `.ts` 文件
- 保存 → esbuild 重新编译 → 写到 `dev/`
- **思源在 1-2 秒内自动热重载插件** ✨
- 终端里会显示 `index.js  16kb → dev/index.js`

> **不用重启思源！** 不用拖 zip 包！不用 build → 打包 → 拖入 → 重启那一套了。

如果你只想**编译一次**看看有没有错（不进入 watch）：

```bash
pnpm run build:dev
# 输出到 dev/，但不监听文件变化
```

---

## 调试技巧

### 看 console.log 输出

思源菜单 → 设置 → 开发者工具 → **Console** 标签页。

你代码里写的 `console.log("xxx")` 会出现在这里。

### 看思源自己的错误日志

打开文件：`<你的思源工作区>/temp/siyuan.log`

比如：`C:\Users\Han\SiYuan\temp\siyuan.log`

### 检查 DOM（页面上某个元素的样式）

在思源窗口里**右键** → **检查元素**（Inspect Element）→ 弹出 DevTools。

### 改完代码没生效？

按这个顺序排查：

1. **终端还在跑 `pnpm run dev` 吗？** 看有没有 `Watching for changes...` 字样。
2. **保存了文件吗？** esbuild 不会编译未保存的修改。
3. **改的是 `src/` 里的文件吗？** 改 `build.js`、`package.json` 这种配置文件不会触发热重载（需要重启 dev）。
4. **思源里插件是不是被禁用了？** 思源 → 设置 → 插件 → 看 zenType 状态。
5. **看思源日志** 有没有报错：`temp/siyuan.log`

---

## 打包发布

发布新版本到思源集市 / GitHub release：

```bash
pnpm build
```

这条命令会：
1. 编译 `src/` → `dist/index.js`
2. 复制 `plugin.json`、`icon.png`、`preview.png` 到 `dist/`
3. （可选）如果传 `--zip` 参数，会生成 `zentype.zip`

打完包后把 `dist/` 目录里的内容（或者 `zentype.zip`）拖到思源集市提交，或者作为 GitHub release 的附件上传。

---

## 常见问题

### `pnpm install` 报 `ERR_PNPM_IGNORED_BUILDS` 错？

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @parcel/watcher@2.5.6, esbuild@0.21.5
```

**这是 pnpm 11 的安全机制，不影响功能。** 直接用 `node build.js` 验证即可：

```bash
node build.js --dev   # 编译到 dev/
node build.js         # 编译到 dist/
```

不需要修。已用 pnpm-lock.yaml 锁住版本，下次安装不会变。

### `pnpm run link` 报"权限不足"

```
Error: EPERM: operation not permitted, symlink ...
```

两种解决方法（任选其一）：

- **方法 A（推荐）**：开启 Windows 开发者模式
  设置 → 更新和安全 → 开发者选项 → **开发人员模式** → 开启 → 重启电脑
- **方法 B**：用管理员权限运行 PowerShell
  右键 PowerShell → "以管理员身份运行" → 再 `pnpm run link`

开了开发者模式以后普通权限也能建符号链接。脚本默认会自动 fallback 到 junction（不需要管理员），一般能直接成功。

### 链接建错了想重新建？

```bash
# 1. 删掉旧的链接
rm "<你的思源工作区>/data/plugins/siyuan-zen"

# 2. 重新建
pnpm run link
```

### 想换思源工作区？

```bash
pnpm run link -- --workspace "D:\another-workspace\SiYuan"
```

### watch 模式下 `dev/` 越来越大？

正常。`dev/` 是 git-ignored 的，编译产物。嫌乱可以手动 `rimraf dev`（别在 watch 跑的时候删，会被立刻重建）。

---

## 工作流速查

| 你想干什么 | 跑这条 |
|---|---|
| 改代码看效果 | `pnpm run dev` |
| 编译一次看看 | `pnpm run build:dev` |
| 打包发布版本 | `pnpm build` |
| 第一次 / 换电脑 | `pnpm install` + `pnpm run link` |
| 链接坏了重建 | `pnpm run link`（会检测已存在的链接） |
| 清理构建产物 | `pnpm run clean`（删 dist + dev + zip） |

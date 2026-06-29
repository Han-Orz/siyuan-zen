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

## 自定义参数（v2.1+）

想调节光标高度、闪烁延迟等参数？改 `src/config.ts`：

```typescript
export const CURSOR_CONFIG = {
  HEIGHT_RATIO: 1.1,        // 光标高度 = 行高 × 1.1
  BLINK_DELAY_MS: 500,      // 停止活动后多少毫秒恢复呼吸
};
```

想调节颜色、宽度、移动曲线、关键帧？改 `src/styles/index.scss`：

```scss
#zentype-cursor {
  width: 3px;
  background: var(--zt-cursor-color, #5d8cd7);
  transition: transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1);
  animation: zentype-breathe 3s 1.5s ease-in-out infinite;
}
```

保存即生效（`pnpm run dev` 自动重新编译 + 热重载）。

> ⚠️ 配置文件中的 `SMOOTH_ENABLED` / `BLINK_ENABLED` / `APPLY_TO_TITLE` / `USE_IN_MOBILE` 开关暂时是占位（SCSS 编译期锁死），需要同步删改 SCSS 才有效。等 P2 实施后才会真正生效。

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

## 同步工作流（Plan 6 之后 / 2026-06-30+）

> 自从 `58d20f6` 落地后，每次改完 `src/` 代码并 `pnpm run build:dev`，
> 思源工作区里的 5 个文件需要同步更新。可以用 PowerShell 一键搞定：

```powershell
# 一次性：定位你的思源插件目录
$siyuanPlugin = "D:\SiYuan\data\plugins\siyuan-zen"

# 改完代码 → build → 同步这 5 个文件
pnpm run build:dev
Copy-Item -Force `
  "dev\icon.png", `
  "dev\index.js", `
  "dev\index.js.map", `
  "dev\plugin.json", `
  "dev\preview.png" `
  -Destination $siyuanPlugin

# 思源里：插件 → 焦点写作 → 禁用 → 启用（触发热重载）
```

**这 5 个文件分别是什么**：

| 文件 | 作用 |
|---|---|
| `icon.png` | 插件图标（思源侧栏显示） |
| `index.js` | 编译后的 JS 入口（必同步） |
| `index.js.map` | Source map（调试用，可选但推荐） |
| `plugin.json` | 插件元数据（name/version/description） |
| `preview.png` | 集市预览图（v2.0+ 用） |

**如果只改了 `src/` 里的 TS/SCSS**：上面脚本会覆盖 `index.js` 和 `index.js.map`，其它 3 个文件 hash 不会变（已构建的产物一致）。

**如果改了 `plugin.json` / `icon.png` / `preview.png`**：也需要重新 `pnpm run build`（生产模式）才能在集市发布。开发模式只用 `pnpm run build:dev` 即可。

**常见坑**：
- 复制时如果思源正在运行，文件可能被锁定 → 先关闭思源再 Copy-Item，或用 `pnpm run dev` 模式（watch 自动写 dev/，符号链接实时同步）
- `index.js.map` 在生产模式（`pnpm build`）下会带 sourceMappingURL，调试时浏览器自动加载；开发模式不带

---

## 常见问题

### `package-lock.json` 怎么没在 git 里？

`package-lock.json` **目前是 untracked 状态**（不是 .gitignored，但也没 commit）。这是 2026-06-30 的有意决定：

- 项目用 `pnpm`，版本锁定靠 `pnpm-lock.yaml`（已 commit）
- `package-lock.json` 是 `npm` 生成的，本项目用不到
- 如果你看到 `git status` 把它列在 untracked files，**不要 `git add` 它**

```powershell
# 验证它真的不该被 add
git check-ignore -v package-lock.json
# 输出：.gitignore:xx:package-lock.json  → 说明被 ignore（但当前其实没被 ignore，只是 untracked）
```

如果想确认 lockfile 健康：

```bash
pnpm install --frozen-lockfile   # 不修改 lockfile，验证 lockfile 和 package.json 一致
```

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

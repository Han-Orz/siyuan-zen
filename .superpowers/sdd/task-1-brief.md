## Task 1: 项目骨架搭建

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `build.js`
- Create: `plugin.json`（覆盖现有）
- Create: `.gitignore`
- Create: `src/index.ts`（空壳）
- Delete: `src/api.ts`、`src/libs/`、`src/hello.svelte`、`src/setting-example.svelte`、`src/参考/`、`vite.config.ts`、`svelte.config.js`、`yaml-plugin.js`

**Interfaces:**
- Produces: 工作目录结构 + `pnpm install` 可成功 + `pnpm build` 可生成 `index.js`

---

- [ ] **Step 1: 初始化 Git 仓库**

```bash
cd /d/Documents/GitHub/zenType
git init
git config user.email "[email protected]"
git config user.name "zenType Developer"
```

（如果用户没提供邮箱，用占位符。实际执行时询问用户。）

- [ ] **Step 2: 创建 `.gitignore`**

写文件 `.gitignore`：
```gitignore
node_modules/
dist/
.DS_Store
*.log
.hotreload
```

- [ ] **Step 3: 写 `package.json`**

写文件 `package.json`：
```json
{
  "name": "zentype",
  "version": "2.0.0",
  "description": "顺滑光标 + 打字机模式 + 涟漪聚焦 - 让写作更专注",
  "main": "index.js",
  "scripts": {
    "build": "node build.js",
    "dev": "node build.js --watch",
    "clean": "rimraf dist *.zip"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "esbuild": "^0.21.0",
    "esbuild-sass-plugin": "^3.3.1",
    "rimraf": "^5.0.0",
    "sass": "^1.77.0",
    "siyuan": "^1.0.4",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 4: 写 `tsconfig.json`**

写文件 `tsconfig.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: 写 `build.js`**

写文件 `build.js`：
```javascript
const esbuild = require('esbuild');
const { sassPlugin } = require('esbuild-sass-plugin');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'index.js',
  platform: 'browser',
  target: 'es2022',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  external: ['siyuan'],
  loader: { '.ts': 'ts' },
  plugins: [
    sassPlugin({
      type: 'css',
      loadPaths: ['src/styles'],
    }),
  ],
  logLevel: 'info',
};

async function copyAssets() {
  fs.mkdirSync('dist', { recursive: true });
  fs.copyFileSync('plugin.json', path.join('dist', 'plugin.json'));
  fs.copyFileSync('icon.png', path.join('dist', 'icon.png'));
  fs.copyFileSync('preview.png', path.join('dist', 'preview.png'));
  fs.copyFileSync('index.js', path.join('dist', 'index.js'));
  // 内联 CSS
  const indexJs = fs.readFileSync('index.js', 'utf-8');
  if (!indexJs.includes('INSERT_CSS_HERE')) {
    console.warn('Warning: index.js does not contain INSERT_CSS_HERE marker');
  }
}

if (watch) {
  esbuild.context(buildOptions).then(ctx => {
    ctx.watch();
    console.log('Watching for changes...');
  });
} else {
  esbuild.build(buildOptions).then(() => {
    copyAssets();
    console.log('Build complete: dist/');
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 6: 写 `plugin.json`**

写文件 `plugin.json`：
```json
{
  "name": "zenType",
  "author": "zenType Developer",
  "url": "https://github.com/your-username/zenType",
  "version": "2.0.0",
  "minAppVersion": "3.0.12",
  "backends": ["all"],
  "frontends": ["all"],
  "displayName": {
    "default": "zenType",
    "zh_CN": "禅打"
  },
  "description": {
    "default": "Smooth cursor + typewriter mode + ripple focus for distraction-free writing",
    "zh_CN": "顺滑光标 + 打字机模式 + 涟漪聚焦，让写作更专注"
  },
  "readme": {
    "default": "README.md",
    "zh_CN": "README_zh_CN.md"
  },
  "funding": {},
  "disabledInPublish": false
}
```

- [ ] **Step 7: 写最小 `src/index.ts`**

写文件 `src/index.ts`：
```typescript
// zenType v2 入口
console.log("zenType v2 loading...");
```

- [ ] **Step 8: 安装依赖**

```bash
cd /d/Documents/GitHub/zenType
pnpm install
```

预期：依赖安装成功，无错误。

- [ ] **Step 9: 第一次构建**

```bash
pnpm build
```

预期：`dist/index.js` 生成，无错误。

- [ ] **Step 10: 删除未使用的模板文件**

```bash
cd /d/Documents/GitHub/zenType
rm -rf src/api.ts src/libs/ src/hello.svelte src/setting-example.svelte src/参考/ vite.config.ts svelte.config.js yaml-plugin.js
```

- [ ] **Step 11: 提交**

```bash
git add -A
git commit -m "chore: rebuild project skeleton with esbuild + TypeScript"
```

---


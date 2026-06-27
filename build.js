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

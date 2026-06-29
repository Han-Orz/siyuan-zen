const esbuild = require('esbuild');
const { sassPlugin } = require('esbuild-sass-plugin');
const fs = require('fs');
const path = require('path');

const isDev = process.argv.includes('--dev');
const isWatch = process.argv.includes('--watch');
const isZip = process.argv.includes('--zip');

const OUT_DIR = isDev ? 'dev' : 'dist';
const OUT_FILE = path.join(OUT_DIR, 'index.js');

const buildOptions = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: OUT_FILE,
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

function copyAssets() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.copyFileSync('plugin.json', path.join(OUT_DIR, 'plugin.json'));
  fs.copyFileSync('icon.png', path.join(OUT_DIR, 'icon.png'));
  fs.copyFileSync('preview.png', path.join(OUT_DIR, 'preview.png'));
  const outJs = fs.readFileSync(OUT_FILE, 'utf-8');
  if (!outJs.includes('INSERT_CSS_HERE')) {
    console.warn('Warning: index.js does not contain INSERT_CSS_HERE marker');
  }
}

if (isWatch) {
  esbuild
    .context(buildOptions)
    .then(async (ctx) => {
      // Do an initial build synchronously so dev/ has index.js before
      // copyAssets() tries to read it. Then start watching for changes.
      await ctx.rebuild();
      copyAssets();
      await ctx.watch();
      console.log(`Watching for changes... Output: ${OUT_DIR}/`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else {
  esbuild
    .build(buildOptions)
    .then(() => {
      copyAssets();
      console.log(`Build complete: ${OUT_DIR}/`);
      if (isZip) packageZip();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

function packageZip() {
  const archiver = require('archiver');
  const output = fs.createWriteStream('zentype.zip');
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log(`Created zentype.zip (${archive.pointer()} bytes)`);
  });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('Archive warning:', err);
    } else {
      throw err;
    }
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);
  archive.directory('dist/', false);
  archive.finalize();
}

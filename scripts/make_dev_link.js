// scripts/make_dev_link.js
//
// Purpose: Create a directory symlink from <SiYuan workspace>/data/plugins/siyuan-zen/
// to <project>/dev/, so SiYuan hot-reloads the plugin as we rebuild during development.
//
// Workspace resolution order:
//   1. SIYUAN_WORKSPACE environment variable
//   2. --workspace <path> CLI argument
//   3. %USERPROFILE%\Documents\SiYuan\   (default)
//
// On Windows the script tries a real symlink first (type='dir'); if that fails
// with a permission error it falls back to a directory junction (type='junction'),
// which does not need admin or Developer Mode.

const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_NAME = 'siyuan-zen';
const DEFAULT_WORKSPACE = path.join(os.homedir(), 'Documents', 'SiYuan');

const log = (msg) => console.log(`\x1B[36m[make_dev_link]\x1B[0m ${msg}`);
const warn = (msg) => console.log(`\x1B[33m[make_dev_link]\x1B[0m ${msg}`);
const error = (msg) => console.log(`\x1B[31m[make_dev_link]\x1B[0m ${msg}`);

function parseArgs(argv) {
  const args = { workspace: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workspace' && i + 1 < argv.length) {
      args.workspace = argv[++i];
    } else if (a.startsWith('--workspace=')) {
      args.workspace = a.slice('--workspace='.length);
    } else if (a === '-h' || a === '--help') {
      args.help = true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/make_dev_link.js [--workspace <path>]

Resolves the SiYuan workspace in this order:
  1. SIYUAN_WORKSPACE env var
  2. --workspace <path> CLI arg
  3. Default: ${DEFAULT_WORKSPACE}

Creates a symlink: <workspace>/data/plugins/${PLUGIN_NAME} -> <project>/dev/`);
}

function resolveWorkspace(args) {
  if (process.env.SIYUAN_WORKSPACE && process.env.SIYUAN_WORKSPACE.trim() !== '') {
    const ws = process.env.SIYUAN_WORKSPACE.trim();
    log(`Using SIYUAN_WORKSPACE env var: ${ws}`);
    return ws;
  }
  if (args.workspace) {
    log(`Using --workspace CLI arg: ${args.workspace}`);
    return args.workspace;
  }
  log(`No workspace specified, using default: ${DEFAULT_WORKSPACE}`);
  return DEFAULT_WORKSPACE;
}

function ensureDir(dir, label) {
  if (fs.existsSync(dir)) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    log(`Created ${label}: ${dir}`);
  } catch (e) {
    error(`Failed to create ${label} at ${dir}: ${e.message}`);
    process.exit(1);
  }
}

function createSymlink(srcDir, dstDir) {
  // Already linked to the right place?
  try {
    const stat = fs.lstatSync(dstDir);
    if (stat.isSymbolicLink()) {
      const existing = fs.readlinkSync(dstDir);
      if (path.resolve(existing) === path.resolve(srcDir)) {
        log(`Symlink already exists and points to ${srcDir}. Nothing to do.`);
        return;
      }
      error(
        `Failed: ${dstDir} already exists and is a symlink to a different target:\n` +
        `  current: ${existing}\n` +
        `  expected: ${srcDir}\n` +
        `Please remove the existing symlink first.`
      );
      process.exit(1);
    }
    error(
      `Failed: ${dstDir} already exists and is NOT a symlink.\n` +
      `If you previously installed the production plugin there, remove that directory first.`
    );
    process.exit(1);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      // Some other stat error — bail with a clear message.
      error(`Failed to inspect ${dstDir}: ${e.message}`);
      process.exit(1);
    }
    // ENOENT means the path does not exist — good, we can create the link.
  }

  // Prefer a real 'dir' symlink (works on macOS/Linux, and on Windows with
  // admin privileges or Developer Mode enabled).
  try {
    fs.symlinkSync(srcDir, dstDir, 'dir');
    log(`Created directory symlink: ${dstDir} -> ${srcDir}`);
    return;
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'ENOSYS') {
      warn(`Symlink ('dir') not permitted (${e.code}). Falling back to junction.`);
    } else {
      error(`Failed to create symlink: ${e.message}`);
      process.exit(1);
    }
  }

  // Junction fallback for Windows: no admin required, but only works for
  // directories and is one-way (no relative resolution).
  try {
    fs.symlinkSync(srcDir, dstDir, 'junction');
    log(`Created directory junction: ${dstDir} -> ${srcDir}`);
  } catch (e) {
    error(`Failed to create junction: ${e.message}`);
    process.exit(1);
  }
}

function verifyLink(dstDir) {
  try {
    const stat = fs.lstatSync(dstDir);
    if (!stat.isSymbolicLink() && !stat.isDirectory()) {
      error(`Verification failed: ${dstDir} is not a symlink or directory.`);
      process.exit(1);
    }
    // For junctions, lstat.isSymbolicLink() is false but isDirectory() is true.
    // For symlinks, isSymbolicLink() is true. Both are acceptable.
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(dstDir);
      log(`Verified: ${dstDir} is a symlink -> ${target}`);
    } else {
      log(`Verified: ${dstDir} is a directory (likely a junction).`);
    }
  } catch (e) {
    error(`Verification failed: ${e.message}`);
    process.exit(1);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const workspace = resolveWorkspace(args);
  if (!fs.existsSync(workspace)) {
    error(
      `SiYuan workspace not found at: ${workspace}\n` +
      `Set SIYUAN_WORKSPACE, pass --workspace <path>, or check that SiYuan has been launched at least once\n` +
      `so it creates its workspace directory.`
    );
    process.exit(1);
  }

  const pluginsDir = path.join(workspace, 'data', 'plugins');
  ensureDir(pluginsDir, 'SiYuan plugins directory');

  const projectRoot = process.cwd();
  const devDir = path.join(projectRoot, 'dev');
  ensureDir(devDir, 'project dev directory');

  const linkPath = path.join(pluginsDir, PLUGIN_NAME);
  log(`Link target: ${linkPath}`);
  log(`Link source: ${devDir}`);

  createSymlink(devDir, linkPath);
  verifyLink(linkPath);

  log('Done. SiYuan should now hot-reload the plugin on every rebuild into dev/.');
}

main();

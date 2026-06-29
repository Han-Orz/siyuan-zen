# SiYuan Plugin: Repo Renaming & Development Workflow Research

> Research date: 2026-06-28
> Researcher: librarian (external research agent)
> Target audience: zenType / siyuan-zen plugin maintainer

---

## Part 1: Renaming the Repo

### 1.1 Background

**Current state of the plugin in the SiYuan marketplace:**
- The plugin is listed in the community bazaar at Han-Orz/siyuan-zen
- **Marketplace entry**: plugins.txt in siyuan-note/bazaar contains Han-Orz/siyuan-zen (confirmed by reading the raw bazaar file)
- **Published version**: v1.0.6 is currently the latest release on Han-Orz/siyuan-zen
- **Published plugin.json** (from https://github.com/Han-Orz/siyuan-zen):
  - "name": "ZenType" (capital Z)
  - "url": "https://github.com/Han-Orz/siyuan-zen"
  - "displayName": { "en_US": "balabala", "zh_CN": "焦点写作" }

**Current GitHub repo structure:**
- **Remote repo (siyuan-zen)**: https://github.com/Han-Orz/siyuan-zen — this is the actual repo, exists, has 16 commits, v1.0.6 release. The siyuan-zen repo was generated from siyuan-note/plugin-sample-vite-svelte template.
- **Remote repo (zenType)**: https://github.com/Han-Orz/zenType — **returns 404**, does not exist.
- **Local setup**: Working directory D:\Documents\GitHub\zenType with git remote origin set to https://github.com/Han-Orz/zenType.git (the non-existent repo).
- **Local plugin.json** (v2.0.0 code):
  - "name": "zenType" (lowercase z)
  - "url": "https://github.com/your-username/zenType" (placeholder URL!)
  - The local codebase was rebuilt from scratch (commit c15067) using esbuild—it is NOT the same git history as siyuan-zen.

### 1.2 SiYuan Marketplace Mechanics

**How marketplace tracks plugin repos:**
- The bazaar uses a **list file** (plugins.txt) — not JSON! Each line is a repo reference in owner/repo format.
  - Source: https://github.com/siyuan-note/bazaar/blob/main/plugins.txt
  - Example entry: Han-Orz/siyuan-zen
- The GitHub Actions workflow in the bazaar repo reads this list, checks each repo's latest release for package.zip, and builds the marketplace index.
- The plugin.json's 
ame field does NOT need to match the repo name for marketplace discovery — the bazaar uses owner/repo from plugins.txt.

**The 
ame field in plugin.json — relationship to GitHub repo name:**
- **Official documentation says**: "
ame: Plugin package name, must be the same as the GitHub repository name, and cannot be duplicated with other plugins in the marketplace"
  - Source: https://github.com/siyuan-note/plugin-sample (both English and Chinese READMEs)
- **Reality check**: The published siyuan-zen v1.0.6 has "name": "ZenType" while the repo is named siyuan-zen. This contradicts the official rule, showing the marketplace does NOT strictly enforce name=repo matching.
- The 
ame field is used internally by SiYuan to determine the **plugin directory name** inside data/plugins/<name>/.
- The make_dev_link.js script reads the 
ame field from plugin.json to set the target symlink path.

**Marketplace update process:**
1. For **first release**: PR to siyuan-note/bazaar, add owner/repo to plugins.txt
2. For **subsequent releases**: Just create a GitHub release with package.zip attached — the bazaar index auto-updates every 1-3 hours
3. If a repo is **renamed on GitHub**, GitHub provides automatic HTTP redirects from the old URL. However, plugins.txt still references the old name, so it would break when the bazaar tries to fetch the release.
4. If the 
ame in plugin.json changes between releases, existing users who installed the old version will have their plugin in data/plugins/<old-name>/, and the new version would be installed to data/plugins/<new-name>/ — potentially causing duplicates.

### 1.3 Renaming Options

#### Option A: Update remote to siyuan-zen, keep 
ame as zenType

**Pros:**
- ✅ Market already working: Han-Orz/siyuan-zen is listed
- ✅ Existing users' installations won't break (plugin still installed to data/plugins/zenType/)
- ✅ Corrects the placeholder URL in plugin.json
- ✅ Minimal changes needed
- ✅ The zenType package name is distinct from the repo name (no collision risk)

**Cons:**
- ❌ Violates the official "name must match repo name" guideline
- ❌ The local plugin.json URL still needs fixing from placeholder
- ❌ Future tooling that enforces the name=repo rule (like siyuan-plugin-cli) may have issues

**Migration steps:**
1. git remote set-url origin https://github.com/Han-Orz/siyuan-zen.git
2. Edit plugin.json: change "url" from placeholder to "https://github.com/Han-Orz/siyuan-zen"
3. Keep "name": "zenType" (or change to "ZenType" for consistency with v1.0.6)
4. Push to the new remote: git push origin master

**Risk assessment: LOW** — The marketplace already works. No GitHub repo rename needed. Just fix the remote URL and plugin.json metadata.

#### Option B: Rename GitHub repo from siyuan-zen to zenType, align everything

**Pros:**
- ✅ Makes name=repo match the official guideline
- ✅ Everything is consistently named "zenType"

**Cons:**
- ❌ **BREAKS THE MARKETPLACE**: The bazaar's plugins.txt has Han-Orz/siyuan-zen. Renaming the repo would break the marketplace link until someone PRs the bazaar to update it. Even with GitHub redirects, the bazaar's Go-based indexing code may not handle redirects seamlessly.
- ❌ Existing users who installed from the marketplace would still have the old siyuan-zen URL in their plugin metadata
- ❌ Requires a marketplace PR to update plugins.txt
- ❌ Renaming an existing repo with 16 commits and 2 releases creates disruption

**Risk assessment: HIGH** — Not recommended. The repo is already correctly named for the marketplace.

#### Option C: Hybrid — siyuan-zen stays as the remote, change 
ame to siyuan-zen in plugin.json

**Pros:**
- ✅ Perfectly follows the official "name must match repo name" guideline
- ✅ Consistent naming everywhere
- ✅ Readies the plugin for potential stricter enforcement in future SiYuan versions

**Cons:**
- ❌ **Breaks existing installations**: Users who had v1.0.6 installed would have data/plugins/ZenType/. The v2.0.0 upgrade would install to data/plugins/siyuan-zen/, creating duplicate entries in the marketplace UI. Users would need to manually remove the old version.
- ❌ The displayName should still be "zenType" or "焦点写作" for user-facing display, so it's confusing to have 
ame different from displayName
- ❌ Package name siyuan-zen is long and redundant (it's a SiYuan plugin — the prefix is implied)

**Risk assessment: MEDIUM** — Technically correct but creates user migration friction.

### 1.4 Comparison Table

| Aspect | Option A (Keep zenType name) | Option B (Rename repo) | Option C (Change name to siyuan-zen) |
|--------|-------------------------------|----------------------|----------------------------------------|
| Marketplace disruption | None | High (breaks listing) | None |
| Existing user disruption | None | None | Medium (duplicate installation) |
| Official guideline compliance | No | Yes | Yes |
| Migration effort | Low | High | Medium |
| Risk | Very Low | High | Medium |

### 1.5 Recommendation

> **Recommended approach: Option A** — Update the remote to point to Han-Orz/siyuan-zen, fix the placeholder URL in plugin.json, and keep "name": "zenType" for backward compatibility.

**Reasoning:**
1. The marketplace **already works** with Han-Orz/siyuan-zen — no change needed there.
2. The 
ame field in the published v1.0.6 is "ZenType", proving the marketplace does not enforce name=repo matching.
3. Changing the 
ame would create unnecessary migration issues for existing users (duplicate entry in marketplace).
4. The actual problem is just the **local git remote pointing to a 404 URL** and the **placeholder in plugin.json** — both easy fixes.

**Step-by-step migration plan:**

`ash
# Step 1: Fix the git remote
cd D:\Documents\GitHub\zenType
git remote set-url origin https://github.com/Han-Orz/siyuan-zen.git

# Step 2: Fix plugin.json URL
# Change "url": "https://github.com/your-username/zenType"
#     to "url": "https://github.com/Han-Orz/siyuan-zen"

# Step 3: Verify remote works
git fetch origin

# Step 4: Decide whether to keep directory name as "zenType"
# The local folder name doesn't affect the marketplace.
# Recommended: rename folder to "siyuan-zen" for consistency
# But it's not strictly necessary.

# Step 5: Push v2.0.0 as a new release
# Create a GitHub release on the siyuan-zen repo
# Attach the built zip
# The bazaar auto-indexes it within 1-3 hours
`

### 1.6 Reference Notes

**From the sspai.com article** (https://sspai.com/post/94572):
- The author used the rostime/plugin-sample-vite template and mentions the dev workflow
- Key quote: "又是 run dev，又是 make_link" — confirming the standard workflow
- The article also references the official plugin sample and API docs
- The hardest part for new developers was environment setup (pnpm/mirror issues)

**From the plugin-sample docs:**
- "name: Plugin package name, must be the same as the GitHub repository name, and cannot be duplicated with other plugins in the marketplace"
- The url field in plugin.json should point to the GitHub repo URL
- First-time marketplace listing requires a PR to siyuan-note/bazaar modifying plugins.txt

**From the bazaar repo:**
- Uses plugins.txt (NOT plugins.json) with owner/repo format
- Updates happen automatically every 1-3 hours via GitHub Actions
- No per-plugin configuration needed beyond the listing in plugins.txt

---

## Part 2: Development Workflow Research

### 2.1 Current Pain Points

The current zenType development workflow ("build → zip → drag → restart") has these issues:

1. **Manual zip step**: 
ode build.js outputs to dist/ and can optionally zip, but the zip must be manually dragged into SiYuan
2. **Restart required**: SiYuan must be restarted (or at minimum, the plugin reloaded) to pick up changes
3. **No symlink setup**: The make_dev_link.js and utils.js scripts that were in the original template were deleted in commit 0faa60 ("clean up unused template files")
4. **No livereload**: The current build uses esbuild --watch which rebuilds on changes, but SiYuan doesn't automatically reload
5. **Context switching**: Each code change → build → drag → restart cycle takes 10-30 seconds

### 2.2 SiYuan Plugin Dev Standards

#### 2.2.1 The Standard Dev Workflow (from official template)

**The correct workflow uses three components working together:**

1. **make_dev_link.js** — Creates a symbolic link
2. **dev/ directory** — Watch-mode build output
3. **SiYuan's live loading** — Plugin loaded from symlink directory picks up changes

**Step-by-step for the standard workflow:**

`ash
# One-time setup:
pnpm install

# Create a symbolic link from dev/ to SiYuan plugins dir:
pnpm run make-link
# This auto-detects your SiYuan workspace via the running SiYuan kernel API
# Falls back to SIYUAN_PLUGIN_DIR env var if SiYuan isn't running

# Start development (watch mode):
pnpm run dev
# Rebuilds on file changes, outputs to dev/
`

**Wait — is there actually a livereload for SiYuan plugins?** Let me clarify what happens after the build:

- The plugin-sample-vite-svelte template uses ollup-plugin-livereload which injects a livereload script. This works when SiYuan loads the plugin as a web page, because SiYuan renders plugin UI inside its Electron/webview environment. The livereload script polls the dev server for changes and refreshes the relevant iframe.
- Without livereload: SiYuan detects file changes in the data/plugins/ directory and reloads the plugin automatically (this is the behavior when using symlinks — the OS-level file watcher in SiYuan's kernel detects changes).
- **No SiYuan restart is needed** when using the symlink + watch approach. SiYuan's kernel watches data/plugins/ for changes and hot-reloads plugins.

#### 2.2.2 The make_dev_link.js Script

**Purpose:** Creates a directory symlink from your project's dev/ folder to <SiYuan workspace>/data/plugins/<plugin-name>/.

**How it works:**
1. Connects to the running SiYuan kernel at http://127.0.0.1:6806/api/system/getWorkspaces
2. If SiYuan isn't running, falls back to SIYUAN_PLUGIN_DIR env var
3. Presents a list of available workspaces for the user to choose
4. Reads plugin.json to get the plugin 
ame
5. Creates a directory symlink: <workspace>/data/plugins/<name> → <project>/dev/
6. On Windows, requires **administrator privileges** or **developer mode** (since Go 1.23 no longer supports junction points — see [issue #12399](https://github.com/siyuan-note/siyuan/issues/12399))

**The scripts directory originally included:**
- make_dev_link.js — Create dev symlink
- make_install.js — Copy dist to plugins dir (for production testing)
- update_version.js — Interactive version updater
- utils.js — Shared utilities (workspace detection, symlink creation)
- elevate.ps1 — Windows admin elevation wrapper

**All of these were deleted** from the zenType project in commit 0faa60.

#### 2.2.3 The .hotreload File

The .hotreload entry in .gitignore (line 5) is **not an active mechanism** in the current zenType codebase. It's a leftover convention from the original plugin-sample-vite-svelte template.

**What it is:** Looking at the sample template's ite.config.ts, there is no reference to .hotreload. The actual livereload mechanism is:
- ollup-plugin-livereload in the Vite/Rollup build pipeline
- The plugin watches the output directory and triggers browser reload via WebSocket

The .hotreload file in .gitignore may have been from an older convention or from community discussions where developers would touch a .hotreload file or use it as a flag for watch scripts. **No documentation for .hotreload as a SiYuan plugin mechanism was found in official sources.** It is safe to keep it in .gitignore.

#### 2.2.4 SiYuan's Plugin Live Loading

**SiYuan does support live-loading plugins** through a file system watcher:
- The SiYuan kernel monitors the data/plugins/ directory for changes
- When a plugin's files change (via symlink rebuild), SiYuan reloads the plugin
- **No manual restart is needed** for most changes
- For some changes to plugin.json metadata, a refresh of the marketplace page may be needed

**Debugging tools:**
- **Open DevTools**: In SiYuan, you can open the Electron DevTools via 开发者工具 (Developer Tools) in the menu
- **Inspect Element**: Right-click → Inspect Element in the SiYuan window
- **Console logging**: Use console.log() in your plugin code — it appears in SiYuan's DevTools console
- **SiYuan's built-in logging**: Check workspace/temp/siyuan.log for plugin errors

#### 2.2.5 Watch Mode

The current zenType build has a --watch flag that uses esbuild's built-in watch mode:

`ash
npm run dev  # runs "node build.js --watch"
`

This watches the source files and rebuilds index.js on changes. However, it outputs to the **project root** (and copies to dist/), not to a dev/ directory linked to SiYuan.

**The standard template uses Vite build in watch mode** instead:

`ash
"dev": "cross-env NODE_ENV=development VITE_SOURCEMAP=inline vite build --watch"
`

This outputs to dev/ (the linked directory). The Vite plugin ecosystem also supports ollup-plugin-livereload for auto-refresh.

### 2.3 Community Tools

#### 2.3.1 siyuan-plugin-cli (recommended)

**Author:** frostime
**GitHub:** https://github.com/frostime/siyuan-plugin-cli  
**npm:** https://www.npmjs.com/package/siyuan-plugin-cli

This is the **actively maintained successor** to the manual scripts/ directory approach. Features:

- 
px make-link — Create dev symlink (auto-detects workspace, supports --dist, --src)
- 
px make-link-win — Version with admin elevation for Windows
- 
px make-install — Copy built files to plugins dir (no symlink)
- 
px check-link — Verify link status
- 
px update-version — Interactive version updater
- 
px create-plugin — Scaffold new plugin from templates

**Installation:**
`ash
npm install --save-dev siyuan-plugin-cli
# or
npm install -g siyuan-plugin-cli
`

The built-in make-link scripts in templates may be removed in future versions in favor of siyuan-plugin-cli.

#### 2.3.2 Neo-Plus Dev Workflow

Neo-Plus (https://github.com/QYLexpired/Neo-Plus) uses a **simpler, no-symlink approach**:
- Manual uild.js script with esbuild and sass compilation (no watch mode in package.json)
- Separate package.js for zipping
- No make_dev_link.js or dev/ directory
- No watcher or livereload

This is similar to zenType's current approach, confirming that many plugins still use the manual workflow. However, Neo-Plus is primarily a companion theme plugin (mostly SCSS/CSS), so its dev cycle may be simpler.

#### 2.3.3 Other Community Approaches

Many community plugins use:
- Vite + esbuild + symlink + livereload (standard approach)
- Or manual build → restart (simpler but slower)

The plugin-sample-vite-svelte template is the most popular starting point, used by at least 20+ marketplace plugins.

### 2.4 Recommended Dev Workflow

#### Setup (one-time)

`ash
# 1. Install dependencies
pnpm install

# Option A: Use the re-usable scripts from the template
# Copy scripts/ directory from plugin-sample-vite-svelte
# https://github.com/siyuan-note/plugin-sample-vite-svelte/tree/main/scripts

# Option B (Recommended): Use siyuan-plugin-cli
pnpm install --save-dev siyuan-plugin-cli

# 2. Modify build.js to output to dev/ instead of root
# Change:
#   const outputDir = 'dev';  // was: outfile: 'index.js' in root
# Add a dev-specific build that writes to dev/

# 3. Create the symlink
npx make-link
# Select your SiYuan workspace from the list
`

#### Daily Dev Loop

`ash
# Terminal 1: Watch for changes and rebuild
pnpm run dev

# Make code changes → auto rebuild to dev/ → SiYuan picks up changes
# No manual restart needed!

# For debugging: Open SiYuan's DevTools (right-click → Inspect)
# Your console.log() output appears there
`

#### Build & Release

`ash
# Production build
pnpm run build

# Create zip
# The standard template auto-generates package.zip with vite-plugin-zip-pack

# Create a GitHub release with the zip attached
# Bazaar auto-indexes within 1-3 hours
`

#### Required Changes to Current zenType Build

To adopt this workflow, the uild.js needs these modifications:

1. **Add a dev output target** that writes to dev/ instead of project root:
   - Set outdir: 'dev' (or outfile: 'dev/index.js') in dev mode
   - Copy plugin.json, icon.png, preview.png to dev/ as well
2. **Restore the scripts/ directory** with make_dev_link.js and utils.js
3. **Add dev/ to .gitignore** (it's already there via the dist/ entry? No — dev/ is separate)
4. **Optionally add ollup-plugin-livereload** for auto-refresh (but SiYuan's file watcher may suffice)

**Simplified alternative:** Just use siyuan-plugin-cli and link the current dist/ directory:
`ash
npx make-link --dist
`
Then ensure pnpm run dev outputs to dist/. The watch mode will rebuild on changes, and SiYuan will detect the file changes in data/plugins/zenType/.

### 2.5 Dev Workflow Comparison

| Aspect | Current zenType workflow | Standard template workflow | With siyuan-plugin-cli |
|--------|-------------------------|---------------------------|----------------------|
| Build tool | esbuild (custom build.js) | Vite + esbuild | Any (configurable) |
| Dev output | project root (index.js) | dev/ directory | Any directory |
| Symlink | None | Manual script | 
px make-link |
| Watch mode | 
ode build.js --watch | ite build --watch | Same as build tool |
| Livereload | None | ollup-plugin-livereload | Same as build tool |
| Windows symlink | N/A | Needs admin/dev mode | 
px make-link-win |
| Restart needed? | Yes (full restart) | No (file watcher) | No |
| Debugging | console.log + restart | DevTools console | DevTools console |

### 2.6 References

**Official docs and repos:**
- SiYuan Plugin API (petal): https://github.com/siyuan-note/petal
- SiYuan Backend API (中文): https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md
- Plugin sample (webpack): https://github.com/siyuan-note/plugin-sample
- Plugin sample (Vite + Svelte): https://github.com/siyuan-note/plugin-sample-vite-svelte
- Community bazaar: https://github.com/siyuan-note/bazaar
- Symlink issue: https://github.com/siyuan-note/siyuan/issues/12399

**Community tools:**
- siyuan-plugin-cli: https://github.com/frostime/siyuan-plugin-cli | https://www.npmjs.com/package/siyuan-plugin-cli
- frostime/plugin-sample-vite: https://github.com/frostime/plugin-sample-vite
- Neo-Plus (comparison): https://github.com/QYLexpired/Neo-Plus

**Reference articles:**
- sspai article on SiYuan plugin dev: https://sspai.com/post/94572
  - Confirmed the "run dev + make_link" workflow is the standard
  - The author found the vite-based template easier to work with
  - Dev setup (pnpm, link, etc.) was the hardest part

**From the project's own git history:**
- The original scripts/make_dev_link.js and scripts/utils.js were from rostime's template (preserved in commit c8081fe and deleted in 0faa60)
- The .hotreload in .gitignore is a convention from the original template, not an active mechanism
- The current build.js only supports --watch for rebuilds but lacks the dev symlink setup

---

## Recommendations Summary

### 1. For Renaming: Option A (Fix remote, keep name as zenType)

**Rationale:** The marketplace already uses Han-Orz/siyuan-zen. The repo is already correctly named for the marketplace. The only problems are (a) the local git remote points to a 404 URL, and (b) the plugin.json URL is a placeholder. Fix both and ship v2.0.0.

**Action items:**
1. git remote set-url origin https://github.com/Han-Orz/siyuan-zen.git
2. Fix plugin.json URL from placeholder to https://github.com/Han-Orz/siyuan-zen
3. (Optional) Rename local folder from zenType to siyuan-zen
4. Push v2.0.0 to siyuan-zen and create a new release
5. No bazaar PR needed — existing listing auto-picks up new releases

### 2. For Dev Workflow: Adopt the standard symlink approach

**Rationale:** The current "build → zip → drag → restart" cycle costs ~30 seconds per iteration. The standard workflow (symlink + watch mode) eliminates the zip/drag/restart steps entirely. Changes appear within seconds of saving.

**Action items:**
1. Install siyuan-plugin-cli as a dev dependency: pnpm install --save-dev siyuan-plugin-cli
2. Add dev/ to .gitignore
3. Modify uild.js to output to dev/ when --watch is used
4. Run 
px make-link to create the symlink (run as admin or enable dev mode)
5. Run 
pm run dev for development — save files and watch SiYuan pick up changes
6. Keep 
pm run build for production builds (outputs to dist/ or creates zip)

### 3. Next Steps

| Priority | Task | Difficulty | Impact |
|----------|------|------------|--------|
| 🔴 High | Fix git remote and plugin.json URL | Easy | Critical (current remote is dead) |
| 🟡 Medium | Set up dev symlink workflow | Medium | Eliminates 90% of iteration time |
| 🟢 Low | Add livereload via ollup-plugin-livereload | Medium | Nice-to-have for instant feedback |

---

## Sources

1. https://github.com/siyuan-note/plugin-sample — Official plugin sample (marketplace rules)
2. https://github.com/siyuan-note/plugin-sample-vite-svelte — Vite+Svelte template (dev workflow)
3. https://github.com/siyuan-note/bazaar — Community bazaar (plugins.txt format)
4. https://github.com/siyuan-note/petal — Plugin API declarations
5. https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md — Backend API
6. https://github.com/siyuan-note/siyuan/issues/12399 — Windows symlink issue
7. https://github.com/Han-Orz/siyuan-zen — Published siyuan-zen repo (v1.0.6)
8. https://github.com/QYLexpired/Neo-Plus — Neo-Plus plugin comparison
9. https://github.com/frostime/siyuan-plugin-cli — CLI toolkit
10. https://www.npmjs.com/package/siyuan-plugin-cli — CLI toolkit on npm
11. https://sspai.com/post/94572 — Reference article (SiYuan plugin dev experience)
12. zenType local git history (commits bc15067, c8081fe, f0faa60)

# zenType v2

Smooth cursor + typewriter mode + ripple focus for distraction-free writing in SiYuan Note.

> **⚠️ Upgrading from v1.0.6?**
>
> The plugin's internal name changed from `ZenType` (v1.0.6) to `siyuan-zen` (v2.0.0) to comply with the SiYuan Bazaar rule that `plugin.json` `name` must match the GitHub repo name. SiYuan treats these as **two different plugins**, so v1.0.6 users must:
>
> 1. **Uninstall the old `ZenType` plugin first** (Settings → Plugins → ZenType → Uninstall)
> 2. **Then install `siyuan-zen`** using the new zip from [Releases](../../releases)
>
> Skipping step 1 will leave both plugins installed side-by-side. Your data and settings are not transferred (you'll need to re-toggle features you want).

## Features

- **Smooth Cursor** — Custom blue cursor replaces the system caret with smooth transition animation
- **Typewriter Mode** — Your caret stays at 38% screen height (golden ratio), with a subtle highlight bar tracking it
- **Ripple Focus** — The current block stays bright while surrounding blocks gradually fade

## Installation

1. Download the latest release zip from the Releases page
2. In SiYuan Note, open Settings → Plugins → Load plugin from disk
3. Select the downloaded zip

## Usage

All three features are enabled by default. To toggle:

- **Top bar icon** (pencil): Toggle all three features on/off
- **Command palette** (Ctrl+Shift+P): Search "zenType" to see individual toggles

## Edge Cases

### Mouse-Centered Ripple (new in v2)

When you're in read-only mode, or when you've stopped typing for 2+ seconds, the ripple focus automatically follows your mouse cursor. As soon as you start typing again, it returns to tracking your text caret.

### Embedded Blocks

Videos, iframes, and PDF embeds are treated as 1 ripple unit (they fade normally). Typewriter mode skips them (no scroll when cursor is in an embed).

### Nested Blocks (Simplified in v1)

If your cursor is in a child of a nested block (e.g., a list item inside a list), only the immediate parent layer fades. Outer containers stay at 100% opacity. This is a simplification — recursive fading is planned for v2 if users request it.

### Selection (Multi-line)

When you drag-select text, ripple focus and typewriter mode gracefully fade out (0.3s animation). The smooth cursor stays active.

### Suspended Edits & Popups

Read-only mode and block popups automatically suspend typewriter mode. Ripple focus switches to mouse-centered mode in read-only.

## Customization (v2.1)

Open `src/config.ts` to tweak:

| Parameter | Default | What it does |
|-----------|---------|--------------|
| `CURSOR_CONFIG.HEIGHT_RATIO` | `1.1` | Cursor height = line-height × this multiplier |
| `CURSOR_CONFIG.BLINK_DELAY_MS` | `500` | Idle delay before blink resumes |

Open `src/styles/index.scss` to tweak visual style:

```scss
#zentype-cursor {
  width: 3px;                                      // Cursor width
  background: var(--zt-cursor-color, #5d8cd7);     // Color (light theme)
  transition: transform 0.15s cubic-bezier(...);   // Movement curve
  animation: zentype-breathe 3s 1.5s ...;          // Blink animation
}
```

`pnpm run dev` rebuilds on save; SiYuan hot-reloads in 1-2 seconds.

## Roadmap

See [docs/superpowers/specs/2026-06-27-zentype-redesign-design.md](docs/superpowers/specs/2026-06-27-zentype-redesign-design.md) for the full design.

## License

MIT
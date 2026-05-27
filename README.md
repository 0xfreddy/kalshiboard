# KalshiBoard

**A fullscreen split-flap board for high-volume Kalshi markets.**

KalshiBoard turns the original FlipOff split-flap display into a live market board. It fetches open Kalshi markets, ranks them by volume, and rotates through the top markets with YES/NO prices, a probability bar, and volume stats.

![KalshiBoard preview](macos-screensaver/Packaging/Assets/thumbnail.png)

## Features

- Live top-volume Kalshi market rotation
- YES/NO midpoint pricing and visual probability bar
- Total volume and 24-hour volume display
- Manual board text override from the settings panel
- Fullscreen TV mode
- Split-flap tile animation with embedded transition audio
- Small local Node server that serves static files and proxies Kalshi API calls
- Vanilla HTML/CSS/JS with no package install step

## Quick Start

Run the local server from this folder:

```bash
node server.mjs
```

Then open:

```text
http://127.0.0.1:4173/
```

If that port is already in use:

```bash
PORT=4174 node server.mjs
```

The server is required for live Kalshi data because the browser calls `/api/kalshi/...`, and `server.mjs` proxies those requests to Kalshi's public API.

## Controls

| Control | Action |
| --- | --- |
| Gear button | Open settings |
| Manual board text + Apply | Show custom text on the board |
| Sample | Load a sample board message |
| Fullscreen button or `F` | Toggle fullscreen |
| Sound button or `M` | Toggle transition audio |
| `Escape` | Exit fullscreen |

## macOS Screen Saver

This repo also includes a native macOS screen saver wrapper that embeds the web app in `WKWebView` and serves the bundled app through a custom `kalshiboard://` URL scheme.

Build the screen saver and DMG:

```bash
scripts/build-screensaver.sh
```

Generated files are written to `build/` and `dist/`, which are intentionally ignored by Git.

## How It Works

`server.mjs` serves the app and proxies supported Kalshi endpoints under `/api/kalshi`. `js/KalshiFeed.js` fetches open markets, sorts them by 24-hour volume first and total volume second, then builds a 30-by-10 tile frame for each market. The board engine renders those frames with split-flap animations and colored YES/NO bar tiles.

The macOS screen saver uses `macos-screensaver/Sources/KalshiBoardSaverView.swift` to load the same web app from bundled resources and proxy the same Kalshi API paths from inside WebKit.

## File Structure

```text
.
  index.html              Single-page app shell
  server.mjs              Static server and Kalshi API proxy
  scripts/
    build-screensaver.sh  Build a .saver bundle and DMG
  macos-screensaver/
    Info.plist            Screen saver bundle metadata
    Sources/              Swift ScreenSaverView and WebKit bridge
    Packaging/            DMG install notes
  css/
    reset.css             CSS reset
    layout.css            App shell and settings panel
    board.css             Fullscreen board grid
    tile.css              Split-flap tile styling and YES/NO tones
    responsive.css        Large-screen and fullscreen adjustments
  js/
    main.js               App bootstrap and settings wiring
    KalshiFeed.js         Market fetch, ranking, and frame formatting
    Board.js              Grid manager and transition orchestration
    Tile.js               Individual tile animation logic
    SoundEngine.js        Embedded transition audio playback
    KeyboardController.js Fullscreen and sound keyboard shortcuts
    constants.js          Grid, timing, and animation constants
    flapAudio.js          Embedded audio data
```

## Legacy Cleanup Notes

The original FlipOff quote rotator has been removed from the active app. The old `MessageRotator.js`, quote message constants, quote interval constant, and unused accent color list are no longer needed because KalshiBoard now drives the display from `KalshiFeed.js`.

The reusable pieces from the original app are still valuable: the board renderer, tile animation, sound engine, keyboard fullscreen/mute handling, base CSS reset, and embedded flap audio.

## License

MIT

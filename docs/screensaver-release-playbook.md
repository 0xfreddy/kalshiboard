# KalshiBoard Screen Saver Release Playbook

This document captures the debugging findings from the first stable macOS
screen saver release. Keep it updated when the saver wrapper, web app boot path,
or release process changes.

## Stable Baseline

The stable implementation has three important properties:

- The web release and `.saver` release share the same board design and Kalshi
  market formatting logic.
- The `.saver` bundle serves the bundled web app from a native localhost server,
  then loads `index.html?screensaver=1` in `WKWebView`.
- The `.saver` options sheet stores board size and dark/light background
  preferences in `ScreenSaverDefaults`, then passes them into the web app as
  startup query params.
- The web release mirrors those same options in a web-only options panel. It
  stores choices in `localStorage` and applies them through the same query-param
  startup path used by the saver.
- In screen saver mode, animation timing is driven by
  `ScreenSaverView.animateOneFrame()` instead of relying only on JavaScript
  timers.

The last point is the critical stability fix. Screen savers do not behave like a
normal browser tab. JavaScript timers can be throttled, delayed, or fail to run
predictably in the System Settings preview or in the real `ScreenSaverEngine`
host. Native frame callbacks are the correct clock source for screen saver
animation.

## What Went Wrong During Debugging

### 1. Custom URL Scheme Was Too Fragile

The initial native wrapper tried to load bundled web resources through a custom
scheme. That made the web app harder to reason about because the normal browser
runtime path and the screen saver runtime path were different.

This also raised questions around API access and CORS. A `.saver` can call
external APIs, but the practical issues are:

- WebKit origin behavior.
- CORS policy.
- macOS network permissions.
- signing and installation friction.
- cache confusion when testing repeated builds.

The stable approach is to serve the bundled app over `http://127.0.0.1:<port>/`
from inside the saver. That gives WebKit a normal HTTP origin and lets the
native wrapper proxy `/api/kalshi/...` just like `server.mjs` does for the web
release.

### 2. In-Board Settings UI Interfered With the Saver Runtime

The web app previously had a settings panel and manual text controls. Those are
useful for a browser toy, but they are wrong for a production screen saver.

The stable release removed the in-board settings panel from both the web and
screen saver releases. Benefits:

- Fewer DOM controls in the screen saver host.
- Less bootstrap state.
- No chance that settings UI overlays block the board.
- The board has one job: show live Kalshi market data full-screen.

Configuration that belongs in the screen saver should be native macOS
configuration, exposed through the screen saver options sheet, not through
buttons or overlays rendered on the board itself. The web release can expose the
same controls as regular browser UI, but it should keep applying them through
the same URL/query-param contract as the saver.

### 3. Waiting for Async Animation Hid Failures

At one point the saver showed only static tiles or blank/white screens. The
debugging path showed that the first visible frame cannot depend on later
animation timers. The saver must render a useful first frame synchronously.

The stable approach:

- Detect screen saver mode with `?screensaver=1`.
- Render the initial board frame immediately.
- Use native ticks for later animation and rotation timing.

That means the user should never stare at an empty screen while waiting for JS
timers to wake up.

### 4. JavaScript Timers Were Not Reliable Enough

The most important bug class was timer scheduling. The board animation depended
on `setTimeout` and `setInterval`. In normal Safari or Chrome this was fine. In
the macOS screen saver host it was not.

The fix:

- `KalshiBoardSaverView.animateOneFrame()` runs at `1.0 / 30.0`.
- Each native frame calls `window.__kalshiBoardNativeFrame(timestamp)`.
- In `screensaver=1` mode, the web app installs `window.__kalshiBoardScheduler`.
- Tile flips, board transition completion, and feed waits use that scheduler.

This keeps web behavior unchanged while making the saver deterministic.

### 5. macOS Kept Old Builds Around

Repeated installs can be misleading. System Settings and screen saver host
processes may keep old bundles, old WebKit state, or old preference state alive.
This made it look like fresh fixes were not working.

When testing a new `.saver`, use a clean install flow:

```bash
killall "System Settings" 2>/dev/null
killall legacyScreenSaver 2>/dev/null
killall WallpaperAgent 2>/dev/null
killall ScreenSaverEngine 2>/dev/null

rm -rf "$HOME/Library/Screen Savers/KalshiBoard.saver"
rm -rf "$HOME/Library/Caches/com.apple.preference.desktopscreeneffect"
rm -rf "$HOME/Library/Caches/com.apple.ScreenSaver.Engine"
rm -rf "$HOME/Library/Caches/com.apple.systempreferences"

defaults delete com.apple.screensaver 2>/dev/null
```

Also check for duplicate installs:

```bash
ls -la "/Library/Screen Savers" "$HOME/Library/Screen Savers"
```

Delete old `KalshiBoard.saver` copies from both locations before reinstalling.

## Current Architecture

### Web Release

The browser release uses:

- `server.mjs` for static files and Kalshi API proxying.
- `index.html` as the app shell.
- `js/KalshiFeed.js` for market fetch, ranking, formatting, and rotation.
- `js/Board.js` and `js/Tile.js` for grid rendering and split-flap animation.

Run locally:

```bash
node server.mjs
```

Open:

```text
http://127.0.0.1:4173/
```

### Screen Saver Release

The screen saver release uses:

- `macos-screensaver/Sources/KalshiBoardSaverView.swift`
- bundled web assets under `Contents/Resources/WebApp`
- native localhost server via `Network.NWListener`
- `WKWebView`
- `index.html?screensaver=1`
- screen saver options passed as `cols`, `rows`, and `theme` query params
- native frame-driven JS scheduler

Build:

```bash
scripts/build-screensaver.sh
```

Release output:

```text
dist/KalshiBoard.dmg
```

## Release Checklist

Run this before handing off any `.saver` or DMG.

### 1. Check the Working Tree

```bash
git status --short
```

There should be no accidental unrelated changes.

### 2. Build the Saver

```bash
scripts/build-screensaver.sh
```

The script should produce:

- a `.saver` bundle in the temporary build directory.
- `dist/KalshiBoard.dmg`.

### 3. Verify Signing

```bash
codesign --verify --deep --strict --verbose=2 "$TMPDIR/kalshiboard-screensaver-build/KalshiBoard.saver"
```

Ad-hoc signing is acceptable for local distribution/testing, but a wider public
release should use Developer ID signing and notarization.

### 4. Verify the DMG

```bash
hdiutil verify dist/KalshiBoard.dmg
```

The checksum should be valid.

### 5. Verify Bundled Assets

Make sure the built bundle contains the latest cache-busted assets and the
screen saver scheduler hooks:

```bash
rg "__kalshiBoardNativeFrame|__kalshiBoardScheduler|screensaver=1" "$TMPDIR/kalshiboard-screensaver-build/KalshiBoard.saver/Contents/Resources/WebApp"
```

If the expected symbols are missing, the DMG is stale.

### 6. Test API Reachability

Test the browser server path:

```bash
node server.mjs
curl -s "http://127.0.0.1:4173/api/kalshi/markets?limit=1&status=open&mve_filter=exclude"
```

The response should be Kalshi JSON, not an HTML error page.

For screen saver-specific API issues, inspect Console.app logs for
`KalshiBoard` and `ScreenSaverEngine`.

### 7. Clean Install Before Manual QA

Do the clean install flow from the cache section, install the fresh DMG, then
open System Settings. This avoids chasing stale bundle behavior.

### 8. Manual QA

Check:

- Board fills the full screen.
- No in-board settings button or overlay panel exists.
- Native screen saver options can switch Dense, Balanced, and Large Text board
  sizes.
- Native screen saver options can switch Dark and Light backgrounds.
- Tiles render immediately.
- `LOADING KALSHI` or live market data appears instead of a blank screen.
- Tiles animate.
- Market frames rotate.
- No white error page appears.

## Best Practices For Future Features

### Keep One Rendering Path

The web app and screen saver should share board layout, tile styling, market
formatting, and animation logic. Forking behavior should be limited to the
runtime shell:

- browser server vs native local server.
- normal timers vs native frame scheduler.
- browser-only controls, if any, behind explicit runtime guards.

### Treat Screen Saver Mode As a Hostile Runtime

Do not assume:

- timers fire on schedule.
- background WebKit behaves like a foreground browser.
- cached resources update after reinstall.
- the System Settings preview matches full-screen saver behavior perfectly.

Prefer:

- synchronous first paint.
- explicit frame ticks from `animateOneFrame()`.
- visible fallback/error states.
- no required user input.

### Keep Configuration Native

Screen saver configuration should use the native macOS options sheet and
`ScreenSaverDefaults`. The board itself should remain non-interactive.

Current supported settings:

- Dense: `30 x 10`
- Balanced: `24 x 8`
- Large Text: `18 x 6`
- Dark background
- Light background

Pass these settings into the web app at load time. Do not make the board read
preferences directly from WebKit storage; that creates another cache/state path.

The web release mirrors these settings with a web-only panel. That panel can use
`localStorage` for browser convenience, but it should still reload/apply through
the same query params so one rendering path stays authoritative.

### Avoid UI That Needs Interaction

A screen saver should not require controls, settings panels, forms, buttons, or
keyboard shortcuts to function. Configuration should be native saver options or
startup config only.

### Make Cache Busting Intentional

When JS or CSS behavior changes, bump asset query versions in `index.html` and
module imports. This matters because WebKit and System Settings may hold stale
resources longer than a normal browser refresh loop.

### Keep API Proxying Native in the Saver

Do not call Kalshi directly from browser JS in the `.saver`. Keep the app
calling `/api/kalshi/...`, and let the native local server proxy to Kalshi.

Benefits:

- same app contract as web release.
- no CORS dependency.
- easier logging and error handling.
- a single place to restrict allowed API endpoints.

### Prefer Diagnostic Fallbacks Over Blank Screens

Blank screens waste debugging time. The saver should show a clear fallback when:

- bundled resources are missing.
- the localhost server fails.
- WebKit navigation fails.
- Kalshi API requests fail.

The current native wrapper already logs and shows load/server failures. Future
work should add a lightweight on-board diagnostic state for API failures if
those become hard to distinguish from empty market data.

### Keep Builds Reproducible

The build script should remain the single release path. Avoid manual bundle
editing after build. If the release requires a plist, signing, assets, or DMG
layout change, put it in the script or source tree.

## Common Failure Modes

### White Screen

Likely causes:

- WebKit navigation failed.
- local server failed to start.
- bundled `index.html` or JS files missing.
- stale bundle was installed.

Check:

- Console.app logs for `KalshiBoard`.
- contents of `Contents/Resources/WebApp`.
- cache-clean reinstall flow.

### Tiles Render But Do Not Animate

Likely causes:

- native `animateOneFrame()` is not firing.
- `window.__kalshiBoardNativeFrame` is missing.
- screen saver loaded without `?screensaver=1`.
- stale JS assets are installed.

Check:

- `KalshiBoardSaverView.swift` sets `animationTimeInterval`.
- native code calls `evaluateJavaScript(...)` from `animateOneFrame()`.
- bundled `js/main.js` contains `__kalshiBoardScheduler`.
- asset versions in `index.html` and JS imports match the built files.

### Options Do Not Apply

Likely causes:

- preferences were saved under the wrong `ScreenSaverDefaults` module name.
- the saver URL was loaded without `cols`, `rows`, or `theme`.
- System Settings or `ScreenSaverEngine` is still running an old bundle.
- stale WebKit resources are installed.

Check:

- `KalshiBoardPreferences.moduleName` matches the saver bundle identifier.
- `loadWebApp()` appends the preference query params.
- cache-clean reinstall flow.

### Tiles Animate But No Market Data Appears

Likely causes:

- local API proxy failed.
- Kalshi API request failed.
- unsupported API endpoint path.
- network permission/signing issue.

Check:

- `NSAllowsLocalNetworking` in `Info.plist`.
- native proxy route allows `/api/kalshi/markets`.
- Console.app logs.
- browser server API path with `curl`.

### Reinstall Shows No Change

Likely causes:

- System Settings is still open.
- `ScreenSaverEngine` is still running.
- old saver exists in both user and system screen saver directories.
- WebKit/System Settings caches are stale.

Use the clean install flow before debugging code.

## Rules Before Shipping New Work

- Do not ship a screen saver feature that has only been tested in a browser.
- Do not introduce screen saver behavior that depends only on JS timers.
- Do not add interactive UI to the board. Saver configuration belongs in the
  native options sheet.
- Do not hand off a DMG without verifying signing, DMG checksum, and bundled
  assets.
- Do not debug a user report until stale installed copies have been ruled out.
- Do not silently swallow load/API errors; log them and show a useful fallback.

## Future Hardening Ideas

These are not required for the current stable build, but they would reduce
future release risk:

- Add a tiny debug overlay controlled by a query param, never enabled by
  default.
- Add native logs for localhost server requests and Kalshi proxy status codes.
- Add a build number visible in the bundled web app DOM as a hidden metadata
  element.
- Add a smoke test that starts the native local server logic outside the saver
  host and checks `index.html` plus `/api/kalshi/markets`.
- Add Developer ID signing and notarization for public distribution.
- Add a release script step that mounts the generated DMG and validates the
  expected `.saver` files are present.

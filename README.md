# Recorder

Clip your favourite moments from videos without leaving IINA.

## Features

- Choose a clip range from the IINA sidebar.
- FAST LOSSLESS export, maintaining original file type, video, and audio (clips at nearest keyframe, use re-encode export for exact frame cuts).
- Exports reencoded video beside the source video.
- Apple VideoToolbox hardware acceleration support.
- Optional centered 9:16 cropping.

## Requirements

- IINA 1.4.0 or newer
- FFmpeg installed
- Node.js 22 or newer and pnpm 11 for local development

## Installation

Requires IINA 1.4.0 or later and FFmpeg.
1. Open IINA → Settings → Plugins.
2. Choose **Install from GitHub** and enter:
   `https://github.com/semiconducted/recorder-iina`
3. Enable **Recorder**.
4. Recorder detects Homebrew installations of FFmpeg automatically (`/opt/homebrew/bin/ffmpeg` on Apple Silicon and `/usr/local/bin/ffmpeg` on Intel). 
If FFmpeg is installed somewhere else, open IINA → Settings → Plugins → Recorder → Preferences and enter the full path to the binary.
5. Open a local video, then choose Plugins → **Start Clipping** or press <kbd>⌥⇧R</kbd>.

## Local development and testing

Requirements: macOS, Node.js 22 or later, pnpm 11, and FFmpeg.

```sh
pnpm install
pnpm check
```

Recorder is organized as a pnpm workspace:

- `@recorder/contracts` contains the typed messages shared by the plugin and webview.
- `@recorder/plugin` contains the TypeScript IINA runtime bundled with esbuild.
- `@recorder/ui` contains the React and TypeScript sidebar bundled with Vite.

To test the checkout directly in IINA, first uninstall the GitHub copy so IINA does not load two
plugins with the `com.recorder.iina-plugin` identifier. Make the IINA plugin CLI available if it is
not already on your `PATH`:

```sh
ln -s /Applications/IINA.app/Contents/MacOS/iina-plugin /usr/local/bin/iina-plugin
```

Then build and link the development checkout:

```sh
pnpm iina:link
```

Restart IINA after linking or rebuilding. Remove the development link with:

```sh
pnpm iina:unlink
```

Other useful commands:

```sh
pnpm dev        # preview the sidebar UI in a browser
pnpm build      # create and validate the production bundle in dist/
pnpm typecheck  # type-check every workspace package
pnpm test       # run plugin unit tests
pnpm lint       # run ESLint
pnpm format     # format source and configuration files
```

The production `dist/` bundle is committed because IINA installs the plugin directly from the
GitHub repository. `Info.json` loads `dist/index.js`, and the sidebar is packaged as a self-contained,
CSP-hashed `dist/ui/window/index.html` for IINA's file-backed WKWebView. These files are generated
artifacts; edit the sources under `packages/` and run `pnpm build` instead of editing `dist/`
directly.

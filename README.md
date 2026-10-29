# Recorder

Clip moments from videos without leaving IINA.

A hardened fork of [5thDimensionalVader/recorder-iina](https://github.com/5thDimensionalVader/recorder-iina)
with network access removed and lossless stream copying as the default.

## Features

- Set In and Out at the playhead with sidebar buttons or <kbd>⌥⇧I</kbd> /
  <kbd>⌥⇧O</kbd>, or type a time (`83`, `1:23`, `0:01:23.5`). Each mark has a
  jump button to check it.
- **Lossless by default.** Clips are stream-copied: no re-encoding, no quality
  loss, near-instant export, and the original container is preserved (an `.mkv`
  stays `.mkv`).
- **Vertical 9:16 crop, optional.** Turning crop on switches the export to a
  re-encode, because cropping requires decoded frames. This is the one setting
  that changes how the clip is produced.
- Apple VideoToolbox hardware acceleration, used only on the re-encode path. It
  has no effect on lossless exports, since nothing is being encoded.
- Clips are written beside the source video. Existing files are never
  overwritten; a numeric suffix is added instead.

## How cutting works

A stream copy can only begin on a **keyframe**. When you mark an in-point,
FFmpeg seeks backward to the nearest keyframe at or before it, so the clip may
start slightly earlier than you intended.

How much earlier depends on the source file's keyframe interval, commonly one to
ten seconds. As a measured example: on a file with keyframes every two seconds, a
five-second clip requested at `0:11` came out `6.2` seconds long, starting at
`0:10`.

Recorder does not display keyframe positions, so the in-point is approximate.
If you need a frame-exact cut, enable vertical crop, which forces a re-encode and
lands on the requested frame. The trade-off is time and a generation of quality
loss.

The out-point is not affected in the same way and needs no keyframe.

## Requirements

- macOS with IINA 1.4.0 or newer
- FFmpeg (`brew install ffmpeg`)
- For development only: Node.js 22 or newer and pnpm 11

## Installation

This fork intentionally has **no auto-update**. The `ghRepo` and `ghVersion`
fields were removed from `Info.json`, so IINA will not check GitHub for new
versions and cannot pull code you have not reviewed. Installing from a local
clone is therefore the supported path.

```sh
git clone https://github.com/semiconducted/recorder-iina.git ~/Developer/recorder-iina
cd ~/Developer/recorder-iina
pnpm install
pnpm build
```

Then link the folder into IINA. Either use the plugin CLI:

```sh
pnpm iina:link
```

Or symlink it manually. The destination must end in `.iinaplugin-dev`:

```sh
ln -sfn ~/Developer/recorder-iina \
  ~/Library/Application\ Support/com.colliderli.iina/plugins/recorder.iinaplugin-dev
```

Use one method or the other, not both, or IINA will load two copies that fight
over the same keyboard shortcut.

Quit IINA completely and reopen it, then enable the plugin under
IINA → Settings → Plugins.

> Installing through IINA's **Install from GitHub** option also works, but that
> is the auto-update channel this fork deliberately disables. Anything pushed to
> the repository would install without review. Prefer the local clone.

## FFmpeg location

Recorder finds Homebrew installations automatically at
`/opt/homebrew/bin/ffmpeg` (Apple Silicon) and `/usr/local/bin/ffmpeg` (Intel).

If FFmpeg lives elsewhere, open IINA → Settings → Plugins → Recorder →
Preferences and enter the full path to the binary.

## Usage

1. Open a local video. Remote URLs and streams are rejected.
2. Choose Plugins → **Start Clipping**, or press <kbd>⌥⇧R</kbd>.
3. Play to the start and press **Set In** (<kbd>⌥⇧I</kbd>), then play to the
   end and press **Set Out** (<kbd>⌥⇧O</kbd>). The hotkeys also work with the
   sidebar closed. Either time can be typed or corrected in its field.
4. Press **Create clip**. The clip is written next to the source file.

## Changes in this fork

Relative to upstream `5thDimensionalVader/recorder-iina`:

- **Network access removed.** The `network-request` permission and the
  `allowedDomains: ["*"]` wildcard were dropped. Upstream requested both but
  never used them; the plugin makes no network calls of any kind.
- **Unused permissions dropped.** `show-osd` and `show-alert` were also removed,
  as neither corresponding API is called. The plugin now requests only
  `video-overlay` and `file-system`, the latter being what authorizes running
  FFmpeg.
- **Auto-update disabled.** `ghRepo` and `ghVersion` removed from `Info.json`.
- **Lossless clipping by default.** Exports now stream-copy rather than always
  re-encoding, preserving the original container and quality. Re-encoding still
  happens when vertical crop is enabled.
- **In/Out marking.** Editable In and Out fields with Set buttons, hotkeys,
  jump-to buttons and millisecond precision replace the single read-only stop
  button. Marks clear when another file opens.
- **Distinct identifier**, `com.semiconducted.recorder-iina`, so this fork does
  not conflict with an upstream installation.

## Local development

```sh
pnpm install
pnpm check
```

`pnpm check` runs type checking, linting, unit tests, formatting checks, and a
production build with package validation.

Recorder is a pnpm workspace:

- `@recorder/contracts` — typed messages shared by the plugin and the webview
- `@recorder/plugin` — the TypeScript IINA runtime, bundled with esbuild
- `@recorder/ui` — the React sidebar, bundled with Vite

Because this fork and upstream use **different** plugin identifiers, IINA will
happily load both at once, and they will both bind <kbd>⌥⇧R</kbd>. Remove any
other copy before linking a development checkout.

If the plugin CLI is not on your `PATH`:

```sh
ln -s /Applications/IINA.app/Contents/MacOS/iina-plugin /usr/local/bin/iina-plugin
```

Then:

```sh
pnpm iina:link      # build and link the checkout
pnpm iina:unlink    # remove the development link
```

Restart IINA after linking or rebuilding. If the plugin does not appear, open
Window → Log Viewer and look for `Loading JS plugin`; load errors surface there.

Other commands:

```sh
pnpm dev        # preview the sidebar UI in a browser
pnpm build      # create and validate the production bundle in dist/
pnpm typecheck  # type-check every workspace package
pnpm test       # run plugin unit tests
pnpm lint       # run ESLint
pnpm format     # format source and configuration files
```

The production `dist/` bundle is committed so the plugin can be installed
directly from a checkout. `Info.json` loads `dist/index.js`, and the sidebar ships
as a self-contained, CSP-hashed `dist/ui/window/index.html` for IINA's
file-backed WKWebView. These are generated artifacts: edit the sources under
`packages/` and run `pnpm build` rather than editing `dist/` by hand.

## Acknowledgements

Built on [recorder-iina](https://github.com/5thDimensionalVader/recorder-iina) by
Daniel Ifechukwude Chinye ([@5thDimensionalVader](https://github.com/5thDimensionalVader)),
which provided the entire original implementation.

## License

ISC. See [LICENSE](LICENSE).

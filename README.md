# FrameFlow AE 2.0.2

A compact CEP 12 timeline panel for After Effects 25.x–26.x, with layer movement, trim, split and keyframe offset operations.

**[Download installable ZIP](downloads/FrameFlow_AE_2.0.2.zip)** · **[Installation and usage in Russian](README_RU.md)** · [Changelog](CHANGELOG.md) · [AE smoke test](docs/AE_SMOKE_TEST_RU.md)

The `extension/` folder is ready to install. Close AE, extract the complete package and run `install/Install-Windows.cmd` or `install/Install-macOS.command`. The installer preserves a previous extension backup. The extension ID and preference storage are unchanged from 2.0.0. This patch fixes host registration when `$.evalFile` runs in function scope, observed as a handshake mismatch in AE 25.6.4.

## Development

- `src/core.jsxinc`: timing, keyframe preservation and bounded mutation/recovery core.
- `src/panel-host.jsxinc`: data-only RPC and AE adapter.
- `extension/js/bridge.js`: CEP initialization, version handshake and correlated RPC.
- `extension/js/panel.js`: timeline UI, preferences and local reports.

`node tools/build.cjs` generates `extension/jsx/host.jsx`. `node tools/check.cjs` checks strict ES3, generated transport strings, pure calculations and simulated AE/CEP/DOM behavior. Maintainer checks need Node >=20 with a compatible Acorn module, or Node's bundled Acorn through `--expose-internals` as used by the check script. No runtime npm packages, CEP Node, server, remote scripts or telemetry are required by the installed panel.

`node tools/preview.cjs` creates the standalone demo `PREVIEW.html`. The demo does not connect to or modify AE.

`python3 tools/package.py` runs the checks and builds `artifacts/FrameFlow_AE_2.0.2.zip` with a matching versioned root, checksums and verification report. It requires maintainer Python 3, Node and Bash; these are not required by the installed extension. Generated build folders are excluded from the archive.

The GitHub PR workflow runs this packaging command and uploads an artifact. The checked download under `downloads/` is retained source distribution, not a signed ZXP or a GitHub Release. CI artifacts are separate builds identified by their workflow run; neither establishes execution in AE.

## Validation boundary

No real AE/CEP host is available in this workspace. Local tests and strict syntax validation do not establish real startup, clipboard, Undo/Redo or visual correctness. See `VERIFICATION.json` for checked byte hashes and current results. Never retry an unconfirmed edit; refresh and inspect the AE state first.

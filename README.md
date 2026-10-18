# FrameFlow AE 2.1.1

A compact CEP 12 panel for timing commands around the After Effects playhead.

**[Download installable ZIP](downloads/FrameFlow_AE_2.1.1.zip)** · **[Installation and usage in Russian](README_RU.md)** · [Changelog](CHANGELOG.md)

Close AE, extract the complete ZIP and run `install/Install-Windows.cmd` or `install/Install-macOS.command`. Open **Window → Extensions (Legacy) → FrameFlow 2.1**. Target: AE 25.x–26.x / CEP 12. The installer backs up the previous extension and enables unsigned CEP 12 panels for the current account. This is a source distribution, not a signed ZXP or GitHub Release. Installed users need no Node, Python, server or network access from the panel.

## Workflow

The panel starts in **Auto / Layers and Keys**, including after upgrading. Auto uses the selected AE layers, or all composition layers when none are selected. Explicit Selected never expands scope. Enable “Remember scope and mode” in settings to retain a different startup context. Frame step, presets and appearance remain saved independently.

Choose frames with presets, stepper, Shift, wheel, slider or half/one-second shortcuts. Use **Before − / Before + / After − / After +**. Minus moves earlier; plus moves later. In Layers and Keys, layers entirely on that side move together with their keys; crossing layers change the edge and keys on that side. Each command reads current CTI and selection before planning, then checks the host snapshot again before writing. Close Gap uses the same scope independently of step and mode. Preview plans the last direction without writing. Undo/Redo is native to AE.

**Finite-footage limits:** by default, a crossing layer requiring unavailable source frames stays completely unchanged, including all its keys. Other valid targets proceed. The status, preview, report and event history show the number of layers without source handles. Select “Cancel everything” in settings for the previous all-or-nothing media policy. Relevant locks, unsupported partial-key targets, collisions and runtime verification failures still block or recover the operation. The panel does not extend footage with invented frames.

The default panel is 420 × 360 px with smaller controls and a single composition/CTI row. Settings and help scroll within the panel. The duplicate AE timeline and layer list remain removed.

## Settings and diagnostics

Preferences v1/v2 migrate to v3. Existing step, presets, zero/false and customized appearance survive. Previous default density becomes compact. Context starts Auto / Layers and Keys unless explicitly opted into remembering it. Import retains the imported context in the current session; the startup rule applies on the next open. Unknown, corrupt or concurrently changed storage stays protected. Export is JSON.

“Report” opens and copies diagnostics on click, with Clipboard API fallback and selected text if both methods fail. Transport failures pause polling until Refresh; uncertain writes are never automatically replayed.

## Development and validation

`src/core.jsxinc` contains timing and bounded recovery. `src/panel-host.jsxinc` is the data-only AE/RPC adapter. `extension/js/bridge.js` retains explicit global registration and single-flight transport. `extension/js/panel.js` implements the controls and acknowledged settings writes.

- `node tools/build.cjs`: generate the complete ES3 host.
- `node tools/check.cjs`: strict ES3, pure timing and simulated AE/CEP/DOM regressions.
- `node tools/preview.cjs`: regenerate the standalone read-only UI demo.
- `python3 tools/package.py`: checks, preview, local paths, shell syntax and checksum-verified ZIP in `artifacts/`.

Maintainer tools need Node >=20 with Acorn 8.17.0 or bundled Acorn through `--expose-internals`, Python 3 and Bash. Read-only PR CI runs packaging and uploads a separate checked build. Issued ZIPs remain unchanged under `downloads/`.

The user confirmed 2.1.0 starts and Close Gap works in AE 25.6.4x3, and supplied the finite-media failure reproduced in these tests. **2.1.1 host behavior, native Undo/Redo, clipboard, docking and layout require an actual AE smoke test.** Local DOM tests are not browser/layout evidence. See [verification](VERIFICATION.json) and [smoke test](docs/AE_SMOKE_TEST_RU.md).

# FrameFlow AE 2.1.0

A compact CEP 12 panel for timing commands around the After Effects playhead. The duplicate timeline, layer list, drag editing and trim/split inspector have been removed from the UI.

**[Download installable ZIP](downloads/FrameFlow_AE_2.1.0.zip)** · **[Installation and usage in Russian](README_RU.md)** · [Changelog](CHANGELOG.md)

Close AE, extract the complete ZIP and run `install/Install-Windows.cmd` or `install/Install-macOS.command`. Open **Window → Extensions (Legacy) → FrameFlow 2.1**. Target: AE 25.x–26.x / CEP 12. Previous installation and preferences are preserved. The panel has no runtime npm dependencies, server, telemetry or CEP Node requirement.

## Workflow

Choose Auto, Selected Layers or Entire Composition. Choose frames using presets, stepper, slider or rounded half/one-second shortcuts. Use one of the four always-visible Before − / Before + / After − / After + actions. Auto uses AE's selected layers, or the entire composition when none are selected. Each command refreshes AE state before mutation and retains the kernel's stale-state checks.

Offset preserves the original crossing-layer edge/key behavior; whole-layer mode uses layer In as its side anchor. Key modes preserve layer bounds. Close Gap uses the same scope independently of frame step/mode. Preview plans the last direction without writing. Undo/Redo remains native to AE.

Preference schema v2 migrates v1 without broadening explicit Selected scope or resetting timing choices/appearance. Obsolete timeline preference values are retained for reversible migration; their old controls are not shown.

## Development and checks

`src/core.jsxinc` contains timing and bounded recovery. `src/panel-host.jsxinc` is the data-only RPC/AE adapter. `extension/js/bridge.js` retains the explicit global bootstrap validated by the user in AE 25.6.4 on 2.0.2. `extension/js/panel.js` implements the compact controls and acknowledged preference writes.

- `node tools/build.cjs`: generate the complete ES3 host.
- `node tools/check.cjs`: strict ES3, calculations and simulated AE/CEP/DOM regressions.
- `node tools/preview.cjs`: standalone, explicitly read-only browser demo.
- `python3 tools/package.py`: checks, preview, path/shell validation and hash-verified versioned ZIP in `artifacts/`.

Maintainer tooling needs Node >=20 with Acorn 8.17.0 or bundled Acorn through `--expose-internals`; packaging also uses Python 3 and Bash. Installed-panel users need none of these tools. Read-only PR CI runs the package command and uploads a separate build; downloads are checked source distributions, not signed ZXP files or GitHub Releases.

Tests simulate AE, scoped evalFile, CEP and the DOM. They cover all four directions, Auto/no-selection, explicit scope safety, stale CTI/selection, gap, lock relevance, key collisions, preference migration, frame controls, clipboard and connection recovery. See `VERIFICATION.json`. **New 2.1 behavior, clipboard, docking, layout and Undo/Redo still require real AE testing.** Use [the smoke test](docs/AE_SMOKE_TEST_RU.md) on a copy of a project.

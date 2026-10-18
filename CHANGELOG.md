# Changelog

## 2.0.2

- Explicitly export the completed host to `$.global.FrameFlowCEP` and dispatch RPC through the same qualified namespace, fixing the reproduced handshake failure with function-scoped `$.evalFile`.
- Capture AE/build/OS before loading and retain them on startup failure. Separate file loading from registration/version/dispatch verification.
- Preserve numeric engine script IDs separately from source filenames; report observed namespace and expected/actual host versions.
- Make scoped file evaluation the default host fixture, with detached-global, shadowing, construction-failure and end-to-end UI regressions.
- Add a reproducible package command, checked GitHub download, and read-only PR validation/build workflow.

Actual AE 25.6.4 execution remains to be confirmed.

## 2.0.1

- Replace implicit CEP ScriptPath startup with a version-checked, read-only host bootstrap using the installed extension path and `$.evalFile`.
- Generate plain ES3 host code without `#target`; test complete installed bytes without stripping directives.
- Surface bootstrap stage, original error message, source line and filename; retain AE environment diagnostics independently of active composition data.
- Pause automatic polling and focus retries after connection failures; allow explicit Refresh and prevent automatic edit replay.
- Distinguish read/bootstrap timeouts from uncertain writes. Reuse loaded matching hosts and retain RPC replay protection.
- Copy the report when the user opens it. Prefer synchronous CEP-compatible copy, fall back to Clipboard API, and report blocked copying accurately.
- Preserve extension ID, installation location, settings, timeline behavior and timing/editing algorithms from 2.0.0.

Host execution in real After Effects remains unverified; local checks use simulated AE/CEP/DOM.

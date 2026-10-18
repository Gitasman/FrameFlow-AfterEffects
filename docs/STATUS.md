# FrameFlow 2.0.2 status

## Source, issue and scope

The baseline is the conversation's issued FrameFlow AE 2.0.1 package. The user reproduced `BOOT_HOST / load / Host handshake/version mismatch` in AE 25.6.4. They authorized publishing complete tool source to `Gitasman/FrameFlow-AfterEffects` through a PR. Previous issued packages remain unchanged.

The repository's inspected `main` head was `f9931e254a0350d0641e246f39276b1b2e55acee`, containing only README.md; there were no existing source guides or CI/deploy triggers. Publication uses a task branch; no default-branch write or merge is part of this patch. See the PR and latest checks for remote state.

## Cause and repair

2.0.1 loaded `host.jsx` using `$.evalFile` inside the bootstrap function, but the host declared `var FrameFlowCEP`. The bootstrap then searched `$.global.FrameFlowCEP`. A function-scoped loader reproduces the user's exact mismatch because a local variable is not an explicit global export. Previous simulations always evaluated the file in global scope and missed this boundary. This explains the source failure; actual behavior in the user's AE must still be confirmed after installation.

The generated host now assigns the completed API to `$.global.FrameFlowCEP` explicitly. RPC uses the same qualified namespace. Construction finishes before replacing the previous global object. Matching loaded hosts are reused; timed-out edits are never replayed.

The bootstrap captures AE version/build, OS and ExtendScript version before loading, returns this environment on failures, separates file execution from registration verification, and reports the expected version and observed namespace/dispatch. Numeric engine script IDs are retained separately rather than displayed as filenames.

## Preserved behavior

Timeline UI, extension ID/install path, preference schema, editing algorithms, one in-flight RPC, replay protection, uncertainty/read-before-write recovery, polling suspension and one-click report copying are retained. No precomp/Smart Ripple features, scene changes during initialization, network services or telemetry are added.

## Checks and delivery

`python3 tools/package.py` builds the kernel, runs strict ES3 and all tests, generates the standalone preview, validates local paths and shell syntax, then verifies a versioned ZIP against file hashes. `VERIFICATION.json` and `docs/verification.log` record actual outcomes. Tests include local and global evalFile scopes, a detached engine namespace, local name shadowing, environment diagnostics, delayed replies and UI → loader → RPC → host → UI. All AE/CEP/DOM execution in these tests is simulated.

No real AE connection is available. Real startup, docking, clipboard operation, layout and Undo/Redo remain unverified. Review is self-review. The GitHub workflow checks source and builds an Actions artifact; it does not run After Effects. The published download under `downloads/` is a checked ZIP, not a signed ZXP or a GitHub Release.

## Next action

Install 2.0.2 with AE closed. Open FrameFlow 2.0 and a composition. The report should show `FrameFlow 2.0.2`, loader `ready`, host `2.0.2`, and real environment values. Run `docs/AE_SMOKE_TEST_RU.md` on a copy of the project. On any failure, click Report and send the copied text. Reconcile changes against the repository branch before the next patch.

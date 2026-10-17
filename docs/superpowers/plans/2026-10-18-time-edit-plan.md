# FrameFlow AE 2.0 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, task by task. Each task has a failing test before implementation and a passing check afterward.

**Goal:** Add transactional insertion/removal of animation time while preserving user-tested 1.3 behavior.

**Architecture:** Pure time maps and key plans in FFCore; AE snapshots, validation and recovery in FFHost; a compact optional ScriptUI dialog in FFUI. Build to a single ES3 JSX.

**Tech Stack:** ExtendScript ES3, native ScriptUI, Node 22+, Acorn 8.17.0.

**Spec:** docs/superpowers/specs/2026-10-18-time-edit-design.md

## Global Constraints

- Target AE 25.6.4; complete final JSX uses conservative ES3 syntax.
- Preserve composition duration, CTI, work area, layer selection and expression state.
- No automatic Time Remap, object-layer deletion, recursive precomp edits or partial successful ripple operations.
- Existing four offsets, gap closing and settings remain compatible.

## Review Focus

- Half-open edit boundaries, fractional frames and source-end limits.
- Source remapping versus key timing; no false freeze-frame promise.
- Deleted keys retain complete original recovery snapshots.
- Selection cleanup precedes rollback readback and Undo always closes.
- Preview cannot apply stale plans or silently target another composition.

### Task 1: Pure time editing and modular build

Files: src/FFCore.jsxinc, tools/build.cjs, tests/ripple-core.test.js.
Interfaces: rippleSpec(context, options) → {mode,from,to,duration,delta,frames}; rippleLayerPlan(model,spec) → native/edge/none/error bounds; rippleKeyPlan(keys,context,spec) → retained indices, times, moved/deleted counts or error.

- [ ] Preserve and run all 109 baseline tests against the modular single-file build.
- [ ] Add failing boundary, range, collision, empty-property and Roving cases.
- [ ] Implement pure plans and run the core test file.

### Task 2: AE transaction

Files: src/FFHost.jsxinc, tests/ripple-host.test.js.
Interface: prepareRipple(options) → existing transaction plan with original and after snapshots; applyPlan(plan) handles retained snapshots and reports deletedKeys.

- [ ] Add failing native/partial/deletion, finite-media, lock/protection and rollback tests.
- [ ] Capture complete originals and retained after snapshots. Reject unavailable targets atomically; reuse shared undo/recovery.
- [ ] Test failure after an earlier successful deletion, selected flags and Time Remap anchor behavior.

### Task 3: Optional editing dialog

Files: src/FFUI.jsxinc, tests/ripple-ui.test.js.
Interface: controls.ripple opens the dialog; prepareRipple drives both check and fresh application.

- [ ] Add failing check/apply, invalidation, cursor/work-area and active-comp-change tests.
- [ ] Implement labelled native controls, fractional inputs and readable results without expanding the main form into modes.
- [ ] Inspect source-derived layouts at 276/324 panel widths and compact dialog width; distinguish native AE evidence.

### Task 4: Verified GitHub delivery

Files: README.md, CHANGELOG.md, ROADMAP.md, .github/workflows/check.yml, dist/*.jsx.

- [ ] Run complete current tests, exact ES3 checker, build reproducibility and fresh code review.
- [ ] Commit to a feature branch based on the observed current main SHA, preserve existing repository content and open a draft PR for user AE testing.
- [ ] Verify uploaded bytes/ref and relevant CI on the actual head. Deliver full JSX and focused host tests.

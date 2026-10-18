# FrameFlow 2.2.0 status

The user reports 2.1.1 is working and requested a clearer interface, the next planned version, an updated roadmap and direct publication to main. The old visual-timeline roadmap is superseded by `ROADMAP_RU.md`.

2.2.0 retains the working timing algorithms and media-limit policy. The interface now groups scope, frame step, mode and Before/After directions with named Earlier/Later controls. Preview is a human-readable list of planned targets, bounds, key counts and reasons rather than raw diagnostics. An optional preview-first mode covers both offset and gap removal. Technical reports remain separately available.

The host keeps one bounded native plan for up to two minutes. Apply uses that plan rather than replanning the user's scope. Metadata changes, replacement plans and expired/missing IDs reject application. Native key snapshots are verified before writing, including time, value and selection. Normal mutation paths invalidate previous preview state; duplicate RPC acknowledgement and uncertain-write no-replay remain in place. The panel never displays native key values.

Local checks currently pass 157 tests, including structured preview, applying/expiring/replacing plans, metadata/key changes, gap preview, media policy, limits and UI routing. Chromium layout checks are configured in the push-main workflow and must be observed before claiming browser verification. Real AE 2.2.0 behavior and native Undo/Redo remain unverified here. Source review is self-review. Exact final checks and evidence hashes are in `VERIFICATION.json`.

Publication is directly to main as authorized by the user, retaining 2.1.1 ancestry and issued downloads. Main updates use an expected SHA without force.

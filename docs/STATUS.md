# FrameFlow 2.1.1 status

The user confirmed 2.1.0 startup and Close Gap in AE 25.6.4x3 (build 3, Windows 10), and reported strict preflight cancellation when a crossing layer has no source handles. The supplied 24 fps / CTI 146/24 s / five-frame case is reproduced with ten simulated layers.

The default media policy now leaves the entire exhausted layer unchanged and lets other valid targets proceed. A separate stop-all option preserves previous media behavior. Relevant locks, collisions, unsupported partial-key values and runtime/readback failures remain atomic. Tests cover both reported directions, nine valid targets plus one limited target, no-op with only a limited target, read-only preview, strict stop-all and bounded recovery after an injected write failure.

Startup defaults are Auto / Layers and Keys, independently of saved step and appearance. Remembering a different context is explicit. Preferences v1/v2 migrate to v3, preserving customization and zero/false. The default layout is compacted to 420 × 360 with shorter inline descriptions. This removes no timing controls.

See `VERIFICATION.json` and `docs/verification.log` for exact check counts and file hashes. Tests simulate AE, scoped evalFile, CEP, clipboard and DOM. Actual 2.1.1 AE execution, Undo/Redo, Windows/macOS installation, clipboard and browser/desktop layout have not run. Source review is self-review. Use `docs/AE_SMOKE_TEST_RU.md` for the host pass. Publication uses a task branch and PR, retaining previous issued downloads.

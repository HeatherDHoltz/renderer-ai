# Renderer implementation instructions

Read `RAILCAR_HANDOFF.md` first (current room: the 1890 private railcar, October 16, 2026), then `IMPLEMENTATION_HANDOFF.md`, `PLAN.md`, and `STATUS.md` before implementation.

- Work only in this AI-assisted repository. Never modify `../renderer-project` or course materials.
- Heather authorized local milestone commits without asking again on October 15, 2026. Inspect status/diffs, verify the change, and commit related work directly. Preserve unrelated edits.
- Heather authorized public `HeatherDHoltz/renderer-ai` creation and automatic pushes on October 15, 2026. Push verified milestone commits without repeated confirmation. Never force-push or rewrite shared history.
- Keep credentials out of files, commits, and tool output. Use GitHub CLI's credential helper.
- Do not spawn subagents without Heather's authorization.
- Continue clear, authorized next steps autonomously. At milestones, state what is next; request input only when Heather actually needs to make a decision.
- For the current railcar iteration, leave changes uncommitted until Heather asks. Keep RAILCAR_HANDOFF.md current for collaboration with Claude.
- Heather authorized measured FPS tradeoffs on October18, including black outside the loupe and resolution reductions. Current faster defaults use75% render dimensions and black loupe surround; retain native/blur comparison options and document visual costs. Heather subsequently required live ring shadows and continuous scenery: do not freeze room frames during hover, dragging or loupe inspection.
- Fidelity takes priority over maneuverability and frame rate (Heather, October 16, 2026). Never lower pixel density or material/geometry quality during interaction without a new explicit request.
- For railcar geometry work, follow `workbench/scripts/railcar/AUDIT.md`: rerun the evaluated-mesh audit after rebuilding, inspect ranked evidence, and resolve ordinary geometry issues autonomously. Never equate a geometry pass with visual approval.
- For railcar exports, follow AUDIT.md's authored-scene clock override after the merged bake. Apply manifest-required collection overrides and inspect matching captures before installing; a completed export is not visual approval.
- Maintain honest milestone evidence and exact next steps. Do not mark unimplemented features complete or invent benchmark results.
- Check `cargo fmt --check`, `cargo test --locked`, and `cargo clippy --all-targets -- -D warnings` for implementation milestones. Inspect actual rendered images for visual milestones.
- Keep large generated output under ignored `output/`; retain selected real gallery images. Keep Cargo.lock.
- Keep AI-assisted portfolio work separate from the manually authored class submission. Document collaboration honestly.
- Ask Heather before assigning a repository license. No license has been selected.

Use right-handed +Y-up coordinates, local camera -Z, column vectors, `T * R * S`, inverse-transpose normals, and unnormalized object-space ray directions to preserve t. Prefer safe, immutable scene data during rendering.

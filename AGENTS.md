# Renderer implementation instructions

Read `IMPLEMENTATION_HANDOFF.md`, `PLAN.md`, and `STATUS.md` before implementation.

- Work only in this AI-assisted repository. Never modify `../renderer-project` or course materials.
- Heather authorized local milestone commits without asking again on October 15, 2026. Inspect status/diffs, verify the change, and commit related work directly. Preserve unrelated edits.
- Heather authorized public `HeatherDHoltz/renderer-ai` creation and automatic pushes on October 15, 2026. Push verified milestone commits without repeated confirmation. Never force-push or rewrite shared history.
- Keep credentials out of files, commits, and tool output. Use GitHub CLI's credential helper.
- Do not spawn subagents without Heather's authorization.
- Maintain honest milestone evidence and exact next steps. Do not mark unimplemented features complete or invent benchmark results.
- Check `cargo fmt --check`, `cargo test --locked`, and `cargo clippy --all-targets -- -D warnings` for implementation milestones. Inspect actual rendered images for visual milestones.
- Keep large generated output under ignored `output/`; retain selected real gallery images. Keep Cargo.lock.
- Keep AI-assisted portfolio work separate from the manually authored class submission. Document collaboration honestly.
- Ask Heather before assigning a repository license. No license has been selected.

Use right-handed +Y-up coordinates, local camera -Z, column vectors, `T * R * S`, inverse-transpose normals, and unnormalized object-space ray directions to preserve t. Prefer safe, immutable scene data during rendering.

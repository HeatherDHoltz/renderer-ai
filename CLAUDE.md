# Claude Code instructions

Follow `AGENTS.md` (shared with Codex) — it is the source of truth for repository rules.
Start with `RAILCAR_HANDOFF.md`: the current room is the 1890 private railcar, with its status and ordered next steps.

- Blender work goes through the Blender MCP server (`mcp__blender__*` tools) with Blender 5.2 open and its MCP add-on running; drive long operations from `bpy.app.timers` and watch `output/railcar/export-log.txt`.
- Run the site with `npm run dev --prefix workbench` and check frame rate at http://127.0.0.1:4173/?fps (target ≥ 30 fps; never trade away visible quality without asking Heather).

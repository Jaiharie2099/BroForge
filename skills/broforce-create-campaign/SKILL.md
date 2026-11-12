---
name: broforce-create-campaign
description: Create or revise Broforce campaigns using existing environments, the local Workshop MCP generator, previews, and game playtests.
---

Use the `broforce-workshop` MCP tools. Read `broforce://guide` if the interface is unfamiliar.

Turn the user's brief into a route, approximate duration, encounters, rescue/checkpoint placement, and a clear exit. Use an existing environment. `create_project(kind="campaign")` starts with the proven short Hell descent; adapt its design rather than presenting an unchanged template as a new level. For another environment, inspect native settings/enums; existing enum names alone do not prove every object works in every environment.

Read `design.json` with `read_project`, edit it with `write_project_file`, then call `build_project`. This invokes the installed game's actual constructors and serializers. Use `inspect_native_catalog` to discover exact terrain, doodad, theme, and action names. JSON has one or more `levels`, and the tool can package a multi-level campaign. Preserve the project's `BWM:<id>|` prefix in every levelDescription.

Important placement rules learned from actual failures:
- Coordinates increase upward from the bottom-left. Terrain rectangle bounds are inclusive. Later rectangles overwrite earlier cells on the same layer.
- A rescue cage spans two columns and two rows. With support at row g, put its anchor at row g+2 and leave both occupied rows clear. Verify the support/footprint in the preview and game; a point-in-map check is insufficient.
- SpawnPoint variation 1 is invisible. Other variations are appearance modes, not player indices, and can add visible starting cages.
- `forcedBro="Random"` (1000) and an empty forced list allow native vanilla rescues. Pick a custom initial bro using `initialBro` when creating the project; that character is a separate installed dependency.
- An exit decoration alone does not establish completion. Preserve or author the actual success trigger.

Call `preview_project` and inspect the scrollable schematic for route, support, gaps, and trigger positions. A valid native round trip establishes a readable file, not a completable level. Install with `install_project` when the user's request includes trying/adding the content. Use `game_control` launch/start_campaign/status and bounded drive inputs to playtest. Supply `projectId` to bind observations to installed hashes. New bro DLLs require restarting the Workshop profile before testing.

Check first-spawn class, rescue behavior, cage position, and actual completion in the normal campaign path. Do not substitute a forced scene change for a gameplay completion test. Report what was observed and what remains untested, and return the preview URL and campaign file paths. Keep sources and generated outputs together.

Workspace setup is available through `initialize_workspace` and `workspace_status`. Keep generated content inside the bound workspace. For cleanup use `broforce://skill-uninstall`; external game writes and optional launch integration must remain journaled.

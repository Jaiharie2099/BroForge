---
name: uninstall
description: Remove BroForge MCP-managed character and level installations, launch integration, exported skills, and local runtime using ownership receipts. Use for BroForge uninstall or rollback requests; preserve authored projects and unrelated game or Steam files.
---

Use the connected `broforce-workshop` MCP. Read `broforce://guide` and call `workspace_status` to identify the bound workspace. A workspace owns only changes recorded in its installation journal; do not infer ownership from filenames or scan-and-delete the game folder.

For one character/campaign, use `uninstall_project(id)`; remove dependent campaigns first when appropriate. Keep project sources unless the user separately requests their deletion.

For full removal, call `uninstall_workspace` without `apply` to obtain the current plan, conflicts, and `planId`. Default `includeRuntime=true` also removes tracked setup tools and profile files. `includeRuntime=false` retains the authoring runtime. Authored projects, build history, backups, and removal receipts remain for recovery.

When the user requested removal, execute the concrete plan with `apply=true` and its `planId`; the initial uninstall request authorizes this scope. A dry run is an inventory step, not a reason to demand another confirmation. If the managed game is running, close only that workspace's game through `game_control(action="quit")` and wait for it to exit before obtaining a fresh plan. Steam must be closed if its launch options need restoring; do not kill Steam or other games without authorization.

A changed file, corrupt/missing backup, or changed Steam setting is a conflict. Report the exact path and reason and preserve it; do not force deletion, restore an entire old Steam config, fabricate receipts, or broaden the cleanup. Re-plan after any state change. If an operation times out, inspect status/receipts before retrying.

Legacy installs without a workspace ownership journal cannot be safely claimed as managed. Explain that limitation and use the available historical receipts for a separate, explicit migration/recovery operation rather than guessing.

After applying, verify the returned removal result. Report restored external settings/files, retained sources and recovery records, and anything blocked. Removing one workspace must not remove another workspace's content or uninstall the purchased game.

# Agent guide: Broforce Workshop MCP

This local stdio server targets Linux x86_64 and the exact game fingerprint reported by inspect_installation. It uses your installed game assemblies; it does not ship the game or recover its original Unity project.

Start with workspace_status and inspect_installation. The server is bound to BROFORCE_WORKSPACE (or its initial cwd). Call initialize_workspace to create the workspace and start its local setup job; poll workspace_status until ready. Setup logs and failures live under .broforge/runtime. Setup does not install demo levels, modify Steam, or implicitly export skills. Serving and inspection never download tools.

Read broforce://skill-create-campaign, broforce://skill-create-bro, broforce://skill-bro-art, or broforce://skill-uninstall. The four bundled skill folders can be exported with install_skills(directory); these explicit external writes are journaled for removal.

## Workflow

1. create_project gives a persistent directory and editable sources. Campaigns start with the known-good short Hell descent; bros start with a rifle preset using inherited vanilla art. Make substantive edits appropriate to the brief.
2. read_project and write_project_file inspect/edit source. Use normal filesystem/image tools for larger edits and generated art; import_bro_asset copies PNG/WAV files into a bro. Names/presets in project.json are stable; create a new project for another identity. configure_project updates author, version or campaign initialBro; rebuild after changing it.
3. build_project constructs native campaigns or compiles bro DLLs and writes build/report.json. A build is tied to source hashes and game fingerprint. Unsupported enums and missing/out-of-bounds declared assets fail. Build validity does not prove game behavior.
4. preview_project opens a read-only loopback site. Campaign previews are zoomable scrollable schematics, **not** actual game rendering. Bro previews show imported PNGs and loops configured in animations.json. No built-in image model or full-level Unity capture exists yet.
5. install_project adds current campaign .bfc/.bfg files to the normal Levels directory, or copies a bro into the isolated profile. Overwrite=false refuses conflicts; overwrite=true backs up differing files. Installing does not upload or push anything. uninstall_project removes unchanged installed files and restores recorded backups; it keeps project sources.
6. Prefer play_project(id) for the complete build/install/play flow. Explicit dependencies and a campaign initialBro are resolved to local bro projects. A bro gets an editable generated playtest campaign; project files are retained. It reports installed/restart-required if a running profile has older character assets; restart=true authorizes closing and relaunching only that managed game. The returned loaded stage confirms the observed map and initial runtime class; gameplayTested=false until actual behavior is exercised.
7. game_control launch starts the Workshop game; start_campaign(name) follows the native normal custom campaign loading path. switch_bro(name) selects a loaded custom bro. New DLLs require quit + launch. status returns observed runtime classes, positions, cages and spawn events. drive provides bounded inputs (1..10000 ms) for player zero. Supply projectId to save hash-bound observations in records/. No generic command execution/eval is exposed.

Build failures return MCP isError plus diagnostics. Requests that time out may already have acted; inspect status before retrying a game mutation. Quit closes the running Workshop game, so do not use it while the user is playing unless their requested workflow calls for restarting.

## Campaign design

Read broforce://campaign-design for a complete fixture. create_project saves an adapted copy as design.json, preserving a project-specific `BWM:<id>|` levelDescription prefix used by the spawn policy. Multiple levels are accepted. `initialBro` at creation sets a custom first spawn; omit it for vanilla selection. The bro must be installed separately and loaded at game startup. Later spawns use native vanilla selection, which can repeat.

Use inspect_native_catalog(section,field) for exact native enums/fields instead of guessing numeric IDs. MapData includes settings; DoodadInfo.type includes objects; LevelEventActionInfo includes action kinds. Terrain and doodad coordinates are in cells with origin bottom-left; terrain bounds are inclusive. Runtime collision, reachability and custom character mechanics still require the actual game.

## Workspace, launch and removal

The server package is the read-only source of templates/code; workspace state is independent. Generated MCP configuration binds an explicit BROFORCE_WORKSPACE, so a client cwd change does not change where projects are written. BROFORCE_GAME_PATH or broforge.json.gamePath selects the purchased game. BROFORCE_PROJECTS_DIR, if used, must remain inside the workspace. Projects live in projects/ and all owned toolchain/profile/dependency state under .broforge/.

The root play-broforce launcher loads this workspace's managed profile. configure_launch(mode="steam",action="plan") prepares optional integration with Steam's existing Play button; apply requires the exact planId and Steam must be closed. Preserve existing arguments and unrelated Steam settings. Steam integration is not enabled merely by setup or installing content. It is not Steam Workshop publishing.

install_project uses the ownership journal with transactional writes and hash-checked backups; removed package assets are reconciled on reinstall. Native level files are the required external game writes. Their physical names include the workspace UUID and project ID so two workspaces cannot claim the same campaign files; the game metadata retains the user-facing name. game_control resolves local campaign names to the installation receipt’s launchName. Record-only legacy installs are not automatically claimed by the new workspace.

uninstall_workspace defaults to a dry run, including tracked setup runtime, installed content, launchers and exported skills. Apply its current planId to perform removal. Retain authored projects, build history, recovery backups and audit logs. Changed files/settings and corrupt or missing backups are conflicts; preserve them and explain the exact paths. Do not force through a conflict or restore an entire stale Steam account config. A running managed game must be closed first; Steam must be closed when restoring launch options. Read broforce://skill-uninstall for scope and recovery guidance.

Runtime loading proof is not a gameplay success verdict. Linux native is the tested platform; Windows/Proton support, remote publishing, hosted image generation and game-rendered level panoramas are not implemented.

## Bundled character and gameplay recording

create_project(kind="bro",template="spider-bro") creates a fully editable Spider Bro 0.2.5 working copy; the default rifle template remains available. Identity/preset names are adapted to the requested project id. play_project builds and launches either template through the same profile workflow.

game_control drive accepts up/down/left/right/fire/jump/special/melee for player one, bounded to 1..10000 ms. record_start(name,milliseconds,fps) records only the game's rendered view for at most 10 seconds at 1..15 requested FPS into the current workspace runtime. Names must be lowercase alphanumeric, hyphens or underscores and at most 64 characters. Existing captures are never overwritten. record_status reports completion/frame count/error; record_stop requests early termination. Frames include measured elapsed time and runtime state. Capture FPS is a target, not a guarantee; gameplay and rendering continue while recording.

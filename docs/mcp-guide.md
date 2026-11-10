# Agent guide: Broforce Workshop MCP

This local stdio server targets Linux x86_64 and the exact game fingerprint reported by inspect_installation. It uses your installed game assemblies; it does not ship the game or recover its original Unity project.

Start with inspect_installation. If the toolchain/profile is missing, follow the setup instructions in README.md outside MCP. Setup downloads pinned dependency archives, provisions .NET 8 locally, builds native tools and prepares a separate mod profile. MCP serving never downloads or updates dependencies implicitly.

Read the skill matching the task: broforce://skill-create-campaign, broforce://skill-create-bro, or broforce://skill-bro-art. These are also installable skill folders under skills/. Connecting an MCP client exposes these resources and prompts; install the skills into your agent's skill directory if you want automatic skill discovery.

## Workflow

1. create_project gives a persistent directory and editable sources. Campaigns start with the known-good short Hell descent; bros start with a rifle preset using inherited vanilla art. Make substantive edits appropriate to the brief.
2. read_project and write_project_file inspect/edit source. Use normal filesystem/image tools for larger edits and generated art; import_bro_asset copies PNG/WAV files into a bro. Names/presets in project.json are stable; create a new project for another identity. configure_project updates author, version or campaign initialBro; rebuild after changing it.
3. build_project constructs native campaigns or compiles bro DLLs and writes build/report.json. A build is tied to source hashes and game fingerprint. Unsupported enums and missing/out-of-bounds declared assets fail. Build validity does not prove game behavior.
4. preview_project opens a read-only loopback site. Campaign previews are zoomable scrollable schematics, **not** actual game rendering. Bro previews show imported PNGs and loops configured in animations.json. No built-in image model or full-level Unity capture exists yet.
5. install_project adds current campaign .bfc/.bfg files to the normal Levels directory, or copies a bro into the isolated profile. Overwrite=false refuses conflicts; overwrite=true backs up differing files. Installing does not upload or push anything. uninstall_project removes unchanged installed files and restores recorded backups; it keeps project sources.
6. game_control launch starts the Workshop game; start_campaign(name) follows the native normal custom campaign loading path. switch_bro(name) selects a loaded custom bro. New DLLs require quit + launch. status returns observed runtime classes, positions, cages and spawn events. drive provides bounded inputs (1..10000 ms) for player zero. Supply projectId to save hash-bound observations in records/. No generic command execution/eval is exposed.

Build failures return MCP isError plus diagnostics. Requests that time out may already have acted; inspect status before retrying a game mutation. Quit closes the running Workshop game, so do not use it while the user is playing unless their requested workflow calls for restarting.

## Campaign design

Read broforce://campaign-design for a complete fixture. create_project saves an adapted copy as design.json, preserving a project-specific `BWM:<id>|` levelDescription prefix used by the spawn policy. Multiple levels are accepted. `initialBro` at creation sets a custom first spawn; omit it for vanilla selection. The bro must be installed separately and loaded at game startup. Later spawns use native vanilla selection, which can repeat.

Use inspect_native_catalog(section,field) for exact native enums/fields instead of guessing numeric IDs. MapData includes settings; DoodadInfo.type includes objects; LevelEventActionInfo includes action kinds. Terrain and doodad coordinates are in cells with origin bottom-left; terrain bounds are inclusive. Runtime collision, reachability and custom character mechanics still require the actual game.

## Portability and records

The server root is derived from its own path, never from the caller's working directory. BROFORCE_GAME_PATH overrides installation discovery; BROFORCE_PROJECTS_DIR overrides the default projects/ library. Keep these values in the MCP client's env configuration when needed. The launch script carries the resolved game path into Snap Steam.

Projects retain editable sources, build artifacts/reports and installation/observation records. Dependency locks and upstream provenance remain separate. The MCP server, tools and skills are implemented; remote GitHub sync, arbitrary platform support, image generation hosting, automatic semantic level reachability checks and game-rendered level panoramas are not.

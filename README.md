# BroForge

A local Linux authoring kit for **custom BroMaker characters and campaigns using Broforce's existing environments**. An agent can create editable projects, invoke the game's real campaign serializers, compile character DLLs, preview content on a local website, install it, and control a separate modded game for playtests.

The MCP server, CLI, three agent skills, project library, and preview site are implemented. This is a local checkout, not a published npm package. GitHub synchronization and full-level game-rendered panoramas are not implemented. The level viewer currently shows an explicitly labeled schematic.

## Quick setup

Requires Linux x86_64, an installed supported Broforce build, Node 22+ with npm (or Bun), Python 3.12+, Steam, and a graphical session for playing. The tested game assembly SHA-256 is `d518444c45ba73f834bfbd163973f3c0fdbb935522144d9b95e6db74029a6b86`. Setup refuses unknown builds rather than claiming compatibility. Python 3.12+ is needed for safe tar extraction when provisioning .NET.

From this directory, with Broforce closed:

```bash
npm ci
npm run setup
npm run doctor
node src/cli.js config
```

Or use Bun:

```bash
bun install
bun run setup
bun run doctor
bun src/cli.js config
```

Setup downloads the exact dependency archives in `dependencies.lock.json`, verifies their hashes, provisions .NET SDK 8.0.427 under `.toolchain/` if needed, builds the native authoring host and live bridge, and prepares the isolated `runtime/profile`. It also installs the existing **The High Ground** demo campaign, backing up differing files of the same name. It does not rewrite game assemblies or Steam's normal launch options. Normal Steam launch stays vanilla; the Workshop launcher enables the mods.

If discovery fails, set `BROFORCE_GAME_PATH` to the game directory before setup and put the same environment variable in the MCP configuration. Installation discovery covers Snap Steam and standard Linux Steam paths. Setup needs network access for missing prerequisites; normal MCP serving uses installed prerequisites only. `npm run setup -- --skip-profile` prepares the native tooling without updating the mod profile while the game is running.

## Connect another agent

`node src/cli.js config` prints ready-to-copy JSON with the actual absolute Node and server paths. Add its `broforce-workshop` entry to your MCP client's configuration. The entry has this shape:

```json
{
  "mcpServers": {
    "broforce-workshop": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/BroForce/src/cli.js", "serve"]
    }
  }
}
```

The server uses **stdio**. Do not start the preview command as the MCP server. No working-directory assumption is required. Use the generated config rather than these example paths. Set `BROFORCE_PROJECTS_DIR` in the client's `env` to keep projects somewhere other than this checkout's `projects/`.

The server exposes the skills as MCP resources and starter prompts. For automatic skill discovery, copy the three folders in `skills/` into your agent's skill directory. Setup can do this explicitly:

```bash
npm run setup -- --skip-profile --skills-dir /path/to/your/agents/skills
```

It refuses to overwrite existing skill folders. MCP connection alone does not configure your client's normal skill discovery. No global agent configuration is changed automatically.

**Give your agent this prompt:**

> Set up the existing Broforce Workshop MCP from this checkout. Read README.md first. Run npm ci, inspect the installation, and run npm run setup with Broforce closed; use BROFORCE_GAME_PATH if needed. Do not create another server implementation. Generate the MCP entry with node src/cli.js config and add it using this client's supported configuration mechanism. Install the three skills into this agent's skill directory if it supports skills. Reconnect if necessary, then verify that inspect_installation works and read broforce://guide. Tell me when the tools are connected and which game build is supported.

**Then try this prompt:**

> Use the Broforce Workshop MCP and its campaign skill to create a new very short Hell campaign called Furnace Escape. Make a distinct descending route with one rescue and a working exit. Start as Bronobi and let the rescue choose a vanilla bro. Build it and show me the local preview, then install and playtest it. Inspect the actual runtime character classes and completion result; report anything untested.

For a character:

> Use the Broforce Workshop bro and artwork skills to make a new rifle-based bro called Ember Ranger. Give it original artwork and an introduction portrait, using the Bronobi reference gallery to understand the asset roles. Use your image tools for art, and the MCP for project creation, imports, builds, preview, installation, and game testing. Keep the rifle template where appropriate and tell me which behaviors remain inherited. If image generation is unavailable, tell me before presenting inherited art as original.

## Tools and references

| Tool | What it does |
|---|---|
| `inspect_installation` | Fingerprint, compatibility, prerequisites and bridge state |
| `create_project`, `list_projects`, `read_project` | Persistent editable campaign or bro projects |
| `write_project_file`, `configure_project`, `import_bro_asset` | Edit sources/settings and import local PNG/WAV assets |
| `inspect_native_catalog` | Discover real settings and enum values from the installed assembly |
| `build_project` | Native `.bfc`/`.bfg` serialization or Unity-compatible bro DLL compilation |
| `preview_project` | Start a read-only local website and return the project's URL |
| `install_project`, `uninstall_project` | Install current builds, remove unchanged installed files, restore recorded backups |
| `game_control` | Launch, inspect, load campaigns/editor, switch loaded bro, bounded input, quit |

Resources: `broforce://guide`, `broforce://skill-create-campaign`, `broforce://skill-create-bro`, `broforce://skill-bro-art`, `broforce://campaign-design`, and `broforce://bro-assets`. Prompts: `create-campaign` and `create-bro`.

The campaign tool constructs **real Campaign, MapData, terrain, doodad and trigger objects**, then invokes the installed game's native serializers without running Unity. It accepts multiple levels and the currently supported LevelEvent action structure; it is not a full replacement for every editor feature. [Native tool format and usage](tools/NativeCampaignTool/README.md).

The bro scaffold is a new preset inheriting BroMaker's Rambro adapter. It compiles against the game's older Mono assemblies, separately from the .NET 8 authoring host. It initially uses vanilla behavior/art. Original art and mechanics require actual editing and testing. Image generation comes from your agent's image tools; this server does not contain an image model or require an image API key.

For a client that strips graphical environment variables, launching recovers display settings from the existing systemd user session. On a non-systemd desktop, provide DISPLAY/XAUTHORITY or WAYLAND_DISPLAY/XDG_RUNTIME_DIR in the MCP client env.

A custom first bro is an explicit campaign dependency. The installed campaign policy configures initial spawning and later vanilla selection. Installing a new/changed character DLL requires restarting the Workshop game. It is not embedded inside `.bfg`.

## Preview and play

Ask the agent to call `preview_project`, or start a persistent preview site yourself:

```bash
npm run preview
```

Open the printed loopback URL. The site provides a project library, scrollable/zoomable campaign maps with optional trigger overlays, character images, configured animation loops, build findings, and a Bronobi art/intro reference gallery. It is a viewer; ask the agent for edits, installation and playtests. Schematic previews and animation loops are separate from actual game rendering and gameplay verification.

Start the modded game manually with:

```bash
./scripts/run_modded.sh
```

Or use MCP `game_control(action="launch")`. Installed campaigns appear in **Custom Campaigns**. The original standalone game client remains available as `python3 scripts/workshop.py --help`.

Projects store sources, `build/report.json`, generated artifacts, and `records/` installation/observation receipts. Builds have source/artifact hashes and game/dependency identity; installation refuses stale sources, altered output, and conflicting files unless overwrite is explicitly requested. Replaced files are backed up under `runtime/backups/`. Playtest observations do not automatically imply a successful gameplay test.

## Verification

```bash
npm test
python3 -m unittest discover -s tests
```

The MCP tests spawn a real stdio client from outside the checkout, discover tools/resources/prompts, build real native campaigns and bro DLLs when setup is available, serve previews, and verify error paths. They do not modify game levels or launch the game. Native checks need completed setup; diagnostics state when those integration portions cannot run.

An explicit full game smoke test creates and installs **Workshop Rifle Test** and **Workshop MCP Smoke**, launches the Workshop profile, checks the initial class and vanilla rescue, and drives through normal campaign completion:

```bash
node scripts/smoke_mcp.js
```

Close Broforce first. This test takes over game input. Its report is `runtime/mcp-live-smoke.json`; test projects remain in the local library for inspection.

## Scope and provenance

Linux and one local player are the verified scope. There is no Windows support, online multiplayer promise, remote GitHub sync, hosted image generation, or stitched Unity level capture in this version. Read [the agent guide](docs/mcp-guide.md) and [native interface evidence](docs/native-interface.md) for detailed boundaries.

Pinned upstream dependencies are UMM, RocketLib, BroMaker, and Bronobi. Imported Bronobi provenance, license and asset credits are retained under `library/bros/bronobi/1.0.1`; downloaded upstream archives remain reference material. Game assemblies are resolved from each user's installation and excluded from distributable code. The original verified [High Ground campaign and evidence](library/levels/high-ground/README.md) remain available.

## Credits

Custom character support is built on **[BroMaker](https://github.com/Gorzontrok/Bro-Maker)**, created and maintained by **[Gorzontrok](https://github.com/Gorzontrok)**. BroForge uses BroMaker's character framework, configuration and integration APIs; it does not replace that work. BroMaker credits **[alexneargarder](https://github.com/alexneargarder)** for the original custom-bro groundwork.

The mod profile also uses [RocketLib by Gorzontrok](https://github.com/Gorzontrok/RocketLib) and [alexneargarder's Unity Mod Manager fork](https://github.com/alexneargarder/unity-mod-manager). The imported **Bronobi** reference character is by Gorzontrok; its [source and release provenance](library/bros/bronobi/1.0.1/catalog.json), [upstream license](library/bros/bronobi/1.0.1/UPSTREAM-LICENSE), and [asset credits](library/bros/bronobi/1.0.1/ASSET-CREDITS.txt) are retained. Dependency versions and hashes are pinned in `dependencies.lock.json` and fetched during setup.

Broforce is developed by [Free Lives](https://freelives.net/). This is an independent authoring tool and requires your own installed copy of the game.

The repository's existing [AGPLv3 license](LICENSE) is retained. Third-party dependencies and assets retain their respective licenses and credits. Proprietary game assemblies, local mod binaries, caches, and reverse-engineering dumps are not included in this repository. Historical verification records replace machine-specific paths with `${WORKSHOP_ROOT}` and `${BROFORCE_GAME_PATH}`; artifact hashes remain unchanged.

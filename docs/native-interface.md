# Native campaign and character interface

## What is implemented

The authoring path uses the installed game's C# types. The original Unity project and a supported public authoring SDK were not recovered. This prototype targets the exact managed assembly identified in `library/levels/high-ground/campaign-build.json`.

There are two working execution paths:

1. **Headless data authoring:** `tools/NativeCampaignTool` loads `Assembly-CSharp.dll` under .NET 8. Its `--design` route constructs real `Campaign`, `MapData`, terrain arrays, objects, and triggers from JSON, then invokes `FileIO.SerializeCampaignBinary` and `FileIO.SerializeCampaign`. Its `--input` route also accepts an existing editable campaign through `Campaign.Deserialize(BinaryReader)`. Native decryption, checksum, decompression, and XML deserialization validate the resulting `.bfg`. Unity is not launched for these steps. The JSON fixture produced an editable file byte-for-byte identical to the runtime-tested campaign; see `tools/NativeCampaignTool/README.md` for usage and format limits.
2. **Live game operations:** `mods/WorkshopBridge` is a UMM mod with a small fixed command interface. It executes queued requests on the game thread and returns typed JSON state. It can load an editor campaign, toggle play, start a normal custom campaign, inspect loaded characters and cage colliders, and drive native player input for tests. No tile placement clicks are needed.

The CLI and bridge are now exposed through the local stdio MCP server in `src/server.js`. See `README.md` and `docs/mcp-guide.md` for setup, tools, skills and previews. The server is implemented; each agent client still needs its own connection configuration.

## Campaign files

A campaign contains an array of levels plus a header with a name, author, description, length, and game mode. A one-level campaign is valid; expanding it means adding more `MapData` entries to `Campaign.levels` before serializing.

- `.bfc` is the editable campaign used by the level editor.
- `.bfg` is the packaged campaign read by the normal Custom Campaign menu.

The game calls the latter a published format; saving it locally does not upload it to Steam Workshop or GitHub. The local package is `library/levels/high-ground/The High Ground.bfg`, with name **The High Ground**, author **Jai**, and one level. Both files are copied into the game's `Levels` folder by `scripts/prepare_profile.py`.

Character DLLs, sprites, and audio are separate mod dependencies. They are not embedded in the campaign file.

## Bro selection and cage correction

The original generator forced Rambro globally. That applied to rescues too. The corrected campaign uses the game's random sentinel (`forcedBro=1000`) and has no forced-bro list.

The bridge patches `Player.SpawnHero` before BroMaker's own patch. For the initial spawn in this test map it sets BroMaker's `nextBroSpawn="Bronobi"` and `overrideNextBroSpawn=true`. For later spawns it temporarily disables BroMaker replacement and leaves the vanilla selection intact. The setting is restored after the spawn. Random selection follows the game's available hero pool and can repeat between runs.

MCP-authored campaigns now use project-specific `BWM:<id>|` descriptions and an installed `campaign-policies.json` entry, so the initial custom character is configurable rather than limited to Bronobi or this demo. The full MCP smoke test compiled a new Rambro-adapter preset, installed a new campaign, observed `WorkshopBros.Workshop_mcp_rifle_smoke` first and `Nebro` after rescue, and reached `VictoryCustomCampaign`. Its record is `library/playtests/mcp-smoke-2026-11-10.json`. The original High Ground playtest record retains the earlier bridge fingerprint; it is historical evidence, not a claim that later bridge builds have that same hash.

Editor play does not create a new Player spawn: `LevelEditorGUI.TogglePlayMode` keeps the preview character. A separate hook therefore uses BroMaker's `StoredHero.LoadBro` when entering editor play. This supports the ordinary editor Play button as well as the bridge command. The normal custom campaign initial-spawn and rescue path was verified in-game; the editor hook was compiled but has not received a separate final visual test.

The native cage occupies two columns and two rows, anchored at its upper row. Moving the rescue anchor from `(30,24)` to `(30,25)` clears the floor at row 23. Runtime collider measurements confirmed bottom Y **376**, equal to the supporting terrain's top Y **376**. The screenshot `bronobi-at-fixed-cage.png` shows the corrected placement.

Spawn-marker variation is an appearance mode, not a player number. All four markers now use variation 1 (invisible), removing unintended starting cages.

## Running and testing

The .NET 8 SDK was installed locally under `.toolchain/dotnet`; game references are resolved from the installed game rather than copied into source. Override installation discovery with `BROFORCE_GAME_PATH` if needed. Upstream source commits, archive paths, and SHA-256 values are pinned in `dependencies.lock.json`.

With the game closed:

```bash
python scripts/prepare_profile.py
./scripts/run_modded.sh
```

The launcher starts Steam silently if necessary and uses Doorstop to load the separate `runtime/profile` mod profile. It does not patch the installed game's managed assemblies or alter Steam's normal launch options. Profile configs and logs remain under `runtime/profile`; vanilla Steam launch does not load Bronobi.

Once the bridge is ready:

For Snap Steam installations the launcher enters Steam's Snap environment so Steam IPC and the game's existing saves resolve correctly. `launch_doorstop.py` reads the actual ELF header and selects the matching Doorstop library, avoiding Snap's missing `file` magic database. It then starts the game with the separate UMM entrypoint.

```bash
python scripts/workshop.py status
python scripts/workshop.py start-campaign 'The High Ground'
python scripts/workshop.py drive --right --fire --milliseconds 500
python scripts/verify_workshop.py
```

Other commands include `load-editor`, `play`, `hide-ui`, and `native-roundtrip`. Run the CLI with `--help` for arguments. Commands use a local file queue, not a network listener. Requests are bound to a game session and expire; after a timeout, inspect state before retrying a mutation whose outcome is unknown.

Static generation checks:

```bash
python tools/build_high_ground.py
python tools/validate_high_ground.py
python -m unittest discover -s tests
```

Rebuilding `.bfc` does not refresh `.bfg` automatically. Follow `library/levels/high-ground/AUTHORING.md` to package it with the native serializer, then prepare/install the profile again.

## Verification and evidence

`library/levels/high-ground/playtest.json` binds runtime results to exact campaign and bridge hashes. Its `verification/` folder contains native state before and after rescue, spawn-policy events, and the normal campaign victory scene. The inspected game code established the serializers, cage footprint, and spawning entry points; actual execution established that this installation loads the package, spawns `BronobiMod.Bronobi`, swaps to vanilla `Rambro` or `BroDredd` on rescue, and reaches `VictoryCustomCampaign`.

Relevant REA records are `ev_bc4e1c6717e1025badc736e6140404267d6db9cbb649fc68dbf37df98527adeb` (campaign/FileIO/Cage) and `ev_7b99052148d6d1ed9127b8ef57e03da09656cdf543757d692e661cbad5074250` (Cage). The spawn member record is retained alongside the local investigation evidence. BroMaker integration was checked against its pinned source and compiled against the actual release DLL.

Verified scope is one local player on this Linux build. Other game builds and multiplayer have not been tested.

Raw REA records and disassembly are retained only in the original local investigation workspace, not in this source repository. The source, generated demo, artifact hashes and exported runtime verification summaries are included here.

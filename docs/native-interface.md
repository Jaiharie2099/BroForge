# Native campaign and character interface

## Implemented paths

The headless `NativeCampaignTool` loads the installed `Assembly-CSharp.dll` under .NET 8. It constructs real `Campaign`, `MapData`, terrain, doodad and trigger objects from JSON, then invokes the game's native editable and packaged serializers. An existing `.bfc` can also be read through `Campaign.Deserialize(BinaryReader)`. Validation calls the native decrypt, checksum, decompression and XML deserialization paths. No Unity process is started for data authoring.

The UMM `WorkshopBridge` executes a fixed set of commands on the game thread through session-bound local file IPC. It loads campaigns/editor maps, inspects runtime classes and cage colliders, drives bounded input, and selects already loaded custom bros. The local MCP server exposes these operations; [README.md](../README.md) and [the agent guide](mcp-guide.md) describe installation and use.

This is an executable use of the installed game's internal data interface, not a recovered original Unity project or a supported public SDK. The tested Linux game fingerprint is recorded in `library/levels/high-ground/campaign-build.json`. Other builds and multiplayer remain unverified.

## Campaign format and characters

A campaign has a header and an array of levels. `.bfc` is editable; `.bfg` is the packaged file read by the normal Custom Campaign menu. Creating the packaged file does not upload it. Custom character DLLs and art are separate dependencies.

Setup provides the UMM, RocketLib and BroMaker framework dependencies, with no imported character package. The standalone High Ground demo uses native vanilla selection (`forcedBro=1000`, an empty forced list).

Authored MCP campaigns carry a `BWM:<id>|` description prefix. Installing a campaign writes its policy to `runtime/profile/campaign-policies.json`. The bridge patches only matching campaigns: an explicit `initialBro` selects the separately installed custom hero for the first spawn, and later spawns use native vanilla selection. Omitting the custom initial hero leaves vanilla selection intact. Settings are restored after the native spawn. The ordinary demo has no special-case character override.

Editor play retains a preview player, so the bridge uses BroMaker's `StoredHero.LoadBro` when entering play for a configured custom initial character. New or changed character DLLs require restarting the Workshop profile. `switch_bro` selects a character already loaded by BroMaker.

## Placement findings

The native rescue cage occupies two columns and two rows, anchored at the upper row. For a supporting terrace at row 23, its anchor is `(30,25)`. Earlier collider measurements established a cage bottom Y of 376, equal to the supporting terrain's top. SpawnPoint variation 1 is invisible; other variations are appearance modes rather than player numbers.

Native parsing does not establish collision, reachability or completion. A decorative exit needs an actual success trigger. Playtest changes through normal campaign loading and record the exact built/installed hashes.

## Run and verify

```bash
npm run setup
./scripts/run_modded.sh
python3 scripts/workshop.py status
python3 scripts/workshop.py start-campaign 'The High Ground'
```

The isolated profile preserves normal Steam launch and the game's managed assemblies. Snap Steam launches enter the existing Snap environment; the launcher selects Doorstop architecture from the actual ELF header. MCP launch recovers desktop environment variables from the systemd user session when a client has stripped them.

```bash
npm test
python3 -m unittest discover -s tests
node scripts/smoke_mcp.js
```

The last command is an explicit live test: it authors and compiles a new rifle preset, builds/installs a separate campaign, launches the game, observes custom first spawn and vanilla rescue, and navigates to normal campaign victory. Close Broforce first; the test takes over input. Its raw report is `runtime/mcp-live-smoke.json`.

Build reports, installation receipts and playtest observations are separate. Records should bind content hashes, game fingerprint and dependency/tool versions to actual observations. A prior success does not certify a modified build.

The inspected serializers and cage footprint are documented by local REA records `ev_bc4e1c6717e1025badc736e6140404267d6db9cbb649fc68dbf37df98527adeb` and `ev_7b99052148d6d1ed9127b8ef57e03da09656cdf543757d692e661cbad5074250`. Raw disassembly and investigation dumps remain outside this source repository.

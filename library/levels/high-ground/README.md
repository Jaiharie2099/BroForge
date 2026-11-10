# The High Ground

A short original campaign using Broforce's existing Hell environment: a high steel ledge descends through demonic terraces to a lower exit. The map is 64×48 cells, with a midpoint rescue and checkpoints.

The campaign leaves hero selection to the game's native vanilla pool. It does not require or contain a custom character. The cage anchor is raised clear of the ground, and all starting markers use the invisible appearance mode.

## Play and edit

Setup installs `The High Ground.bfg` in the local Custom Campaigns library and `The High Ground.bfc` for the level editor. A normal vanilla launch can load the campaign; use the separate Workshop profile when you want the live MCP bridge.

```bash
./scripts/run_modded.sh
python3 scripts/workshop.py start-campaign 'The High Ground'
```

`design.json` records the original generator's settings and placements. `campaign-build.json` records native serialization identity and validation; it is not a gameplay test result. The reusable semantic authoring template is `templates/campaigns/high-ground.json`.

Read [AUTHORING.md](AUTHORING.md) for native packaging commands and [the native interface guide](../../../docs/native-interface.md) for runtime control and verification boundaries. Use `node scripts/smoke_mcp.js` for a full test of a separately generated campaign and a new rifle preset.

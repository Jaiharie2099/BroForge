# The High Ground

A tiny original test campaign using Broforce's existing Hell environment. Start on a high steel overlook, descend four short drops through demonic terrain and burning bone torches, then reach the Hell exit portal on the bottom terrace.

The map is 64 by 48 tiles, with four small enemy encounters, a midpoint checkpoint and rescue cage, and a lower checkpoint. Expected first playthrough: about 15–30 seconds.

The current revision removes the global Rambro restriction, raises the rescue cage to the correct native anchor, and uses invisible starting markers. Starting as Bronobi requires the separate BroMaker integration; the campaign file itself leaves native bro selection unrestricted so rescues can change characters. The original Rambro test and its evidence are preserved under `revisions/initial-rambro/`.

## Play locally

Launch the modded profile with `./scripts/run_modded.sh` from the workspace root, then select **Custom Campaign → The High Ground**. Bronobi is loaded by that profile; a normal vanilla launch does not load custom characters. Native state and the normal custom campaign victory were verified; see `playtest.json`.

For editor testing, use `The High Ground.bfc` in the game's `Levels` directory: select **Level Editor**, select **The High Ground**, click **Load**, then click **Play (F3)**. For normal campaign play, use the packaged `The High Ground.bfg` in the local Custom Campaign browser. With the current local controls: arrow keys move, Up jumps, Z fires. Move right down the terraces and reach the portal/completion region at the far right of the lowest terrace.

## Files

- `The High Ground.bfc`: editable native campaign.
- `The High Ground.bfg`: local playable campaign package with metadata, created by the game's own managed serializer.
- `campaign-build.json`: exact serializer invocation identity, artifact hash, and native round-trip validation result.
- `design.json`: settings and placements used by this prototype generator.
- `playtest.json`: actual verification results for the recorded artifact hash.
- `bronobi-at-fixed-cage.png`: Bronobi beside the correctly placed rescue cage.
- `campaign-completed.png` and `campaign-victory.png`: normal campaign completion.
- `verification/`: typed native game state before/after rescue and the victory scene.
- `revisions/initial-rambro/`: original prototype artifacts and screenshots.

Rebuild with `python tools/build_high_ground.py` from the workspace root; inspect the generated file with `python tools/validate_high_ground.py`. See [AUTHORING.md](AUTHORING.md) for the headless native campaign packaging command. Rebuilding does not install it automatically. The generator currently describes this one test map; it is not a general level authoring interface.

The binary format was reconstructed from the installed assembly's Campaign, MapData, DoodadInfo, TriggerInfo, TriggerActionInfo, and LevelEventActionInfo serializers. It targets the inspected Linux game build; broader version compatibility is untested. Game artwork and shipped levels are not embedded in this campaign.

The reusable native interface and launch commands are documented in [docs/native-interface.md](../../../docs/native-interface.md).

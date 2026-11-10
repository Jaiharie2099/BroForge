# Native campaign data interface

This tool executes the installed game's real managed data constructors and serializers without starting the Unity player. It does not reconstruct or require the original Unity project, and it does not provide gameplay simulation outside Unity.

Two input routes are available:

- `--input existing.bfc`: invoke `Campaign.Deserialize(BinaryReader)` and package it with metadata.
- `--design design.json`: construct `Campaign`, `MapData(width,height)`, typed `TerrainType[,]` arrays, `GridPoint`, `DoodadInfo`, `TriggerInfo`, and `LevelEventActionInfo` directly from a JSON design.

Both routes call the actual `FileIO.SerializeCampaignBinary(campaign,true)` and `FileIO.SerializeCampaign(campaign,true,true)` methods. Validation reads the native editable output through `Campaign.Deserialize`, then decrypts, checksums, decompresses, and XML-deserializes the published output using the game implementation. No fake Unity engine calls or replacement game data classes are used.

## Build and run

```bash
.toolchain/dotnet/dotnet build tools/NativeCampaignTool -o .toolchain/native-campaign-tool
.toolchain/dotnet/dotnet .toolchain/native-campaign-tool/NativeCampaignTool.dll \
  --managed '/path/to/Broforce/Broforce_Data/Managed' \
  --design templates/campaigns/high-ground.json \
  --output 'runtime/native-design-test/The High Ground.bfg'
```

Design input also writes an editable `.bfc` next to the `.bfg`. Set `--editable-output` to choose another location. The input-BFC route writes an editable copy only if `--editable-output` is explicitly supplied, preserving its prior behavior. Optional metadata arguments are `--name`, `--author`, and `--description`.

Output is a JSON build report containing both artifact hashes, the exact source game assembly hash and MVID, level count, invoked native interface, and validation scope. A failure prints its exception and exits nonzero; it does not claim successful validation.

## Design shape

See `templates/campaigns/high-ground.json` for a complete working example. The shape is:

```json
{
  "name": "Campaign name",
  "levels": [{
    "width": 64,
    "height": 48,
    "settings": {"theme": "Hell", "heroSpawnMode": "SpawnPoint", "forcedBro": "Random"},
    "terrain": [{"layer": "foreground", "bounds": [0, 0, 63, 10], "type": "HellEarth"}],
    "doodads": [{"x": 4, "y": 11, "type": "SpawnPoint", "variation": 1}],
    "triggers": []
  }]
}
```

Terrain rectangle bounds are inclusive `[left,bottom,right,top]`, and later rectangles overwrite earlier ones. Empty cells begin as native `TerrainType.Empty`. Settings name actual `MapData` fields. Native enum names or numeric values are accepted. Unknown fields, unsupported scalar types, invalid dimensions, invalid terrain layers/rectangles, and out-of-map doodads are rejected.

Triggers specify native field values, `bottomLeft`/`upperRight`, and `actions`. This prototype supports `LevelEventActionInfo` actions, with optional `pos`/`pos2` GridPoints. It intentionally does not pretend to cover every native action subclass or arbitrary Unity object reference. The game remains necessary for collision, rendering, character behavior, and completion testing.

## Proven local result

The fixture's JSON-to-native-constructor route produced a 6,977-byte editable campaign with SHA-256 `19bf67583007509a91c487930fbbac7239e020fd20abcfaea59ac035deb8ad1d`, byte-for-byte identical to the independently generated and runtime-verified High Ground campaign. Generated experiments are under `runtime/native-design-test/`; the current library artifacts were not overwritten.

This observation is bound to game assembly SHA-256 `d518444c45ba73f834bfbd163973f3c0fdbb935522144d9b95e6db74029a6b86`, MVID `26ca9ec0-2f28-4fc8-8117-d9a0eb8804eb`. Other builds are untested. A different `.bfg` hash can result from native constructor defaults on XML-only fields (for example null versus empty lists); native round trips validate its structure, while only the byte-identical editable output inherits the already established gameplay equivalence.

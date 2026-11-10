# Bro asset contract

Use the character's chosen BroMaker baseline to determine sprite layout and offsets. Consult [BroMaker's documentation and examples](https://github.com/Gorzontrok/Bro-Maker) rather than assuming every hero uses the same animation grid. Credit the authors and respect the licenses of any material you reuse.

The following example filenames describe asset roles; they are not bundled artwork:

| Role | Example filename | Configuration |
|---|---|---|
| HUD portrait | avatar.png | parameters.Avatar |
| Body animation | hero.png | parameters.Sprite |
| Weapon animation | weapon.png | parameters.GunSprite |
| Grabbed weapon | weapon-grab.png | beforeAwake.gunGrabSprite |
| Special icon | special.png | parameters.SpecialIcons |
| Introduction art | intro.png | cutscene.spritePath |
| Introduction voice | intro.wav | cutscene.barkPath |

Paths in bro.json are relative to the built package root, corresponding to the editable project's `assets/` directory. Omit an override to retain inherited game art. Art is separate from Hero.dll. Import original/generated PNGs or WAVs with `import_bro_asset`, record provenance in CREDITS.md, and inspect them in the project's local preview.

For a still introduction, configure `playCutsceneOnFirstSpawn=true`, a `heading`, optional subtitles, `spritePath`, `isAnimated=false`, and `spriteRect` matching the intended image rectangle. Use the actual BroMaker documentation and game tests for animated introduction settings, timing and composition.

Browser animation metadata is independent of game configuration:

```json
{
  "animations": [
    {
      "name": "Run preview",
      "file": "hero.png",
      "fps": 10,
      "frames": [[0, 0, 32, 32], [32, 0, 32, 32], [64, 0, 32, 32]]
    }
  ]
}
```

Rectangles are `[x,y,width,height]` in pixels from the image's top-left. Use positive integer rectangles entirely inside the PNG. These example dimensions illustrate the viewer format; choose actual dimensions from the selected runtime baseline. Preview metadata does not change BroMaker's runtime animation rows, weapon origins or material configuration.

Review introduction artwork in context: framing, subtitle placement, identity and readability need both visual inspection and an in-game check.

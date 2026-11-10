# Bro asset contract and visual references

The local preview website includes a **Bronobi art reference** page with the actual imported avatar, introduction sheet, body and gun sheets, special icon, and the cutscene configuration. These are reference assets credited to the imported package, not original art for your new character. Provenance is in `library/bros/bronobi/1.0.1/catalog.json`; preserve its upstream license and asset-specific credits when reusing material.

The known-good files are under `library/bros/bronobi/1.0.1/package/UMM/BroMaker_Storage/Bronobi/`:

| Role | Reference filename | Configuration |
|---|---|---|
| HUD portrait | avatar_Bronobi.png | parameters.Avatar |
| Body animation | Bronobi_anim.png | parameters.Sprite |
| Weapon animation | Bronobi_gun_anim.png | parameters.GunSprite |
| Grabbed weapon | Bronobi_gun_grab_anim.png | beforeAwake.gunGrabSprite |
| Special icon | Bronobi_ammo.png | parameters.SpecialIcons |
| Introduction art | Bronobi_Cutscene.png | cutscene.spritePath |
| Introduction voice | Bronobi.wav | cutscene.barkPath |

For a new bro, all these paths are relative to its package root, which corresponds to the editable project's `assets/` directory. Omit an override to retain inherited game art. Art is not embedded inside Hero.dll.

An introductory still can be configured with `playCutsceneOnFirstSpawn=true`, `heading`, optional subtitles, `spritePath`, `isAnimated=false`, and `spriteRect` matching the intended rectangle. Read the actual BroMaker format for advanced animated intros. Bronobi uses six frames with FrameWidth=42.5 and FrameRate=0.08; that unusual existing configuration is a reference, not a recommended universal template.

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

Rectangles are `[x,y,width,height]` in pixels from the image's **top-left**. Use positive integer rectangles entirely within the PNG. This viewer metadata does not change BroMaker's runtime animation rows, weapon origins or material configuration.

For introduction art, demonstrate the composed in-game result as well as the source image: framing, subtitle overlap, character identity and readability can only be judged in context.

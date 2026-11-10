---
name: broforce-bro-art
description: Prepare Broforce custom character portraits, introduction artwork, avatars, icons, and aligned sprite animations from visual references.
---

Read [the asset reference](references/assets.md), also available as `broforce://bro-assets`. Use the host agent's image-generation/editing capability when available; no image generation service is built into this MCP server. If it is unavailable, use supplied assets or report that limitation rather than claiming images were generated.

Develop a consistent silhouette, costume, palette and weapon across the introduction portrait, HUD avatar, icons and gameplay sprite. Start with a reference/concept image; use it to maintain identity across subsequent assets. Inspect the actual reference images rather than inferring them from filenames. Use BroMaker's documentation and the included asset-role guide as format references; `preview_project` shows the images you import into the project.

Generate concepts, portraits and pose candidates as separate tasks. Gameplay sprites require precise transparent pixels, stable anchors and a compatible frame layout. Assemble and align frames deterministically with appropriate image tools after generation; do not rely on a single image-model request to produce a perfect final sheet. Follow any tool-specific image-generation instructions.

Import PNGs/WAVs into assets/ using `import_bro_asset` or ordinary file tools. Configure the actual BroMaker filenames and offsets in bro.json and C#. Add explicit frame rectangles to animations.json for browser loops. Build validation checks their bounds, but does not verify visual consistency, alpha quality, collision, timing or all engine animation conventions. Inspect both enlarged loops and the character at native scale, then test in game.

Keep introduction artwork distinct from gameplay sprite sheets. Use the reference cutscene configuration to understand heading, subtitles, image path, animation and bark audio; derive frame dimensions from the chosen baseline. Preserve the user's chosen character concept and record sources, generated assets and credits.

---
name: broforce-create-bro
description: Create or revise playable custom Broforce characters using BroMaker, editable C# behavior, assets, compilation, and in-game testing.
---

Use the `broforce-workshop` MCP tools and read `broforce://guide`. Ask only about material choices missing from the brief. Define the identity, primary attack, special, movement, and visual silhouette before choosing a baseline.

`create_project(kind="bro")` creates a new named C# preset inheriting BroMaker's Rambro adapter, plus bro.json, assets/, animations.json and credits. This is a functional rifle baseline with inherited vanilla art, not a finished original character. Retain it for suitable rifle concepts. For other abilities, author C# using a verified BroMaker baseline/reference and compile/test it; do not claim changing a JSON label creates new mechanics. Bronobi is an example of custom SwordHero behavior, not the default template for every character.

Edit src/Hero.cs, bro.json and related source files using `write_project_file`. The project manifest owns the preset identifier; keep the HeroPreset attribute and bro.json.characterPreset consistent. Use your host's file tools for complex source editing if preferable, then rebuild through MCP. Do not include or copy the game DLLs into the content package.

Read the `broforce-bro-art` skill for original art, introduction portraits, icons and animations. The server does not provide an image model; use the host agent's available image tool, or the user's assets, and import local PNG/WAV files with `import_bro_asset`. Keep provenance/credits in CREDITS.md. A request for a new look requires original assets, not merely renaming inherited art.

Call `build_project` to validate referenced assets and declared preview frames and compile the gameplay DLL against the installed Unity/Mono assemblies. This compilation target differs from the .NET 8 campaign authoring host. Compiler errors are actionable feedback; do not change the runtime target to .NET 8 to make them disappear.

Call `preview_project` to inspect actual images and animation loops. Preview frames in animations.json are for the viewer; they do not configure the game's animation system. Apply corresponding changes in BroMaker configuration/code.

Install through `install_project`. New/changed DLLs require quitting and relaunching the separate Workshop profile. In a loaded level, `game_control(action="switch_bro",name=...)` selects the character; check status for the actual runtime class. Test the intro, idle/run/jump, attack direction/offsets, special and death/rescue behavior appropriate to the brief. Use a short campaign with this character set as its initialBro for repeatable tests.

Finish with source/package paths, preview URL, known inherited behavior/art, build results, and observed runtime results. Distinguish compilation, visual inspection and actual gameplay evidence.

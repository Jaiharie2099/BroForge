# Spider Bro

Version 0.2.5 is the approved editable bundled character. Create a working copy with
`create_project({id: "my-spider", kind: "bro", name: "My Spider", template: "spider-bro"})`.
The default `rifle` template remains available. Existing projects are never overwritten.

The self-contained project is in `0.2.5/project/`. It includes C# gameplay and visual
sources, runtime assets, animation metadata, credits, and Python/Pillow authoring tools.
Build/install the working copy with the normal project tools; local Broforce and
BroMaker references are required to compile. The bundle contains no compiled DLLs.

From the project directory, `python tools/build_art.py` regenerates the animation
bank and optional preview records. Keep the bundled fallback atlases: without an
optional local native source atlas, the script preserves them for native gib geometry.
`python tools/build_portrait.py` rebuilds portrait C with its approved suit, preserving
the skull from the existing avatar. `python tools/build_special_icon.py` rebuilds
approved icon A with mirrored eyes. `python tools/verify_art.py` checks animation
coverage, the approved idle reference, native weapon transparency, and the skull crop.
Python 3 and Pillow are required. Review previews are generated locally and not bundled.

The approved version includes the chest emblem, shortened arms, crouch-only floor
punches, C portrait and suit, and mirrored special icon A. See the project's
`CREDITS.md` for artwork and inherited game asset attribution. Bundled provenance
remains 0.2.5 when creating a differently named character; the new project owns its
requested id, name, author, preset and creation date.

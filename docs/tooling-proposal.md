# BroForge architecture and remaining work

The local Linux MCP adapter, CLI, agent skills, native campaign authoring host, BroMaker-compatible character compiler, isolated mod profile, and schematic/asset preview website are implemented. See [the agent guide](mcp-guide.md) for the current contract.

The shared core owns projects, native serialization, compilation, validation, packaging and installation. The MCP adapter exposes those operations. Skills guide creative choices, asset preparation and playtest iteration. The website reads the same source files and manifests, avoiding a second competing project store.

A bro project retains editable C#, configuration, original/imported assets and credits. A campaign design retains semantic terrain/object/trigger specifications and can contain multiple levels. Builds connect source and artifact hashes, game fingerprint and dependency/tool versions. Playtest results describe what actually ran and remain separate from static/native validation.

Only framework dependencies are pinned and fetched by setup: UMM, RocketLib and BroMaker. There is no bundled third-party bro. The default authoring scaffold inherits the BroMaker Rambro adapter; original appearances and unusual mechanics require actual art/code changes and in-game tests.

Remaining work includes full-level Unity-rendered panorama capture, broader verified authoring features, and optional GitHub library synchronization. Keep the local versioned directory as the source of truth. Future synchronization should preserve local edits, provenance, licenses and exact test records, and exclude game binaries, credentials and machine-specific configuration. No automatic remote synchronization is currently implemented.

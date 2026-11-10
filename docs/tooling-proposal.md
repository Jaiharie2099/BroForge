# Broforce authoring tools and library proposal

Status: original design proposal, now partly implemented. The local MCP server, CLI, skills and schematic preview website are documented in `README.md` and `docs/mcp-guide.md`. GitHub synchronization remains proposed. Scope: custom bros through BroMaker; levels using existing game environments. Custom environment assets are excluded.

## Concrete reference

Bronobi 1.0.1 is imported under `library/bros/bronobi/1.0.1/`. The upstream source at `references/CustomBros/Bronobi/Bronobi/` includes C# behavior, JSON configuration, sprites, and audio. The character class uses BroMaker's HeroPreset attribute and derives from SwordHero. The release manifest declares BroMaker 2.6.2, RocketLib 2.4.3, and UMM 1.1.0. These are this release's declared dependencies, not a claim that they are the latest versions or compatible with this host.

The package has separate character configuration, mod metadata, compiled behavior, art, and sound. This is a useful real example for authoring skills and validators. CRC, declared assembly/config file existence, and primary sprite references passed. Runtime loading and gameplay were verified locally; source-to-binary reproducibility of the imported release remains untested. Provenance and per-file hashes are in catalog.json. Keep upstream code license and individual asset credits with copied material.

## Shape of the system

Build one authoring module with a small interface, then expose it through a CLI and a local stdio MCP adapter. Keep formatting, compatibility checks, build diagnostics, and packaging in that implementation so skills do not each reproduce them. Skills supply the creative workflow: designing an encounter, mapping a bro's abilities to code and animations, interpreting playtest feedback, and iterating.

Start with actual workflows before fixing a large tool inventory. Candidate operations:

| Workflow | Proposed operation | Result |
| --- | --- | --- |
| Understand local setup | inspect_installation | Game fingerprint, dependency availability, supported and untested capabilities |
| Author a bro | create_bro / build_bro | Source workspace, assets/configuration, build diagnostics, package |
| Author a level | create_level / build_level | Editable design and compatible campaign file, with diagnostics |
| Check either artifact | validate_content | Structured findings and validation status |
| Reuse content | list_content / inspect_content | Searchable local catalog and provenance |
| Test in the game | stage_content / collect_playtest | Installation record and actual observed evidence, if host tooling supports it |
| Share content | sync_library | Git changes, commit/remote result, and explicit conflict diagnostics |

These names and parameter shapes are provisional. Do not advertise stage/playtest/build capabilities until they actually work on this host. Runtime automation may require a small in-game bridge; filesystem generation alone does not provide game control.

## Library model

Use an ordinary versioned directory as the source of truth. The MCP server manages and queries it; GitHub hosts and synchronizes it. A database or custom hosting service is unnecessary at this scale.

- A **bro project** contains editable code, metadata, configuration, and original assets. A **bro package** is a versioned build with dependency requirements.
- A **level design** is an editable semantic specification. A **campaign** is the game-loadable artifact containing one or more levels. Keep both when generation supports it.
- A **catalog entry** connects identity, author, version, provenance, required mods, game compatibility, previews, and artifact hashes.
- A **playtest record** describes what actually ran: game build, content hash, dependency versions, result, and observed evidence. It must not be inferred from static validation.

For example, a level requiring a custom bro should record that requirement explicitly; a campaign should not be assumed to embed the character's DLL or assets. A design modified after a successful playtest needs a new test record tied to its new artifact hash.

Potential layout:

```text
skills/                    # Bro and level authoring workflows
src/                       # Authoring implementation, CLI, MCP adapter
library/bros/<id>/          # Owned source projects and versioned packages
library/levels/<id>/        # Designs, editable campaigns, previews
library/playtests/          # Results bound to exact artifact hashes
references/                # Pinned upstream examples, not owned content
investigation/             # Format and compatibility evidence
```

The imported character currently stores both its release ZIP and extraction for inspection. A durable repository can keep source/configuration/previews in Git and attach compiled ZIPs to releases. Decide whether larger art/audio files warrant Git LFS from actual sizes. Local game assemblies and saves should stay outside the shared library; resolve build references from the user's installation.

## GitHub synchronization

Support a configured repository and local checkout. Pull changes without discarding local work; use branches and report conflicts instead of silently overwriting designs. Push new content as explicit commits or pull requests according to the user's chosen policy. Immutable package versions and hashes make downloaded content traceable. Keep third-party provenance and credits, and exclude credentials, local install paths/configuration, and game binaries from shared content.

No GitHub repository has been selected or created. Implementation needs a repository name/owner and a chosen visibility before remote creation or synchronization. A local library can work before that choice.

## Proposed skills

1. **Create a bro:** concept and moveset, select an appropriate BroMaker baseline, create source/configuration and animation assets, build, validate, and iterate from an actual test.
2. **Create a level:** choose an existing environment, define route and encounters, compile a campaign, check placement/connectivity, open in the editor, and iterate.
3. **Maintain the library:** import with provenance, inspect versions and dependencies, attach previews/test records, and synchronize with the configured GitHub repository.

## Delivery order

1. Complete: import an existing BroMaker bro with source, release, provenance, and basic file checks.
2. Complete: run Bronobi through the separate Linux mod profile and verify its runtime character class.
3. Complete: generate editable and packaged campaigns, verify native serialization round trips, fix cage geometry, and complete the normal campaign in-game.
4. CLI and live bridge implemented: direct JSON-to-native-data authoring, native serialization, campaign loading, character inspection, and input-driven playtests. Complete: the MCP adapter, three skills and local schematic/asset preview site now expose this interface.
5. Add catalog search and GitHub synchronization around real artifacts and their test records.

The local mod-loading and campaign-format proofs are recorded in [the native interface documentation](native-interface.md). The MCP adapter, reusable skills and Linux setup command are implemented. Remaining work includes full-level Unity capture and a configured GitHub remote and synchronization policy. Multiplayer and other game builds remain untested.

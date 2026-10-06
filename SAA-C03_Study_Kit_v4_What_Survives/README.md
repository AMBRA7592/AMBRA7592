# AWS — What Survives

**Three visual studies of state, failure and recovery.** An optional companion to the *SAA-C03 One-Guide Study Kit, Revision 4 (6 October 2026)*.

Each study replays one small online print shop through the same events. You can pause at any event, predict, rewind, change one design decision and compare equivalent moments of the two runs. Every pause shows what still exists, which component holds it, whether the current request can reach it, and whether the business action has already happened.

## Open it

1. Extract the ZIP.
2. Open **`What_Survives_companion/AWS_What_Survives.html`** in a web browser.

It works offline, straight from disk. You do not need to install anything, use an AWS account or connect to a network. Chapter links open the guide in `SAA-C03_One-Guide_Study_Kit_v4/`. The guide files are unchanged.

## Where it fits in the ten-day route

| Study | Use after | Links into the guide |
|---|---|---|
| 1 · The missing photograph | Day 4: §6 compute, load balancing and scaling | W1, §6.3, §7.1, §7.5 |
| 2 · The perfectly replicated mistake | Day 6: §8 databases | §8.2, §11.1 |
| 3 · The second payment | Day 7: §9 messaging | §9.2, W21 |

**Design target:** a guided first visit to all three studies should take about 10–15 minutes, with time left over for slower exploration. Learner timings have not been measured.

Keyboard: `→`/`←` step through events, `K` plays or pauses, `R` resets the study, `1`–`3` switch studies and `?` lists every key. **Text view** gives a readable step-by-step mode. **Reduce motion** turns animation off; the companion also follows your system's reduced-motion setting. **Print key states** prints 12 annotated moments.

## Status: read this if you are in the pilot

- The companion is **not part of the frozen v4 study route**. Using it is an **additional teaching condition**.
- Pilot learners should record its use in `MY_STUDY_LOG.txt`: which studies they used, the date and the approximate minutes. Record it under *Outside help used* and *Other departures from the planned route*.
- Report results from this extended route separately. They should not be attributed to the original guide alone.
- The companion has passed its model and browser checks. It has **not** been tested with learners, so it has no established learning effect.

## Contents

| Path | What it is |
|---|---|
| `SAA-C03_One-Guide_Study_Kit_v4/` | The original package. All five files are byte-for-byte identical to the hashes in its `EDITION.json` |
| `What_Survives_companion/AWS_What_Survives.html` | The companion: one self-contained file with all scripts, styles and teaching data embedded |
| `What_Survives_companion/SOURCE_MAP.md` | Each teaching claim, with its guide section, the supporting AWS documentation and the date it was checked |
| `What_Survives_companion/GUIDE_NOTES.md` | Clarifications and coverage notes recorded separately from the frozen guide, plus notes for pilot coordinators |
| `What_Survives_companion/screenshots/` | Three representative screenshots, one per study |
| `What_Survives_companion/source/` | Source code (model, teaching data, view, interface, styles, page template) and the build script |
| `What_Survives_companion/checks/` | Model, package and browser checks |
| `MANIFEST.json` | Version, route placement, teaching condition and a SHA-256 hash for every file |

## For maintainers

Run these from `What_Survives_companion/` with Node 18 or later:

```text
node source/build.mjs            # rebuild AWS_What_Survives.html and SOURCE_MAP.md (reproducible)
node checks/model-checks.mjs     # causal behaviour, rewind/reset, teaching data (no dependencies)
node checks/package-checks.mjs   # unchanged guide, manifest hashes, reproducible build
node checks/browser-checks.mjs   # needs Playwright; --screenshots refreshes screenshots/
node source/package.mjs          # write MANIFEST.json and the distribution ZIP
```

The model holds a deterministic event model that is kept separate from the drawing code. For the same study, design and incident schedule, it always produces the same frames, and the checks test the built page itself. The claims were checked on 2026-10-06. The build environment blocked direct requests to AWS documentation, so the AWS pages were read through a search index; `SOURCE_MAP.md` explains how. Re-open the links before relying on them.

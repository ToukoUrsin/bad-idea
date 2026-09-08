# Bad Idea — invention and design playtest

September 8, 2026. Local prototype at http://localhost:4320.

## Assessment

The core loop now works: describe an invention, inspect its 3D preview, equip it, test it in the courtyard, then revise it. This is a playable invention sandbox. It is still a prototype with one simple courtyard and primitive generated art, not a polished escape game or an unrestricted “anything you imagine” engine.

## What the first pass actually exposed

- The helicopter fetched the key in the real browser, then parked inside the first-person view.
- The original ladder design was upward thrust dressed as a ladder; the original cloak froze the guard instead of hiding the player.
- An ice ray could not aim and could only be activated once.
- Generated inventions replaced equipment before the player pressed Equip.
- There was no 3D preview. Held gun geometry sat below the visible screen.
- The original grappling trajectory overshot with simple forward movement.
- The trampoline needs a jump onto the pad. Walking into its raised edge is not a valid launch test.

## Changes made from those findings

- Added actual nearby ladder climbing, aligned with the rungs and requiring forward input. It cannot lift the player remotely.
- Added aimed ice shots with range and line-of-sight checks, miss feedback, and repeat activation.
- Added invisibility that suppresses guard detection without freezing the guard. The player still has to approach and take the key.
- Added contact-triggered trampoline launches with repeat-contact protection.
- Added solid parts for anchored inventions and whole-capsule collision checks for teleport destinations.
- Couriers are size-bounded, face their movement direction, support simple part animation, and park beside/behind the player after delivery.
- Added a rotatable 3D preview; drafts and equipped inventions are separate. Cancellation preserves the equipped item. Drafts and equipment survive a page reload in local browser storage.
- Added actionable usage text, explicit unsupported-mechanic notes, contextual in-game hints, visible ice shots and a grappling tether, and corrected first-person pistol framing.
- Kept the responsive movement and added regression coverage for the new mechanics. The exit now has a visible road and treeline.

## Fresh generated inventions

These are new API outputs, stored in `tests/fixtures/playtest/`. The engine, not the model, determines the result.

| Invention | Generation | Actual route verified |
|---|---:|---|
| Clockwork Keybird | 13.0 s | Steals and delivers the key; player goes around the guard and unlocks the gate. |
| Handheld Ice Ray | 10.1 s | Aim and fire within range, approach the frozen guard, take the key and escape. |
| Wooden Ladder | 13.8 s | Walk to the ladder, climb at its physical location, cross above the wall and land outside. |
| Walltop Grappling Hook | 13.8 s | Attraction lifts the player; steering and descent complete the escape. This is a tethered pull, not simulated rope/latching physics. |
| Invisibility Cloak | 9.6 s | Hide, approach the moving guard without freezing him, pickpocket, unlock the gate. |
| Wall-Hopper Trampoline | 10.7 s | Jump onto the active pad, launch over the wall and steer the landing. |

All six completed deterministic routes in the actual Rapier simulation, and their rendered first-person replays were observed in the browser. These replays apply movement through a test driver; they are not a claim of six manually played keyboard runs. Reported completed browser replays averaged roughly 118–120 FPS here, with p95 frame intervals around 9 ms. These short local measurements are not a guarantee for other hardware or every generated scene.

## Live UI checks

- Generated a red key-fetching helicopter and observed actual key delivery. Its original camera occlusion prompted the courier fix.
- Generated Blue Ice Pistol through the workbench in 10.4 s, rotated its preview, equipped it, and observed an out-of-range miss with a reuse hint.
- Verified equipment survives a renderer reload.
- Cancelled a revision and verified the original pistol remained equipped.
- Generated Tiny Orange Ice Pistol in 6.8 s: changed size/color and requested an 8-second freeze. The original blue pistol remained equipped until explicit replacement; the new preview and replacement label were visible.
- Looked at keyboard jump, mouse-look fallback, pause/restart and camera-motion/sound controls during the movement pass.
- Native pointer lock was rejected by the automation context. The free-look/edge-turn fallback was used; native mouse capture is not claimed as verified.

An additional “turn me into a mouse and squeeze through the bars” request returned a cosmetic potion with explicit shrinking/collision limitations and no substitute cloak/teleport power. Its no-op behavior is tested against the locked gate.

## Reproduce

- `npm run build`
- `npm test` — 30 deterministic checks, including all six new generated routes, wrong-aim/blocked shots, remote ladder/trampoline rejection, teleport collision, unsupported shrinking, and courier parking.
- `npx tsx tests/play-cases.ts` — prints results for the saved local exploratory outputs.
- `http://localhost:4320/playtest.html` — local developer replay view, separate from the actual game. Uses the saved outputs under `runtime/playtest/` and makes no API calls.
- `node tests/explore.mjs` — explicitly makes six new paid generation requests and writes exploratory outputs. It is not part of `npm test`.

## Remaining design limits

Object recognition and animation still vary; primitive parts cannot match authored game assets. One guard and one courtyard give the player little reason to keep solving once they have found a reliable approach. The next meaningful design work is richer physical interactions and a second scenario that rewards revising an invention, not more decorative menus. A frozen guard still needs to be approached for the key; that distinction should remain clear in onboarding. The existing key is not magically transferred by a shot.

## Three-level and controls pass — September 8

Reworked the game into The Courtyard (guard/key or wall bypass), The Broken Bridge (4m of missing ground), and The Rooftop (exit on a 4m platform). All are selectable from the title menu; wins offer the next level and record completion. Pause includes level selection. The workbench receives the actual level context, including no guard or gate in the later levels and the rooftop exit height.

Controls/UI: R immediately retries with the current invention; T equips a local sample without generation; E opens the workbench. Camera bob, roll, landing dip and variable FOV default off. When pointer capture is unavailable, dragging turns the camera, with Q/C as additional turning controls. Removed passive mouse movement and screen-edge continuous turning. Reduced HUD coverage. Suggestions change with the level. The current level is saved with the equipped invention and draft.

Verification: 37 physics/regression tests pass, including impossible walking-only routes, working sample blink/ladder routes, clean retries, and two fresh API-generated inventions solving the later levels. Rendered replay of the bridge won in 2.5s; rooftop won in 5.9s, approximately 120 FPS / 9ms p95 on this machine in these short runs. Actual browser checks covered selecting both levels, T sample equip, F activation, R retry with equipment retained, pause, camera-motion default off, returning to level selection, and starting generation from a level-specific suggestion.

Limits: The automated replays drive simulation inputs; they are not a human assessment of game feel. Native pointer capture remains unavailable to this automation environment, so the fallback and keyboard/menu behavior were checked. Scenes remain procedural prototype art, and the inventions remain bounded by the supported verbs. A custom bridge sample can require multiple solid pieces; arbitrary generated inventions are not guaranteed to solve a level.

Final browser generation check: selected Broken Bridge, clicked its teleport suggestion, and built Pocket Gap Jumper in 15.0s through the actual workbench. Verified the preview's landmark-based instructions and explicit fixed-direction/landing limitations, then equipped it successfully. This caught and fixed the absent-guard scene serialization: later levels now send a nullable guard and no-key state. Main browser is left at the bridge with this invention equipped; server remains running on localhost:4320.

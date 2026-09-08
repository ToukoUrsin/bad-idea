# Current implementation — September 8, 2026

The game now uses an adaptive white room and direct generation. The earlier preflight-based evidence below belongs to the previous iteration.

- A real UI request generated **Big Bad Balloon** in 56.3s. It ran directly when equipped, lifted the player, and the first room was escaped using forward input.
- During that play, `/api/direct` generated **The downdraft** in 18.7s: actual room JavaScript added a ceiling blower, rotating blades, animated warning arrows, destructible housing and timed downward force exceeding the balloon's lift. This was new authored code, not a preset hazard selection.
- The next-room button entered that generated room with the same balloon. After the automatic-deployment change, entering the saved second room visibly inflated the balloon without another F press.
- The interface is white and minimal. E opens a small non-modal prompt over the visible running room; submitting a request closes it and leaves a small progress/Equip button. A live cobalt-blue balloon revision completed in 13.2s while the current room continued running. Forward input moved the player up to the wall during generation, and the revision was equipped through the small ready button. The next authored room, “A moving landing,” generated in 18.1s in parallel.
- New API output omits test code. The player flow does not call workers, preflight simulations, code-budget instrumentation or separate rule-assessment APIs. Invention and room callbacks run directly; actual runtime exceptions initiate repair. The app's build passes.

## Prompt-time parallel generation and controls

The live UI submitted a balloon revision with Enter. Browser request timestamps were 406012.225158 for `/api/direct` and 406012.226042 for `/api/invent`: both started from the same submission, 0.884ms apart, without waiting for equip or use. This is one observed dispatch measurement, not generation latency. The counter request receives the planned prompt and revision context. Its result is associated with the completed invention so equip preserves the prefetched room.

Keyboard checks in the live page: Enter starts/resumes; E opens the prompt; Esc closes it and restores CANVAS focus; H toggles detailed hints; F vented the balloon; R from pause restarted with the balloon deployed. Forward input also moved the player during background generation. Computed cursor was `none` over the game canvas during play and ordinary in pause. Routine hint paragraphs are hidden unless H is used.

## Earlier iteration evidence (historical)

# Verification — September 8, 2026

Current architecture: new inventions contain executable JavaScript, with full game objects, Three.js and Rapier available. The action enum only remains for old saved inventions and instant samples.

## Generated code, independently checked

- **Bad Idea RPG**: visible rocket travel; no instant gate destruction; swept collision; blast removes the actual gate/wall collider; distant wall and ground survive; repeated firing after automatic reload. Its own test passed, and an independent test targeted a different wall. The browser worker passed the code, and the rendered replay showed the gate actually missing after impact.
- **Rootbound Crossing**: new vine geometry and growing colliders; the gap begins unsupported; support grows progressively; leaves unfurl; walking crosses the real gap; a second press retracts the geometry/colliders; regrowth works. Rendered replay won in 6.5s, ~120 FPS / 9.8ms p95 in this short local run.
- **Pocket Moon Remote**: toggles real world gravity; actual jumping and falling change; an independent dynamic physics body falls with the new acceleration; repeated presses restore normal gravity; visible halo changes. Behavioral tests passed.
- **Bad Company RPG**, created through the actual Chrome workbench: built and worker-tested in 65.4s, with no manual code repair. A live F press produced a smoke trail and destroyed the visible gate. The HUD changed to the open-way objective. A subsequent F press started manual reload. The saved generated test covers recoil, rocket travel, collision, explosion geometry, reload timing, a second shot destroying a wall, and cleanup.

The three earlier API code generations took 49.4s (RPG), 38.2s (vine), and 40.4s (gravity). These are individual measurements, not latency promises.

## Runtime and regression checks

The suite covers arbitrary gravity changes without action verbs, replacing an engine method, building physical support, removing an actual gate collider, repeat use semantics, surfaced runtime failures, failed behavioral-test rejection, loop/recursion interruption, cleanup, generated code, all three levels, plus the existing movement/legacy invention regressions.

Native pointer capture remains unverified in browser automation. The fallback uses plain mouse movement without holding a button; Q/C supplement turning, and Esc releases control. Movement timing and traversal routes use real simulation inputs; automated replays are not a subjective human assessment of feel. Audio feedback was synthesized and invoked, but not independently listened to.

Generated tests can be wrong or incomplete. Passing preflight does not prove every possible invention or interaction works. The executable code can change game rules and engine objects; source instructions ask it to solve the requested obstacle through the intended mechanic. Loop budgets are reliability protection, not an isolation/security guarantee. The normal execution destination is the browser, and no server credentials are supplied to it.

Local server only, http://localhost:4320. Build output alone does not include the API backend. No publication/deployment performed.

## Thinking-level latency trial

The live default is now low reasoning for first attempts and medium for repairs, both on Fast tier. A small same-prompt trial measured 27.2s for the low RPG versus an earlier 49.4s medium RPG, and 21.3s for the low vine versus an earlier 38.2s medium vine. These are different stochastic generations, not a controlled latency guarantee.

The low RPG passed its authored behavior checks and an independently aimed wall-breach test. The low vine failed physical-support validation; it was not equipped. Passing the failed candidate and error to the live server selected medium reasoning and produced a passing repair in 29.2s. That repaired bridge also passed an independent full-level crossing. Thus the vine needed about 50.6s of total generation, slower than the earlier medium first attempt. This policy improves the opportunity for fast successful builds, with a real repair tradeoff. The regression suite retains both the rejected code and passing repair.

54 tests pass. TypeScript and production build pass; the existing large-bundle warning remains. No player equipment or progress was changed by this trial.

## Continuous turning and inventory

The game requests native pointer lock when resuming and after submitting the prompt, and retries it on a stage click. The in-app browser denied native capture during this run. Its edge-turn fallback was measured through the rendered camera: 411.6 degrees of yaw in 3.4 seconds, with no clamp; the temporary measurement hook was removed immediately afterward. Moving away from the edge stops the continuous turn.

I opens a compact inventory containing saved inventions. New generations now equip directly on completion; automatic equip preserves the current play/pause mode, camera and active room. Inventory selection switches tools through the same runtime cleanup path. No generation preflight was added.

## Keyboard-only gameplay follow-up

- Production TypeScript/build passed after automatic equip, saved inventory and pointer-capture changes.
- Live local browser: generated Pocket Grappler automatically equipped. I opened an inventory containing Pocket Grappler and Big Bad Balloon; ArrowDown then Enter equipped Big Bad Balloon and closed inventory without a click.
- E focused the invention prompt with cursor computed as `none`; Escape closed it, focused the canvas and kept cursor `none`.
- Native pointer capture is retained through inventory/composer. Where the embedded browser denies capture, edge turning continues indefinitely; a temporary render observation measured 411.6 degrees of yaw over 3.4 seconds and was removed afterwards.
- Added Enter to advance a ready result, E to change an invention after a result, and retained R retry. Result shortcuts were typechecked; no additional full round was played for that small binding change.

## Inventory Escape and spawn correction

- Removed the separate change-invention retry choice. Failure has one Retry; I opens all saved inventions. E remains available for invention input.
- Escape closes the inventory through either keydown or pointer-lock release; paired events are deduplicated. Live DOM keyboard interaction returned canvas focus with inventory and pause hidden. A simulated pointerlockchange exercised the browser-consumed Escape branch and also returned to play; native capture is unavailable in the embedded test browser.
- Found Pocket Blink calls teleport() during its generated setup, in addition to carrying autoDeploy=true. Reset now defers invention runtime setup until F. It restores entrance position and zero velocity after room setup, with interpolation synchronized.
- Observed live retry frames at x=-6,z=0 with no invention runtime, settling onto the floor. Pressing F then visibly inflated the retained balloon. Temporary render observation was removed after the check.
- Production build passed. Future room instructions reserve clear standing space and safe floor around the entrance; existing generated rooms are not regenerated automatically.

## Background room queue and invention-rule rounds

- Found repeated cancellation paths on inventory equip, invention submission and unequip. The upcoming room is now committed per current round: a building/ready result survives those actions and retries. First prompt still starts invention and room together; later round entry starts the following counter even without a carried invention.
- Live browser keyboard sequence entered play, switched saved inventory and retried. Observed zero /api/direct requests, with Next room ready retained. Temporary fetch observation was removed afterwards.
- Added explicit geometry/rules/mixed director modes. Rules-only responses reuse the previous room source and objective on the server. Known inventory legality is returned with the same generation; missing items use a lightweight batch check. Forbidden tools stay in inventory and cannot equip/use under the rule. A tool authored under a different round is checked before automatic equip.
- Live Astra request returned rules mode in 6,722 ms: Continuous transport only. Existing source was preserved exactly; Pocket Blink was forbidden and Pocket Grappler allowed. Saved response: runtime/rule-round-check.json. No generated-code preflight was run.
- The late-inventory batch endpoint returned HTTP 200 and rejected Pocket Blink in 1,986 ms. Rule checks are legality judgments, not physics/runtime tests.
- Production TypeScript/build passed. A completed rule-only round has not been played through end-to-end. Physical generation can still outlast a very short level; the change removes avoidable regeneration, not network/model latency.

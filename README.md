# Bad idea

A first-person invention game in a white, minimal room. Invent a way out; Astra responds by writing the next room to counter what you used. Rooms can change geometry, enemies, physics, mechanics, rules and the win condition. Both inventions and rooms contain actual executable JavaScript, not a selection from a fixed action list.

## Run

Requires Node.js 22+ and an OpenAI API key with access to the configured model. Clone this repository, then:

```sh
npm ci
# Supply OPENAI_API_KEY through your environment or secret manager.
npm run dev
```

On Touko's machine, the existing vault launcher is `hsec exec --only OPENAI_API_KEY -- npm run dev`. Teammates do not need hsec; the server reads `OPENAI_API_KEY` from the environment. It does not automatically load `.env` files. `ESCAPE_MODEL`, `ESCAPE_REASONING_EFFORT`, `ESCAPE_REPAIR_REASONING_EFFORT`, `ESCAPE_SERVICE_TIER`, and `PORT` are optional environment overrides.

Open http://localhost:4320. The local server holds the API key; the browser and generated code never receive it.

WASD move, mouse looks, Space jumps, Shift sprints, E opens a small floating prompt, F uses the invention, R retries, I opens saved inventions (↑/↓ or W/S selects, Enter or 1–9 equips), H toggles detailed help, Esc pauses. Enter submits the floating prompt; Shift+Enter adds a line; Esc closes it and restores keyboard focus to the canvas. The cursor stays hidden during play, including the prompt and inventory. Every gameplay action uses the keyboard; the mouse only looks. Enter continues from a completed round, I opens inventory and R retries. Escape also closes inventory when the browser consumes the key to release pointer capture. Pointer capture stays active through the prompt and inventory, and is requested again on returning to play. When native capture is unavailable, moving to a horizontal viewport edge continues turning, so the camera has no rotation boundary. The first adaptive round has one low wall and no guard. A simple ladder is available immediately; later rounds ask you to invent. The original three static rooms remain selectable from the title screen.

## The adaptive loop

The first invention prompt starts invention and counter-room generation together. Later rounds start the following room immediately on entry, even if the current rule requires a new invention. Once a next room is building or ready, inventory switches, new invention prompts and retries keep it instead of cancelling and regenerating it. A later prompt starts a counter only if none is already queued. The next room does not wait for invention completion, equip or use. Each round commits one upcoming challenge. The current round continues. Submitting an invention closes the prompt and returns movement focus immediately; a small status button says “Building · Keep playing” and automatically equips the result when ready, without pausing or resetting the room. Previous inventions are kept in the I inventory. The current invention and room keep running throughout. On escape, the result screen reveals the new counter and any invention rule, then lets you enter the next round. Failure offers a single Retry action; all saved inventions remain available through I. Inventions marked `autoDeploy` activate on a fresh equip. Room entry and retry preserve the equipped item but defer its executable setup until F, so even an invention that teleports during setup cannot move the spawn. Each round starts at the same position facing the room. Your invention carries over unless the new rule explicitly makes it illegal; the prompt can adapt the previous idea to that rule. Retrying preserves the current room and invention. Run state and drafts are saved locally.

Astra authors the entire room behavior as JavaScript. It gets Three.js, Rapier, the simulation, renderer, entity registry and independent room root. It can reshape the room, implement new enemies and interactions, or replace the exit condition through `sim.winCondition`. The director chooses geometry, rules, or mixed challenges. Rule-only rounds reuse the previous room code and objective, reducing output generation. The director checks known inventory against its new free-form rule in the same response. Items acquired later are checked in one short background batch, and blocked items remain visible in inventory. Era limits concern the actual mechanism rather than cosmetic styling. New invention generation receives the active rule. These legality checks do not execute or preflight invention code.

Generation uses `gpt-6-astra`, low reasoning and Fast tier; repairs use medium. New generated output does **not** include test code and is **not preflighted**. Equip/enter runs it directly in the browser. If a JavaScript error occurs in actual play, its error and source are sent back for repair. There is no generated-code approval or automated simulation gate. The historical validation helpers and fixtures remain development artifacts, not part of the player flow.

Invention and room callbacks run independently. Ownership tracking keeps unequipping an invention from deleting the room's newly created objects. Each runtime catches actual errors and cleans up its own additions on disposal. The direct runtime does not instrument loops or function calls. This is a local dynamic-code prototype.

## Files

- `src/arena.ts`: free-form room schema, starting room and director prompt.
- `src/main.ts`: play, background room generation, progression, workbench and runtime-error repair.
- `src/code-runtime.ts`: independent room/invention execution and resource ownership.
- `src/simulation.ts`: physics, movement, editable world entities and replaceable win condition.
- `src/view.ts`, `src/style.css`: white room and minimal interface.
- `server.mjs`: `/api/invent`, `/api/direct`, source context and Responses API.

`npm run build` checks the app's TypeScript and builds the client. The optional existing `npm test` suite contains earlier engine and fixture regressions; it is not invoked for a player's generation. Saved API results are under ignored `runtime/inventions/` and `runtime/rooms/`. The GitHub repository contains the source and test fixtures; no hosted game is deployed. Historical playtest links to ignored `runtime/` files refer to local artifacts and are not included in a clone.

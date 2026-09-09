# Bad idea

A first-person invention game in a white, minimal room. Invent a way out; Astra responds by writing the next room to counter what you used. Rooms can change geometry, enemies, physics, mechanics, rules and the win condition. Both inventions and rooms contain actual executable JavaScript, not a selection from a fixed action list.

## Run

For hosted deployment, see [DEPLOYMENT.md](DEPLOYMENT.md). The repository includes a production Docker image and DigitalOcean App Platform configuration. Production serves the built game and its generation API together; it requires `APP_ORIGIN` and a shared `GAME_PASSWORD` unless public access is explicitly enabled.

Requires Node.js 22+ and an OpenAI API key with access to the configured model. Clone this repository, then:

```sh
npm ci
# Supply OPENAI_API_KEY through your environment or secret manager.
npm run dev
```

On Touko's machine, the existing vault launcher is `hsec exec --only OPENAI_API_KEY -- npm run dev`. Teammates do not need hsec; the server reads `OPENAI_API_KEY` from the environment. It does not automatically load `.env` files. `ESCAPE_MODEL`, `ESCAPE_REASONING_EFFORT`, `ESCAPE_REPAIR_REASONING_EFFORT`, `ESCAPE_SERVICE_TIER`, and `PORT` are optional environment overrides.

Open http://localhost:4320. The local server holds the API key; the browser and generated code never receive it.

On Mac, double-click `Play Bad Idea.command` in this folder. It installs dependencies if needed, starts the local server, and opens the game in your browser. Keep its Terminal window open; Ctrl-C stops the server. Opening the launcher again reuses a running game. The launcher uses an existing `OPENAI_API_KEY` environment variable or the same named entry in an unlocked `hsec` vault, without creating or saving a key. If neither is available, the starter inventions and three original rooms remain playable; generating inventions and new adaptive rooms requires a key. For a quick first round, press Enter, T, F, then hold W to climb the sample ladder and escape.

WASD move, mouse looks, Space jumps, Shift sprints, E opens a small floating prompt, F uses the invention, R retries, I opens saved inventions (↑/↓ or W/S selects, Enter or 1–9 equips), H toggles detailed help, Esc pauses. Enter submits the floating prompt; Shift+Enter adds a line; Esc closes it and restores keyboard focus to the canvas. The cursor stays hidden during play, including the prompt and inventory. Every gameplay action uses the keyboard; the mouse only looks. Enter continues from a completed round, I opens inventory and R retries. Escape also closes inventory when the browser consumes the key to release pointer capture. Pointer capture stays active through the prompt and inventory, and is requested again on returning to play. When native capture is unavailable, moving to a horizontal viewport edge continues turning, so the camera has no rotation boundary. The first adaptive round has one low wall and no guard. A starter ladder can be selected explicitly in the workshop; later rounds ask you to invent. The original three static rooms remain selectable from the title screen.

Opening the game shows a clean first room. Enter starts a new run with empty hands, an empty inventory and no background generation. New adaptive run also clears saved inventory. Use the Continue button or C on the title screen to restore saved progress explicitly; Continue and Retry preserve the run's inventory, available through I.

## Voice inventions

Press **V** while playing to open the invention box and start recording. Allow microphone access the first time, say what you want to build, and press **V** again to finish (recordings stop automatically after 60 seconds). Review the transcript, then press **Enter** to build through the normal invention flow. **Esc** cancels a recording or pending transcription. You can also use the **Speak idea** button in the workshop; while typing, V remains a normal letter. Speaking again inserts words at the caret or replaces selected text. Existing round rules apply to spoken descriptions too.

Voice uses the browser's microphone recorder on localhost or HTTPS and the existing server API key. Audio is sent to OpenAI only when you finish recording, transcribed with `gpt-4o-mini-transcribe`, and never written to the game's storage. `ESCAPE_TRANSCRIBE_MODEL` optionally changes the transcription model. Recording ends immediately when you leave the workshop, pause, change rooms, or hide the tab. If the microphone is unavailable or permission is denied, typing remains available. No audio plays back and no invention is submitted until you choose Build or press Enter.

## The adaptive loop

Round 4 always introduces the no-E description rule. Round 5 replaces it with a word-collection round. From round 6 onward, Astra chooses when to use letter bans, word bans, pickups, other restrictions, or unrestricted invention. These two introductions are the only fixed rule events. Language rules apply to the description you write or dictate, not the generated name or code. The workshop flags violations before building, and the server checks the same rules. In word rounds, walk into blue word tags to unlock reusable vocabulary; the workshop shows available and missing words. Pickups survive Retry and Continue, then reset for the next round. Inventory checks use each invention’s saved player description; choose **Describe again** to revise a blocked or older invention.

Astra can also choose a fresh-start round from round 6 onward, aiming for roughly one inventory reset in five rounds without a fixed schedule. The round result announces it before entry. Entering clears saved inventions, the equipped invention, drafts, and pending builds; retries, reloads, and repairs preserve anything made after that reset.

The first invention prompt starts invention and counter-room generation together. Later rounds start the following room immediately on entry, even if the current rule requires a new invention. Once a next room is building or ready, inventory switches, new invention prompts and retries keep it instead of cancelling and regenerating it. A later prompt starts a counter only if none is already queued. The next room does not wait for invention completion, equip or use. Each round commits one upcoming challenge. The current round continues. Submitting an invention closes the prompt and returns movement focus immediately; a small status button reports elapsed time and the number of outlined parts. A build-location marker appears immediately, then a teal outline grows from the actual preview parts streamed by Astra. Free-standing objects are outlined at their declared spawn; wearable tools follow the player. The finished invention replaces its outline and equips automatically without pausing or resetting the room. Cancelling, failing, or changing rooms removes the unfinished outline. Previous inventions are kept in the I inventory. The current invention and room keep running throughout. On escape, the result screen reveals the new counter and any invention rule, then lets you enter the next round. Failure offers a single Retry action; all saved inventions remain available through I. Inventions marked `autoDeploy` activate on a fresh equip. Room entry and retry preserve the equipped item but defer its executable setup until F, so even an invention that teleports during setup cannot move the spawn. Each round starts at the same position facing the room. Your invention carries over unless the new rule explicitly makes it illegal; the prompt can adapt the previous idea to that rule. Retrying preserves the current room and invention. Run state and drafts are saved locally.

Each new room also records its dominant physical interaction, a short mechanic summary, and execution pressure. The next director request uses the last six distinct rooms (including the current one) to discourage repeating the same player task under a new visual theme. After two consecutive high-pressure rooms, it asks for a low-pressure invention challenge. These are generation guidelines, not measured player difficulty or a guarantee of model compliance; they add no model call. Old saves remain readable without invented metadata. Repairs do not add a history entry, and rule-only rounds inherit the reused layout’s physical profile.

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

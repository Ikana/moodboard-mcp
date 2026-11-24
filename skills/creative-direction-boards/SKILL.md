---
name: creative-direction-boards
description: Turn a person's keyword columns into moodboards, then design one creative direction per board with the Lenny's "AI designer" method (seed strings, design-critic subagent loop, deliver pass), and lay the directions out as one-screen mockups with a 2D or walkable 3D centre piece framed by a collage of references. Use for "moodboards from my keywords", "show me directions", "the Lenny approach", "visualise the creative process", or "mood board mockups to choose a direction".
---

# Creative direction boards

The moodboard MCP and the Lenny's design method are one pipeline. The boards are the taste baseline the method designs against, and the method turns each board into a direction. Run all three stages, and show the person the result of each one:

1. **Boards**: one moodboard per keyword column, built with the `moodboard` MCP.
2. **Directions**: the Lenny's method (Discover → Define → Deliver) applied to each board: a seeded centre piece, a critic loop that uses the board as its baseline, and a deliver pass.
3. **Mockups**: every direction on one screen, with the centre piece in the middle and the board's images packed round the edges, all three side by side.

Show the person the result of each stage before going on. They usually redirect after the first or second.

## 1. Boards

Input: columns of keywords with priorities (1 = most important). Make one board per column.

For each board:

1. Run 4–6 `find_images` searches with specific queries drawn *from* the keywords, never the keywords themselves. Name the artists, techniques and phenomena ("Gabriel Dawe plexus", "Piranesi carceri etching", "earth nullschool wind map"). Use about 8 per source.
2. Run `find_arena_boards` for one or two keywords, then `browse_arena_board` the best channel.
3. Look at every contact sheet and `save_found` only images that hit a keyword strongly: 12–15 per board, choosing variety over repeats. Weight the count toward the lower priority numbers.
4. `view_image` and `tag_image` every saved image, tagging which keywords it serves as `kw:<keyword>`.
5. `arrange_board` with one section per keyword in priority order, named like `"3 · Inspiring"`, then `render_board`.

Report the HTML paths, one paragraph per board on the direction it suggests, and the images that serve keywords from every column. Those are candidates for the final direction.

Known MCP quirks, and the workaround for each:

- The `arena` source inside `find_images` returns 403. Use `find_arena_boards` and `browse_arena_board` instead.
- `openverse` returns nothing when combined with other sources. Call it alone with `sources: ["openverse"]`.
- Are.na captions arrive as filenames. Write real captions when you tag.

## 2. Directions (the Lenny's method)

Read [references/design-loop.md](references/design-loop.md) before building anything, and follow every stage of it for each board:

- Roll a fresh seed per direction and read a geometry out of it.
- Build the centre piece and run the critic subagent loop for two rounds.
- Do a deliver pass: cut what adds nothing, remove AI tells and shorten the copy.

The centre piece shows the process as one figure with labelled stations, grouped into the phases Discover, Define and Deliver (use the person's own process if they gave one). Each station links to the board image that inspired it.

## 3. Mockups

The mockups and the walkable rooms are a finished template in [template/](template/). Don't rebuild any of the mechanics: the rotunda, the oval rooms, the pictures on the walls, the holographic visor, walking, teleport and the embed camera all come from one data file. For each direction you write data and one centre piece, nothing else.

**Getting the template.** If this skill's folder isn't on disk (a cloud session, or a skill installed without its files), fetch it: `git clone --depth 1 https://github.com/Ikana/moodboard-mcp` and work from `moodboard-mcp/skills/creative-direction-boards/`. Everything runs on Node 22.18 or later with no install step. Run `npm install` in the working folder only to type-check.

1. **Make a working folder with the images.** With the moodboard MCP: `node scripts/export-boards.ts --home ~/Moodboards --out <dir> --board "<board name>=a" --board "...=b" --board "...=c"`. It copies the template to `<dir>`, copies each board's images into `<dir>/img/` and writes `<dir>/boards.json`. Re-running it refreshes the images and keeps your edits. Without the MCP, copy `template/` to `<dir>`, put the images in `<dir>/img/`, and write `boards.json` by hand from `boards.example.json`.
2. **Fill in `boards.json`.** `process` is the person's steps in order, each with a `name` and a `phase` (`intent`, `discover`, `define` or `deliver`). Use the steps they chose; the export defaults to the nine spiral-worksheet steps. Then, per board: `column`, `headline`, `caption`, `seed`, `reading` (one sentence on what the seed was read as), `figure`, `keywords` (`n` = priority, `word`), `theme`, `stations` (step number → the image that inspired it), and `flat` for the 2D draft. Leave `images` as the export wrote them. In `theme`, `mode` is `dark` or `light` and fills in the other colours; set `c1`/`c2`/`c3` (discover, define, deliver), `wall`, `floor`, `sky`, `lamp` and `holo` (the visor tint) to match the board. [template/boards.example.json](template/boards.example.json) has the three finished directions from the first run. A bad file shows a clear error on the page naming the field.
3. **Write the centre piece.** Add one entry to `CENTRES` in `rooms/centre.ts` (3D) and the same name to `FIGURES` in `flat/figures.ts` (2D), then set the board's `figure` to that name. The header comment in each file is the contract: what you draw into, the room's coordinates, and how to colour and label each step. Copy `plinth` to start. `exploded`, `aperture` and `eight` are the finished examples; write a new one for each new seed reading rather than reusing them. These two files are the only code you edit.
4. **Check and serve.** `npx tsc -p <dir>` must pass. Then `node <dir>/serve.ts` serves on port 5191 and compiles the TypeScript as it goes:
   - `/collage.html`: every mockup on one screen. `/collage.html?k=a` shows one full screen.
   - `/flat/?k=a`: the 2D draft, quicker to iterate in the critic loop before moving to 3D.
   - `/rooms/`: a walkable Orangerie-style rotunda with a doorway into each board's oval room. Keys: WASD walk, Space teleports to where you point, H toggles the visor, 0 to 9 jump between rooms.
   - `/rooms/?embed=a`: the framed camera move used inside a mockup (from your centre piece's `shot`). `?shot=a` starts in room `a`, and `?hud=0` turns the visor off.
5. **Look at it.** Screenshot each page, look at it, fix it, then open it in the person's browser. In a cloud session, `node <dir>/build.ts` writes a static `dist/` with plain JavaScript, which any static server or Playwright can open.

Write all code in TypeScript, never Python or plain JavaScript, and follow [references/typescript-style.md](references/typescript-style.md).

Publish no images: the boards are other people's work, fine for a private moodboard. Each image's notes hold its source and licence.

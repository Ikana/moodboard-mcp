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

Start from [template/](template/). It is three directions keyed `a`, `b` and `c`:

1. Copy the boards in. `python3 scripts/export_boards.py --home ~/Moodboards --out <dir> --board "<board name>=a" --board "...=b" --board "...=c"` creates `<dir>` from the template, copies the images, and writes `sizes.js` and `rooms/boards.js`.
2. Fill in `rooms/boards.js` for each key: `headline`, `caption`, `seed`, `theme` (palette, with `c1`/`c2`/`c3` for the three phases), `figure`, and `stations` (station number → image id). See `rooms/boards.example.js`, which has the three finished directions from the first run.
3. Centre pieces live in `rooms/main.js` under `CENTRE`. The ones there are `exploded` (a stack of parts on one axis), `aperture` (nested frames you walk through toward one opening) and `eight` (a figure-eight tube). Write a new function for each new seed reading rather than reusing these.
4. Serve with `python3 <dir>/rooms/serve.py`, which serves on port 5191. These are the pages:
   - `/collage.html`: all three mockups on one screen.
   - `/collage.html?k=a`: one mockup full screen.
   - `/rooms/`: a walkable Orangerie-style rotunda, with doorways into three oval auditoria.
   - `/rooms/?embed=a`: the framed camera move used inside a mockup.
5. Screenshot each page, look at it, fix it, then open it in the person's browser.

[template/flat/](template/flat/) holds the 2D version of a direction page, which is quicker to iterate in the critic loop before moving to 3D.

Publish no images: the boards are other people's work, fine for a private moodboard. Each image's notes hold its source and licence.

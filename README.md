# Moodboard MCP (prototype)

A self-hosted, AI-driven Pinterest that you use by talking to Claude. Claude is the
"AI" part: it looks at each image and writes tags, a caption and a mood. The server
stores images locally, adds cheap visual features (palette, color histogram, layout),
and renders boards as one self-contained HTML page.

## Install

```bash
pip install -r requirements.txt
# Claude Code
claude mcp add moodboard -e MOODBOARD_HOME=~/Moodboards -e BRAVE_API_KEY=... -- python /path/to/moodboard-mcp/server.py
```

Claude Desktop (`claude_desktop_config.json`):

```json
{ "mcpServers": { "moodboard": {
    "command": "python", "args": ["/path/to/moodboard-mcp/server.py"],
    "env": { "MOODBOARD_HOME": "~/Moodboards", "BRAVE_API_KEY": "..." } } } }
```

Data lives in `$MOODBOARD_HOME` (default `~/.moodboard`): `library.db` (SQLite),
`images/`, `boards/*.html`.

## Finding new images

`find_images` searches several sources at once and hands Claude a labelled contact sheet
(f1, f2, ...). Claude looks at it and `save_found`s only what fits; credit, licence and
the source page go into the image's notes.

| Source | Needs | Good for | Cost |
|---|---|---|---|
| Brave | `BRAVE_API_KEY` | The whole web, up to 200 images per call | $5 per 1,000 calls, $5 free credit a month |
| Are.na | nothing (`ARENA_TOKEN` optional) | Boards people already curated; `find_arena_boards`, `browse_arena_board` | free |
| Openverse | nothing | Creative Commons images, licence included | free |
| Unsplash | `UNSPLASH_ACCESS_KEY` | Polished photography | free key |
| Pexels | `PEXELS_API_KEY` | Polished photography | free key |

Put keys in the `env` block of the MCP config. `image_sources` shows what is switched on.
Web results from Brave are other people's images: fine for a private moodboard, check the
source page before using one in published work.

## Things to say to Claude

- "Import everything in ~/Pictures/refs/fog into a board called Fog, look at each one and tag it."
- "Save this: https://... onto Fog under 'Light'."
- "Find everything warm and paper-like" / "anything close to #c8553d".
- "Cluster the Fog board into 4 groups, name them, and arrange the board that way."
- "Render the board."
- "Find me images of brutalist stairwells in fog, keep the best six on the Fog board."
- "Find Are.na boards about Japanese packaging and show me the best one."

## Tools

| Tool | What it does |
|---|---|
| `add_image` | Save from URL or path, optionally onto a board/section |
| `import_folder` | Bulk import with a glob |
| `view_image` | Returns the picture so Claude can see it |
| `tag_image` | Tags, caption, mood, notes |
| `list_images` | All images, or only untagged ones |
| `search` | Words (tags/caption/mood/notes) and/or a hex color |
| `similar` | Lookalikes by palette, light and composition |
| `cluster` | k-means visual groups, with shared tags and palette |
| `create_board` / `list_boards` / `get_board` | Boards |
| `add_to_board` / `remove_from_board` | Pin and unpin |
| `arrange_board` | `{"Section": [ids in order]}` |
| `find_images` | Search Brave, Are.na, Openverse, Unsplash, Pexels; returns a contact sheet |
| `find_arena_boards` / `browse_arena_board` | Explore other people's curated Are.na channels |
| `save_found` | Download picked results, with credit and licence |
| `image_sources` | Which sources are on |
| `render_board` | Masonry HTML: sections, board palette, tag filters, zoom, dark mode |

## Architecture

```
 sources                       library (this server)                  outputs
 ───────                       ─────────────────────                  ───────
 local folders ─┐              images/  (content-addressed files)     boards/*.html
 URLs ──────────┼─ add_image ─▶ library.db: tags, caption, mood,  ──▶ (self-contained,
 other MCPs ────┘              palette, visual features, boards       shareable)
 (Unsplash, Are.na,                   ▲          │
  image generators)          tag_image│          │view_image
                                      └─ Claude ─┘  (vision = the tagger)
```

`library.py` and `discover.py` have no MCP code and can be scripted directly; `server.py` is a thin wrapper.

## Known limits / next steps

- Visual similarity is color/light/layout only. Subject-level search ("foggy harbours")
  relies on Claude's tags. Next: optional CLIP/SigLIP embeddings for text-to-image search.
- Source search was tested against recorded response shapes, not live APIs (the build
  sandbox has no outbound access to them). First live run may need a small fix.
- No "more like this" from the web: Brave has no reverse image search. Google Lens via
  SerpApi (about $25/month) would add it.
- No image generation tool yet (fal / Replicate / a RunPod endpoint would slot in as a source).
- Layout is a sectioned masonry grid, not a free canvas.

## Known issues

- The `arena` source inside `find_images` currently returns HTTP 403. `find_arena_boards` and `browse_arena_board` work, so use those for Are.na.
- `openverse` can come back empty when it runs alongside other sources. Calling `find_images` with `sources: ["openverse"]` works.

## Skill: creative direction boards

[`skills/creative-direction-boards`](skills/creative-direction-boards/SKILL.md) is an agent skill that uses this server end to end:

- It turns keyword columns into moodboards.
- It builds a seeded centre piece for each direction and refines it with a design-critic subagent loop.
- It lays every direction out on one screen as a mood-board mockup: the centre piece in the middle and a collage of references round the edges. A walkable 3D version is included, an Orangerie-style rotunda that opens onto oval auditoria.

To install it for Claude Code, copy or symlink the folder into `~/.claude/skills/`:

```bash
ln -s "$PWD/skills/creative-direction-boards" ~/.claude/skills/creative-direction-boards
```

The template ships without images. `scripts/export_boards.py` copies a board's images out of your local library.

No API keys live in this repo. They come from the MCP config's `env` block.

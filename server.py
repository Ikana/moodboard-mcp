"""Moodboard MCP server: a self-hosted, AI-driven Pinterest you drive by talking to Claude.

Run:  python server.py            (stdio, for Claude Desktop / Claude Code)
Data: $MOODBOARD_HOME (default ~/.moodboard): library.db, images/, boards/*.html
"""

from __future__ import annotations

import functools
import json
import urllib.error

try:  # mcp >= 2
    from mcp.server.mcpserver import Image, MCPServer
    from mcp.server.mcpserver.exceptions import ToolError
except ImportError:  # mcp 1.x
    from mcp.server.fastmcp import FastMCP as MCPServer, Image  # type: ignore
    from mcp.server.fastmcp.exceptions import ToolError  # type: ignore

import discover
import library as lib

INSTRUCTIONS = """You are curating moodboards in a local image library.
Workflow: add images (add_image / import_folder), then for anything untagged call
view_image and write tags, a one-line caption and a mood with tag_image. Tags should
cover subject, material, light, color, era/style and feeling, lowercase.
Group images into boards (add_to_board), use cluster for visual groupings and your own
judgement for thematic ones, set sections with arrange_board, then render_board and give
the user the HTML path. search finds by words and/or a hex color; similar finds lookalikes.
To discover new images, use find_images (web + Are.na + Creative Commons + stock), look at the
contact sheet it returns, and save_found only the ones that fit the brief. find_arena_boards and
browse_arena_board explore boards other people have already curated."""

mcp = MCPServer("moodboard", instructions=INSTRUCTIONS)


def tool(fn):
    """Register a tool; expected failures (bad id, missing file, dead URL) reach Claude as readable errors."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except (ValueError, OSError, urllib.error.URLError) as exc:
            raise ToolError(str(exc)) from exc
    return mcp.tool()(wrapper)


def _brief(img: dict) -> dict:
    keys = ("id", "caption", "mood", "tags", "palette", "source", "width", "height",
            "score", "similarity", "section", "board_note")
    out = {k: img[k] for k in keys if k in img and img[k] not in (None, "", [])}
    if "palette" in out:
        out["palette"] = [p["hex"] for p in out["palette"]]
    if "section" in out:
        out["section"] = lib._section_label(out["section"])
    return out


@tool
def add_image(source: str, tags: list[str] | None = None, caption: str = "", mood: str = "",
              notes: str = "", board: str | None = None, section: str = "") -> dict:
    """Save an image from a URL or local file path into the library (optionally straight onto a board).
    Returns its id and palette. Re-adding the same image is a no-op that returns the existing id."""
    return _brief(lib.add_image(source, tags, caption, mood, notes, board, section))


@tool
def import_folder(folder: str, pattern: str = "*", board: str | None = None) -> dict:
    """Bulk-import every image in a folder matching a glob pattern (e.g. 'spiral-*.jpg')."""
    imgs = lib.import_folder(folder, pattern, board)
    return {"imported": len(imgs), "ids": [i["id"] for i in imgs],
            "untagged": [i["id"] for i in imgs if not i["tags"]]}


@tool
def view_image(image_id: str, max_side: int = 768) -> Image:
    """Look at an image (returns the picture itself) so you can describe and tag it."""
    return Image(data=lib.thumbnail_bytes(image_id, max_side), format="jpeg")


@tool
def tag_image(image_id: str, tags: list[str] | None = None, caption: str | None = None,
              mood: str | None = None, notes: str | None = None, replace_tags: bool = False) -> dict:
    """Write what you see: tags (added to existing unless replace_tags), a caption, a mood, notes."""
    return _brief(lib.tag_image(image_id, tags, caption, mood, notes, replace_tags))


@tool
def list_images(untagged_only: bool = False, limit: int = 100) -> list[dict]:
    """List images in the library. Use untagged_only to find ones still needing tags."""
    return [_brief(i) for i in lib.list_images(untagged_only, limit)]


@tool
def search(query: str = "", color: str | None = None, limit: int = 20) -> list[dict]:
    """Find images by words (matched against tags, caption, mood, notes) and/or a hex color like '#c8553d'."""
    return [_brief(i) for i in lib.search(query, color, limit)]


@tool
def similar(image_id: str, limit: int = 8) -> list[dict]:
    """Images that look alike (palette, light and composition)."""
    return [_brief(i) for i in lib.similar(image_id, limit)]


@tool
def cluster(board: str | None = None, image_ids: list[str] | None = None, k: int = 3) -> list[dict]:
    """Group images into k visual clusters (by palette/light/layout). Name the groups yourself
    from their tags, then pass them to arrange_board as sections."""
    groups = lib.cluster(image_ids, board, k)
    return [{"group": n + 1, "ids": [i["id"] for i in g],
             "common_tags": _common_tags(g), "palette": lib._swatch_strip([i["palette"] for i in g], 5)}
            for n, g in enumerate(groups)]


def _common_tags(group: list[dict]) -> list[str]:
    counts: dict[str, int] = {}
    for i in group:
        for t in i["tags"]:
            counts[t] = counts.get(t, 0) + 1
    return [t for t, c in sorted(counts.items(), key=lambda kv: -kv[1]) if c > 1][:8]


@tool
def create_board(name: str, description: str = "") -> dict:
    """Create a board (or update its description)."""
    b = lib.create_board(name, description)
    return {"name": b["name"], "description": b["description"], "items": len(b["items"])}


@tool
def list_boards() -> list[dict]:
    """All boards with item counts."""
    return lib.list_boards()


@tool
def get_board(name: str) -> dict:
    """A board's description and items with their sections."""
    b = lib.get_board(name)
    return {"name": b["name"], "description": b["description"], "items": [_brief(i) for i in b["items"]]}


@tool
def add_to_board(board: str, image_ids: list[str], section: str = "", note: str = "") -> dict:
    """Pin images to a board (creates the board if needed), optionally into a section with a note."""
    b = lib.add_to_board(board, image_ids, section, note)
    return {"name": b["name"], "items": len(b["items"])}


@tool
def remove_from_board(board: str, image_ids: list[str]) -> dict:
    """Unpin images from a board (they stay in the library)."""
    b = lib.remove_from_board(board, image_ids)
    return {"name": b["name"], "items": len(b["items"])}


@tool
def arrange_board(board: str, sections: dict[str, list[str]]) -> dict:
    """Lay out a board: {"Section name": [image ids in order], ...}. Section order follows the dict."""
    b = lib.arrange_board(board, sections)
    return {"name": b["name"], "sections": sorted({lib._section_label(i["section"]) for i in b["items"]})}


@tool
def render_board(board: str, title: str | None = None, export_to: str | None = None) -> dict:
    """Render the board as one self-contained HTML page (masonry grid, sections, palette, tag filters).
    Optionally copy it to export_to (a folder or file path)."""
    path = lib.export_board(board, export_to) if export_to else lib.render_board(board, title)
    return {"html": path}


# ---------------------------------------------------------------- discovery

def _found(cands: list[dict], errors: dict | None = None) -> list:
    rows = [{"ref": c["ref"], "source": c["source"], "title": c["title"][:80],
             **({"credit": c["credit"]} if c["credit"] else {}),
             **({"license": c["license"]} if c["license"] else {})} for c in cands]
    head = {"results": rows}
    if errors:
        head["skipped_sources"] = errors
    head["next"] = ("Look at the contact sheet, then save_found with the refs worth keeping." if cands
                    else "Nothing came back. Try other words, or check skipped_sources.")
    out: list = [json.dumps(head, ensure_ascii=False)]
    if cands:
        out.append(Image(data=discover.contact_sheet(cands), format="jpeg"))
    return out


@tool
def find_images(query: str, sources: list[str] | None = None, per_source: int = 8) -> list:
    """Search the web and image communities for a query. Returns a labelled contact sheet you can
    look at plus refs (f1, f2...) to pass to save_found. sources: any of brave, arena, openverse,
    unsplash, pexels (default: every one that is configured). Keep per_source small (6-12):
    the sheet is one image."""
    cands, errors = discover.find_images(query, sources, per_source)
    return _found(cands, errors)


@tool
def find_arena_boards(query: str, limit: int = 10) -> list[dict]:
    """Find Are.na channels (boards other people curated) about a topic. Open one with browse_arena_board."""
    return discover.arena_channels(query, limit)


@tool
def browse_arena_board(slug_or_url: str, limit: int = 30) -> list:
    """Show the images in an Are.na channel as a contact sheet with refs for save_found."""
    return _found(discover.browse_arena_channel(slug_or_url, limit))


@tool
def save_found(refs: list[str], board: str | None = None, section: str = "",
               tags: list[str] | None = None) -> list[dict]:
    """Download chosen search results into the library (credit, licence and source page go in notes),
    optionally straight onto a board. Then view_image and tag_image them as usual."""
    return [_brief(s) if "id" in s else s for s in discover.save_found(refs, board, section, tags)]


@tool
def image_sources() -> dict:
    """Which search sources are switched on, and which keys would switch on the rest."""
    on = discover.available_sources()
    return {"on": on, "off": {s: f"set {k}" for s, k in discover.NEEDS.items() if s not in on}}


if __name__ == "__main__":
    mcp.run()

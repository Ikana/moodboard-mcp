"""Moodboard library: storage, visual features, search, clustering and board rendering.

No MCP code here, so it can be tested and scripted on its own. The MCP server
(server.py) is a thin wrapper around this module.

Design idea: Claude is the "AI" part. It looks at each image (view_image) and
writes tags, a caption and a mood. This module stores that, adds cheap visual
features (palette, color histogram, layout hash) for similarity and clustering,
and renders boards as a single self-contained HTML file.
"""

from __future__ import annotations

import base64
import colorsys
import hashlib
import html
import io
import json
import os
import re
import shutil
import sqlite3
import time
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image as PILImage

HOME = Path(os.environ.get("MOODBOARD_HOME", Path.home() / ".moodboard")).expanduser()
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}

SCHEMA = """
create table if not exists images (
  id text primary key,
  file text not null,
  source text,
  width int, height int,
  caption text default '',
  mood text default '',
  notes text default '',
  tags text default '[]',
  palette text default '[]',
  features blob,
  added real
);
create table if not exists boards (
  name text primary key,
  description text default '',
  created real
);
create table if not exists board_items (
  board text, image_id text, section text default '', position int default 0,
  note text default '',
  primary key (board, image_id)
);
"""


# ---------------------------------------------------------------- storage

def db() -> sqlite3.Connection:
    HOME.mkdir(parents=True, exist_ok=True)
    (HOME / "images").mkdir(exist_ok=True)
    (HOME / "boards").mkdir(exist_ok=True)
    con = sqlite3.connect(HOME / "library.db")
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def _row(r: sqlite3.Row) -> dict:
    d = dict(r)
    d.pop("features", None)
    d["tags"] = json.loads(d["tags"] or "[]")
    d["palette"] = json.loads(d["palette"] or "[]")
    d["path"] = str(HOME / "images" / d["file"])
    return d


def get_image(image_id: str) -> dict:
    with db() as con:
        r = con.execute("select * from images where id=?", (image_id,)).fetchone()
    if not r:
        raise ValueError(f"No image with id {image_id}")
    return _row(r)


# ---------------------------------------------------------------- visual features

def _palette(img: PILImage.Image, n: int = 5) -> list[dict]:
    small = img.convert("RGB").resize((96, 96))
    q = small.quantize(colors=n, method=PILImage.Quantize.MEDIANCUT)
    pal = q.getpalette()[: n * 3]
    counts = sorted(q.getcolors(), reverse=True)
    total = sum(c for c, _ in counts)
    out = []
    for c, idx in counts:
        r, g, b = pal[idx * 3: idx * 3 + 3]
        out.append({"hex": f"#{r:02x}{g:02x}{b:02x}", "share": round(c / total, 3)})
    return out


def _features(img: PILImage.Image) -> np.ndarray:
    """Color histogram in HSV (8 hues x 3 sat x 3 val) + 8x8 layout thumbnail.

    Cheap stand-in for a CLIP embedding: good at "same palette / same light",
    blind to subject matter. Subject matter comes from Claude's tags.
    """
    hsv = np.asarray(img.convert("RGB").resize((64, 64)).convert("HSV"), dtype=np.float32) / 255
    h = np.minimum((hsv[..., 0] * 8).astype(int), 7)
    s = np.minimum((hsv[..., 1] * 3).astype(int), 2)
    v = np.minimum((hsv[..., 2] * 3).astype(int), 2)
    # low-saturation pixels have meaningless hue: put them in hue bin 0
    h = np.where(s == 0, 0, h)
    hist = np.bincount((h * 9 + s * 3 + v).ravel(), minlength=72).astype(np.float32)
    hist /= np.linalg.norm(hist) + 1e-9
    layout = np.asarray(img.convert("L").resize((8, 8)), dtype=np.float32).ravel()
    layout = (layout - layout.mean()) / (layout.std() + 1e-6)
    layout /= np.linalg.norm(layout) + 1e-9
    return np.concatenate([hist, 0.5 * layout]).astype(np.float32)


# ---------------------------------------------------------------- adding images

def _fetch(source: str) -> tuple[bytes, str]:
    if re.match(r"https?://", source):
        req = urllib.request.Request(source, headers={"User-Agent": "moodboard-mcp/0.1"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read(), source
    p = Path(source).expanduser()
    return p.read_bytes(), str(p.resolve())


def add_image(source: str, tags: list[str] | None = None, caption: str = "",
              mood: str = "", notes: str = "", board: str | None = None,
              section: str = "") -> dict:
    data, origin = _fetch(source)
    image_id = hashlib.sha1(data).hexdigest()[:10]
    img = PILImage.open(io.BytesIO(data))
    img.load()
    con = db()
    existing = con.execute("select id from images where id=?", (image_id,)).fetchone()
    if not existing:
        fmt = (img.format or "PNG").lower().replace("jpeg", "jpg")
        fname = f"{image_id}.{fmt}"
        (HOME / "images" / fname).write_bytes(data)
        con.execute(
            "insert into images (id,file,source,width,height,caption,mood,notes,tags,palette,features,added)"
            " values (?,?,?,?,?,?,?,?,?,?,?,?)",
            (image_id, fname, origin, img.width, img.height, caption, mood, notes,
             json.dumps(_clean_tags(tags or [])), json.dumps(_palette(img)),
             _features(img).tobytes(), time.time()))
    elif tags or caption or mood or notes:
        con.commit()
        tag_image(image_id, tags=tags, caption=caption or None, mood=mood or None,
                  notes=notes or None)
    con.commit()
    con.close()
    if board:
        add_to_board(board, [image_id], section=section)
    out = get_image(image_id)
    out["already_in_library"] = bool(existing)
    return out


def import_folder(folder: str, pattern: str = "*", board: str | None = None) -> list[dict]:
    paths = sorted(p for p in Path(folder).expanduser().glob(pattern)
                   if p.suffix.lower() in IMAGE_EXTS and p.is_file())
    return [add_image(str(p), board=board) for p in paths]


# ---------------------------------------------------------------- tagging

def _clean_tags(tags: list[str]) -> list[str]:
    seen = []
    for t in tags:
        t = t.strip().lower()
        if t and t not in seen:
            seen.append(t)
    return seen


def tag_image(image_id: str, tags: list[str] | None = None, caption: str | None = None,
              mood: str | None = None, notes: str | None = None, replace_tags: bool = False) -> dict:
    cur = get_image(image_id)
    new_tags = _clean_tags((tags or []) if replace_tags else cur["tags"] + (tags or []))
    with db() as con:
        con.execute(
            "update images set tags=?, caption=?, mood=?, notes=? where id=?",
            (json.dumps(new_tags),
             cur["caption"] if caption is None else caption,
             cur["mood"] if mood is None else mood,
             cur["notes"] if notes is None else notes,
             image_id))
    return get_image(image_id)


def thumbnail_bytes(image_id: str, max_side: int = 768) -> bytes:
    img = PILImage.open(get_image(image_id)["path"]).convert("RGB")
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=82)
    return buf.getvalue()


# ---------------------------------------------------------------- finding things

def _hex_to_rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def _color_distance(palette: list[dict], hex_color: str) -> float:
    target = _hex_to_rgb(hex_color)
    best = 1e9
    for p in palette:
        d = np.linalg.norm(_hex_to_rgb(p["hex"]) - target) / (0.5 + p["share"])
        best = min(best, d)
    return float(best)


def list_images(untagged_only: bool = False, limit: int = 200) -> list[dict]:
    with db() as con:
        rows = con.execute("select * from images order by added").fetchall()
    out = [_row(r) for r in rows]
    if untagged_only:
        out = [i for i in out if not i["tags"] and not i["caption"]]
    return out[:limit]


def search(query: str = "", color: str | None = None, limit: int = 20) -> list[dict]:
    words = [w for w in re.findall(r"[\w-]+", query.lower()) if len(w) > 1]
    results = []
    for img in list_images(limit=100000):
        hay_tags = " ".join(img["tags"])
        hay = f"{hay_tags} {img['caption']} {img['mood']} {img['notes']} {Path(img['source'] or '').stem}".lower()
        score = 0.0
        for w in words:
            if w in img["tags"]:
                score += 3
            elif w in hay_tags:
                score += 2
            elif w in hay:
                score += 1
        if words and score == 0:
            continue
        if color:
            score += 3 - min(3.0, _color_distance(img["palette"], color) / 60)
        img["score"] = round(score, 2)
        results.append(img)
    results.sort(key=lambda i: -i["score"])
    return results[:limit]


def _feature_matrix(ids: list[str]) -> np.ndarray:
    with db() as con:
        rows = {r["id"]: r["features"] for r in
                con.execute(f"select id, features from images where id in ({','.join('?' * len(ids))})", ids)}
    return np.stack([np.frombuffer(rows[i], dtype=np.float32) for i in ids])


def similar(image_id: str, limit: int = 8) -> list[dict]:
    ids = [i["id"] for i in list_images(limit=100000)]
    feats = _feature_matrix(ids)
    q = feats[ids.index(image_id)]
    sims = feats @ q / (np.linalg.norm(feats, axis=1) * np.linalg.norm(q) + 1e-9)
    order = [k for k in np.argsort(-sims) if ids[k] != image_id][:limit]
    out = []
    for k in order:
        d = get_image(ids[k])
        d["similarity"] = round(float(sims[k]), 3)
        out.append(d)
    return out


def cluster(image_ids: list[str] | None = None, board: str | None = None, k: int = 3,
            seed: int = 0) -> list[list[dict]]:
    """k-means on visual features. Groups by palette/light/layout, not subject."""
    if board:
        image_ids = [i["id"] for i in board_items(board)]
    if not image_ids:
        image_ids = [i["id"] for i in list_images(limit=100000)]
    X = _feature_matrix(image_ids)
    k = max(1, min(k, len(image_ids)))
    rng = np.random.default_rng(seed)
    # k-means++ init
    centers = [X[rng.integers(len(X))]]
    for _ in range(1, k):
        d2 = np.min([((X - c) ** 2).sum(1) for c in centers], axis=0)
        centers.append(X[rng.choice(len(X), p=d2 / d2.sum())] if d2.sum() > 0 else X[rng.integers(len(X))])
    C = np.stack(centers)
    for _ in range(50):
        labels = np.argmin(((X[:, None, :] - C[None]) ** 2).sum(-1), axis=1)
        newC = np.stack([X[labels == j].mean(0) if (labels == j).any() else C[j] for j in range(k)])
        if np.allclose(newC, C):
            break
        C = newC
    groups = [[get_image(image_ids[i]) for i in np.where(labels == j)[0]] for j in range(k)]
    return [g for g in groups if g]


# ---------------------------------------------------------------- boards

def create_board(name: str, description: str = "") -> dict:
    with db() as con:
        con.execute("insert or ignore into boards (name, description, created) values (?,?,?)",
                    (name, description, time.time()))
        if description:
            con.execute("update boards set description=? where name=?", (description, name))
    return get_board(name)


def get_board(name: str) -> dict:
    with db() as con:
        r = con.execute("select * from boards where name=?", (name,)).fetchone()
    if not r:
        raise ValueError(f"No board named {name!r}. Create it first.")
    d = dict(r)
    d["items"] = board_items(name)
    return d


def list_boards() -> list[dict]:
    with db() as con:
        rows = con.execute(
            "select b.name, b.description, count(i.image_id) n from boards b"
            " left join board_items i on i.board=b.name group by b.name order by b.created").fetchall()
    return [dict(r) for r in rows]


def board_items(name: str) -> list[dict]:
    with db() as con:
        rows = con.execute(
            "select i.*, bi.section, bi.position, bi.note as board_note from board_items bi"
            " join images i on i.id=bi.image_id where bi.board=? order by bi.section, bi.position",
            (name,)).fetchall()
    out = []
    for r in rows:
        d = _row(r)
        out.append(d)
    return out


def add_to_board(board: str, image_ids: list[str], section: str = "", note: str = "") -> dict:
    create_board(board)
    with db() as con:
        start = con.execute("select coalesce(max(position), -1) + 1 from board_items where board=?",
                            (board,)).fetchone()[0]
        for n, iid in enumerate(image_ids):
            get_image(iid)
            con.execute(
                "insert into board_items (board, image_id, section, position, note) values (?,?,?,?,?)"
                " on conflict(board, image_id) do update set section=excluded.section,"
                " note=case when excluded.note != '' then excluded.note else board_items.note end",
                (board, iid, section, start + n, note))
    return get_board(board)


def remove_from_board(board: str, image_ids: list[str]) -> dict:
    with db() as con:
        con.executemany("delete from board_items where board=? and image_id=?",
                        [(board, i) for i in image_ids])
    return get_board(board)


def arrange_board(board: str, sections: dict[str, list[str]]) -> dict:
    """Set sections and order in one go: {"Light": [id, id], "Structures": [id]}.

    Section order follows the dict order; images not mentioned keep their place
    in an "Unsorted" section at the end.
    """
    with db() as con:
        con.execute("update board_items set section='~Unsorted', position=position+100000 where board=?",
                    (board,))
        for s_idx, (section, ids) in enumerate(sections.items()):
            label = f"{s_idx:02d}|{section}"
            for p, iid in enumerate(ids):
                con.execute(
                    "insert into board_items (board, image_id, section, position) values (?,?,?,?)"
                    " on conflict(board, image_id) do update set section=excluded.section,"
                    " position=excluded.position", (board, iid, label, p))
    return get_board(board)


def _section_label(s: str) -> str:
    if s == "~Unsorted":
        return "Unsorted"
    return s.split("|", 1)[1] if re.match(r"^\d\d\|", s) else s


# ---------------------------------------------------------------- rendering

def _swatch_strip(palettes: list[list[dict]], n: int = 8) -> list[str]:
    """Board-level palette: most common colors across all items, merged when close."""
    pool: list[tuple[np.ndarray, float]] = []
    for pal in palettes:
        for p in pal:
            pool.append((_hex_to_rgb(p["hex"]), p["share"]))
    merged: list[list] = []
    for rgb, w in sorted(pool, key=lambda t: -t[1]):
        for m in merged:
            if np.linalg.norm(m[0] - rgb) < 40:
                m[0] = (m[0] * m[1] + rgb * w) / (m[1] + w)
                m[1] += w
                break
        else:
            merged.append([rgb, w])
    merged.sort(key=lambda m: -m[1])
    return ["#%02x%02x%02x" % tuple(int(x) for x in m[0]) for m in merged[:n]]


def render_board(board: str, title: str | None = None, embed: bool = True) -> str:
    b = get_board(board)
    items = b["items"]
    sections: dict[str, list[dict]] = {}
    for it in items:
        sections.setdefault(_section_label(it["section"] or ""), []).append(it)
    swatches = _swatch_strip([i["palette"] for i in items])
    all_tags: dict[str, int] = {}
    for it in items:
        for t in it["tags"]:
            all_tags[t] = all_tags.get(t, 0) + 1
    top_tags = sorted(all_tags, key=lambda t: -all_tags[t])[:16]

    def src(it: dict) -> str:
        if not embed:
            return Path(it["path"]).as_uri()
        return "data:image/jpeg;base64," + base64.b64encode(thumbnail_bytes(it["id"], 900)).decode()

    e = html.escape
    parts = []
    for sec, its in sections.items():
        if sec:
            parts.append(f'<h2>{e(sec)}</h2>')
        parts.append('<div class="grid">')
        for it in its:
            tags = "".join(f'<span class="tag">{e(t)}</span>' for t in it["tags"][:6])
            pal = "".join(f'<i style="background:{p["hex"]}"></i>' for p in it["palette"])
            cap = e(it["board_note"] or it["caption"] or "")
            parts.append(
                f'<figure data-tags="{e(" ".join(it["tags"]))}">'
                f'<img loading="lazy" src="{src(it)}" alt="{cap}">'
                f'<figcaption><div class="pal">{pal}</div>'
                f'{f"<p>{cap}</p>" if cap else ""}'
                f'{f"<p class=mood>{e(it["mood"])}</p>" if it["mood"] else ""}'
                f'<div class="tags">{tags}</div></figcaption></figure>')
        parts.append('</div>')

    doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title or board)}</title>
<style>
:root {{ --bg:#f4f1ec; --fg:#1d1b18; --muted:#6f6a62; --card:#fff; --line:#e2ddd5; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#141312; --fg:#ece8e1; --muted:#9a948a; --card:#1e1d1b; --line:#2e2c29; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--fg); font:15px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }}
header {{ padding:40px 24px 8px; max-width:1500px; margin:auto; }}
h1 {{ font:600 clamp(28px,5vw,48px)/1.05 ui-serif,Georgia,serif; margin:0 0 8px; letter-spacing:-.01em; }}
.desc {{ color:var(--muted); max-width:70ch; margin:0 0 16px; }}
.swatches {{ display:flex; height:28px; border-radius:6px; overflow:hidden; max-width:520px; }}
.swatches i {{ flex:1; }}
.filters {{ display:flex; flex-wrap:wrap; gap:6px; margin:18px 0 0; }}
.filters button {{ font:inherit; font-size:13px; border:1px solid var(--line); background:var(--card); color:var(--fg); padding:4px 10px; border-radius:99px; cursor:pointer; }}
.filters button.on {{ background:var(--fg); color:var(--bg); border-color:var(--fg); }}
main {{ padding:8px 24px 64px; max-width:1500px; margin:auto; }}
h2 {{ font:600 13px/1 ui-sans-serif,system-ui,sans-serif; text-transform:uppercase; letter-spacing:.12em; color:var(--muted); margin:36px 0 14px; padding-bottom:8px; border-bottom:1px solid var(--line); }}
.grid {{ columns:4 260px; column-gap:16px; }}
figure {{ break-inside:avoid; margin:0 0 16px; background:var(--card); border-radius:10px; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,.06); }}
figure.hide {{ display:none; }}
figure img {{ display:block; width:100%; height:auto; cursor:zoom-in; }}
figcaption {{ padding:10px 12px 12px; font-size:13px; }}
figcaption p {{ margin:6px 0 0; }}
.mood {{ color:var(--muted); font-style:italic; }}
.pal {{ display:flex; height:6px; border-radius:3px; overflow:hidden; }}
.pal i {{ flex:1; }}
.tags {{ margin-top:8px; display:flex; flex-wrap:wrap; gap:4px; }}
.tag {{ font-size:11px; color:var(--muted); border:1px solid var(--line); border-radius:99px; padding:1px 7px; }}
#zoom {{ position:fixed; inset:0; background:rgba(0,0,0,.88); display:none; align-items:center; justify-content:center; cursor:zoom-out; padding:24px; }}
#zoom.on {{ display:flex; }}
#zoom img {{ max-width:100%; max-height:100%; border-radius:6px; }}
@media (max-width:600px) {{ header, main {{ padding-left:16px; padding-right:16px; }} .grid {{ columns:2 140px; column-gap:10px; }} figure {{ margin-bottom:10px; }} }}
</style></head><body>
<header>
<h1>{e(title or board)}</h1>
{f'<p class="desc">{e(b["description"])}</p>' if b["description"] else ""}
<div class="swatches">{"".join(f'<i style="background:{s}" title="{s}"></i>' for s in swatches)}</div>
<div class="filters">{"".join(f'<button data-t="{e(t)}">{e(t)}</button>' for t in top_tags)}</div>
</header>
<main>{"".join(parts)}</main>
<div id="zoom"><img alt=""></div>
<script>
const on = new Set();
document.querySelectorAll('.filters button').forEach(b => b.onclick = () => {{
  b.classList.toggle('on'); on.has(b.dataset.t) ? on.delete(b.dataset.t) : on.add(b.dataset.t);
  document.querySelectorAll('figure').forEach(f => {{
    const t = f.dataset.tags.split(' ');
    f.classList.toggle('hide', on.size > 0 && ![...on].every(x => x.split(' ').every(w => t.includes(w))));
  }});
}});
const z = document.getElementById('zoom');
document.querySelectorAll('figure img').forEach(i => i.onclick = () => {{ z.firstChild.src = i.src; z.classList.add('on'); }});
z.onclick = () => z.classList.remove('on');
</script>
</body></html>"""
    out = HOME / "boards" / f"{re.sub(r'[^a-zA-Z0-9_-]+', '-', board).strip('-').lower()}.html"
    out.write_text(doc)
    return str(out)


def export_board(board: str, dest: str) -> str:
    """Render the board and copy the HTML somewhere else (e.g. a shared folder)."""
    path = render_board(board)
    dest_p = Path(dest).expanduser()
    if dest_p.is_dir() or dest.endswith("/"):
        dest_p.mkdir(parents=True, exist_ok=True)
        dest_p = dest_p / Path(path).name
    shutil.copy(path, dest_p)
    return str(dest_p)

"""Find images out in the world and bring the good ones into the library.

Sources (each turns on when it can work):
  brave     BRAVE_API_KEY         web-wide image search, up to 200 per call ($5 / 1,000 calls)
  arena     always (ARENA_TOKEN optional)   Are.na blocks and channels: human-curated boards
  openverse always                Creative Commons images, licence included
  unsplash  UNSPLASH_ACCESS_KEY   polished photography
  pexels    PEXELS_API_KEY        polished photography

Flow: find_images -> candidates get short refs (f1, f2, ...) and a labelled contact
sheet Claude can look at -> save_found(refs) downloads the full image into the library
with its credit, licence and source page kept in the notes.
"""

from __future__ import annotations

import io
import json
import os
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image as PILImage, ImageDraw, ImageFont

import library as lib

UA = "moodboard-mcp/0.2"


def _get_json(url: str, headers: dict | None = None) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def _get_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


# Tests swap these out.
http_json = _get_json
http_bytes = _get_bytes


def _q(**params) -> str:
    return urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})


def _cand(source, image_url, thumb=None, title="", page_url="", credit="", license="", w=None, h=None):
    return {"source": source, "image_url": image_url, "thumb": thumb or image_url, "title": (title or "").strip(),
            "page_url": page_url or "", "credit": credit or "", "license": license or "", "width": w, "height": h}


# ---------------------------------------------------------------- sources

def brave(query: str, n: int, safe: str = "strict") -> list[dict]:
    key = os.environ["BRAVE_API_KEY"]
    data = http_json("https://api.search.brave.com/res/v1/images/search?" +
                     _q(q=query, count=min(n, 200), safesearch=safe),
                     {"X-Subscription-Token": key})
    out = []
    for r in data.get("results", []):
        props, th = r.get("properties") or {}, r.get("thumbnail") or {}
        url = props.get("url") or th.get("src")
        if url:
            out.append(_cand("brave", url, th.get("src"), r.get("title"), r.get("url"),
                             r.get("source"), "", th.get("width"), th.get("height")))
    return out


def _arena_headers() -> dict:
    tok = os.environ.get("ARENA_TOKEN")
    return {"Authorization": f"Bearer {tok}"} if tok else {}


def _arena_block(b: dict) -> dict | None:
    img = b.get("image") or {}
    if not img:
        return None
    full = (img.get("original") or {}).get("url") or (img.get("large") or {}).get("url") or (img.get("display") or {}).get("url")
    thumb = (img.get("display") or {}).get("url") or (img.get("thumb") or {}).get("url") or full
    if not full:
        return None
    src = b.get("source") or {}
    user = b.get("user") or {}
    return _cand("arena", full, thumb, b.get("title") or b.get("generated_title") or "",
                 src.get("url") or f"https://www.are.na/block/{b.get('id')}",
                 user.get("full_name") or user.get("username") or "")


def arena(query: str, n: int) -> list[dict]:
    data = http_json("https://api.are.na/v2/search/blocks?" + _q(q=query, per=min(n, 100)), _arena_headers())
    return [c for c in (_arena_block(b) for b in data.get("blocks", [])) if c][:n]


def arena_channel(slug: str, n: int = 40) -> list[dict]:
    """Every image in one Are.na channel (someone's board). Slug is the last part of its URL."""
    slug = slug.rstrip("/").split("/")[-1]
    data = http_json(f"https://api.are.na/v2/channels/{urllib.parse.quote(slug)}/contents?" + _q(per=min(n, 100)),
                     _arena_headers())
    return [c for c in (_arena_block(b) for b in data.get("contents", [])) if c][:n]


def arena_channels(query: str, n: int = 10) -> list[dict]:
    """Find Are.na channels (boards) about a topic, to browse with arena_channel."""
    data = http_json("https://api.are.na/v2/search/channels?" + _q(q=query, per=min(n, 50)), _arena_headers())
    return [{"slug": c.get("slug"), "title": c.get("title"), "blocks": c.get("length"),
             "by": (c.get("user") or {}).get("full_name"), "url": f"https://www.are.na/{(c.get('user') or {}).get('slug', '')}/{c.get('slug')}"}
            for c in data.get("channels", [])]


def openverse(query: str, n: int) -> list[dict]:
    data = http_json("https://api.openverse.org/v1/images/?" + _q(q=query, page_size=min(n, 20)))
    out = []
    for r in data.get("results", []):
        lic = f"CC {r.get('license', '').upper()} {r.get('license_version') or ''}".strip()
        out.append(_cand("openverse", r["url"], r.get("thumbnail"), r.get("title"), r.get("foreign_landing_url"),
                         r.get("creator"), lic, r.get("width"), r.get("height")))
    return out


def unsplash(query: str, n: int) -> list[dict]:
    data = http_json("https://api.unsplash.com/search/photos?" + _q(query=query, per_page=min(n, 30)),
                     {"Authorization": f"Client-ID {os.environ['UNSPLASH_ACCESS_KEY']}", "Accept-Version": "v1"})
    return [_cand("unsplash", r["urls"]["regular"], r["urls"].get("small"),
                  r.get("description") or r.get("alt_description"), (r.get("links") or {}).get("html"),
                  (r.get("user") or {}).get("name"), "Unsplash License", r.get("width"), r.get("height"))
            for r in data.get("results", [])]


def pexels(query: str, n: int) -> list[dict]:
    data = http_json("https://api.pexels.com/v1/search?" + _q(query=query, per_page=min(n, 80)),
                     {"Authorization": os.environ["PEXELS_API_KEY"]})
    return [_cand("pexels", r["src"].get("large2x") or r["src"]["original"], r["src"].get("medium"), r.get("alt"),
                  r.get("url"), r.get("photographer"), "Pexels License", r.get("width"), r.get("height"))
            for r in data.get("photos", [])]


SOURCES = {"brave": brave, "arena": arena, "openverse": openverse, "unsplash": unsplash, "pexels": pexels}
NEEDS = {"brave": "BRAVE_API_KEY", "unsplash": "UNSPLASH_ACCESS_KEY", "pexels": "PEXELS_API_KEY"}


def available_sources() -> list[str]:
    return [s for s in SOURCES if s not in NEEDS or os.environ.get(NEEDS[s])]


# ---------------------------------------------------------------- candidates

def _store(cands: list[dict], query: str) -> list[dict]:
    con = lib.db()
    con.execute("create table if not exists candidates (ref text primary key, query text, data text, found real)")
    start = con.execute("select count(*) from candidates").fetchone()[0]
    for n, c in enumerate(cands, start=start + 1):
        c["ref"] = f"f{n}"
        con.execute("insert into candidates values (?,?,?,?)", (c["ref"], query, json.dumps(c), time.time()))
    con.commit()
    con.close()
    return cands


def get_candidate(ref: str) -> dict:
    con = lib.db()
    con.execute("create table if not exists candidates (ref text primary key, query text, data text, found real)")
    r = con.execute("select data from candidates where ref=?", (ref.strip(),)).fetchone()
    con.close()
    if not r:
        raise ValueError(f"No search result {ref!r}. Run find_images again.")
    return json.loads(r[0])


def find_images(query: str, sources: list[str] | None = None, per_source: int = 12) -> tuple[list[dict], dict]:
    """Search several sources at once and interleave results. Returns (candidates, errors)."""
    avail = available_sources()
    wanted = [s for s in (sources or avail)]
    errors = {s: f"needs {NEEDS[s]} in the server's environment" for s in wanted if s not in avail}
    run = [s for s in wanted if s in avail]
    per = {}
    with ThreadPoolExecutor(max_workers=max(1, len(run))) as ex:
        futs = {s: ex.submit(SOURCES[s], query, per_source) for s in run}
        for s, f in futs.items():
            try:
                per[s] = f.result()[:per_source]
            except Exception as e:  # one dead source should not sink the others
                errors[s] = f"{type(e).__name__}: {e}"
    # round-robin so the sheet mixes sources
    merged, seen = [], set()
    for i in range(per_source):
        for s in run:
            if i < len(per.get(s, [])):
                c = per[s][i]
                if c["image_url"] not in seen:
                    seen.add(c["image_url"])
                    merged.append(c)
    return _store(merged, query), errors


def browse_arena_channel(slug: str, n: int = 40) -> list[dict]:
    return _store(arena_channel(slug, n), f"are.na channel {slug}")


# ---------------------------------------------------------------- contact sheet

def _font(size: int):
    for f in ("DejaVuSans-Bold.ttf", "Arial Bold.ttf", "Helvetica.ttc"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def contact_sheet(cands: list[dict], cell: int = 220, cols: int = 6) -> bytes:
    """One JPEG grid with each thumbnail labelled by its ref, so Claude can pick by eye."""
    def load(c):
        try:
            im = PILImage.open(io.BytesIO(http_bytes(c["thumb"]))).convert("RGB")
            im.thumbnail((cell - 8, cell - 8))
            return im
        except Exception:
            return None
    with ThreadPoolExecutor(max_workers=12) as ex:
        thumbs = list(ex.map(load, cands))
    rows = max(1, (len(cands) + cols - 1) // cols)
    sheet = PILImage.new("RGB", (cols * cell, rows * cell), (24, 24, 24))
    d, font = ImageDraw.Draw(sheet), _font(18)
    for n, (c, im) in enumerate(zip(cands, thumbs)):
        x, y = (n % cols) * cell, (n // cols) * cell
        if im:
            sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        else:
            d.text((x + 10, y + cell // 2), "no preview", fill=(140, 140, 140), font=font)
        label = f"{c['ref']} {c['source'][:2]}"
        tw = d.textlength(label, font=font)
        d.rectangle((x + 4, y + 4, x + 12 + tw, y + 28), fill=(0, 0, 0))
        d.text((x + 8, y + 6), label, fill=(255, 255, 255), font=font)
    buf = io.BytesIO()
    sheet.save(buf, "JPEG", quality=80)
    return buf.getvalue()


# ---------------------------------------------------------------- saving

def save_found(refs: list[str], board: str | None = None, section: str = "",
               tags: list[str] | None = None) -> list[dict]:
    saved = []
    for ref in refs:
        c = get_candidate(ref)
        notes = "; ".join(x for x in (
            f"from {c['source']}", f"credit: {c['credit']}" if c["credit"] else "",
            f"licence: {c['license']}" if c["license"] else "", f"page: {c['page_url']}" if c["page_url"] else "") if x)
        last = None
        for url in (c["image_url"], c["thumb"]):  # full size first, thumbnail if the host refuses
            try:
                img = lib.add_image(url, tags=tags, caption=c["title"][:140], notes=notes, board=board, section=section)
                img["ref"] = ref
                saved.append(img)
                break
            except Exception as e:
                last = e
        else:
            saved.append({"ref": ref, "error": f"could not download: {last}"})
    return saved

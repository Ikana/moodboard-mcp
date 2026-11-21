#!/usr/bin/env python3
"""Copy moodboard boards into a working copy of the template and write its data files.

    python3 export_boards.py --out ~/work/my-directions \
        --board "Column A – Engineering=a" --board "Column B – Clarity=b" --board "Column C – Flow=c"

Creates <out> from the template on first run, copies each board's images into <out>/img,
writes <out>/sizes.js (aspect ratios) and <out>/rooms/boards.js. Fields you have already
edited in boards.js (headline, caption, seed, theme, figure, stations) are kept on re-runs.
"""
import argparse, json, os, re, shutil, sqlite3
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE.parent / "template"

DARK = {"ink": "#0b0c0f", "ink-2": "#111317", "fg": "#e9e4d8", "muted": "#6f6c66", "hair": "#24262b",
        "c1": "#5aa7d8", "c2": "#e9e4d8", "c3": "#e0562a",
        "img-filter": "grayscale(1) contrast(1.1) brightness(.4)",
        "inv-filter": "invert(1) grayscale(1) contrast(1.1) brightness(.4)"}


def load_js(path: Path) -> dict:
    if not path.exists():
        return {}
    txt = path.read_text()
    return json.loads(re.sub(r"^export const BOARDS = ", "", txt.strip()).rstrip(";"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--home", default=os.environ.get("MOODBOARD_HOME", "~/.moodboard"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--board", action="append", required=True, help='"Board name=key", key is a, b, c...')
    a = ap.parse_args()
    home, out = Path(a.home).expanduser(), Path(a.out).expanduser()
    if not out.exists():
        shutil.copytree(TEMPLATE, out)
    (out / "img").mkdir(exist_ok=True)

    db = sqlite3.connect(home / "library.db")
    boards = load_js(out / "rooms" / "boards.js")
    sizes = {}
    for spec in a.board:
        name, key = spec.rsplit("=", 1)
        rows = db.execute(
            "select i.id, i.file, i.caption, i.width, i.height from board_items b join images i on i.id = b.image_id "
            "where b.board = ? order by b.section, b.position", (name,)).fetchall()
        if not rows:
            raise SystemExit(f"no images on board {name!r}")
        images = []
        for iid, file, caption, w, h in rows:
            src = Path(file) if os.path.isabs(file) else home / file
            if not src.exists():
                src = home / "images" / Path(file).name
            dst = out / "img" / src.name
            shutil.copy2(src, dst)
            sizes[src.name] = round((w or 1) / (h or 1), 3)
            images.append({"id": iid, "f": src.name, "t": caption or iid, "inv": False})
        b = boards.get(key, {})
        b.update({"key": key.upper(), "title": b.get("title") or f"Column {key.upper()}, {name}", "images": images})
        b.setdefault("headline", name)
        b.setdefault("caption", "Discover, define, deliver.")
        b.setdefault("seed", "")
        b.setdefault("figure", "eight")
        b.setdefault("theme", DARK)
        b.setdefault("stations", [{"n": i + 1, "img": im["id"]} for i, im in enumerate(images[:8])])
        boards[key] = b
        print(f"{key}: {len(images)} images from {name!r}")

    (out / "rooms" / "boards.js").write_text("export const BOARDS = " + json.dumps(boards, ensure_ascii=False, indent=1) + ";\n")
    old = {}
    sj = out / "sizes.js"
    if sj.exists():
        old = json.loads(sj.read_text().split("=", 1)[1].strip().rstrip(";"))
    old.update(sizes)
    sj.write_text("window.ASPECT = " + json.dumps(old) + ";\n")
    print(f"wrote {out}/rooms/boards.js and sizes.js. Run: python3 {out}/rooms/serve.py")


if __name__ == "__main__":
    main()

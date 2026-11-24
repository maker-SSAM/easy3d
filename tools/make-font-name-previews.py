"""사이트 글씨체 이름을 그 글씨체 모양 그림(SVG 경로)으로 만든다 → assets/js/font-name-previews.js

갤러리9의 글씨체 목록은 글씨체 이름을 그 글씨체 모양으로 보여 준다. 사이트 글씨체 12종을 모두
내려받으면 43MB가 넘어서(목록을 열 때마다 받기엔 너무 큼), 이름 글자만 미리 그림으로 만들어 둔다.

쓰는 법(맥·윈도우 같음, fonttools 필요):
    python3 tools/make-font-name-previews.py
assets/js/font-list.js에 글씨체를 넣거나 이름(label)을 바꾸면 다시 실행해서 결과 파일을 함께 커밋한다.
"""
import json
import re
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT_LIST = ROOT / "assets" / "js" / "font-list.js"
FONTS_DIR = ROOT / "assets" / "fonts"
OUT = ROOT / "assets" / "js" / "font-name-previews.js"


def read_font_list():
    text = FONT_LIST.read_text(encoding="utf-8")
    return re.findall(r"\{\s*label:\s*'([^']+)',\s*file:\s*'([^']+)'\s*\}", text)


def name_path(font_path, label):
    font = TTFont(font_path, lazy=True)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    upm = font["head"].unitsPerEm
    pen = SVGPathPen(glyph_set, ntos=lambda v: str(round(v)))
    x = 0
    missing = []
    for ch in label:
        gname = cmap.get(ord(ch))
        if gname is None:
            missing.append(ch)
            x += upm // 3
            continue
        glyph_set[gname].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))  # 글자 좌표는 위가 +, SVG는 아래가 +
        x += hmtx[gname][0]
    # 세로 범위를 글씨체의 em(unitsPerEm) 비율로 정한다 — 모든 글씨체가 같은 글자 크기·같은 기준선으로 보이게.
    # (ascent/descent로 하면 Noto처럼 위아래 여유가 큰 글씨체가 작게 보였다.) 넘치는 획은 화면에서 잘리지 않게 둔다.
    view_box = f"0 {round(-0.9 * upm)} {x} {round(1.15 * upm)}"
    return {"vb": view_box, "d": pen.getCommands()}, missing


def main():
    out = {}
    for label, file in read_font_list():
        entry, missing = name_path(FONTS_DIR / file, label)
        out[file] = entry
        note = f"  (없는 글자: {''.join(missing)})" if missing else ""
        print(f"{file}: {len(entry['d']):,}자{note}")
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(
        "// 자동 생성 파일 — 손으로 고치지 말 것. tools/make-font-name-previews.py로 다시 만든다.\n"
        "// 사이트 글씨체 이름을 그 글씨체 모양으로 그린 SVG 경로(갤러리9 글씨체 목록용).\n"
        "// 글자 모양은 각 글씨체의 것이며 글씨체 라이선스(OFL 등)를 따른다.\n"
        f"window.FontNamePreviews = {body};\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"→ {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
